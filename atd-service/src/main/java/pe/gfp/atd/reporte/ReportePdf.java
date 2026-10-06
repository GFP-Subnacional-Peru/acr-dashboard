package pe.gfp.atd.reporte;

import com.lowagie.text.Chunk;
import com.lowagie.text.Document;
import com.lowagie.text.DocumentException;
import com.lowagie.text.Element;
import com.lowagie.text.Font;
import com.lowagie.text.Image;
import com.lowagie.text.PageSize;
import com.lowagie.text.Paragraph;
import com.lowagie.text.Phrase;
import com.lowagie.text.Rectangle;
import com.lowagie.text.pdf.PdfPCell;
import com.lowagie.text.pdf.PdfPTable;
import com.lowagie.text.pdf.PdfWriter;
import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;
import pe.gfp.atd.reporte.ReporteRepository.ImagenEscena;

/** Reporte técnico de una alerta, con el mismo diseño del toolbox (ATD_2026_ACR10_001_OID205.pdf). */
@Component
public class ReportePdf {

    private static final Color AZUL = new Color(0x2F, 0x5F, 0x8F);
    private static final Color AZUL_CB = new Color(0x3A, 0x7C, 0xA5);
    private static final Color AZUL_SUAVE = new Color(0xE8, 0xEE, 0xF4);
    private static final Color ROJO = new Color(0xC4, 0x1E, 0x3A);
    private static final Color ROJO_OSCURO = new Color(0x8B, 0x15, 0x28);
    private static final Color GRIS = new Color(0xF4, 0xF6, 0xF8);
    private static final Color BORDE = new Color(0xB8, 0xC8, 0xD8);
    private static final DateTimeFormatter DMY = DateTimeFormatter.ofPattern("dd/MM/yyyy");
    private static final ZoneId LIMA = ZoneId.of("America/Lima");

    private static final Map<Integer, String[]> CABECERA = Map.of(
            1, new String[] {"GOBIERNO REGIONAL DE LORETO",
                    "GERENCIA REGIONAL DE RECURSOS NATURALES Y GESTIÓN AMBIENTAL",
                    "SUB GERENCIA DE CONSERVACIÓN Y DIVERSIDAD BIOLÓGICA"},
            2, new String[] {"GOBIERNO REGIONAL DE SAN MARTIN",
                    "GERENCIA REGIONAL DE RECURSOS NATURALES Y GESTIÓN AMBIENTAL",
                    "SUB GERENCIA DE CONSERVACIÓN Y DIVERSIDAD BIOLÓGICA"},
            3, new String[] {"GOBIERNO REGIONAL DE CUSCO",
                    "GERENCIA REGIONAL DE DESARROLLO ECONÓMICO",
                    "DIRECCIÓN DE GESTIÓN AMBIENTAL"});

    private static final Map<Integer, String> CONFIANZA = Map.of(
            1, "Alta (prioritaria para revisión)",
            2, "Media (revisar en campo)",
            3, "Baja (complementar con visita)");

    private static final float W = cm(18.6);

    private final ReporteRepository repo;
    private final Dibujo dibujo;
    private final String responsable;
    private final String cargo;
    private final String dashboardUrl;

    public ReportePdf(ReporteRepository repo, Dibujo dibujo,
                      @Value("${atd.reporte.responsable}") String responsable,
                      @Value("${atd.reporte.cargo}") String cargo,
                      @Value("${atd.reporte.dashboard-url}") String dashboardUrl) {
        this.repo = repo;
        this.dibujo = dibujo;
        this.responsable = responsable;
        this.cargo = cargo;
        this.dashboardUrl = dashboardUrl;
    }

    public record Archivo(String nombre, byte[] contenido) {
    }

    /** @param base URL pública del servicio (para los enlaces del reporte), sin barra final. */
    public Optional<Archivo> generar(String codigo, String base) {
        return repo.datos(codigo).map(d -> new Archivo(nombreArchivo(d), construir(d, base)));
    }

    private static String nombreArchivo(DatosReporte d) {
        String correlativo = d.codigoReporte() != null
                ? d.codigoReporte().replaceAll(".*?(\\d+)\\s*$", "$1")
                : d.codigo().substring(d.codigo().lastIndexOf('-') + 1);
        return "ATD_%d_%s_%s_OID%d.pdf".formatted(d.anio(), d.acrOficial(), correlativo, d.oid());
    }

