package pe.gfp.atd.reporte;

import java.util.regex.Pattern;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;
import pe.gfp.atd.drive.DriveAlmacen;

@RestController
@RequestMapping("/api/atd/alertas/{codigo}")
public class ReporteController {

    private static final Pattern PATRON_CODIGO = Pattern.compile("[A-Z]{3}-\\d{4}-\\d{4,6}");

    private final ReportePdf reporte;
    private final DriveAlmacen drive;

    public ReporteController(ReportePdf reporte, DriveAlmacen drive) {
        this.reporte = reporte;
        this.drive = drive;
    }

    @GetMapping("/reporte.pdf")
    public ResponseEntity<byte[]> pdf(@PathVariable String codigo) {
        if (!PATRON_CODIGO.matcher(codigo).matches()) {
            return ResponseEntity.notFound().build();
        }
        String base = ServletUriComponentsBuilder.fromCurrentContextPath().build().toUriString();
        return reporte.generar(codigo, base)
                .map(a -> {
                    drive.archivarReporte(a.nombre(), a.contenido());
                    return ResponseEntity.ok()
                        .contentType(MediaType.APPLICATION_PDF)
                        .header(HttpHeaders.CONTENT_DISPOSITION,
                                ContentDisposition.inline().filename(a.nombre()).build().toString())
                        .body(a.contenido());
                })
                .orElseGet(() -> ResponseEntity.notFound().build());
    }
}
