package pe.gfp.atd.evidencia;

import java.math.BigDecimal;
import java.time.LocalDate;

public record Escena(
        String momento,
        String proveedor,
        String escenaId,
        LocalDate fecha,
        BigDecimal nubosidadLocal,
        String imagen) {
}
