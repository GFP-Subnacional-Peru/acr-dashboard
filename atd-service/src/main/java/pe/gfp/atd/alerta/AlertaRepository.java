package pe.gfp.atd.alerta;

import java.util.List;
import java.util.Optional;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import pe.gfp.atd.alerta.ResumenMensual.CausaHa;
import pe.gfp.atd.alerta.ResumenMensual.Conteo;

@Repository
public class AlertaRepository {

    /** Filtro común: ACR + ámbito (ACR / ZI / AMBOS). Parámetros: acr, ambito, ambito. */
    private static final String FILTRO_TERRITORIO =
            "a.acr_codigo = ? AND (?::text = 'AMBOS' OR a.ambito = ?)";

    private static final String SELECT_CONTEO = """
            SELECT count(*) AS recibidas,
                   count(*) FILTER (WHERE a.estado = 'validada') AS validadas,
                   count(*) FILTER (WHERE a.estado = 'pendiente') AS pendientes,
                   count(*) FILTER (WHERE a.estado = 'validada' AND c.resultado = 'falsa') AS falsas,
                   round(COALESCE(sum(a.superficie_ha) FILTER (
                         WHERE a.estado = 'validada' AND c.resultado = 'antropica'), 0), 2) AS antropica_ha,
                   round(COALESCE(sum(a.superficie_ha) FILTER (
                         WHERE a.estado = 'validada' AND c.resultado = 'natural'), 0), 2) AS natural_ha,
                   round(COALESCE(sum(a.superficie_ha) FILTER (
                         WHERE a.estado = 'pendiente'), 0), 2) AS pendiente_ha
              FROM alerta a
              LEFT JOIN cat_causa c ON c.id = a.causa_id
             WHERE %s AND a.anio = ? AND a.mes = ?
            """.formatted(FILTRO_TERRITORIO);

    private static final String SELECT_POR_CAUSA = """
            SELECT c.nombre AS causa, count(*) AS alertas, round(sum(a.superficie_ha), 2) AS ha
              FROM alerta a
              JOIN cat_causa c ON c.id = a.causa_id
             WHERE %s AND a.anio = ? AND a.mes = ?
               AND a.estado = 'validada' AND c.resultado = 'antropica'
             GROUP BY c.nombre
             ORDER BY ha DESC
            """.formatted(FILTRO_TERRITORIO);

    private static final String SELECT_PERIODOS = """
            SELECT a.anio, a.mes, count(*) AS alertas
              FROM alerta a
             WHERE %s
             GROUP BY a.anio, a.mes
             ORDER BY a.anio DESC, a.mes DESC
            """.formatted(FILTRO_TERRITORIO);

    /** Propiedades públicas de una alerta: resultado y causal solo si ya está validada. */
    private static final String PROPIEDADES = """
            json_build_object(
                'codigo', a.codigo,
                'ambito', a.ambito,
                'territorio', a.territorio_codigo,
                'anio', a.anio,
                'mes', a.mes,
                'fecha_imagen', a.fecha_imagen,
                'superficie_ha', round(a.superficie_ha, 2),
                'estado', a.estado,
                'resultado', CASE WHEN a.estado = 'validada' THEN c.resultado END,
                'causa', CASE WHEN a.estado = 'validada' AND c.resultado = 'antropica' THEN c.nombre END,
                'confiabilidad', cf.nombre,
                'zonificacion', z.nombre,
                'sector', a.sector,
                'con_imagen', EXISTS (SELECT 1 FROM evidencia v
                                       WHERE v.alerta_id = a.id AND v.tipo = 'chip_despues'),
                'lon', round(ST_X(a.centroide)::numeric, 6),
                'lat', round(ST_Y(a.centroide)::numeric, 6))
            """;

