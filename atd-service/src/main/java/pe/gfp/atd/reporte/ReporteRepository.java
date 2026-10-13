package pe.gfp.atd.reporte;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class ReporteRepository {

    /** Imagen de evidencia con su extensión en EPSG:3857 [xmin, ymin, xmax, ymax]. */
    public record ImagenEscena(String momento, String escenaId, LocalDate fecha, double[] recorte, byte[] png) {
    }

    /** Límites simplificados del ACR y de su Zona de Influencia, en GeoJSON EPSG:3857. */
    public record Limites(String acr, String zi) {
    }

    private final JdbcTemplate jdbc;

    public ReporteRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<DatosReporte> datos(String codigo) {
        return jdbc.query("""
                SELECT a.codigo, a.codigo_reporte, a.origen_oid, a.anio, a.mes_reporte, a.fecha_imagen, a.estado,
                       c.resultado, c.nombre AS causa, a.confiabilidad_id, tb.nombre AS bosque,
                       a.superficie_ha, a.sector, a.exa, z.nombre AS zonificacion,
                       r.id AS region_id, r.nombre AS departamento,
                       t.codigo AS acr_codigo, t.codigo_oficial, t.nombre AS acr_nombre, t.provincia, t.distrito,
                       o.nombre AS olv, o.lugar_poblado,
                       ST_X(ST_Transform(a.centroide, 32700 + u.zona)) AS este,
                       ST_Y(ST_Transform(a.centroide, 32700 + u.zona)) AS norte, u.zona,
                       ST_AsGeoJSON(ST_Transform(a.geom, 3857), 2) AS geom3857,
                       a.conclusion
                  FROM alerta a
                  JOIN region r ON r.id = a.region_id
                  JOIN territorio t ON t.codigo = a.acr_codigo
                  LEFT JOIN cat_causa c ON c.id = a.causa_id
                  LEFT JOIN cat_tipo_bosque tb ON tb.id = a.tipo_bosque_id
                  LEFT JOIN cat_zonificacion z ON z.codigo = a.zonificacion
                  CROSS JOIN LATERAL (SELECT floor((ST_X(a.centroide) + 180) / 6)::int + 1 AS zona) u
                  LEFT JOIN LATERAL (
                       SELECT nombre, lugar_poblado FROM olv
                        WHERE acr_oficial = t.codigo_oficial
                        ORDER BY geom <-> a.centroide LIMIT 1) o ON TRUE
                 WHERE a.codigo = ?
                """, (rs, i) -> new DatosReporte(
                rs.getString("codigo"),
                rs.getString("codigo_reporte"),
                rs.getLong("origen_oid"),
                rs.getInt("anio"),
                (Integer) rs.getObject("mes_reporte", Integer.class),
                rs.getObject("fecha_imagen", LocalDate.class),
                rs.getString("estado"),
                rs.getString("resultado"),
                rs.getString("causa"),
                (Integer) rs.getObject("confiabilidad_id", Integer.class),
                rs.getString("bosque"),
                rs.getBigDecimal("superficie_ha"),
                rs.getString("sector"),
                rs.getString("exa"),
                rs.getString("zonificacion"),
                rs.getInt("region_id"),
                rs.getString("departamento"),
                rs.getString("acr_codigo"),
                rs.getString("codigo_oficial"),
                rs.getString("acr_nombre"),
                rs.getString("provincia"),
                rs.getString("distrito"),
                rs.getString("olv"),
                rs.getString("lugar_poblado"),
                rs.getDouble("este"),
                rs.getDouble("norte"),
                rs.getInt("zona"),
                rs.getString("geom3857"),
                rs.getString("conclusion")), codigo).stream().findFirst();
    }

    public List<ImagenEscena> imagenes(String codigo) {
        return jdbc.query("""
                SELECT e.momento, e.escena_id, e.fecha, e.rec_xmin, e.rec_ymin, e.rec_xmax, e.rec_ymax, v.contenido
                  FROM escena e
                  JOIN alerta a ON a.id = e.alerta_id
                  JOIN evidencia v ON v.escena_id = e.id AND v.contenido IS NOT NULL
                 WHERE a.codigo = ? AND e.publica
                """, (rs, i) -> new ImagenEscena(
                rs.getString("momento"),
                rs.getString("escena_id"),
                rs.getObject("fecha", LocalDate.class),
                rs.getObject("rec_xmin") == null ? null : new double[] {
                        rs.getDouble("rec_xmin"), rs.getDouble("rec_ymin"),
                        rs.getDouble("rec_xmax"), rs.getDouble("rec_ymax")},
                rs.getBytes("contenido")), codigo);
    }

    public Limites limites(String acrCodigo) {
        return jdbc.queryForObject("""
                SELECT (SELECT ST_AsGeoJSON(ST_SimplifyPreserveTopology(ST_Transform(geom, 3857), 40), 0)
                          FROM territorio WHERE codigo = ?) AS acr,
                       (SELECT ST_AsGeoJSON(ST_SimplifyPreserveTopology(ST_Transform(geom, 3857), 40), 0)
                          FROM territorio WHERE codigo = replace(?, 'ACR_', 'ZI_')) AS zi
                """, (rs, i) -> new Limites(rs.getString("acr"), rs.getString("zi")), acrCodigo, acrCodigo);
    }
}
