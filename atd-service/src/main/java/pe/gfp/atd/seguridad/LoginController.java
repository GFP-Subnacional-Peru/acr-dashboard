package pe.gfp.atd.seguridad;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

/** Quien abre /login a mano llega a la página de ingreso, fuera del mapa. */
@Controller
public class LoginController {

    @GetMapping("/login")
    public String login() {
        return "redirect:/login.html";
    }
}