    private static final String SELECT_ALERTAS_GEOJSON = """
            SELECT json_build_object(
                     'type', 'FeatureCollection',
                     'features', COALESCE(json_agg(json_build_object(
                         'type', 'Feature',
                         'id', a.codigo,
                         'geometry', ST_AsGeoJSON(a.geom, 6)::json,
                         'properties', %s) ORDER BY a.codigo), '[]'::json))::text
              FROM alerta a
              LEFT JOIN cat_causa c ON c.id = a.causa_id
              LEFT JOIN cat_confiabilidad cf ON cf.id = a.confiabilidad_id
              LEFT JOIN cat_zonificacion z ON z.codigo = a.zonificacion
             WHERE %s AND a.anio = ? AND a.mes = ?
            """.formatted(PROPIEDADES, FILTRO_TERRITORIO);

    private static final String SELECT_DETALLE = """
            SELECT json_build_object(
                     'type', 'Feature',
                     'id', a.codigo,
                     'geometry', ST_AsGeoJSON(a.geom, 6)::json,
                     'bbox', json_build_array(
                         round(ST_XMin(a.geom)::numeric, 6), round(ST_YMin(a.geom)::numeric, 6),
                         round(ST_XMax(a.geom)::numeric, 6), round(ST_YMax(a.geom)::numeric, 6)),
                     'properties', (%s)::jsonb || jsonb_build_object(
                         'acr', a.acr_codigo,
                         'acr_nombre', t.nombre,
                         'region', r.nombre,
                         'tipo_bosque', tb.nombre,
                         'fuente', f.nombre,
                         'conclusion', CASE WHEN a.estado = 'validada' THEN a.conclusion END,
                         'fecha_imagen_antes', a.fecha_imagen_ant,
                         'img_antes', a.img_antes,
                         'img_despues', a.img_despues,
                         'sat_antes', a.sat_antes,
                         'sat_despues', a.sat_despues))::text
              FROM alerta a
              JOIN region r ON r.id = a.region_id
              JOIN territorio t ON t.codigo = a.acr_codigo
              LEFT JOIN cat_causa c ON c.id = a.causa_id
              LEFT JOIN cat_confiabilidad cf ON cf.id = a.confiabilidad_id
              LEFT JOIN cat_zonificacion z ON z.codigo = a.zonificacion
              LEFT JOIN cat_tipo_bosque tb ON tb.id = a.tipo_bosque_id
              LEFT JOIN cat_fuente f ON f.id = a.fuente_id
             WHERE a.codigo = ?
            """.formatted(PROPIEDADES);

    private final JdbcTemplate jdbc;

    public AlertaRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Conteo conteo(String acr, Ambito ambito, int anio, int mes) {
        return jdbc.queryForObject(SELECT_CONTEO, (rs, i) -> new Conteo(
                rs.getInt("recibidas"),
                rs.getInt("validadas"),
                rs.getInt("pendientes"),
                rs.getInt("falsas"),
                rs.getBigDecimal("antropica_ha"),
                rs.getBigDecimal("natural_ha"),
                rs.getBigDecimal("pendiente_ha")),
                acr, ambito.name(), ambito.name(), anio, mes);
    }

    public List<CausaHa> porCausa(String acr, Ambito ambito, int anio, int mes) {
        return jdbc.query(SELECT_POR_CAUSA, (rs, i) -> new CausaHa(
                rs.getString("causa"), rs.getInt("alertas"), rs.getBigDecimal("ha")),
                acr, ambito.name(), ambito.name(), anio, mes);
    }

    public List<Periodo> periodos(String acr, Ambito ambito) {
        return jdbc.query(SELECT_PERIODOS, (rs, i) -> new Periodo(
                rs.getInt("anio"), rs.getInt("mes"), rs.getInt("alertas")),
                acr, ambito.name(), ambito.name());
    }

    public String alertasGeoJson(String acr, Ambito ambito, int anio, int mes) {
        return jdbc.queryForObject(SELECT_ALERTAS_GEOJSON, String.class,
                acr, ambito.name(), ambito.name(), anio, mes);
    }

    public Optional<String> detalle(String codigo) {
        try {
            return Optional.ofNullable(jdbc.queryForObject(SELECT_DETALLE, String.class, codigo));
        } catch (EmptyResultDataAccessException e) {
            return Optional.empty();
        }
    }
}
