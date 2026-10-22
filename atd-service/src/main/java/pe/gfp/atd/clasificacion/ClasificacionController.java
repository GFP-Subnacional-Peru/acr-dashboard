package pe.gfp.atd.clasificacion;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Pattern;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * Guarda la decisión del especialista en la alerta. No inventa una detección:
 * confirma, como natural o como falsa, el polígono que ya trajo GeoBosques.
 */
@RestController
public class ClasificacionController {

    private static final Pattern PATRON_CODIGO = Pattern.compile("[A-Z]{3}-\\d{4}-\\d{4,6}");
    private static final int CAUSA_NATURAL = 14;
    private static final int CAUSA_FALSA = 99;

    private final JdbcTemplate jdbc;
    private final ObjectMapper json;

    public ClasificacionController(JdbcTemplate jdbc, ObjectMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    @PutMapping("/api/atd/alertas/{codigo}/clasificacion")
    @Transactional
    public ResponseEntity<?> guardar(@PathVariable String codigo, @RequestBody Map<String, Object> cuerpo) {
        if (!PATRON_CODIGO.matcher(codigo).matches()) {
            return error(HttpStatus.NOT_FOUND, "Alerta no encontrada");
        }
        String resultado = texto(cuerpo.get("resultado"));
        if (!resultado.equals("antropica") && !resultado.equals("natural") && !resultado.equals("falsa")) {
            return error(HttpStatus.BAD_REQUEST, "El resultado no es válido");
        }
        Integer causaId = resultado.equals("natural") ? CAUSA_NATURAL
                : resultado.equals("falsa") ? CAUSA_FALSA
                : entero(cuerpo.get("causaId"));
        if (causaId == null) {
            return error(HttpStatus.BAD_REQUEST, "Elige la causa de la pérdida");
        }
        Integer causaOk = jdbc.query("""
                SELECT id FROM cat_causa WHERE id = ? AND resultado = ?
                """, rs -> rs.next() ? rs.getInt(1) : null, causaId, resultado);
        if (causaOk == null) {
            return error(HttpStatus.BAD_REQUEST, "La causa no corresponde al resultado");
        }
        int confiabilidad = entero(cuerpo.get("confiabilidadId")) == null ? 1 : entero(cuerpo.get("confiabilidadId"));
        int bosque = entero(cuerpo.get("tipoBosqueId")) == null ? 1 : entero(cuerpo.get("tipoBosqueId"));
        if ((confiabilidad != 1 && confiabilidad != 2) || (bosque != 1 && bosque != 2)) {
            return error(HttpStatus.BAD_REQUEST, "Confiabilidad o tipo de bosque no válidos");
        }
        String conclusion = texto(cuerpo.get("conclusion"));
        if (conclusion.length() > 4000) {
            return error(HttpStatus.BAD_REQUEST, "La conclusión es demasiado larga");
        }
        String especialista = texto(cuerpo.get("especialista"));
        if (especialista.isBlank()) {
            especialista = "Sin nombre";
        }
        if (especialista.length() > 80) {
            especialista = especialista.substring(0, 80);
        }

        Map<String, Object> previa = jdbc.query("""
                SELECT id, estado FROM alerta WHERE codigo = ?
                """, rs -> rs.next() ? Map.of("id", rs.getLong(1), "estado", rs.getString(2)) : null, codigo);
        if (previa == null) {
            return error(HttpStatus.NOT_FOUND, "Alerta no encontrada");
        }

        ObjectNode cambios = json.createObjectNode();
        cambios.put("resultado", resultado);
        cambios.put("causaId", causaOk);
        cambios.put("confiabilidadId", confiabilidad);
        cambios.put("tipoBosqueId", bosque);
        cambios.put("especialista", especialista);
        cambios.put("conclusion", conclusion);

        jdbc.update("""
                INSERT INTO historial_validacion (alerta_id, accion, estado_anterior, estado_nuevo, cambios)
                VALUES (?, 'clasificar', ?, 'validada', ?::jsonb)
                """, previa.get("id"), previa.get("estado"), cambios.toString());
        int n = jdbc.update("""
                UPDATE alerta SET
                       estado = 'validada',
                       causa_id = ?,
                       confiabilidad_id = ?,
                       tipo_bosque_id = ?,
                       conclusion = NULLIF(?, ''),
                       validado_en = now(),
                       actualizado_en = now()
                 WHERE codigo = ?
                """, causaOk, confiabilidad, bosque, conclusion, codigo);
        if (n == 0) {
            return error(HttpStatus.NOT_FOUND, "Alerta no encontrada");
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("codigo", codigo);
        out.put("estado", "validada");
        out.put("resultado", resultado);
        out.put("causaId", causaOk);
        out.put("causa", jdbc.queryForObject("SELECT nombre FROM cat_causa WHERE id = ?", String.class, causaOk));
        return ResponseEntity.ok(out);
    }

    private static String texto(Object v) {
        return v == null ? "" : v.toString().trim();
    }

    private static Integer entero(Object v) {
        if (v instanceof Number n) {
            return n.intValue();
        }
        if (v == null || v.toString().isBlank()) {
            return null;
        }
        try {
            return Integer.parseInt(v.toString().trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static ResponseEntity<Map<String, String>> error(HttpStatus status, String mensaje) {
        return ResponseEntity.status(status).body(Map.of("error", mensaje));
    }
}
