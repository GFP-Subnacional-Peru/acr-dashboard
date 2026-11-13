package pe.gfp.atd.edicion;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.RestController;
import pe.gfp.atd.reporte.UbicacionTerritorial;

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

    private static final Logger log = LoggerFactory.getLogger(GeometriaController.class);

    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    private final UbicacionTerritorial ubicacion;

    public GeometriaController(JdbcTemplate jdbc, ObjectMapper json, UbicacionTerritorial ubicacion) {
        this.jdbc = jdbc;
        this.json = json;
        this.ubicacion = ubicacion;
    }

    /** Solo alcanzable con perfil editor (ver Seguridad). */
    @PutMapping("/api/atd/alertas/{codigo}/geometria")
    @Transactional
    public ResponseEntity<?> guardar(@PathVariable String codigo, Authentication auth,
                                     @RequestBody JsonNode geometria) {
        if (!PATRON_CODIGO.matcher(codigo).matches()) {
            return error(HttpStatus.NOT_FOUND, "Alerta no encontrada");
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
                """, geometria.toString(), auth.getName(), codigo);
        recalcularAmbito(codigo);
        ubicar(codigo);
        return ResponseEntity.ok(resumen(codigo));
    }

    @DeleteMapping("/api/atd/alertas/{codigo}/geometria")
    @Transactional
    public ResponseEntity<?> restaurar(@PathVariable String codigo) {
        if (!PATRON_CODIGO.matcher(codigo).matches()) {
            return error(HttpStatus.NOT_FOUND, "Alerta no encontrada");
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
        ubicar(codigo);
        return ResponseEntity.ok(resumen(codigo));
    }

    private void ubicar(String codigo) {
        try {
            ubicacion.completar(codigo);
        } catch (RuntimeException e) {
            log.warn("Zonificación no aplicada a {}: {}", codigo, e.toString());
        }
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

    private static ResponseEntity<Map<String, String>> error(HttpStatus status, String mensaje) {
        return ResponseEntity.status(status).body(Map.of("error", mensaje));
    }
}
