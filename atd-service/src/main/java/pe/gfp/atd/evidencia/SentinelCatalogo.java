package pe.gfp.atd.evidencia;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Busca otras fechas Sentinel-2 L2A en el catálogo público de Element84 (el mismo del toolbox).
 * No reemplaza el par antes/después guardado para el reporte.
 */
@Service
public class SentinelCatalogo {

    private static final Logger log = LoggerFactory.getLogger(SentinelCatalogo.class);
    private static final String STAC = "https://earth-search.aws.element84.com/v1/search";
    private static final String TITILER = "https://titiler.xyz/cog/bbox/";
    private static final int MAX_DIAS = 120;
    private static final int MAX_FECHAS = 12;
    private static final double RADIO = 0.012;

    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(8)).build();
    private final ObjectMapper json = new ObjectMapper();

    public BusquedaSentinel buscar(double lon, double lat, LocalDate desde, LocalDate hasta) {
        return buscar(lon, lat, desde, hasta, 80);
    }

    /** maxNubes es el tope de eo:cloud_cover (0 a 80). El par del reporte usa 30. */
    public BusquedaSentinel buscar(double lon, double lat, LocalDate desde, LocalDate hasta, double maxNubes) {
        if (hasta.isBefore(desde)) {
            LocalDate tmp = desde;
            desde = hasta;
            hasta = tmp;
        }
        if (ChronoUnit.DAYS.between(desde, hasta) > MAX_DIAS) {
            throw new IllegalArgumentException("El rango supera " + MAX_DIAS + " días");
        }
        double tope = Math.max(0, Math.min(80, maxNubes));
        try {
            ObjectNode cuerpo = json.createObjectNode();
            cuerpo.putArray("collections").add("sentinel-2-l2a");
            ObjectNode punto = cuerpo.putObject("intersects");
            punto.put("type", "Point");
            punto.putArray("coordinates").add(lon).add(lat);
            cuerpo.put("datetime", desde + "T00:00:00Z/" + hasta + "T23:59:59Z");
            cuerpo.putObject("query").putObject("eo:cloud_cover").put("lte", tope);
            cuerpo.putArray("sortby").addObject().put("field", "properties.datetime").put("direction", "desc");
            cuerpo.put("limit", 40);

            HttpRequest req = HttpRequest.newBuilder(URI.create(STAC))
                    .timeout(Duration.ofSeconds(25))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(cuerpo)))
                    .build();
            HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() != 200) {
                log.warn("Catálogo Sentinel-2 respondió HTTP {}", res.statusCode());
                return new BusquedaSentinel(List.of(), "El catálogo Sentinel-2 no respondió. Intente de nuevo.");
            }
            String aviso = tope <= 30
                    ? "Escenas Sentinel-2 L2A con nubosidad de hasta 30 %."
                    : "Fechas del catálogo Sentinel-2 L2A. El par del reporte no cambia.";
            return new BusquedaSentinel(unicas(json.readTree(res.body()), lon, lat), aviso);
        } catch (IllegalArgumentException e) {
            throw e;
        } catch (Exception e) {
            log.warn("No se pudo consultar Sentinel-2: {}", e.toString());
            return new BusquedaSentinel(List.of(), "El catálogo Sentinel-2 no respondió. Intente de nuevo.");
        }
    }

    private List<EscenaLibre> unicas(JsonNode raiz, double lon, double lat) {
        Map<String, EscenaLibre> porFecha = new LinkedHashMap<>();
        for (JsonNode item : raiz.path("features")) {
            String fecha = item.path("properties").path("datetime").asText("").substring(0, Math.min(10,
                    item.path("properties").path("datetime").asText("").length()));
            if (fecha.length() < 10 || porFecha.containsKey(fecha)) {
                continue;
            }
            JsonNode assets = item.path("assets");
            String visual = assets.path("visual").path("href").asText("");
            String mini = assets.path("thumbnail").path("href").asText("");
            if (visual.isBlank() && mini.isBlank()) {
                continue;
            }
            double nubes = item.path("properties").path("eo:cloud_cover").asDouble(0);
            double oeste = lon - RADIO;
            double este = lon + RADIO;
            double sur = lat - RADIO;
            double norte = lat + RADIO;
            String recorte = visual.isBlank() ? "" : TITILER + oeste + "," + sur + "," + este + "," + norte
                    + ".png?coord-crs=epsg:4326&url=" + URLEncoder.encode(visual, StandardCharsets.UTF_8);
            porFecha.put(fecha, new EscenaLibre(
                    item.path("id").asText(""),
                    fecha,
                    Math.round(nubes * 10) / 10.0,
                    mini,
                    recorte,
                    oeste, sur, este, norte));
            if (porFecha.size() >= MAX_FECHAS) {
                break;
            }
        }
        List<EscenaLibre> lista = new ArrayList<>(porFecha.values());
        lista.sort(Comparator.comparing(EscenaLibre::fecha).reversed());
        return lista;
    }
}
