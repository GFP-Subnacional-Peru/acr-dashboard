package pe.gfp.atd.reporte;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.Font;
import java.awt.FontMetrics;
import java.awt.Graphics2D;
import java.awt.Polygon;
import java.awt.RenderingHints;
import java.awt.geom.Ellipse2D;
import java.awt.geom.Path2D;
import java.awt.geom.Rectangle2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.function.DoubleUnaryOperator;
import javax.imageio.ImageIO;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/** Imágenes del reporte: contorno de la alerta sobre los recortes Sentinel-2 y mapa de ubicación. */
@Component
public class Dibujo {

    private static final Logger log = LoggerFactory.getLogger(Dibujo.class);
    private static final String ESRI_EXPORT =
            "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export"
                    + "?bbox=%.1f,%.1f,%.1f,%.1f&bboxSR=3857&imageSR=3857&size=%d,%d&format=jpg&f=image";
    private static final Color ROJO = new Color(0xE5, 0x1A, 0x2E);
    private static final Color VERDE = new Color(0x2E, 0xCC, 0x40);
    private static final Color GRIS = new Color(0xB0, 0xB6, 0xBA);

    private final ObjectMapper json = new ObjectMapper();
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();

    /** Recorte Sentinel-2 con el polígono vigente en rojo. Sin extensión conocida, se devuelve tal cual. */
    public byte[] conContorno(byte[] png, double[] recorte, String geom3857) {
        if (recorte == null || geom3857 == null) {
            return png;
        }
        BufferedImage img = leer(png);
        Graphics2D g = lienzo(img);
        double sx = img.getWidth() / (recorte[2] - recorte[0]);
        double sy = img.getHeight() / (recorte[3] - recorte[1]);
        Path2D p = trazo(geom3857, x -> (x - recorte[0]) * sx, y -> (recorte[3] - y) * sy);
        g.setColor(new Color(255, 255, 255, 140));
        g.setStroke(new BasicStroke(4.2f, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND));
        g.draw(p);
        g.setColor(ROJO);
        g.setStroke(new BasicStroke(2.4f, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND));
        g.draw(p);
        g.dispose();
        return escribir(img, "png");
    }

    /** Mapa de ubicación: imagen satelital, ZI gris, ACR verde y la alerta marcada en rojo. */
    public byte[] mapaUbicacion(ReporteRepository.Limites lim, String geomAlerta3857, String titulo) {
        int w = 1060;
        int h = 750;
        Rectangle2D caja = limites(lim.zi() != null ? lim.zi() : lim.acr());
        if (lim.acr() != null) {
            caja = caja.createUnion(limites(lim.acr()));
        }
        double margen = Math.max(caja.getWidth(), caja.getHeight()) * 0.06;
        double cx = caja.getCenterX();
        double cy = caja.getCenterY();
        double ancho = caja.getWidth() + 2 * margen;
        double alto = caja.getHeight() + 2 * margen;
        if (ancho / alto > (double) w / h) {
            alto = ancho * h / w;
        } else {
            ancho = alto * w / h;
        }
        double x0 = cx - ancho / 2;
        double y1 = cy + alto / 2;
        double esc = w / ancho;

        BufferedImage img = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = lienzo(img);
        g.setColor(new Color(0x1D, 0x2B, 0x22));
        g.fillRect(0, 0, w, h);
        BufferedImage fondo = satelital(x0, y1 - alto, x0 + ancho, y1, w, h);
        if (fondo != null) {
            g.drawImage(fondo, 0, 0, w, h, null);
        }
        DoubleUnaryOperator fx = x -> (x - x0) * esc;
        DoubleUnaryOperator fy = y -> (y1 - y) * esc;

        if (lim.zi() != null) {
            g.setColor(GRIS);
            g.setStroke(new BasicStroke(2.6f, BasicStroke.CAP_BUTT, BasicStroke.JOIN_ROUND, 10f, new float[] {9f, 6f}, 0f));
            g.draw(trazo(lim.zi(), fx, fy));
        }
        if (lim.acr() != null) {
            Path2D acr = trazo(lim.acr(), fx, fy);
            g.setColor(new Color(46, 204, 64, 45));
            g.fill(acr);
            g.setColor(VERDE);
            g.setStroke(new BasicStroke(2.6f));
            g.draw(acr);
        }
        Rectangle2D alerta = trazo(geomAlerta3857, fx, fy).getBounds2D();
        double r = 13;
        Ellipse2D marca = new Ellipse2D.Double(alerta.getCenterX() - r, alerta.getCenterY() - r, 2 * r, 2 * r);
        g.setColor(Color.WHITE);
        g.setStroke(new BasicStroke(4f));
        g.draw(marca);
        g.setColor(ROJO);
        g.fill(new Ellipse2D.Double(alerta.getCenterX() - 7, alerta.getCenterY() - 7, 14, 14));
        g.setStroke(new BasicStroke(2.2f));
        g.draw(marca);

        g.setColor(new Color(0, 0, 0, 150));
        g.fillRect(0, 0, w, 40);
        g.setColor(Color.WHITE);
        g.setFont(new Font(Font.SANS_SERIF, Font.BOLD, 19));
        FontMetrics fm = g.getFontMetrics();
        g.drawString(titulo, (w - fm.stringWidth(titulo)) / 2, 27);

        norte(g, w - 46, 70);
        leyenda(g, 14, h - 14, lim.zi() != null);
        g.dispose();
        return escribir(img, "jpg");
    }

