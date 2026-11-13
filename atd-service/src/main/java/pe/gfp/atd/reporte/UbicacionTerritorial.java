package pe.gfp.atd.reporte;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.InputStream;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Completa zonificación, sector y grilla EXA cruzando el centroide con las capas
 * que ya usa el visor. No inventa un nombre si el punto no cae en ningún polígono.
 */
@Service
public class UbicacionTerritorial {

    private static final Logger log = LoggerFactory.getLogger(UbicacionTerritorial.class);
    private static final Map<String, String> ZONAS = Map.of(
            "zona de proteccion estricta", "PE",
            "zona silvestre", "S",
            "zona de recuperacion", "REC",
            "zona historico cultural", "HC",
            "zona de aprovechamiento directo", "AD",
            "zona de uso especial", "UE",
            "zona de uso turistico y recreativo", "T",
            "no zonificado", "No Zonificado");

    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    private volatile List<Poligono> zonificacion;
    private volatile List<Poligono> sectores;
    private volatile List<Poligono> grilla;

    public UbicacionTerritorial(JdbcTemplate jdbc, ObjectMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    @Transactional(propagation = Propagation.NESTED)
    public void completar(String codigo) {
        List<Centro> centros = jdbc.query("""
                SELECT acr_codigo, ST_X(centroide) AS lon, ST_Y(centroide) AS lat
                  FROM alerta
                 WHERE codigo = ?
                   AND (zonificacion IS NULL OR nullif(btrim(sector), '') IS NULL OR nullif(btrim(exa), '') IS NULL)
                """, (rs, i) -> new Centro(rs.getString("acr_codigo"), rs.getDouble("lon"), rs.getDouble("lat")),
                codigo);
        if (centros.isEmpty()) {
            return;
        }
        Centro c = centros.get(0);
        asegurarCapas();
        String zona = codigoZona(nombreEn(zonificacion, c));
        String sector = nombreEn(sectores, c);
        String exa = nombreEn(grilla, c);
        if (zona == null && sector == null && exa == null) {
            return;
        }
        jdbc.update("""
                UPDATE alerta SET
                       zonificacion = COALESCE(zonificacion, ?),
                       sector = COALESCE(NULLIF(btrim(sector), ''), ?),
                       exa = COALESCE(NULLIF(btrim(exa), ''), ?)
                 WHERE codigo = ?
                """, zona, sector, exa, codigo);
    }

    private void asegurarCapas() {
        if (zonificacion == null) {
            synchronized (this) {
                if (zonificacion == null) {
                    zonificacion = leer("static/limites/zonif.geojson", false);
                    sectores = leer("static/limites/sectores.geojson", false);
                    grilla = leer("static/limites/exa.geojson", true);
                }
            }
        }
    }

    private List<Poligono> leer(String ruta, boolean soloCaja) {
        List<Poligono> salida = new ArrayList<>();
        try (InputStream in = new ClassPathResource(ruta).getInputStream()) {
            for (JsonNode f : json.readTree(in).path("features")) {
                String acr = f.path("properties").path("acr").asText("");
                String label = f.path("properties").path("label").asText("");
                if (acr.isBlank() || label.isBlank()) {
                    continue;
                }
                JsonNode geom = f.path("geometry");
                String tipo = geom.path("type").asText();
                JsonNode coords = geom.path("coordinates");
                if ("Polygon".equals(tipo)) {
                    agregar(salida, acr, label, coords, soloCaja);
                } else if ("MultiPolygon".equals(tipo)) {
                    for (JsonNode poligono : coords) {
                        agregar(salida, acr, label, poligono, soloCaja);
                    }
                }
            }
        } catch (Exception e) {
            log.warn("No se leyó {}: {}", ruta, e.toString());
        }
        return salida;
    }

    private static void agregar(List<Poligono> salida, String acr, String label, JsonNode anillos, boolean soloCaja) {
        if (!anillos.isArray() || anillos.isEmpty()) {
            return;
        }
        JsonNode anillo = anillos.get(0);
        int n = anillo.size();
        if (n < 3) {
            return;
        }
        double minx = Double.POSITIVE_INFINITY;
        double miny = Double.POSITIVE_INFINITY;
        double maxx = Double.NEGATIVE_INFINITY;
        double maxy = Double.NEGATIVE_INFINITY;
        double[][] ring = soloCaja ? null : new double[n][2];
        for (int i = 0; i < n; i++) {
            double x = anillo.get(i).get(0).asDouble();
            double y = anillo.get(i).get(1).asDouble();
            if (x < minx) minx = x;
            if (y < miny) miny = y;
            if (x > maxx) maxx = x;
            if (y > maxy) maxy = y;
            if (!soloCaja) {
                ring[i][0] = x;
                ring[i][1] = y;
            }
        }
        salida.add(new Poligono(acr, label, minx, miny, maxx, maxy, ring));
    }

    private static String nombreEn(List<Poligono> capa, Centro c) {
        if (capa == null) {
            return null;
        }
        for (Poligono p : capa) {
            if (!p.acr().equals(c.acr())) {
                continue;
            }
            if (c.lon() < p.minx() || c.lon() > p.maxx() || c.lat() < p.miny() || c.lat() > p.maxy()) {
                continue;
            }
            if (p.anillo() == null || contiene(c.lon(), c.lat(), p.anillo())) {
                return p.label();
            }
        }
        return null;
    }

    private static boolean contiene(double x, double y, double[][] anillo) {
        boolean dentro = false;
        for (int i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
            double xi = anillo[i][0];
            double yi = anillo[i][1];
            double xj = anillo[j][0];
            double yj = anillo[j][1];
            if (((yi > y) != (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi + 0.0) + xi)) {
                dentro = !dentro;
            }
        }
        return dentro;
    }

    private static String codigoZona(String label) {
        if (label == null) {
            return null;
        }
        String n = Normalizer.normalize(label, Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "")
                .toLowerCase(Locale.ROOT)
                .trim();
        return ZONAS.get(n);
    }

    private record Centro(String acr, double lon, double lat) {
    }

    private record Poligono(String acr, String label, double minx, double miny, double maxx, double maxy,
                            double[][] anillo) {
    }
}
