package pe.gfp.atd.territorio;

import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class TerritorioRepository {

    private static final String SELECT_TERRITORIOS = """
            SELECT t.codigo, t.tipo, t.acr_codigo, t.codigo_oficial, t.nombre,
                   r.codigo AS region, r.nombre AS region_nombre, t.area_ha,
                   ST_XMin(t.geom) AS xmin, ST_YMin(t.geom) AS ymin,
                   ST_XMax(t.geom) AS xmax, ST_YMax(t.geom) AS ymax,
                   (SELECT count(*) FROM alerta a WHERE a.territorio_codigo = t.codigo) AS alertas
              FROM territorio t
              JOIN region r ON r.id = t.region_id
             WHERE (?::text IS NULL OR r.codigo = ?)
             ORDER BY r.id, t.acr_codigo, t.tipo
            """;

    private final JdbcTemplate jdbc;

    public TerritorioRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<Territorio> listar(String region) {
        return jdbc.query(SELECT_TERRITORIOS, (rs, i) -> new Territorio(
                rs.getString("codigo"),
                rs.getString("tipo"),
                rs.getString("acr_codigo"),
                rs.getString("codigo_oficial"),
                rs.getString("nombre"),
                rs.getString("region"),
                rs.getString("region_nombre"),
                rs.getBigDecimal("area_ha"),
                rs.getObject("xmin") == null ? null : List.of(
                        rs.getDouble("xmin"), rs.getDouble("ymin"),
                        rs.getDouble("xmax"), rs.getDouble("ymax")),
                rs.getInt("alertas")), region, region);
    }

    /** Límites del ACR y su ZI, simplificados (~10 m) para el mapa del visor. */
    public String limitesGeoJson(String acrCodigo) {
        return jdbc.queryForObject("""
                SELECT json_build_object(
                         'type', 'FeatureCollection',
                         'features', COALESCE(json_agg(json_build_object(
                             'type', 'Feature',
                             'geometry', ST_AsGeoJSON(ST_SimplifyPreserveTopology(t.geom, 0.0001), 5)::json,
                             'properties', json_build_object(
                                 'codigo', t.codigo, 'tipo', t.tipo, 'nombre', t.nombre))
                           ORDER BY t.tipo), '[]'::json))::text
                  FROM territorio t
                 WHERE t.acr_codigo = ?
                """, String.class, acrCodigo);
    }

    public boolean existeAcr(String acrCodigo) {
        Boolean existe = jdbc.queryForObject(
                "SELECT EXISTS (SELECT 1 FROM territorio WHERE codigo = ? AND tipo = 'ACR')",
                Boolean.class, acrCodigo);
        return Boolean.TRUE.equals(existe);
    }
}
