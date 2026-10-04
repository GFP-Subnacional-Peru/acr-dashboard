package pe.gfp.atd.alerta;

import java.util.Locale;

/** Ámbito de consulta: solo el ACR, solo su Zona de Influencia, o ambos. */
public enum Ambito {
    ACR, ZI, AMBOS;

    public static Ambito desde(String valor) {
        if (valor == null || valor.isBlank()) {
            return AMBOS;
        }
        return Ambito.valueOf(valor.trim().toUpperCase(Locale.ROOT));
    }
}
