package pe.gfp.atd.alerta;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
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
import pe.gfp.atd.territorio.TerritorioController;

@Validated
@RestController
@RequestMapping("/api/atd")
public class AlertaController {

    private static final String PATRON_AMBITO = "(?i)acr|zi|ambos";
    private static final MediaType GEOJSON = MediaType.parseMediaType("application/geo+json");
    private static final CacheControl CACHE_CORTO = CacheControl.maxAge(Duration.ofMinutes(5)).cachePrivate();

    private final AlertaRepository repo;

    public AlertaController(AlertaRepository repo) {
        this.repo = repo;
    }

    @GetMapping("/periodos")
    public List<Periodo> periodos(
            @RequestParam @Pattern(regexp = TerritorioController.PATRON_ACR) String acr,
            @RequestParam(defaultValue = "ambos") @Pattern(regexp = PATRON_AMBITO) String ambito) {
        return repo.periodos(acr, Ambito.desde(ambito));
    }

    @GetMapping("/resumen")
    public ResponseEntity<ResumenMensual> resumen(
            @RequestParam @Pattern(regexp = TerritorioController.PATRON_ACR) String acr,
            @RequestParam(defaultValue = "ambos") @Pattern(regexp = PATRON_AMBITO) String ambito,
            @RequestParam @Min(2000) @Max(2100) int anio,
            @RequestParam @Min(1) @Max(12) int mes) {
        Ambito amb = Ambito.desde(ambito);
        int anioAnt = mes == 1 ? anio - 1 : anio;
        int mesAnt = mes == 1 ? 12 : mes - 1;
        ResumenMensual resumen = new ResumenMensual(
                acr, amb.name(), anio, mes,
                repo.conteo(acr, amb, anio, mes),
                repo.conteo(acr, amb, anioAnt, mesAnt),
                repo.porCausa(acr, amb, anio, mes));
        return ResponseEntity.ok().cacheControl(CACHE_CORTO).body(resumen);
    }

    @GetMapping("/alertas")
    public ResponseEntity<String> alertas(
            @RequestParam @Pattern(regexp = TerritorioController.PATRON_ACR) String acr,
            @RequestParam(defaultValue = "ambos") @Pattern(regexp = PATRON_AMBITO) String ambito,
            @RequestParam @Min(2000) @Max(2100) int anio,
            @RequestParam @Min(1) @Max(12) int mes) {
        return ResponseEntity.ok()
                .contentType(GEOJSON)
                .cacheControl(CACHE_CORTO)
                .body(repo.alertasGeoJson(acr, Ambito.desde(ambito), anio, mes));
    }

    @GetMapping("/alertas/{codigo}")
    public ResponseEntity<String> detalle(
            @PathVariable @Pattern(regexp = "[A-Z]{3}-\\d{4}-\\d{4,6}") String codigo) {
        String feature = repo.detalle(codigo)
                .orElseThrow(() -> new NoEncontradoException("Alerta no encontrada"));
        return ResponseEntity.ok().contentType(GEOJSON).cacheControl(CACHE_CORTO).body(feature);
    }
}
