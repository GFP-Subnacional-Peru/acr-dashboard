package pe.gfp.atd.evidencia;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
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
 * con nubosidad de la escena de hasta 30 %. Si no hay una, el recuadro queda vacío.
 */
@Service
public class ParSentinel {

    private static final Logger log = LoggerFactory.getLogger(ParSentinel.class);
    private static final double MAX_NUBES = 30;
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
            try {
                guardarLado(p, "antes", det.minusDays(ANTES_DESDE), det.minusDays(ANTES_HASTA), det, true);
            } catch (RuntimeException e) {
                log.warn("No se guardó la escena anterior de {}: {}", codigo, e.toString());
            }
        }
        if (!tieneDespues) {
            try {
                guardarLado(p, "despues", det, det.plusDays(DESPUES_HASTA), det, false);
            } catch (RuntimeException e) {
                log.warn("No se guardó la escena posterior de {}: {}", codigo, e.toString());
            }
        }
    }

    private void guardarLado(Punto p, String momento, LocalDate desde, LocalDate hasta, LocalDate det, boolean anterior) {
        BusquedaSentinel busqueda = catalogo.buscar(p.lon(), p.lat(), desde, hasta, MAX_NUBES);
        Optional<EscenaLibre> elegida = elegir(busqueda.escenas(), det, anterior);
        if (elegida.isEmpty()) {
            log.info("Sin escena Sentinel de hasta {} % para {} ({})", MAX_NUBES, p, momento);
            return;
        }
        EscenaLibre escena = elegida.get();
        byte[] png = descargar(escena);
        if (png == null) {
            log.warn("No se pudo descargar el recorte {} de {}", momento, escena.escenaId());
            return;
        }
        String mime = png[0] == (byte) 0xFF ? "image/jpeg" : "image/png";
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
                VALUES (?, ?, ?, ?, ?, 'sentinel2')
                ON CONFLICT (alerta_id, tipo) WHERE tipo IN ('chip_antes', 'chip_despues') DO UPDATE SET
                    escena_id = EXCLUDED.escena_id,
                    contenido = EXCLUDED.contenido,
                    mime = EXCLUDED.mime
                """, p.id(), escenaId, "chip_" + momento, png, mime);
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
                .filter(e -> e.fecha() != null && e.fecha().length() >= 10 && e.nubes() <= MAX_NUBES && !e.recorte().isBlank())
                .filter(e -> {
                    LocalDate f = LocalDate.parse(e.fecha());
                    long delta = ChronoUnit.DAYS.between(f, det);
                    return anterior ? delta >= ANTES_HASTA : delta <= 0;
                })
                .min(Comparator.comparingDouble(EscenaLibre::nubes)
                        .thenComparingLong(e -> Math.abs(ChronoUnit.DAYS.between(LocalDate.parse(e.fecha()), det))));
    }

    private byte[] descargar(EscenaLibre escena) {
        String titiler = escena.recorte();
        if (titiler != null && !titiler.isBlank() && !titiler.contains("width=")) {
            titiler = titiler + "&width=512&height=512";
        }
        byte[] recorte = leer(titiler);
        if (recorte != null) {
            return recorte;
        }
        byte[] esri = leer(urlEsri(escena));
        if (esri == null) {
            log.warn("Sin recorte para {}", escena.escenaId());
        }
        return esri;
    }

    /** La misma escena, por el servicio de Sentinel-2 que ya usa el mapa del reporte. */
    private static String urlEsri(EscenaLibre escena) {
        LocalDate dia = LocalDate.parse(escena.fecha());
        String where = "acquisitiondate >= timestamp '" + dia + " 00:00:00' AND acquisitiondate < timestamp '"
                + dia.plusDays(1) + " 00:00:00'";
        String mosaic = URLEncoder.encode(
                "{\"mosaicMethod\":\"esriMosaicAttribute\",\"sortField\":\"acquisitiondate\","
                        + "\"sortValue\":\"2099/12/31\",\"ascending\":true,\"where\":\"" + where + "\"}",
                StandardCharsets.UTF_8);
        String render = URLEncoder.encode("{\"rasterFunction\":\"Natural Color\"}", StandardCharsets.UTF_8);
        return "https://sentinel.arcgis.com/arcgis/rest/services/Sentinel2/ImageServer/exportImage"
                + "?bbox=" + x3857(escena.oeste()) + "," + y3857(escena.sur()) + ","
                + x3857(escena.este()) + "," + y3857(escena.norte())
                + "&bboxSR=3857&imageSR=3857&size=640,640&format=png&f=image"
                + "&mosaicRule=" + mosaic + "&renderingRule=" + render;
    }

    private byte[] leer(String url) {
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
                log.warn("Recorte HTTP {} ({} bytes) {}", res.statusCode(), cuerpo == null ? 0 : cuerpo.length, url);
                return null;
            }
            boolean png = cuerpo[0] == (byte) 0x89 && cuerpo[1] == 0x50;
            boolean jpeg = cuerpo[0] == (byte) 0xFF && cuerpo[1] == (byte) 0xD8;
            if (!png && !jpeg) {
                log.warn("El recorte no es una imagen: {}", url);
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