    private byte[] construir(DatosReporte d, String base) {
        ImagenEscena antes = null;
        ImagenEscena despues = null;
        for (ImagenEscena e : repo.imagenes(d.codigo())) {
            if ("antes".equals(e.momento())) {
                antes = e;
            } else {
                despues = e;
            }
        }
        LocalDate hoy = LocalDate.now(LIMA);
        String periodo = periodo(d, hoy);
        String codigoReporte = d.codigoReporte() != null ? d.codigoReporte() : d.codigo();

        ByteArrayOutputStream out = new ByteArrayOutputStream();
        Document doc = new Document(PageSize.A4, cm(1.1), cm(1.1), cm(0.7), cm(0.6));
        try {
            PdfWriter.getInstance(doc, out);
            doc.addTitle("Reporte técnico ATD " + codigoReporte);
            doc.addAuthor(responsable);
            doc.open();

            doc.add(cabecera(d));
            doc.add(titulo(d.acrNombre()));
            doc.add(ficha(d, periodo));
            doc.add(banda("Vista Estática de la Alerta Temprana de Deforestación"));
            doc.add(imagenes(d, antes, despues));
            doc.add(vistaDinamica(d, antes, despues, base));

            float wa = cm(3.8);
            float wb = cm(5.1);
            DecimalFormat miles = new DecimalFormat("#,##0.0", DecimalFormatSymbols.getInstance(Locale.US));
            String zona = " (UTM " + d.zonaUtm() + "S)";
            doc.add(par(
                    seccion("3", "Datos de Monitoreo", new String[][] {
                            {"Código de Alerta:", codigoReporte},
                            {"Período de Monitoreo:", periodo},
                            {"Nivel de Confianza:", d.confiabilidadId() == null ? null : CONFIANZA.get(d.confiabilidadId())},
                            {"Coordenada Este (m):", miles.format(d.este()) + zona},
                            {"Coordenada Norte (m):", miles.format(d.norte()) + zona}}, wa, wb, false),
                    seccion("4", "Datos de Afectación", new String[][] {
                            {"Actividad:", d.causa()},
                            {"Efecto:", "Pérdida de Hábitat"},
                            {"Tipo de Bosque:", d.tipoBosque()},
                            {"Superficie Afectada (ha):", d.superficieHa() == null ? null
                                    : String.format(Locale.ROOT, "%.2f", d.superficieHa().doubleValue())},
                            {"Código de Grilla:", d.exa()}}, wa, wb, false)));
            doc.add(par(
                    seccion("5", "Datos de Producción", new String[][] {
                            {"Responsable:", responsable},
                            {"Cargo:", cargo},
                            {"Fecha de emisión:", DMY.format(hoy)}}, wa, wb, false),
                    seccion("6", "Datos de Elaboración", new String[][] {
                            {"Metodología:", "Abrir metodología (documento HTML)", base + "/docs/ATD_metodologia.html"},
                            {"Procedimiento:", "Abrir guía de fotointerpretación",
                                    base + "/docs/ATD_procedimiento_fotointerpretacion.html"},
                            {"Visualización:", "Abrir Dashboard ACR (monitoreo deforestación)", dashboardUrl}},
                            wa, wb, true)));
            doc.add(pie());
        } catch (DocumentException e) {
            throw new IllegalStateException("No se pudo armar el reporte " + d.codigo(), e);
        } finally {
            if (doc.isOpen()) {
                doc.close();
            }
        }
        return out.toByteArray();
    }

    /** Del día 1 del mes de reporte a la emisión; si ese mes (o el de la imagen, el posterior) ya cerró, hasta su último día. */
    private static String periodo(DatosReporte d, LocalDate hoy) {
        LocalDate base = d.fechaImagen() != null ? d.fechaImagen() : hoy;
        int mes = d.mesReporte() != null ? d.mesReporte() : base.getMonthValue();
        LocalDate ini = LocalDate.of(d.anio(), mes, 1);
        LocalDate ultimo = base.isAfter(ini) ? base : ini;
        LocalDate finMes = ultimo.withDayOfMonth(ultimo.lengthOfMonth());
        LocalDate fin = finMes.isBefore(hoy) ? finMes : hoy;
        return DMY.format(ini) + " - " + DMY.format(fin);
    }

    // ---------------------------------------------------------------- bloques

