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
                SELECT e.momento, e.proveedor, e.escena_id, e.fecha, e.nubosidad
                  FROM escena e
                  JOIN alerta a ON a.id = e.alerta_id
                 WHERE a.codigo = ? AND e.publica
                   AND EXISTS (SELECT 1 FROM evidencia v
                                WHERE v.escena_id = e.id AND v.contenido IS NOT NULL)
                 ORDER BY e.momento = 'despues', e.fecha
                """, (rs, i) -> new Escena(
                rs.getString("momento"),
                rs.getString("proveedor"),
                rs.getString("escena_id"),
                rs.getObject("fecha", LocalDate.class),
                rs.getBigDecimal("nubosidad"),
                "/api/atd/alertas/" + codigoAlerta + "/imagen/" + rs.getString("momento") + ".png"),
                codigoAlerta);
    }

    public Optional<byte[]> imagen(String codigoAlerta, String momento) {
        List<byte[]> filas = jdbc.query("""
                SELECT v.contenido
                  FROM evidencia v
                  JOIN alerta a ON a.id = v.alerta_id
                  JOIN escena e ON e.id = v.escena_id AND e.publica
                 WHERE a.codigo = ? AND v.tipo = ? AND v.contenido IS NOT NULL
                """, (rs, i) -> rs.getBytes(1), codigoAlerta, "chip_" + momento);
        return filas.stream().findFirst();
    }
}
