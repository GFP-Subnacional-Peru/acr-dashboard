package pe.gfp.atd.evidencia;

/** Una pasada Sentinel-2 encontrada en el catálogo, distinta del par guardado del reporte. */
public record EscenaLibre(
        String escenaId,
        String fecha,
        double nubes,
        String miniatura,
        String recorte,
        double oeste,
        double sur,
        double este,
        double norte) {
}
