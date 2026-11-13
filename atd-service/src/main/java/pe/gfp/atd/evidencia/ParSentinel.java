package pe.gfp.atd.evidencia;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Guarda el par antes/después del reporte. Solo entran escenas Sentinel-2 L2A
 * con nubosidad de la escena menor a 3 %. Si no hay una, el recuadro queda vacío.
 */
@Service
public class ParSentinel {

    private static final Logger log = LoggerFactory.getLogger(ParSentinel.class);
    private static final double MAX_NUBES = 3;
    private static final int ANTES_DESDE = 75;
    private static final int ANTES_HASTA = 8;
    private static final int DESPUES_HASTA = 25;

    private final JdbcTemplate jdbc;
    private final SentinelCatalogo catalogo;
    private final HttpClient http = HttpClient.newBuilder()
            .followRedirects(HttpClient.Redirect.NORMAL)
            .connectTimeout(Duration.ofSeconds(15))
            .build();

    public ParSentinel(JdbcTemplate jdbc, SentinelCatalogo catalogo) {
        this.jdbc = jdbc;
        this.catalogo = catalogo;
    }

    public void asegurar(String codigo) {
        List<Punto> puntos = jdbc.query("""
                SELECT id, ST_X(centroide) AS lon, ST_Y(centroide) AS lat, fecha_imagen
                  FROM alerta WHERE codigo = ?
                """, (rs, i) -> new Punto(rs.getLong("id"), rs.getDouble("lon"), rs.getDouble("lat"),
                        rs.getObject("fecha_imagen", LocalDate.class)), codigo);
        if (puntos.isEmpty() || puntos.get(0).fecha() == null) {
            return;
        }
        Punto p = puntos.get(0);
        boolean tieneAntes = tieneChip(p.id(), "antes");
        boolean tieneDespues = tieneChip(p.id(), "despues");
        if (tieneAntes && tieneDespues) {
            return;
        }
        LocalDate det = p.fecha();
        if (!tieneAntes) {
            guardarLado(p, "antes", det.minusDays(ANTES_DESDE), det.minusDays(ANTES_HASTA), det, true);
        }
        if (!tieneDespues) {
            guardarLado(p, "despues", det, det.plusDays(DESPUES_HASTA), det, false);
        }
    }

    private void guardarLado(Punto p, String momento, LocalDate desde, LocalDate hasta, LocalDate det, boolean anterior) {
        BusquedaSentinel busqueda = catalogo.buscar(p.lon(), p.lat(), desde, hasta, MAX_NUBES);
        Optional<EscenaLibre> elegida = elegir(busqueda.escenas(), det, anterior);
        if (elegida.isEmpty()) {
            log.info("Sin escena Sentinel < {} % para {} ({})", MAX_NUBES, p, momento);
            return;
        }
        EscenaLibre escena = elegida.get();
        byte[] png = descargar(escena.recorte());
        if (png == null) {
            log.warn("No se pudo descargar el recorte {} de {}", momento, escena.escenaId());
            return;
        }
        double xmin = x3857(escena.oeste());
        double ymin = y3857(escena.sur());
        double xmax = x3857(escena.este());
        double ymax = y3857(escena.norte());
        Long escenaId = jdbc.queryForObject("""
                INSERT INTO escena (alerta_id, momento, proveedor, escena_id, fecha, nubosidad, nubosidad_escena,
                                    publica, rec_xmin, rec_ymin, rec_xmax, rec_ymax)
                VALUES (?, ?, 'sentinel2', ?, ?, ?, ?, TRUE, ?, ?, ?, ?)
                ON CONFLICT (alerta_id, momento, proveedor) DO UPDATE SET
                    escena_id = EXCLUDED.escena_id,
                    fecha = EXCLUDED.fecha,
                    nubosidad = EXCLUDED.nubosidad,
                    nubosidad_escena = EXCLUDED.nubosidad_escena,
                    publica = TRUE,
                    rec_xmin = EXCLUDED.rec_xmin,
                    rec_ymin = EXCLUDED.rec_ymin,
                    rec_xmax = EXCLUDED.rec_xmax,
                    rec_ymax = EXCLUDED.rec_ymax
                RETURNING id
                """, Long.class, p.id(), momento, escena.escenaId(), LocalDate.parse(escena.fecha()),
                escena.nubes(), escena.nubes(), xmin, ymin, xmax, ymax);
        jdbc.update("""
                INSERT INTO evidencia (alerta_id, escena_id, tipo, contenido, mime, ruta)
                VALUES (?, ?, ?, ?, 'image/png', 'sentinel2')
                ON CONFLICT (alerta_id, tipo) DO UPDATE SET
                    escena_id = EXCLUDED.escena_id,
                    contenido = EXCLUDED.contenido,
                    mime = EXCLUDED.mime
                """, p.id(), escenaId, "chip_" + momento, png);
    }

    private boolean tieneChip(long alertaId, String momento) {
        Boolean ok = jdbc.queryForObject("""
                SELECT EXISTS (
                    SELECT 1 FROM evidencia v
                      JOIN escena e ON e.id = v.escena_id
                     WHERE v.alerta_id = ? AND v.tipo = ? AND v.contenido IS NOT NULL AND e.publica)
                """, Boolean.class, alertaId, "chip_" + momento);
        return Boolean.TRUE.equals(ok);
    }

    private static Optional<EscenaLibre> elegir(List<EscenaLibre> escenas, LocalDate det, boolean anterior) {
        return escenas.stream()
                .filter(e -> e.fecha() != null && e.fecha().length() >= 10 && e.nubes() < MAX_NUBES && !e.recorte().isBlank())
                .filter(e -> {
                    LocalDate f = LocalDate.parse(e.fecha());
                    long delta = ChronoUnit.DAYS.between(f, det);
                    return anterior ? delta >= ANTES_HASTA : delta <= 0;
                })
                .min(Comparator.comparingDouble(EscenaLibre::nubes)
                        .thenComparingLong(e -> Math.abs(ChronoUnit.DAYS.between(LocalDate.parse(e.fecha()), det))));
    }

    private byte[] descargar(String url) {
        if (url == null || url.isBlank()) {
            return null;
        }
        try {
            HttpRequest req = HttpRequest.newBuilder(URI.create(url))
                    .timeout(Duration.ofSeconds(40))
                    .header("User-Agent", "gfp-atd/1.0")
                    .GET()
                    .build();
            HttpResponse<byte[]> res = http.send(req, HttpResponse.BodyHandlers.ofByteArray());
            byte[] cuerpo = res.body();
            if (res.statusCode() != 200 || cuerpo == null || cuerpo.length < 800 || cuerpo.length > 4_000_000) {
                return null;
            }
            if (cuerpo[0] != (byte) 0x89 || cuerpo[1] != 0x50) {
                return null;
            }
            return cuerpo;
        } catch (Exception e) {
            log.warn("Recorte Sentinel no disponible: {}", e.toString());
            return null;
        }
    }

    private static double x3857(double lon) {
        return lon * 20037508.342789244 / 180.0;
    }

    private static double y3857(double lat) {
        double y = Math.log(Math.tan(Math.toRadians(90 + lat) / 2.0)) / (Math.PI / 180.0);
        return y * 20037508.342789244 / 180.0;
    }

    private record Punto(long id, double lon, double lat, LocalDate fecha) {
    }
}
