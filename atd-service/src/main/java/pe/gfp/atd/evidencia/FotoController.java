package pe.gfp.atd.evidencia;

import jakarta.validation.constraints.Pattern;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.multipart.MultipartFile;
import pe.gfp.atd.config.NoEncontradoException;
import pe.gfp.atd.drive.DriveAlmacen;

/** Foto tomada en el lugar. Confirma la alerta satelital, como la foto de una patrulla. */
@Validated
@RestController
@RequestMapping("/api/atd/alertas/{codigo}/foto")
public class FotoController {

    private static final Logger log = LoggerFactory.getLogger(FotoController.class);
    private static final String PATRON_CODIGO = "[A-Z]{3}-\\d{4}-\\d{4,6}";
    private static final int MAX_FOTOS = 6;
    private static final int MAX_BYTES = 8 * 1024 * 1024;

    private final EvidenciaRepository repo;
    private final DriveAlmacen drive;

    public FotoController(EvidenciaRepository repo, DriveAlmacen drive) {
        this.repo = repo;
        this.drive = drive;
    }

    @GetMapping
    public List<Map<String, Object>> listar(@PathVariable @Pattern(regexp = PATRON_CODIGO) String codigo) {
        return repo.fotos(codigo).stream().map(f -> fotoJson(codigo, f)).toList();
    }

    @GetMapping("/{id}")
    public ResponseEntity<byte[]> ver(@PathVariable @Pattern(regexp = PATRON_CODIGO) String codigo,
                                      @PathVariable long id) {
        EvidenciaRepository.FotoGuardada img = repo.foto(codigo, id)
                .orElseThrow(() -> new NoEncontradoException("Foto no encontrada"));
        byte[] datos = img.datos();
        if ((datos == null || datos.length == 0) && img.ruta() != null && img.ruta().startsWith("drive:")) {
            try {
                datos = drive.descargar(img.ruta().substring("drive:".length()));
            } catch (Exception e) {
                throw new NoEncontradoException("Foto no encontrada");
            }
        }
        if (datos == null || datos.length == 0) {
            throw new NoEncontradoException("Foto no encontrada");
        }
        MediaType tipo = img.mime() == null ? MediaType.IMAGE_JPEG : MediaType.parseMediaType(img.mime());
        return ResponseEntity.ok()
                .contentType(tipo)
                .cacheControl(CacheControl.maxAge(Duration.ofDays(7)).cachePrivate())
                .body(datos);
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<Map<String, Object>> subir(@PathVariable @Pattern(regexp = PATRON_CODIGO) String codigo,
                                                     @RequestParam("foto") MultipartFile foto,
                                                     @RequestParam(value = "nota", required = false) String nota) {
        if (foto == null || foto.isEmpty()) {
            return rechazo("Elige una foto");
        }
        if (foto.getSize() > MAX_BYTES) {
            return rechazo("La foto pasa de 8 MB");
        }
        if (repo.contarFotos(codigo) >= MAX_FOTOS) {
            return rechazo("Esta alerta ya tiene 6 fotos");
        }
        byte[] datos;
        try {
            datos = foto.getBytes();
        } catch (Exception e) {
            return rechazo("No se pudo leer la foto");
        }
        String mime = mimeDe(datos);
        if (mime == null) {
            return rechazo("La foto tiene que ser JPG, PNG o WEBP");
        }
        String limpia = nota == null ? null : nota.trim();
        if (limpia != null && limpia.isEmpty()) {
            limpia = null;
        }
        if (limpia != null && limpia.length() > 250) {
            limpia = limpia.substring(0, 250);
        }
        String ruta = null;
        byte[] guardar = datos;
        if (drive.activo()) {
            try {
                String idDrive = drive.subir("fotos", codigo + "-" + System.currentTimeMillis() + extension(mime), mime, datos);
                ruta = "drive:" + idDrive;
                guardar = null;
            } catch (Exception e) {
                log.warn("Drive no recibió la foto, queda en la base: {}", e.getMessage());
            }
        }
        long id = repo.guardarFoto(codigo, guardar, mime, limpia, ruta);
        return ResponseEntity.status(HttpStatus.CREATED).body(fotoJson(codigo, new EvidenciaRepository.Foto(id, limpia, "ahora")));
    }

    private static ResponseEntity<Map<String, Object>> rechazo(String mensaje) {
        return ResponseEntity.badRequest().body(Map.of("error", mensaje));
    }

    @DeleteMapping("/{id}")
    public Map<String, Object> borrar(@PathVariable @Pattern(regexp = PATRON_CODIGO) String codigo,
                                      @PathVariable long id) {
        String ruta = repo.borrarFoto(codigo, id)
                .orElseThrow(() -> new NoEncontradoException("Foto no encontrada"));
        if (ruta.startsWith("drive:") && drive.activo()) {
            drive.borrar(ruta.substring("drive:".length()));
        }
        return Map.of("borrada", true);
    }

    private static Map<String, Object> fotoJson(String codigo, EvidenciaRepository.Foto f) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", f.id());
        m.put("nota", f.nota());
        m.put("tomada", f.tomada());
        m.put("url", "/api/atd/alertas/" + codigo + "/foto/" + f.id());
        return m;
    }

    /** JPG, PNG o WEBP por los primeros bytes. El nombre del archivo no basta. */
    private static String mimeDe(byte[] d) {
        if (d.length >= 3 && (d[0] & 0xFF) == 0xFF && (d[1] & 0xFF) == 0xD8 && (d[2] & 0xFF) == 0xFF) {
            return "image/jpeg";
        }
        if (d.length >= 8 && d[0] == (byte) 0x89 && d[1] == 0x50 && d[2] == 0x4E && d[3] == 0x47) {
            return "image/png";
        }
        if (d.length >= 12 && d[0] == 'R' && d[1] == 'I' && d[2] == 'F' && d[3] == 'F'
                && d[8] == 'W' && d[9] == 'E' && d[10] == 'B' && d[11] == 'P') {
            return "image/webp";
        }
        return null;
    }

    private static String extension(String mime) {
        if ("image/png".equals(mime)) {
            return ".png";
        }
        if ("image/webp".equals(mime)) {
            return ".webp";
        }
        return ".jpg";
    }
}