    private PdfPTable cabecera(DatosReporte d) throws DocumentException {
        String[] textos = CABECERA.getOrDefault(d.regionId(), CABECERA.get(1));
        PdfPTable t = tabla(new float[] {cm(5.0), cm(8.6), cm(5.0)});
        t.addCell(logos(logo("gore_" + d.regionId()), logo("gerencia_" + d.regionId())));
        PdfPCell centro = sinBorde(null);
        centro.addElement(parrafo(textos[0], fuente(8.5f, true, Color.BLACK), Element.ALIGN_CENTER, 10));
        centro.addElement(parrafo(textos[1], fuente(7.5f, true, Color.BLACK), Element.ALIGN_CENTER, 9));
        centro.addElement(parrafo(textos[2], fuente(7f, true, Color.BLACK), Element.ALIGN_CENTER, 9));
        centro.setVerticalAlignment(Element.ALIGN_MIDDLE);
        centro.setPaddingBottom(5);
        t.addCell(centro);
        t.addCell(logos(logo("gfp"), logo("acr_" + d.acrOficial())));
        return caja(t, 1.2f, AZUL, mm(1));
    }

    private PdfPCell logos(Image a, Image b) {
        PdfPTable t = tabla(new float[] {cm(2.4), cm(2.4)});
        t.addCell(celdaImagen(a, cm(2.2), cm(1.6)));
        t.addCell(celdaImagen(b, cm(2.2), cm(1.6)));
        PdfPCell c = new PdfPCell(t);
        c.setBorder(Rectangle.NO_BORDER);
        c.setPadding(4);
        c.setVerticalAlignment(Element.ALIGN_MIDDLE);
        return c;
    }

    private PdfPTable titulo(String acr) {
        PdfPTable t = tabla(new float[] {W});
        PdfPCell c1 = sinBorde(new Phrase("REPORTE TÉCNICO SOBRE ALERTA TEMPRANA DE DEFORESTACIÓN",
                fuente(12, true, ROJO)));
        c1.setHorizontalAlignment(Element.ALIGN_CENTER);
        c1.setPaddingTop(3);
        c1.setPaddingBottom(5);
        t.addCell(c1);
        PdfPCell c2 = sinBorde(new Phrase(acr.toUpperCase(Locale.ROOT), fuente(10, true, Color.WHITE)));
        c2.setHorizontalAlignment(Element.ALIGN_CENTER);
        c2.setBackgroundColor(ROJO);
        c2.setPaddingTop(3);
        c2.setPaddingBottom(5);
        t.addCell(c2);
        return caja(t, 1.2f, ROJO_OSCURO, mm(1));
    }

    private PdfPTable ficha(DatosReporte d, String periodo) {
        float w1 = cm(3.4);
        float w2 = cm(4.2);
        PdfPTable izq = tabla(new float[] {w1 + w2});
        izq.addCell(bloque(seccion("1", "Ubicación en circunscripción", new String[][] {
                {"Departamento:", d.departamento()},
                {"Provincia:", d.provincia()},
                {"Distrito:", d.distrito()},
                {"Lugar Poblado Cercano:", d.lugarPoblado()}}, w1, w2, false), mm(1)));
        izq.addCell(bloque(seccion("2", "Ubicación en área de conservación", new String[][] {
                {"Nombre de ACR:", d.acrNombre()},
                {"Zonificación:", d.zonificacion()},
                {"Sector:", d.sector()},
                {"OLV Cercano:", d.olv()}}, w1, w2, false), mm(1)));
        PdfPTable per = tabla(new float[] {w1, w2});
        PdfPCell l = celdaDato("Periodo de Monitoreo:", true, Color.WHITE, false);
        l.setBorderWidthRight(0.3f);
        l.setBorderColorRight(BORDE);
        l.setBorder(Rectangle.RIGHT);
        per.addCell(l);
        per.addCell(celdaDato(periodo, false, Color.WHITE, false));
        izq.addCell(bloque(caja(per, 1.2f, AZUL, 0), 0));

        float anchoMapa = cm(10.6);
        float altoMapa = cm(7.5);
        String titulo = d.acrNombre() + " · Alerta " + (d.codigoReporte() != null ? d.codigoReporte() : d.codigo());
        byte[] mapa = dibujo.mapaUbicacion(repo.limites(d.acrCodigo()), d.geom3857(), titulo);
        PdfPTable der = tabla(new float[] {anchoMapa});
        PdfPCell celdaMapa = celdaImagen(imagen(mapa), anchoMapa, altoMapa);
        celdaMapa.setFixedHeight(altoMapa);
        celdaMapa.setPadding(0);
        der.addCell(celdaMapa);

        PdfPTable t = tabla(new float[] {w1 + w2 + cm(0.3), anchoMapa + cm(0.1)});
        PdfPCell a = new PdfPCell(izq);
        izq.setExtendLastRow(false);
        a.setBorder(Rectangle.NO_BORDER);
        a.setPaddingRight(cm(0.3));
        PdfPCell b = new PdfPCell(caja(der, 1.2f, AZUL, 0));
        b.setBorder(Rectangle.NO_BORDER);
        b.setPaddingLeft(cm(0.1));
        t.addCell(a);
        t.addCell(b);
        t.setSpacingAfter(mm(1));
        return t;
    }

