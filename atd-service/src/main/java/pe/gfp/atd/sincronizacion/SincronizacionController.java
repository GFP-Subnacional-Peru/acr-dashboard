package pe.gfp.atd.sincronizacion;

import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.RestClient;

/**
 * Estado de actualización: semana vigente publicada por GeoBosques y última carga en la base.
 * La fecha de GeoBosques se consulta como máximo una vez por hora.
 */
@RestController
public class SincronizacionController {

    private static final Logger log = LoggerFactory.getLogger(SincronizacionController.class);
    private static final String URL_FECHA =
            "https://geobosques.minam.gob.pe/geobosque/controller/getFechaUltimaSemana.php";
    private static final Pattern FECHAS =
            Pattern.compile("\"menor\"\\s*:\\s*\"([\\d\\\\/]+)\".*?\"mayor\"\\s*:\\s*\"([\\d\\\\/]+)\"");
    private static final Duration VIGENCIA = Duration.ofHours(1);

    private final JdbcTemplate jdbc;
    private final RestClient http;
    private volatile Map<String, String> semanaGeobosques;
    private volatile Instant consultadoEn = Instant.EPOCH;

    public SincronizacionController(JdbcTemplate jdbc, RestClient.Builder builder) {
        this.jdbc = jdbc;
        SimpleClientHttpRequestFactory fabrica = new SimpleClientHttpRequestFactory();
        fabrica.setConnectTimeout(5000);
        fabrica.setReadTimeout(8000);
        this.http = builder.requestFactory(fabrica).build();
    }

    @GetMapping("/api/atd/sincronizacion")
    public Map<String, Object> estado() {
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("geobosques", semanaGeobosques());
        List<Map<String, Object>> ingesta = jdbc.queryForList("""
                SELECT fuente, estado, terminado_en, n_nuevas, n_actualizadas
                  FROM ingesta ORDER BY id DESC LIMIT 1
                """);
        r.put("ultimaCarga", ingesta.isEmpty() ? null : ingesta.get(0));
        r.put("alertas", jdbc.queryForMap("""
                SELECT count(*) AS total,
                       count(*) FILTER (WHERE estado = 'pendiente') AS por_clasificar,
                       count(*) FILTER (WHERE EXISTS (SELECT 1 FROM evidencia v
                                                       WHERE v.alerta_id = alerta.id
                                                         AND v.tipo = 'chip_despues')) AS con_sentinel2
                  FROM alerta
                """));
        return r;
    }

    private Map<String, String> semanaGeobosques() {
        if (semanaGeobosques != null && Instant.now().isBefore(consultadoEn.plus(VIGENCIA))) {
            return semanaGeobosques;
        }
        try {
            String cuerpo = http.get().uri(URL_FECHA).retrieve().body(String.class);
            Matcher m = FECHAS.matcher(cuerpo == null ? "" : cuerpo);
            if (m.find()) {
                semanaGeobosques = Map.of(
                        "desde", m.group(1).replace("\\", ""),
                        "hasta", m.group(2).replace("\\", ""));
            }
        } catch (Exception e) {
            log.warn("No se pudo consultar la semana vigente de GeoBosques: {}", e.getMessage());
        }
        consultadoEn = Instant.now();
        return semanaGeobosques;
    }
}
