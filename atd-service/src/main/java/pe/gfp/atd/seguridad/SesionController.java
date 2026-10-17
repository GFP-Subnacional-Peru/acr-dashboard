package pe.gfp.atd.seguridad;

import java.util.Map;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class SesionController {

    @GetMapping("/api/atd/sesion")
    public Map<String, Object> sesion(Authentication auth) {
        boolean dentro = auth != null && auth.isAuthenticated()
                && !(auth instanceof AnonymousAuthenticationToken);
        if (!dentro) {
            return Map.of("usuario", "", "editor", false, "ingresado", false);
        }
        boolean editor = auth.getAuthorities().stream().anyMatch(a -> "ROLE_EDITOR".equals(a.getAuthority()));
        return Map.of("usuario", auth.getName(), "editor", editor, "ingresado", true);
    }
}
