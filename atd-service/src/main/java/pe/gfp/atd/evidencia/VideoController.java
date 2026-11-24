package pe.gfp.atd.evidencia;

import jakarta.validation.constraints.Pattern;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import pe.gfp.atd.config.NoEncontradoException;
import pe.gfp.atd.drive.DriveAlmacen;

/** Video de la constatación. La subida viaja junto con la foto. */
@RestController
@RequestMapping("/api/atd/alertas/{codigo}/video")
public class VideoController {

    private static final String PATRON_CODIGO = "[A-Z]{3}-\\d{4}-\\d{4,6}";

    private final EvidenciaRepository repo;
    private final DriveAlmacen drive;

    public VideoController(EvidenciaRepository repo, DriveAlmacen drive) {
        this.repo = repo;
        this.drive = drive;
    }

    @GetMapping
    public List<Map<String, Object>> listar(@PathVariable @Pattern(regexp = PATRON_CODIGO) String codigo) {
        return repo.videos(codigo).stream().map(f -> videoJson(codigo, f)).toList();
    }

    @GetMapping("/{id}")
    public ResponseEntity<byte[]> ver(@PathVariable @Pattern(regexp = PATRON_CODIGO) String codigo,
                                      @PathVariable long id) {
        EvidenciaRepository.FotoGuardada img = repo.video(codigo, id)
                .orElseThrow(() -> new NoEncontradoException("Video no encontrado"));
        byte[] datos = img.datos();
        if ((datos == null || datos.length == 0) && img.ruta() != null && img.ruta().startsWith("drive:")) {
            try {
                datos = drive.descargar(img.ruta().substring("drive:".length()));
            } catch (Exception e) {
                throw new NoEncontradoException("Video no encontrado");
            }
        }
        if (datos == null || datos.length == 0) {
            throw new NoEncontradoException("Video no encontrado");
        }
        String mime = img.mime() == null ? "video/mp4" : img.mime();
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(mime))
                .cacheControl(CacheControl.maxAge(Duration.ofDays(7)).cachePrivate())
                .body(datos);
    }

    private static Map<String, Object> videoJson(String codigo, EvidenciaRepository.Foto f) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", f.id());
        m.put("nota", f.nota());
        m.put("autor", f.autor());
        m.put("cargo", f.cargo());
        m.put("url", "/api/atd/alertas/" + codigo + "/video/" + f.id());
        return m;
    }
}
