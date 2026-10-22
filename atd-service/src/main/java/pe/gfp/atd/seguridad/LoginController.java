package pe.gfp.atd.seguridad;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

/** Quien abre /login a mano llega al visor, con el cuadro de ingreso. */
@Controller
public class LoginController {

    @GetMapping("/login")
    public String login() {
        return "redirect:/?entrar=1";
    }
}
