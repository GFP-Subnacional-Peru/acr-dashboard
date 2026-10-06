package pe.gfp.atd.seguridad;

import java.util.Map;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class SesionController {

    @GetMapping("/api/atd/sesion")
    public Map<String, Object> sesion(Authentication auth) {
        boolean editor = auth.getAuthorities().stream().anyMatch(a -> "ROLE_EDITOR".equals(a.getAuthority()));
        return Map.of("usuario", auth.getName(), "editor", editor);
    }
}
