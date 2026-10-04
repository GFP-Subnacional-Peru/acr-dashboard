package pe.gfp.atd.territorio;

import java.math.BigDecimal;
import java.util.List;

public record Territorio(
        String codigo,
        String tipo,
        String acrCodigo,
        String codigoOficial,
        String nombre,
        String region,
        String regionNombre,
        BigDecimal areaHa,
        List<Double> bbox,
        int alertas) {
}
