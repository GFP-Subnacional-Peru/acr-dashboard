package pe.gfp.atd.reporte;

import java.math.BigDecimal;
import java.time.LocalDate;

/** Todo lo que imprime el reporte técnico de una alerta (modelo ATD_2026_ACR10_001_OID205). */
public record DatosReporte(
        String codigo,
        String codigoReporte,
        long oid,
        int anio,
        Integer mesReporte,
        LocalDate fechaImagen,
        String estado,
        String resultado,
        String causa,
        Integer confiabilidadId,
        String tipoBosque,
        BigDecimal superficieHa,
        String sector,
        String exa,
        String zonificacion,
        int regionId,
        String departamento,
        String acrCodigo,
        String acrOficial,
        String acrNombre,
        String provincia,
        String distrito,
        String olv,
        String lugarPoblado,
        double este,
        double norte,
        int zonaUtm,
        /** Polígono vigente (editado o no) como GeoJSON en EPSG:3857. */
        String geom3857,
        /** Texto que el especialista escribió al clasificar. Sale en el PDF. */
        String conclusion) {
}
