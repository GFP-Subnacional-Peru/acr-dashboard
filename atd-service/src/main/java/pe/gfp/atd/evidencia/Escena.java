package pe.gfp.atd.evidencia;

import java.math.BigDecimal;
import java.time.LocalDate;

/** {@code recorte}: extensión de la imagen en EPSG:3857 [xmin, ymin, xmax, ymax], o null si es antigua. */
public record Escena(
        String momento,
        String proveedor,
        String escenaId,
        LocalDate fecha,
        BigDecimal nubosidadLocal,
        BigDecimal nubosidadEscena,
        double[] recorte,
        String imagen) {
}
