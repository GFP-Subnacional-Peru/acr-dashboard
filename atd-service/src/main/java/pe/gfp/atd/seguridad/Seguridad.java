package pe.gfp.atd.seguridad;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.provisioning.InMemoryUserDetailsManager;
import org.springframework.boot.web.embedded.tomcat.TomcatServletWebServerFactory;
import org.springframework.boot.web.server.Cookie;
import org.springframework.boot.web.server.WebServerFactoryCustomizer;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.security.web.authentication.LoginUrlAuthenticationEntryPoint;
import org.springframework.security.web.authentication.SavedRequestAwareAuthenticationSuccessHandler;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;
import org.springframework.security.web.util.matcher.AntPathRequestMatcher;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Acceso al visor con usuario y contraseña. Dos perfiles: consulta (ver alertas y reportes) y editor
 * (además corrige polígonos y clasifica). Las credenciales solo llegan por variables de entorno.
 */
@Configuration
public class Seguridad {

    private static final Logger log = LoggerFactory.getLogger(Seguridad.class);

    @Bean
    SecurityFilterChain cadena(HttpSecurity http, IntentosLogin intentos) throws Exception {
        CsrfTokenRequestAttributeHandler csrf = new CsrfTokenRequestAttributeHandler();
        // Sin token diferido: la cookie XSRF-TOKEN ya existe cuando se muestra la pantalla de ingreso.
        csrf.setCsrfRequestAttributeName(null);
        CookieCsrfTokenRepository tokens = CookieCsrfTokenRepository.withHttpOnlyFalse();
        if (enNube()) {
            tokens.setCookieCustomizer(c -> c.sameSite("None").secure(true));
        }
        SavedRequestAwareAuthenticationSuccessHandler destino = new SavedRequestAwareAuthenticationSuccessHandler();
        destino.setDefaultTargetUrl("/");

        http
            .authorizeHttpRequests(a -> a
                .requestMatchers("/login.html", "/login.css", "/img/**", "/docs/**", "/error", "/api/atd/salud").permitAll()
                .requestMatchers("/", "/index.html", "/constatacion.html").authenticated()
                .requestMatchers(HttpMethod.GET, "/**").permitAll()
                .requestMatchers(HttpMethod.PUT, "/api/atd/alertas/*/geometria").hasRole("EDITOR")
                .requestMatchers(HttpMethod.PUT, "/api/atd/alertas/*/clasificacion").hasRole("EDITOR")
                .requestMatchers(HttpMethod.DELETE, "/api/atd/alertas/*/geometria").hasRole("EDITOR")
                .requestMatchers(HttpMethod.POST, "/api/atd/alertas/*/foto").hasRole("EDITOR")
                .requestMatchers(HttpMethod.DELETE, "/api/atd/alertas/*/foto/*").hasRole("EDITOR")
                .requestMatchers(HttpMethod.POST, "/api/atd/responsables").hasRole("EDITOR")
                .requestMatchers(HttpMethod.DELETE, "/api/atd/responsables/*").hasRole("EDITOR")
                .anyRequest().authenticated())
            .formLogin(f -> f
                .loginPage("/login.html")
                .loginProcessingUrl("/login")
                .successHandler((req, res, auth) -> {
                    intentos.exito(req.getRemoteAddr(), auth.getName());
                    destino.onAuthenticationSuccess(req, res, auth);
                })
                .failureHandler((req, res, e) -> {
                    intentos.fallo(req.getRemoteAddr(), req.getParameter("username"));
                    res.sendRedirect("/login.html?error");
                }))
            .logout(l -> l
                .logoutUrl("/logout")
                .logoutSuccessUrl("/login.html?salir")
                .deleteCookies("ATD_SESION"))
            .headers(h -> h
                .frameOptions(f -> f.disable())
                .contentSecurityPolicy(csp -> csp.policyDirectives(
                    "frame-ancestors 'self' https://www.gfpsubnacional.pe https://gfpsubnacional.pe")))
            .csrf(c -> c
                .csrfTokenRepository(tokens)
                .csrfTokenRequestHandler(csrf))
            .exceptionHandling(e -> e
                .authenticationEntryPoint(new LoginUrlAuthenticationEntryPoint("/login.html"))
                .defaultAuthenticationEntryPointFor(
                    new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED), new AntPathRequestMatcher("/api/**"))
                // Formulario de ingreso o de salida con token vencido (p. ej. volver atrás tras ingresar).
                .accessDeniedHandler((req, res, ex) -> {
                    if (req.getRequestURI().startsWith("/api/")) {
                        res.sendError(HttpStatus.FORBIDDEN.value());
                        return;
                    }
                    Authentication auth = SecurityContextHolder.getContext().getAuthentication();
                    boolean dentro = auth != null && !(auth instanceof AnonymousAuthenticationToken);
                    res.sendRedirect("/login".equals(req.getRequestURI()) && !dentro ? "/login.html?expirada" : "/");
                }))
            .addFilterBefore(new FiltroBloqueo(intentos), UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }

    /** En la nube la página de GFP abre el visor dentro de un iframe. La sesión tiene que viajar en ese marco. */
    @Bean
    WebServerFactoryCustomizer<TomcatServletWebServerFactory> sesionEnIframe() {
        return factory -> {
            if (!enNube()) return;
            var cookie = factory.getSession().getCookie();
            cookie.setSameSite(Cookie.SameSite.NONE);
            cookie.setSecure(true);
            cookie.setHttpOnly(true);
        };
    }

    private static boolean enNube() {
        return System.getenv("RENDER") != null;
    }

    @Bean
    PasswordEncoder codificador() {
        return PasswordEncoderFactories.createDelegatingPasswordEncoder();
    }

    @Bean
    InMemoryUserDetailsManager usuarios(PasswordEncoder codificador,
                                        @Value("${atd.acceso.consulta.usuario}") String usuarioConsulta,
                                        @Value("${atd.acceso.consulta.clave}") String claveConsulta,
                                        @Value("${atd.acceso.editor.usuario}") String usuarioEditor,
                                        @Value("${atd.acceso.editor.clave}") String claveEditor) {
        List<UserDetails> lista = new ArrayList<>();
        if (!claveConsulta.isBlank()) {
            lista.add(User.withUsername(usuarioConsulta).password(codificador.encode(claveConsulta))
                    .roles("CONSULTA").build());
        }
        if (!claveEditor.isBlank()) {
            lista.add(User.withUsername(usuarioEditor).password(codificador.encode(claveEditor))
                    .roles("CONSULTA", "EDITOR").build());
        }
        if (lista.isEmpty()) {
            log.warn("Sin ATD_CLAVE_CONSULTA ni ATD_CLAVE_EDITOR: nadie podrá ingresar al visor");
        }
        return new InMemoryUserDetailsManager(lista);
    }

    /** Corta el intento de ingreso antes de verificar la contraseña si la IP o el usuario están bloqueados. */
    private static final class FiltroBloqueo extends OncePerRequestFilter {
        private final IntentosLogin intentos;

        FiltroBloqueo(IntentosLogin intentos) {
            this.intentos = intentos;
        }

        @Override
        protected boolean shouldNotFilter(HttpServletRequest req) {
            return !("POST".equals(req.getMethod()) && "/login".equals(req.getRequestURI()));
        }

        @Override
        protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain cadena)
                throws ServletException, IOException {
            if (intentos.bloqueado(req.getRemoteAddr(), req.getParameter("username"))) {
                res.sendRedirect("/login.html?bloqueado");
                return;
            }
            cadena.doFilter(req, res);
        }
    }
}
