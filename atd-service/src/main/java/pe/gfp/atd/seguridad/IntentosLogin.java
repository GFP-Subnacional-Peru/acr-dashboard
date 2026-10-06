package pe.gfp.atd.seguridad;

import java.time.Duration;
import java.time.Instant;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

/**
 * Freno a la fuerza bruta: tras varios fallos seguidos se bloquea el ingreso un tiempo, por IP y por usuario.
 * El límite por usuario cubre a quien rote la IP (o falsee X-Forwarded-For).
 */
@Component
public class IntentosLogin {

    private static final int MAX_FALLOS_IP = 5;
    private static final int MAX_FALLOS_USUARIO = 10;
    private static final Duration BLOQUEO = Duration.ofMinutes(10);
    private static final int MAX_CLAVES = 10_000;

    private record Estado(int fallos, Instant ultimo, Instant hasta) {}

    private final Map<String, Estado> claves = new ConcurrentHashMap<>();

    boolean bloqueado(String ip, String usuario) {
        return bloqueado("ip:" + ip) || bloqueado("u:" + normalizar(usuario));
    }

    void fallo(String ip, String usuario) {
        Instant ahora = Instant.now();
        if (claves.size() > MAX_CLAVES) {
            claves.values().removeIf(e -> e.ultimo().plus(BLOQUEO).isBefore(ahora));
        }
        registrar("ip:" + ip, MAX_FALLOS_IP, ahora);
        registrar("u:" + normalizar(usuario), MAX_FALLOS_USUARIO, ahora);
    }

    void exito(String ip, String usuario) {
        claves.remove("ip:" + ip);
        claves.remove("u:" + normalizar(usuario));
    }

    private boolean bloqueado(String clave) {
        Estado e = claves.get(clave);
        return e != null && e.hasta() != null && e.hasta().isAfter(Instant.now());
    }

    private void registrar(String clave, int maximo, Instant ahora) {
        claves.compute(clave, (k, e) -> {
            boolean vigente = e != null && e.ultimo().plus(BLOQUEO).isAfter(ahora);
            int fallos = vigente ? e.fallos() + 1 : 1;
            return new Estado(fallos, ahora, fallos >= maximo ? ahora.plus(BLOQUEO) : null);
        });
    }

    private static String normalizar(String usuario) {
        if (usuario == null) {
            return "";
        }
        String u = usuario.trim().toLowerCase(Locale.ROOT);
        return u.length() > 60 ? u.substring(0, 60) : u;
    }
}
