package pe.gfp.atd.alerta;

import java.math.BigDecimal;
import java.util.List;

/**
 * Indicadores del paso "Resumen". Las hectáreas antrópicas y naturales solo cuentan
 * alertas validadas; las pendientes no muestran clasificación.
 */
public record ResumenMensual(
        String acr,
        String ambito,
        int anio,
        int mes,
        Conteo actual,
        Conteo mesAnterior,
        List<CausaHa> porCausa) {

    public record Conteo(
            int alertasRecibidas,
            int alertasValidadas,
            int alertasPendientes,
            int falsasAlertas,
            BigDecimal perdidaAntropicaHa,
            BigDecimal cambioNaturalHa,
            BigDecimal pendienteHa) {
    }

    public record CausaHa(String causa, int alertas, BigDecimal ha) {
    }
}
