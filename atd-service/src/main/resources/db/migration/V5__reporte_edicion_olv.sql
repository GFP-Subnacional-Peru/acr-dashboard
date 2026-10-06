-- Datos que pide el reporte PDF oficial, edición de geometrías y georreferencia de la evidencia.

ALTER TABLE territorio
    ADD COLUMN provincia VARCHAR(150),
    ADD COLUMN distrito  VARCHAR(150);

ALTER TABLE alerta
    ADD COLUMN codigo_reporte   VARCHAR(30),                   -- md_codigo de la GDB: "ACR10 - 2026 - 064"
    ADD COLUMN geom_original    geometry(MultiPolygon, 4326),  -- polígono tal como vino de la GDB
    ADD COLUMN geom_editada_en  TIMESTAMPTZ,
    ADD COLUMN geom_editada_por VARCHAR(80);

UPDATE alerta SET geom_original = geom;

-- Centros de vigilancia comunal (GDB de gestión ACR): lugar poblado y OLV más cercanos a la alerta.
CREATE TABLE olv (
    id             SERIAL PRIMARY KEY,
    acr_oficial    VARCHAR(10)  NOT NULL,
    nombre         VARCHAR(150) NOT NULL,
    lugar_poblado  VARCHAR(100),
    geom           geometry(Point, 4326) NOT NULL
);
CREATE INDEX olv_geom_gix ON olv USING GIST (geom);
CREATE INDEX olv_acr_ix ON olv (acr_oficial);

-- Extensión del recorte en EPSG:3857: permite dibujar el polígono vigente sobre la imagen.
ALTER TABLE escena
    ADD COLUMN rec_xmin DOUBLE PRECISION,
    ADD COLUMN rec_ymin DOUBLE PRECISION,
    ADD COLUMN rec_xmax DOUBLE PRECISION,
    ADD COLUMN rec_ymax DOUBLE PRECISION,
    ADD COLUMN nubosidad_escena NUMERIC(5, 2);
