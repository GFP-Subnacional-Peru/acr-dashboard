package pe.gfp.atd.evidencia;

import jakarta.validation.constraints.Pattern;
import java.time.Duration;
import java.util.List;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import pe.gfp.atd.config.NoEncontradoException;

@Validated
@RestController
@RequestMapping("/api/atd/alertas/{codigo}")
public class EvidenciaController {

    private static final String PATRON_CODIGO = "[A-Z]{3}-\\d{4}-\\d{4,6}";

    private final EvidenciaRepository repo;

    public EvidenciaController(EvidenciaRepository repo) {
        this.repo = repo;
    }

    @GetMapping("/evidencia")
    public List<Escena> evidencia(@PathVariable @Pattern(regexp = PATRON_CODIGO) String codigo) {
        return repo.escenas(codigo);
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