    private PdfPTable imagenes(DatosReporte d, ImagenEscena antes, ImagenEscena despues) {
        float aw = (W - mm(2)) / 2;
        float ah = cm(4.2);
        PdfPTable t = tabla(new float[] {aw, aw});
        t.addCell(cabImagen("Imagen Satelital A: Sin Cambios", true));
        t.addCell(cabImagen("Imagen Satelital B: Con Cambios", false));
        t.addCell(chip(antes, d, aw, ah, true));
        t.addCell(chip(despues, d, aw, ah, false));
        t.addCell(metaImagen(antes, aw, true));
        t.addCell(metaImagen(despues, aw, false));
        return caja(t, 1.2f, AZUL, mm(1.5));
    }

    private PdfPCell cabImagen(String texto, boolean izquierda) {
        PdfPCell c = sinBorde(new Phrase(texto, fuente(7.5f, true, Color.WHITE)));
        c.setBackgroundColor(AZUL_CB);
        c.setHorizontalAlignment(Element.ALIGN_CENTER);
        c.setPaddingTop(2);
        c.setPaddingBottom(4);
        separador(c, izquierda);
        return c;
    }

    private PdfPCell chip(ImagenEscena e, DatosReporte d, float aw, float ah, boolean izquierda) {
        PdfPCell c;
        if (e == null) {
            c = sinBorde(new Phrase(izquierda ? "[ Sin imagen Sentinel A ]" : "[ Sin imagen Sentinel B ]",
                    fuente(7, false, Color.GRAY)));
            c.setHorizontalAlignment(Element.ALIGN_CENTER);
        } else {
            c = celdaImagen(imagen(dibujo.conContorno(e.png(), e.recorte(), d.geom3857())), aw, ah);
        }
        c.setFixedHeight(ah + 4);
        c.setVerticalAlignment(Element.ALIGN_MIDDLE);
        separador(c, izquierda);
        return c;
    }

    private PdfPCell metaImagen(ImagenEscena e, float aw, boolean izquierda) {
        PdfPTable t = tabla(new float[] {aw * 0.48f, aw * 0.52f});
        PdfPCell sat = sinBorde(new Phrase("Satélite:  Sentinel-2", fuente(6, true, Color.BLACK)));
        PdfPCell fecha = sinBorde(new Phrase("Fecha:  " + (e == null || e.fecha() == null ? "-" : DMY.format(e.fecha())),
                fuente(6, true, Color.BLACK)));
        fecha.setHorizontalAlignment(Element.ALIGN_CENTER);
        PdfPCell cod = sinBorde(new Phrase("Código:  " + (e == null ? "-" : e.escenaId()), fuente(5.5f, false, Color.BLACK)));
        cod.setColspan(2);
        for (PdfPCell c : new PdfPCell[] {sat, fecha, cod}) {
            c.setBackgroundColor(GRIS);
            c.setPaddingTop(1.5f);
            c.setPaddingBottom(3f);
            c.setPaddingLeft(3);
            t.addCell(c);
        }
        PdfPCell c = new PdfPCell(t);
        c.setBorder(Rectangle.NO_BORDER);
        separador(c, izquierda);
        return c;
    }

    private static void separador(PdfPCell c, boolean izquierda) {
        if (izquierda) {
            c.setBorder(Rectangle.RIGHT);
            c.setBorderWidthRight(0.5f);
            c.setBorderColorRight(BORDE);
        }
    }

