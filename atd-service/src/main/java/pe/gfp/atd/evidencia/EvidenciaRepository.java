package pe.gfp.atd.evidencia;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class EvidenciaRepository {

    private final JdbcTemplate jdbc;

    public EvidenciaRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Solo escenas públicas (Sentinel-2); Planet queda reservado a validadores. */
    public List<Escena> escenas(String codigoAlerta) {
        return jdbc.query("""
                SELECT e.momento, e.proveedor, e.escena_id, e.fecha, e.nubosidad, e.nubosidad_escena,
                       e.rec_xmin, e.rec_ymin, e.rec_xmax, e.rec_ymax,
                       extract(epoch FROM v.creado_en)::bigint AS version
                  FROM escena e
                  JOIN alerta a ON a.id = e.alerta_id
                  JOIN evidencia v ON v.escena_id = e.id AND v.contenido IS NOT NULL
                 WHERE a.codigo = ? AND e.publica
                 ORDER BY e.momento = 'despues', e.fecha
                """, (rs, i) -> new Escena(
                rs.getString("momento"),
                rs.getString("proveedor"),
                rs.getString("escena_id"),
                rs.getObject("fecha", LocalDate.class),
                rs.getBigDecimal("nubosidad"),
                rs.getBigDecimal("nubosidad_escena"),
                rs.getObject("rec_xmin") == null ? null : new double[] {
                        rs.getDouble("rec_xmin"), rs.getDouble("rec_ymin"),
                        rs.getDouble("rec_xmax"), rs.getDouble("rec_ymax")},
                "/api/atd/alertas/" + codigoAlerta + "/imagen/" + rs.getString("momento") + ".png?v="
                        + rs.getLong("version")),
                codigoAlerta);
    }

    public record PuntoAlerta(double lon, double lat, LocalDate fechaImagen) {}

    public Optional<PuntoAlerta> punto(String codigoAlerta) {
        List<PuntoAlerta> filas = jdbc.query("""
                SELECT ST_X(centroide) AS lon, ST_Y(centroide) AS lat, fecha_imagen
                  FROM alerta
                 WHERE codigo = ?
                """, (rs, i) -> new PuntoAlerta(
                rs.getDouble("lon"),
                rs.getDouble("lat"),
                rs.getObject("fecha_imagen", LocalDate.class)), codigoAlerta);
        return filas.stream().findFirst();
    }

    public record Imagen(byte[] datos, String mime) {}

    public Optional<Imagen> imagen(String codigoAlerta, String momento) {
        List<Imagen> filas = jdbc.query("""
                SELECT v.contenido, v.mime
                  FROM evidencia v
                  JOIN alerta a ON a.id = v.alerta_id
                  JOIN escena e ON e.id = v.escena_id AND e.publica
                 WHERE a.codigo = ? AND v.tipo = ? AND v.contenido IS NOT NULL
                """, (rs, i) -> new Imagen(rs.getBytes(1), rs.getString(2)), codigoAlerta, "chip_" + momento);
        return filas.stream().findFirst();
    }
}