    private void norte(Graphics2D g, int x, int y) {
        g.setColor(new Color(0, 0, 0, 120));
        g.fillRoundRect(x - 20, y - 22, 40, 58, 10, 10);
        g.setColor(Color.WHITE);
        g.fill(new Polygon(new int[] {x, x - 9, x + 9}, new int[] {y - 14, y + 10, y + 10}, 3));
        g.setFont(new Font(Font.SANS_SERIF, Font.BOLD, 16));
        g.drawString("N", x - 6, y + 30);
    }

    private void leyenda(Graphics2D g, int x, int yBase, boolean conZi) {
        g.setFont(new Font(Font.SANS_SERIF, Font.PLAIN, 15));
        String[] textos = conZi
                ? new String[] {"Alerta", "Área de Conservación Regional", "Zona de Influencia"}
                : new String[] {"Alerta", "Área de Conservación Regional"};
        int alto = 24 * textos.length + 12;
        g.setColor(new Color(0, 0, 0, 150));
        g.fillRoundRect(x, yBase - alto, 290, alto, 10, 10);
        int y = yBase - alto + 22;
        for (String t : textos) {
            switch (t) {
                case "Alerta" -> {
                    g.setColor(ROJO);
                    g.fillOval(x + 12, y - 11, 13, 13);
                }
                case "Zona de Influencia" -> {
                    g.setColor(GRIS);
                    g.setStroke(new BasicStroke(2.4f, BasicStroke.CAP_BUTT, BasicStroke.JOIN_MITER, 10f, new float[] {5f, 3f}, 0f));
                    g.drawRect(x + 11, y - 11, 15, 13);
                }
                default -> {
                    g.setColor(new Color(46, 204, 64, 70));
                    g.fillRect(x + 11, y - 11, 15, 13);
                    g.setColor(VERDE);
                    g.setStroke(new BasicStroke(2.4f));
                    g.drawRect(x + 11, y - 11, 15, 13);
                }
            }
            g.setColor(Color.WHITE);
            g.drawString(t, x + 36, y);
            y += 24;
        }
    }

    private BufferedImage satelital(double xmin, double ymin, double xmax, double ymax, int w, int h) {
        String url = String.format(Locale.ROOT, ESRI_EXPORT, xmin, ymin, xmax, ymax, w, h);
        try {
            HttpResponse<byte[]> r = http.send(
                    HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(12)).GET().build(),
                    HttpResponse.BodyHandlers.ofByteArray());
            return r.statusCode() == 200 ? ImageIO.read(new ByteArrayInputStream(r.body())) : null;
        } catch (IOException e) {
            log.warn("Sin imagen satelital para el mapa de ubicación: {}", e.getMessage());
            return null;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return null;
        }
    }

    private Path2D trazo(String geojson, DoubleUnaryOperator fx,
                         DoubleUnaryOperator fy) {
        Path2D p = new Path2D.Double(Path2D.WIND_EVEN_ODD);
        for (JsonNode anillo : anillos(geojson)) {
            for (int i = 0; i < anillo.size(); i++) {
                double x = fx.applyAsDouble(anillo.get(i).get(0).asDouble());
                double y = fy.applyAsDouble(anillo.get(i).get(1).asDouble());
                if (i == 0) {
                    p.moveTo(x, y);
                } else {
                    p.lineTo(x, y);
                }
            }
            p.closePath();
        }
        return p;
    }

    private Rectangle2D limites(String geojson) {
        return trazo(geojson, x -> x, y -> y).getBounds2D();
    }

    private Iterable<JsonNode> anillos(String geojson) {
        try {
            JsonNode g = json.readTree(geojson);
            List<JsonNode> lista = new ArrayList<>();
            JsonNode coords = g.get("coordinates");
            if ("Polygon".equals(g.get("type").asText())) {
                coords.forEach(lista::add);
            } else {
                coords.forEach(poligono -> poligono.forEach(lista::add));
            }
            return lista;
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static Graphics2D lienzo(BufferedImage img) {
        Graphics2D g = img.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
        g.setRenderingHint(RenderingHints.KEY_STROKE_CONTROL, RenderingHints.VALUE_STROKE_PURE);
        return g;
    }

    private static BufferedImage leer(byte[] png) {
        try {
            BufferedImage src = ImageIO.read(new ByteArrayInputStream(png));
            BufferedImage rgb = new BufferedImage(src.getWidth(), src.getHeight(), BufferedImage.TYPE_INT_RGB);
            rgb.createGraphics().drawImage(src, 0, 0, null);
            return rgb;
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static byte[] escribir(BufferedImage img, String formato) {
        try {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            ImageIO.write(img, formato, out);
            return out.toByteArray();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
