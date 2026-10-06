package pe.gfp.atd.edicion;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

/**
 * Corrección del polígono de una alerta desde el visor. El original de la GDB queda en geom_original
 * y una recarga de la GDB no pisa la versión corregida.
 */
@RestController
public class GeometriaController {

    private static final Pattern PATRON_CODIGO = Pattern.compile("[A-Z]{3}-\\d{4}-\\d{4,6}");
    /** Ni una corrección razonable se aleja tanto ni crece tanto respecto del polígono de la GDB. */
    private static final double MAX_DESPLAZAMIENTO_M = 2000;
    private static final double MAX_HA = 2000;

    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    private final byte[] token;

    public GeometriaController(JdbcTemplate jdbc, ObjectMapper json, @Value("${atd.edicion.token:}") String token) {
        this.jdbc = jdbc;
        this.json = json;
        this.token = token.getBytes(StandardCharsets.UTF_8);
    }

    @GetMapping("/api/atd/edicion")
    public Map<String, Boolean> estado() {
        return Map.of("habilitada", token.length > 0);
    }

    @PutMapping("/api/atd/alertas/{codigo}/geometria")
    @Transactional
    public ResponseEntity<?> guardar(@PathVariable String codigo,
                                     @RequestHeader(value = "X-ATD-Token", required = false) String clave,
                                     @RequestHeader(value = "X-ATD-Editor", required = false) String editor,
                                     @RequestBody JsonNode geometria) {
        ResponseEntity<?> rechazo = validar(codigo, clave);
        if (rechazo != null) {
            return rechazo;
        }
        String tipo = geometria.path("type").asText();
        if (!tipo.equals("Polygon") && !tipo.equals("MultiPolygon")) {
            return error(HttpStatus.BAD_REQUEST, "Se espera un polígono");
        }
        List<Map<String, Object>> filas = jdbc.queryForList("""
                WITH nueva AS (
                    SELECT ST_Multi(ST_CollectionExtract(ST_MakeValid(
                               ST_SetSRID(ST_GeomFromGeoJSON(?), 4326)), 3))::geometry(MultiPolygon, 4326) AS g)
                SELECT ST_IsEmpty(n.g) AS vacia,
                       ST_Area(n.g::geography) / 10000 AS ha,
                       ST_Distance(n.g::geography, a.geom_original::geography) AS distancia
                  FROM nueva n, alerta a
                 WHERE a.codigo = ?
                """, geometria.toString(), codigo);
        if (filas.isEmpty()) {
            return error(HttpStatus.NOT_FOUND, "Alerta no encontrada");
        }
        Map<String, Object> f = filas.get(0);
        double ha = ((Number) f.get("ha")).doubleValue();
        if (Boolean.TRUE.equals(f.get("vacia")) || ha <= 0) {
            return error(HttpStatus.BAD_REQUEST, "El polígono no es válido");
        }
        if (ha > MAX_HA || ((Number) f.get("distancia")).doubleValue() > MAX_DESPLAZAMIENTO_M) {
            return error(HttpStatus.BAD_REQUEST, "El polígono se aleja demasiado de la alerta original");
        }
        jdbc.update("""
                WITH nueva AS (
                    SELECT ST_Multi(ST_CollectionExtract(ST_MakeValid(
                               ST_SetSRID(ST_GeomFromGeoJSON(?), 4326)), 3))::geometry(MultiPolygon, 4326) AS g)
                UPDATE alerta a SET
                       geom = n.g,
                       centroide = ST_PointOnSurface(n.g),
                       superficie_ha = round((ST_Area(n.g::geography) / 10000)::numeric, 4),
                       geom_editada_en = now(),
                       geom_editada_por = ?,
                       actualizado_en = now()
                  FROM nueva n
                 WHERE a.codigo = ?
                """, geometria.toString(), nombreEditor(editor), codigo);
        recalcularAmbito(codigo);
        return ResponseEntity.ok(resumen(codigo));
    }

    @DeleteMapping("/api/atd/alertas/{codigo}/geometria")
    @Transactional
    public ResponseEntity<?> restaurar(@PathVariable String codigo,
                                       @RequestHeader(value = "X-ATD-Token", required = false) String clave) {
        ResponseEntity<?> rechazo = validar(codigo, clave);
        if (rechazo != null) {
            return rechazo;
        }
        int n = jdbc.update("""
                UPDATE alerta SET
                       geom = geom_original,
                       centroide = ST_PointOnSurface(geom_original),
                       superficie_ha = round((ST_Area(geom_original::geography) / 10000)::numeric, 4),
                       geom_editada_en = NULL,
                       geom_editada_por = NULL,
                       actualizado_en = now()
                 WHERE codigo = ? AND geom_original IS NOT NULL
                """, codigo);
        if (n == 0) {
            return error(HttpStatus.NOT_FOUND, "Alerta no encontrada");
        }
        recalcularAmbito(codigo);
        return ResponseEntity.ok(resumen(codigo));
    }

    private void recalcularAmbito(String codigo) {
        jdbc.update("""
                UPDATE alerta a SET
                       ambito = CASE WHEN d.acr THEN 'ACR' ELSE 'ZI' END,
                       territorio_codigo = CASE WHEN d.acr THEN a.acr_codigo
                                                ELSE replace(a.acr_codigo, 'ACR_', 'ZI_') END
                  FROM alerta b
                 CROSS JOIN LATERAL (
                       SELECT EXISTS (SELECT 1 FROM territorio t
                                       WHERE t.codigo = b.acr_codigo AND ST_Intersects(t.geom, b.centroide)) AS acr) d
                 WHERE a.id = b.id AND a.codigo = ?
                """, codigo);
    }

    private Map<String, Object> resumen(String codigo) {
        Map<String, Object> r = new LinkedHashMap<>(jdbc.queryForMap("""
                SELECT codigo, ambito, superficie_ha AS "superficieHa",
                       geom_editada_en IS NOT NULL AS editada,
                       ST_AsGeoJSON(geom, 7) AS geometria
                  FROM alerta WHERE codigo = ?
                """, codigo));
        try {
            r.put("geometria", json.readTree((String) r.get("geometria")));
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
        return r;
    }

    private ResponseEntity<?> validar(String codigo, String clave) {
        if (token.length == 0) {
            return error(HttpStatus.FORBIDDEN, "La edición no está habilitada en este servidor");
        }
        if (clave == null || !MessageDigest.isEqual(token, clave.getBytes(StandardCharsets.UTF_8))) {
            return error(HttpStatus.FORBIDDEN, "Clave de edición incorrecta");
        }
        if (!PATRON_CODIGO.matcher(codigo).matches()) {
            return error(HttpStatus.NOT_FOUND, "Alerta no encontrada");
        }
        return null;
    }

    private static String nombreEditor(String editor) {
        if (editor == null || editor.isBlank()) {
            return "editor web";
        }
        String limpio = editor.replaceAll("[^\\p{L}\\p{N} ._-]", "").trim();
        return limpio.isEmpty() ? "editor web" : limpio.substring(0, Math.min(80, limpio.length()));
    }

    private static ResponseEntity<Map<String, String>> error(HttpStatus status, String mensaje) {
        return ResponseEntity.status(status).body(Map.of("error", mensaje));
    }
}
