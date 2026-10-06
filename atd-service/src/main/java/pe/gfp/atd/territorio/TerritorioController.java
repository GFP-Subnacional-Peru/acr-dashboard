package pe.gfp.atd.territorio;

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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import pe.gfp.atd.config.NoEncontradoException;

@Validated
@RestController
@RequestMapping("/api/atd/territorios")
public class TerritorioController {

    public static final String PATRON_ACR = "ACR_[A-Z]{2,8}";
    private static final MediaType GEOJSON = MediaType.parseMediaType("application/geo+json");

    private final TerritorioRepository repo;

    public TerritorioController(TerritorioRepository repo) {
        this.repo = repo;
    }

    @GetMapping
    public List<Territorio> listar(
            @RequestParam(required = false) @Pattern(regexp = "[a-z_]{3,20}") String region) {
        return repo.listar(region);
    }

    @GetMapping("/{acr}/limites")
    public ResponseEntity<String> limites(@PathVariable @Pattern(regexp = PATRON_ACR) String acr) {
        if (!repo.existeAcr(acr)) {
            throw new NoEncontradoException("ACR no encontrada");
        }
        return ResponseEntity.ok()
                .contentType(GEOJSON)
                .cacheControl(CacheControl.maxAge(Duration.ofHours(12)).cachePrivate())
                .body(repo.limitesGeoJson(acr));
    }
}