    private PdfPTable vistaDinamica(DatosReporte d, ImagenEscena antes, ImagenEscena despues, String base) {
        PdfPTable t = tabla(new float[] {W});
        PdfPCell c1 = sinBorde(new Phrase("Vista Dinámica de la ATD", fuente(7.5f, true, Color.BLACK)));
        c1.setBackgroundColor(AZUL_SUAVE);
        c1.setHorizontalAlignment(Element.ALIGN_CENTER);
        c1.setPaddingTop(3);
        c1.setPaddingBottom(5);
        c1.setBorder(Rectangle.BOTTOM);
        c1.setBorderWidthBottom(0.5f);
        c1.setBorderColorBottom(BORDE);
        t.addCell(c1);
        String etiqueta = antes != null && despues != null
                ? "Comparación swipe antes / después (Antes: %s · Después: %s)".formatted(
                        antes.fecha() == null ? "-" : DMY.format(antes.fecha()),
                        despues.fecha() == null ? "-" : DMY.format(despues.fecha()))
                : "Ver la alerta en el visor ATD";
        PdfPCell c2 = sinBorde(enlace(etiqueta, base + "/?alerta=" + d.codigo(), 7));
        c2.setHorizontalAlignment(Element.ALIGN_CENTER);
        c2.setPaddingTop(6);
        c2.setPaddingBottom(8);
        t.addCell(c2);
        return caja(t, 1.0f, AZUL, mm(1));
    }

    private PdfPTable par(PdfPTable a, PdfPTable b) {
        float media = W / 2;
        PdfPTable t = tabla(new float[] {media, media});
        PdfPCell ca = new PdfPCell(a);
        ca.setBorder(Rectangle.NO_BORDER);
        ca.setPaddingRight(cm(0.15));
        PdfPCell cb = new PdfPCell(b);
        cb.setBorder(Rectangle.NO_BORDER);
        cb.setPaddingLeft(cm(0.15));
        t.addCell(ca);
        t.addCell(cb);
        t.setSpacingAfter(mm(1));
        return t;
    }

    private PdfPTable pie() throws DocumentException {
        PdfPTable t = tabla(new float[] {cm(3.2), cm(3.8), cm(5.8), cm(5.8)});
        PdfPCell texto = sinBorde(null);
        Font f = new Font(Font.HELVETICA, 7, Font.BOLDITALIC, Color.BLACK);
        texto.addElement(parrafo("Con la asistencia", f, Element.ALIGN_CENTER, 9));
        texto.addElement(parrafo("técnica de:", f, Element.ALIGN_CENTER, 9));
        texto.setVerticalAlignment(Element.ALIGN_MIDDLE);
        PdfPCell[] celdas = {
                texto,
                celdaImagen(logo("gfp"), cm(3.2), cm(1.15)),
                celdaImagen(logo("seco"), cm(4.5), cm(1.15)),
                celdaImagen(logo("basel"), cm(4.5), cm(1.15))};
        for (int i = 0; i < celdas.length; i++) {
            PdfPCell c = celdas[i];
            c.setBackgroundColor(GRIS);
            c.setPaddingTop(4);
            c.setPaddingBottom(4);
            if (i < 3) {
                c.setBorder(Rectangle.RIGHT);
                c.setBorderWidthRight(0.4f);
                c.setBorderColorRight(BORDE);
            }
            t.addCell(c);
        }
        return caja(t, 1.2f, AZUL, 0);
    }

    private PdfPTable banda(String texto) {
        PdfPTable t = tabla(new float[] {W});
        PdfPCell c = sinBorde(new Phrase(texto, fuente(8, true, Color.WHITE)));
        c.setBackgroundColor(AZUL);
        c.setHorizontalAlignment(Element.ALIGN_CENTER);
        c.setPaddingTop(3);
        c.setPaddingBottom(5);
        t.addCell(c);
        return caja(t, 1.2f, AZUL, mm(1));
    }

    /** Sección numerada con cabecera azul y filas alternas. Con {@code enlaces}, cada fila es {etiqueta, texto, url}. */
    private PdfPTable seccion(String numero, String titulo, String[][] filas, float w1, float w2, boolean enlaces) {
        PdfPTable t = tabla(new float[] {w1, w2});
        PdfPCell cab = sinBorde(new Phrase(numero + ".  " + titulo, fuente(7.5f, true, Color.WHITE)));
        cab.setColspan(2);
        cab.setBackgroundColor(AZUL);
        cab.setPaddingTop(4);
        cab.setPaddingBottom(6);
        cab.setPaddingLeft(5);
        t.addCell(cab);
        for (int i = 0; i < filas.length; i++) {
            Color fondo = i % 2 == 0 ? Color.WHITE : GRIS;
            boolean linea = i < filas.length - 1;
            t.addCell(celdaDato(filas[i][0], true, fondo, linea));
            if (enlaces) {
                PdfPCell c = celdaBase(enlace(filas[i][1], filas[i][2], 6.5f), fondo, linea);
                t.addCell(c);
            } else {
                t.addCell(celdaDato(filas[i][1], false, fondo, linea));
            }
        }
        return caja(t, 1.2f, AZUL, 0);
    }

