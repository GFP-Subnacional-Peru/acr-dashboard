package pe.gfp.atd.catalogo;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** Dominios de la GDB (causa, confiabilidad, tipo de bosque) para el formulario de clasificación. */
@RestController
public class CatalogoController {

    private final JdbcTemplate jdbc;

    public CatalogoController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @GetMapping("/api/atd/catalogos")
    public ResponseEntity<Map<String, List<Map<String, Object>>>> catalogos() {
        Map<String, List<Map<String, Object>>> r = Map.of(
                "causas", jdbc.queryForList("SELECT id, nombre, resultado FROM cat_causa ORDER BY id"),
                "confiabilidad", jdbc.queryForList("SELECT id, nombre FROM cat_confiabilidad ORDER BY id"),
                "tipoBosque", jdbc.queryForList("SELECT id, nombre FROM cat_tipo_bosque ORDER BY id"));
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofHours(12)).cachePublic()).body(r);
    }
}
