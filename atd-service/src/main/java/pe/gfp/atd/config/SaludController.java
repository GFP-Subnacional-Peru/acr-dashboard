package pe.gfp.atd.config;

import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import pe.gfp.atd.drive.DriveAlmacen;

@RestController
public class SaludController {

    private final JdbcTemplate jdbc;
    private final DriveAlmacen drive;

    public SaludController(JdbcTemplate jdbc, DriveAlmacen drive) {
        this.jdbc = jdbc;
        this.drive = drive;
    }

    @GetMapping("/api/atd/salud")
    public Map<String, Object> salud() {
        Integer alertas = jdbc.queryForObject("SELECT count(*) FROM alerta", Integer.class);
        return Map.of("estado", "ok", "alertas", alertas == null ? 0 : alertas, "drive", drive.activo());
    }
}