    // ---------------------------------------------------------------- utilidades

    private static PdfPCell celdaDato(String texto, boolean negrita, Color fondo, boolean linea) {
        String v = texto == null || texto.isBlank() ? "-" : texto;
        return celdaBase(new Phrase(v, fuente(7.5f, negrita, Color.BLACK)), fondo, linea);
    }

    private static PdfPCell celdaBase(Phrase p, Color fondo, boolean linea) {
        PdfPCell c = new PdfPCell(p);
        c.setBackgroundColor(fondo);
        c.setVerticalAlignment(Element.ALIGN_MIDDLE);
        c.setPaddingTop(3.2f);
        c.setPaddingBottom(5f);
        c.setPaddingLeft(4);
        c.setPaddingRight(3);
        c.setBorder(linea ? Rectangle.BOTTOM : Rectangle.NO_BORDER);
        c.setBorderWidthBottom(0.3f);
        c.setBorderColorBottom(BORDE);
        return c;
    }

    private static Phrase enlace(String texto, String url, float tam) {
        Font f = new Font(Font.HELVETICA, tam, Font.UNDERLINE, AZUL);
        Chunk ch = new Chunk(texto, f);
        ch.setAnchor(url);
        return new Phrase(ch);
    }

    /** Envuelve una tabla en un recuadro del color y grosor dados. */
    private static PdfPTable caja(PdfPTable contenido, float grosor, Color color, float espacioDespues) {
        PdfPTable t = tabla(new float[] {contenido.getTotalWidth()});
        PdfPCell c = new PdfPCell(contenido);
        c.setBorder(Rectangle.BOX);
        c.setBorderWidth(grosor);
        c.setBorderColor(color);
        c.setPadding(0);
        t.addCell(c);
        t.setSpacingAfter(espacioDespues);
        return t;
    }

    private static PdfPCell bloque(PdfPTable t, float espacioDespues) {
        PdfPCell c = new PdfPCell(t);
        c.setBorder(Rectangle.NO_BORDER);
        c.setPadding(0);
        c.setPaddingBottom(espacioDespues);
        return c;
    }

    private static PdfPTable tabla(float[] anchos) {
        PdfPTable t = new PdfPTable(anchos.length);
        try {
            t.setTotalWidth(anchos);
        } catch (DocumentException e) {
            throw new IllegalArgumentException(e);
        }
        t.setLockedWidth(true);
        t.setHorizontalAlignment(Element.ALIGN_CENTER);
        return t;
    }

    private static PdfPCell sinBorde(Phrase p) {
        PdfPCell c = p == null ? new PdfPCell() : new PdfPCell(p);
        c.setBorder(Rectangle.NO_BORDER);
        return c;
    }

    private static PdfPCell celdaImagen(Image img, float maxW, float maxH) {
        if (img == null) {
            return sinBorde(null);
        }
        img.scaleToFit(maxW, maxH);
        PdfPCell c = new PdfPCell(img, false);
        c.setBorder(Rectangle.NO_BORDER);
        c.setHorizontalAlignment(Element.ALIGN_CENTER);
        c.setVerticalAlignment(Element.ALIGN_MIDDLE);
        c.setPadding(2);
        return c;
    }

    private static Paragraph parrafo(String texto, Font f, int alineacion, float interlineado) {
        Paragraph p = new Paragraph(interlineado, texto, f);
        p.setAlignment(alineacion);
        return p;
    }

    private static Font fuente(float tam, boolean negrita, Color color) {
        return new Font(Font.HELVETICA, tam, negrita ? Font.BOLD : Font.NORMAL, color);
    }

    private static Image logo(String nombre) {
        ClassPathResource r = new ClassPathResource("reporte/logos/" + nombre + ".png");
        if (!r.exists()) {
            return null;
        }
        try (InputStream in = r.getInputStream()) {
            return imagen(in.readAllBytes());
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static Image imagen(byte[] bytes) {
        try {
            return Image.getInstance(bytes);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        } catch (DocumentException e) {
            throw new IllegalStateException(e);
        }
    }

    private static float cm(double v) {
        return (float) (v * 72 / 2.54);
    }

    private static float mm(double v) {
        return cm(v / 10);
    }
}
