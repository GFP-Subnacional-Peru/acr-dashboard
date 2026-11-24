package pe.gfp.atd.evidencia;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.springframework.dao.EmptyResultDataAccessException;
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

    public record Foto(long id, String nota, String tomada, Double lat, Double lon, String autor, String cargo) {}

    public List<Foto> fotos(String codigoAlerta) {
        return jdbc.query("""
                SELECT v.id, v.descripcion, to_char(v.creado_en, 'DD/MM/YYYY HH24:MI') AS tomada,
                       v.lat, v.lon, v.autor_nombre, v.autor_cargo
                  FROM evidencia v
                  JOIN alerta a ON a.id = v.alerta_id
                 WHERE a.codigo = ? AND v.tipo = 'foto_campo'
                 ORDER BY v.creado_en
                """, (rs, i) -> new Foto(rs.getLong("id"), rs.getString("descripcion"), rs.getString("tomada"),
                        (Double) rs.getObject("lat"), (Double) rs.getObject("lon"),
                        rs.getString("autor_nombre"), rs.getString("autor_cargo")),
                codigoAlerta);
    }

    public List<Foto> videos(String codigoAlerta) {
        return jdbc.query("""
                SELECT v.id, v.descripcion, to_char(v.creado_en, 'DD/MM/YYYY HH24:MI') AS tomada,
                       v.lat, v.lon, v.autor_nombre, v.autor_cargo
                  FROM evidencia v
                  JOIN alerta a ON a.id = v.alerta_id
                 WHERE a.codigo = ? AND v.tipo = 'video_campo'
                 ORDER BY v.creado_en
                """, (rs, i) -> new Foto(rs.getLong("id"), rs.getString("descripcion"), rs.getString("tomada"),
                        (Double) rs.getObject("lat"), (Double) rs.getObject("lon"),
                        rs.getString("autor_nombre"), rs.getString("autor_cargo")),
                codigoAlerta);
    }

    public int contarFotos(String codigoAlerta) {
        Integer n = jdbc.queryForObject("""
                SELECT count(*) FROM evidencia v
                  JOIN alerta a ON a.id = v.alerta_id
                 WHERE a.codigo = ? AND v.tipo = 'foto_campo'
                """, Integer.class, codigoAlerta);
        return n == null ? 0 : n;
    }

    public record FotoGuardada(byte[] datos, String mime, String ruta) {}

    public long guardarFoto(String codigoAlerta, byte[] datos, String mime, String nota, String ruta,
                            Double lat, Double lon, String autor, String cargo) {
        return guardarMedio(codigoAlerta, "foto_campo", datos, mime, nota, ruta, lat, lon, autor, cargo);
    }

    public long guardarVideo(String codigoAlerta, byte[] datos, String mime, String nota, String ruta,
                             Double lat, Double lon, String autor, String cargo) {
        return guardarMedio(codigoAlerta, "video_campo", datos, mime, nota, ruta, lat, lon, autor, cargo);
    }

    private long guardarMedio(String codigoAlerta, String tipo, byte[] datos, String mime, String nota, String ruta,
                              Double lat, Double lon, String autor, String cargo) {
        final Long alertaId;
        try {
            alertaId = jdbc.queryForObject("SELECT id FROM alerta WHERE codigo = ?", Long.class, codigoAlerta);
        } catch (EmptyResultDataAccessException e) {
            throw new pe.gfp.atd.config.NoEncontradoException("Alerta no encontrada");
        }
        Long id = jdbc.queryForObject("""
                INSERT INTO evidencia (alerta_id, tipo, ruta, descripcion, contenido, mime, lat, lon, autor_nombre, autor_cargo)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                RETURNING id
                """, Long.class, alertaId, tipo, ruta, nota, datos, mime, lat, lon, autor, cargo);
        if (id == null) {
            throw new pe.gfp.atd.config.NoEncontradoException("Alerta no encontrada");
        }
        return id;
    }

    public Optional<FotoGuardada> video(String codigoAlerta, long id) {
        return medio(codigoAlerta, id, "video_campo");
    }

    public Optional<FotoGuardada> foto(String codigoAlerta, long id) {
        return medio(codigoAlerta, id, "foto_campo");
    }

    private Optional<FotoGuardada> medio(String codigoAlerta, long id, String tipo) {
        List<FotoGuardada> filas = jdbc.query("""
                SELECT v.contenido, v.mime, v.ruta
                  FROM evidencia v
                  JOIN alerta a ON a.id = v.alerta_id
                 WHERE a.codigo = ? AND v.id = ? AND v.tipo = ?
                """, (rs, i) -> new FotoGuardada(rs.getBytes(1), rs.getString(2), rs.getString(3)),
                codigoAlerta, id, tipo);
        return filas.stream().findFirst();
    }

    /** Borra la fila y devuelve la ruta de Drive, si la tenía. Vacío si la foto no existe. */
    public Optional<String> borrarFoto(String codigoAlerta, long id) {
        List<String> rutas = jdbc.query("""
                SELECT COALESCE(v.ruta, '')
                  FROM evidencia v
                  JOIN alerta a ON a.id = v.alerta_id
                 WHERE a.codigo = ? AND v.id = ? AND v.tipo = 'foto_campo'
                """, (rs, i) -> rs.getString(1), codigoAlerta, id);
        if (rutas.isEmpty()) {
            return Optional.empty();
        }
        jdbc.update("""
                DELETE FROM evidencia v USING alerta a
                 WHERE v.alerta_id = a.id AND a.codigo = ? AND v.id = ? AND v.tipo = 'foto_campo'
                """, codigoAlerta, id);
        return Optional.of(rutas.get(0));
    }
}
