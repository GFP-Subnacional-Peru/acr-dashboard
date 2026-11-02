package pe.gfp.atd.territorio;

import jakarta.validation.constraints.Pattern;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import pe.gfp.atd.config.NoEncontradoException;

/** Personas a las que se les pide fotointerpretar las alertas nuevas de un ACR. No son cuentas de acceso. */
@RestController
@RequestMapping("/api/atd/responsables")
public class ResponsableController {

    private final JdbcTemplate jdbc;

    public ResponsableController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @GetMapping
    public List<Map<String, Object>> listar(
            @RequestParam @Pattern(regexp = TerritorioController.PATRON_ACR) String acr) {
        return jdbc.query("""
                SELECT id, nombre, correo
                  FROM responsable_acr
                 WHERE acr_codigo = ?
                 ORDER BY nombre
                """, (rs, i) -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", rs.getLong("id"));
            m.put("nombre", rs.getString("nombre"));
            m.put("correo", rs.getString("correo"));
            return m;
        }, acr);
    }

    @PostMapping
    public ResponseEntity<Map<String, Object>> crear(@RequestBody Map<String, Object> cuerpo) {
        String acr = texto(cuerpo.get("acr"));
        String nombre = texto(cuerpo.get("nombre"));
        String correo = texto(cuerpo.get("correo"));
        if (!acr.matches(TerritorioController.PATRON_ACR)) {
            return ResponseEntity.badRequest().body(Map.of("error", "Elige un ACR"));
        }
        if (nombre.isBlank() || nombre.length() > 150) {
            return ResponseEntity.badRequest().body(Map.of("error", "Escribe el nombre"));
        }
        if (!correo.isBlank() && (correo.length() > 150 || !correo.contains("@"))) {
            return ResponseEntity.badRequest().body(Map.of("error", "El correo no parece válido"));
        }
        try {
            Long id = jdbc.queryForObject("""
                    INSERT INTO responsable_acr (acr_codigo, nombre, correo)
                    VALUES (?, ?, NULLIF(?, ''))
                    RETURNING id
                    """, Long.class, acr, nombre, correo);
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("id", id);
            out.put("nombre", nombre);
            out.put("correo", correo.isBlank() ? null : correo);
            return ResponseEntity.status(HttpStatus.CREATED).body(out);
        } catch (DataIntegrityViolationException e) {
            return ResponseEntity.badRequest().body(Map.of("error", "Ese ACR no está en el visor"));
        }
    }

    @DeleteMapping("/{id}")
    public Map<String, Object> borrar(@PathVariable long id) {
        int n = jdbc.update("DELETE FROM responsable_acr WHERE id = ?", id);
        if (n == 0) {
            throw new NoEncontradoException("Responsable no encontrado");
        }
        return Map.of("borrado", true);
    }

    private static String texto(Object v) {
        return v == null ? "" : v.toString().trim();
    }
}
