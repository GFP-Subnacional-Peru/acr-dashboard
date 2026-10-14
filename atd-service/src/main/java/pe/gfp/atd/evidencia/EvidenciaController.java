package pe.gfp.atd.evidencia;

import jakarta.validation.constraints.Pattern;
import java.time.Duration;
import java.time.LocalDate;
import java.util.List;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import pe.gfp.atd.config.NoEncontradoException;

@Validated
@RestController
@RequestMapping("/api/atd/alertas/{codigo}")
public class EvidenciaController {

    private static final String PATRON_CODIGO = "[A-Z]{3}-\\d{4}-\\d{4,6}";

    private final EvidenciaRepository repo;
    private final SentinelCatalogo sentinel;

    public EvidenciaController(EvidenciaRepository repo, SentinelCatalogo sentinel) {
        this.repo = repo;
        this.sentinel = sentinel;
    }

    @GetMapping("/evidencia")
    public List<Escena> evidencia(@PathVariable @Pattern(regexp = PATRON_CODIGO) String codigo) {
        return repo.escenas(codigo);
    }

    /** Otras fechas Sentinel-2 alrededor de la alerta. No sustituye el par guardado del reporte. */
    @GetMapping("/sentinel")
    public BusquedaSentinel sentinel(
            @PathVariable @Pattern(regexp = PATRON_CODIGO) String codigo,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate desde,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate hasta) {
        EvidenciaRepository.PuntoAlerta punto = repo.punto(codigo)
                .orElseThrow(() -> new NoEncontradoException("Alerta no encontrada"));
        LocalDate base = punto.fechaImagen() != null ? punto.fechaImagen() : LocalDate.now();
        if (desde == null) {
            desde = base.minusDays(45);
        }
        if (hasta == null) {
            hasta = base.plusDays(20);
        }
        return sentinel.buscar(punto.lon(), punto.lat(), desde, hasta);
    }

    @GetMapping("/imagen/{momento}.png")
    public ResponseEntity<byte[]> imagen(
            @PathVariable @Pattern(regexp = PATRON_CODIGO) String codigo,
            @PathVariable @Pattern(regexp = "antes|despues") String momento) {
        EvidenciaRepository.Imagen img = repo.imagen(codigo, momento)
                .orElseThrow(() -> new NoEncontradoException("Imagen no disponible"));
        // La URL conserva ".png" por compatibilidad con enlaces ya emitidos; el tipo real va en la cabecera.
        MediaType tipo = img.mime() == null ? MediaType.IMAGE_PNG : MediaType.parseMediaType(img.mime());
        return ResponseEntity.ok()
                .contentType(tipo)
                .cacheControl(CacheControl.maxAge(Duration.ofDays(7)).cachePrivate())
                .body(img.datos());
    }
}
