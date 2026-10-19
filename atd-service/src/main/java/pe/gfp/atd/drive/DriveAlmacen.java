package pe.gfp.atd.drive;

import com.google.api.client.googleapis.javanet.GoogleNetHttpTransport;
import com.google.api.client.http.ByteArrayContent;
import com.google.api.client.json.gson.GsonFactory;
import com.google.api.services.drive.Drive;
import com.google.api.services.drive.DriveScopes;
import com.google.api.services.drive.model.FileList;
import com.google.auth.http.HttpCredentialsAdapter;
import com.google.auth.oauth2.GoogleCredentials;
import com.google.auth.oauth2.UserCredentials;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Archivo grande en la unidad compartida de Google Workspace.
 * La base guarda el id (ruta = drive:ID). Sin credenciales, el visor sigue usando la base.
 */
@Component
public class DriveAlmacen {

    private static final Logger log = LoggerFactory.getLogger(DriveAlmacen.class);

    private final String carpetaRaiz;
    private final Drive drive;
    private final Map<String, String> carpetas = new ConcurrentHashMap<>();

    public DriveAlmacen(@Value("${atd.drive.carpeta:}") String carpeta,
                        @Value("${atd.drive.credenciales:}") String credenciales,
                        @Value("${atd.drive.refresh:}") String refresh) {
        this.carpetaRaiz = carpeta == null ? "" : carpeta.trim();
        Drive cliente = null;
        if (!this.carpetaRaiz.isBlank() && credenciales != null && !credenciales.isBlank()) {
            try {
                cliente = conectar(credenciales.trim(), refresh == null ? "" : refresh.trim());
                log.info("Google Drive empresarial conectado");
            } catch (Exception e) {
                log.warn("Google Drive no quedó conectado: {}", e.getMessage());
            }
        }
        this.drive = cliente;
    }

    public boolean activo() {
        return drive != null;
    }

    /** Sube un archivo nuevo dentro de fotos, reportes o sentinel. Devuelve el id de Drive. */
    public String subir(String grupo, String nombre, String mime, byte[] datos) throws Exception {
        String padre = carpeta(grupo);
        com.google.api.services.drive.model.File meta = new com.google.api.services.drive.model.File();
        meta.setName(nombre);
        meta.setParents(List.of(padre));
        com.google.api.services.drive.model.File creado = drive.files()
                .create(meta, new ByteArrayContent(mime, datos))
                .setSupportsAllDrives(true)
                .setFields("id")
                .execute();
        return creado.getId();
    }

    public byte[] descargar(String fileId) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        drive.files().get(fileId).setSupportsAllDrives(true).executeMediaAndDownloadTo(out);
        return out.toByteArray();
    }

    public void borrar(String fileId) {
        try {
            drive.files().delete(fileId).setSupportsAllDrives(true).execute();
        } catch (Exception e) {
            log.warn("No se pudo borrar el archivo de Drive {}: {}", fileId, e.getMessage());
        }
    }

    /** Deja una sola copia del PDF, con el nombre del reporte. */
    public void archivarReporte(String nombre, byte[] pdf) {
        if (!activo()) {
            return;
        }
        try {
            String padre = carpeta("reportes");
            String id = buscar(padre, nombre);
            if (id == null) {
                subir("reportes", nombre, "application/pdf", pdf);
            } else {
                drive.files().update(id, null, new ByteArrayContent("application/pdf", pdf))
                        .setSupportsAllDrives(true)
                        .execute();
            }
        } catch (Exception e) {
            log.warn("No se archivó el reporte en Drive: {}", e.getMessage());
        }
    }

    private Drive conectar(String credenciales, String refresh) throws Exception {
        byte[] json = leer(credenciales);
        String texto = new String(json, StandardCharsets.UTF_8);
        GoogleCredentials acceso;
        if (texto.contains("\"installed\"") || texto.contains("\"web\"")) {
            if (refresh.isBlank()) {
                throw new IllegalStateException("Falta el permiso de tu usuario");
            }
            JsonObject raiz = JsonParser.parseString(texto).getAsJsonObject();
            JsonObject datos = raiz.has("installed") ? raiz.getAsJsonObject("installed") : raiz.getAsJsonObject("web");
            acceso = UserCredentials.newBuilder()
                    .setClientId(datos.get("client_id").getAsString())
                    .setClientSecret(datos.get("client_secret").getAsString())
                    .setRefreshToken(refresh)
                    .build();
        } else {
            acceso = GoogleCredentials.fromStream(new ByteArrayInputStream(json))
                    .createScoped(List.of(DriveScopes.DRIVE));
        }
        return new Drive.Builder(
                GoogleNetHttpTransport.newTrustedTransport(),
                GsonFactory.getDefaultInstance(),
                new HttpCredentialsAdapter(acceso))
                .setApplicationName("ATD")
                .build();
    }

    private static byte[] leer(String valor) throws Exception {
        Path ruta = Path.of(valor);
        if (Files.isRegularFile(ruta)) {
            return Files.readAllBytes(ruta);
        }
        if (valor.startsWith("{")) {
            return valor.getBytes(StandardCharsets.UTF_8);
        }
        return Base64.getDecoder().decode(valor.replaceAll("\\s", ""));
    }

    private String carpeta(String nombre) throws Exception {
        String ya = carpetas.get(nombre);
        if (ya != null) {
            return ya;
        }
        synchronized (carpetas) {
            ya = carpetas.get(nombre);
            if (ya != null) {
                return ya;
            }
            String id = buscar(carpetaRaiz, nombre);
            if (id == null) {
                com.google.api.services.drive.model.File meta = new com.google.api.services.drive.model.File();
                meta.setName(nombre);
                meta.setMimeType("application/vnd.google-apps.folder");
                meta.setParents(List.of(carpetaRaiz));
                id = drive.files().create(meta)
                        .setSupportsAllDrives(true)
                        .setFields("id")
                        .execute()
                        .getId();
            }
            carpetas.put(nombre, id);
            return id;
        }
    }

    private String buscar(String padre, String nombre) throws Exception {
        String q = "name = '" + nombre.replace("'", "") + "' and '" + padre
                + "' in parents and trashed = false";
        FileList lista = drive.files().list()
                .setQ(q)
                .setSupportsAllDrives(true)
                .setIncludeItemsFromAllDrives(true)
                .setCorpora("allDrives")
                .setPageSize(1)
                .setFields("files(id)")
                .execute();
        if (lista.getFiles() == null || lista.getFiles().isEmpty()) {
            return null;
        }
        return lista.getFiles().get(0).getId();
    }
}
