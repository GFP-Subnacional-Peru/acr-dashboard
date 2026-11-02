SET search_path = atd, public;

-- Coordenadas de la foto de campo. La descripción sigue en evidencia.descripcion.
ALTER TABLE evidencia
    ADD COLUMN lat DOUBLE PRECISION,
    ADD COLUMN lon DOUBLE PRECISION;

-- A quién se le pide la fotointerpretación de las alertas nuevas de cada ACR.
CREATE TABLE responsable_acr (
    id          BIGSERIAL PRIMARY KEY,
    acr_codigo  VARCHAR(20)  NOT NULL REFERENCES territorio (codigo),
    nombre      VARCHAR(150) NOT NULL,
    correo      VARCHAR(150),
    creado_en   TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX responsable_acr_ix ON responsable_acr (acr_codigo);
