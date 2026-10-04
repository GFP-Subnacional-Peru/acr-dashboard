SET search_path = atd, public;

-- Los recortes Sentinel-2 (PNG ~60 KB) se guardan en la base: Render free no tiene disco persistente.
ALTER TABLE evidencia
    ADD COLUMN contenido BYTEA,
    ADD COLUMN mime      VARCHAR(30),
    ALTER COLUMN ruta DROP NOT NULL;

CREATE UNIQUE INDEX evidencia_alerta_tipo_uk ON evidencia (alerta_id, tipo);
