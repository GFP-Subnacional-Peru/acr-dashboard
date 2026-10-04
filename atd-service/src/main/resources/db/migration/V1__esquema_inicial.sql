SET search_path = atd, public;

CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA public;

-- ============================================================
-- Catálogos (dominios de la GDB oficial)
-- ============================================================
CREATE TABLE region (
    id      SMALLINT PRIMARY KEY,
    codigo  VARCHAR(20)  NOT NULL UNIQUE,
    nombre  VARCHAR(60)  NOT NULL
);

-- resultado: antropica | natural | falsa  (define cómo suma en los indicadores)
CREATE TABLE cat_causa (
    id         SMALLINT PRIMARY KEY,
    nombre     VARCHAR(60) NOT NULL,
    resultado  VARCHAR(10) NOT NULL CHECK (resultado IN ('antropica', 'natural', 'falsa'))
);

CREATE TABLE cat_fuente (
    id      SMALLINT PRIMARY KEY,
    nombre  VARCHAR(40) NOT NULL
);

CREATE TABLE cat_confiabilidad (
    id      SMALLINT PRIMARY KEY,
    nombre  VARCHAR(20) NOT NULL
);

CREATE TABLE cat_tipo_bosque (
    id      SMALLINT PRIMARY KEY,
    nombre  VARCHAR(20) NOT NULL
);

CREATE TABLE cat_zonificacion (
    codigo  VARCHAR(20) PRIMARY KEY,
    nombre  VARCHAR(60) NOT NULL
);

-- ============================================================
-- Territorios: ACR y su Zona de Influencia (mismos códigos del dashboard)
-- ============================================================
CREATE TABLE territorio (
    codigo          VARCHAR(20) PRIMARY KEY,            -- ACR_AA, ZI_AA ...
    tipo            VARCHAR(3)  NOT NULL CHECK (tipo IN ('ACR', 'ZI')),
    acr_codigo      VARCHAR(20) NOT NULL,               -- ACR al que pertenece (ella misma si tipo = ACR)
    codigo_oficial  VARCHAR(20),                        -- ACR09 (código SERNANP/GDB)
    nombre          VARCHAR(150) NOT NULL,
    region_id       SMALLINT NOT NULL REFERENCES region (id),
    area_ha         NUMERIC(14, 2),
    geom            geometry(MultiPolygon, 4326)
);
CREATE INDEX territorio_geom_gix ON territorio USING GIST (geom);
CREATE INDEX territorio_acr_ix ON territorio (acr_codigo);

-- ============================================================
-- Usuarios del módulo de validación (fase 3)
-- ============================================================
CREATE TABLE usuario (
    id                 BIGSERIAL PRIMARY KEY,
    email              VARCHAR(150) NOT NULL UNIQUE,
    nombre             VARCHAR(150) NOT NULL,
    password_hash      VARCHAR(100) NOT NULL,
    rol                VARCHAR(20)  NOT NULL CHECK (rol IN ('ESPECIALISTA', 'ADMIN')),
    region_id          SMALLINT REFERENCES region (id),  -- NULL = todas (ADMIN)
    activo             BOOLEAN      NOT NULL DEFAULT TRUE,
    intentos_fallidos  SMALLINT     NOT NULL DEFAULT 0,
    bloqueado_hasta    TIMESTAMPTZ,
    creado_en          TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ============================================================
-- Alertas
-- ============================================================
CREATE TABLE alerta (
    id                BIGSERIAL PRIMARY KEY,
    codigo            VARCHAR(30)  NOT NULL UNIQUE,        -- LOR-2026-0001
    region_id         SMALLINT     NOT NULL REFERENCES region (id),
    territorio_codigo VARCHAR(20)  NOT NULL REFERENCES territorio (codigo),
    acr_codigo        VARCHAR(20)  NOT NULL,
    ambito            VARCHAR(3)   NOT NULL CHECK (ambito IN ('ACR', 'ZI')),

    anio              SMALLINT     NOT NULL,                              -- de la fecha de imagen
    mes               SMALLINT     NOT NULL CHECK (mes BETWEEN 1 AND 12), -- de la fecha de imagen
    mes_reporte       SMALLINT     CHECK (mes_reporte BETWEEN 1 AND 12),  -- md_mesrep normalizado
    fecha_imagen      DATE,
    fecha_imagen_ant  DATE,
    superficie_ha     NUMERIC(12, 4) NOT NULL,

    fuente_id         SMALLINT REFERENCES cat_fuente (id),
    confiabilidad_id  SMALLINT REFERENCES cat_confiabilidad (id),
    tipo_bosque_id    SMALLINT REFERENCES cat_tipo_bosque (id),
    zonificacion      VARCHAR(20) REFERENCES cat_zonificacion (codigo),
    sector            VARCHAR(150),
    exa               VARCHAR(50),

    estado            VARCHAR(10)  NOT NULL DEFAULT 'pendiente'
                      CHECK (estado IN ('pendiente', 'validada')),
    causa_id          SMALLINT REFERENCES cat_causa (id),   -- define el resultado
    conclusion        TEXT,
    observaciones     VARCHAR(250),
    validado_por      BIGINT REFERENCES usuario (id),
    validado_en       TIMESTAMPTZ,
    editor_gdb        VARCHAR(50),

    img_antes         VARCHAR(500),
    img_despues       VARCHAR(500),
    sat_antes         VARCHAR(50),
    sat_despues       VARCHAR(50),
    img_referencia    VARCHAR(500),

    este_utm          DOUBLE PRECISION,
    norte_utm         DOUBLE PRECISION,
    geom              geometry(MultiPolygon, 4326) NOT NULL,
    centroide         geometry(Point, 4326) NOT NULL,

    origen_gdb        VARCHAR(80)  NOT NULL,
    origen_capa       VARCHAR(60)  NOT NULL,
    origen_oid        INTEGER      NOT NULL,
    creado_en         TIMESTAMPTZ  NOT NULL DEFAULT now(),
    actualizado_en    TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT alerta_origen_uk UNIQUE (origen_gdb, origen_capa, origen_oid),
    CONSTRAINT alerta_validada_ck CHECK (estado = 'pendiente' OR causa_id IS NOT NULL)
);
CREATE INDEX alerta_geom_gix ON alerta USING GIST (geom);
CREATE INDEX alerta_periodo_ix ON alerta (acr_codigo, anio, mes);
CREATE INDEX alerta_territorio_ix ON alerta (territorio_codigo, anio, mes);

-- ============================================================
-- Evidencia satelital (escenas antes/después) y recortes guardados
-- ============================================================
CREATE TABLE escena (
    id           BIGSERIAL PRIMARY KEY,
    alerta_id    BIGINT       NOT NULL REFERENCES alerta (id) ON DELETE CASCADE,
    momento      VARCHAR(7)   NOT NULL CHECK (momento IN ('antes', 'despues')),
    proveedor    VARCHAR(12)  NOT NULL CHECK (proveedor IN ('planet', 'sentinel2')),
    escena_id    VARCHAR(200) NOT NULL,
    fecha        DATE,
    nubosidad    NUMERIC(5, 2),
    publica      BOOLEAN      NOT NULL DEFAULT FALSE,  -- Planet queda privado hasta confirmar licencia
    creado_en    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT escena_uk UNIQUE (alerta_id, momento, proveedor)
);

CREATE TABLE evidencia (
    id           BIGSERIAL PRIMARY KEY,
    alerta_id    BIGINT       NOT NULL REFERENCES alerta (id) ON DELETE CASCADE,
    escena_id    BIGINT       REFERENCES escena (id) ON DELETE SET NULL,
    tipo         VARCHAR(20)  NOT NULL,           -- chip_antes, chip_despues, foto_campo ...
    ruta         VARCHAR(300) NOT NULL,
    descripcion  VARCHAR(250),
    creado_por   BIGINT       REFERENCES usuario (id),
    creado_en    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ============================================================
-- Reportes PDF generados
-- ============================================================
CREATE TABLE reporte (
    id            BIGSERIAL PRIMARY KEY,
    alerta_id     BIGINT      REFERENCES alerta (id) ON DELETE CASCADE,
    acr_codigo    VARCHAR(20),
    anio          SMALLINT,
    mes           SMALLINT,
    ruta          VARCHAR(300) NOT NULL,
    sha256        CHAR(64),
    generado_por  BIGINT      REFERENCES usuario (id),
    generado_en   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- Auditoría de validación e ingestas
-- ============================================================
CREATE TABLE historial_validacion (
    id               BIGSERIAL PRIMARY KEY,
    alerta_id        BIGINT      NOT NULL REFERENCES alerta (id) ON DELETE CASCADE,
    usuario_id       BIGINT      REFERENCES usuario (id),
    accion           VARCHAR(20) NOT NULL,
    estado_anterior  VARCHAR(10),
    estado_nuevo     VARCHAR(10),
    cambios          JSONB,
    creado_en        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX historial_alerta_ix ON historial_validacion (alerta_id, creado_en DESC);

CREATE TABLE ingesta (
    id               BIGSERIAL PRIMARY KEY,
    fuente           VARCHAR(40) NOT NULL,     -- gdb_inicial, geobosques ...
    iniciado_en      TIMESTAMPTZ NOT NULL DEFAULT now(),
    terminado_en     TIMESTAMPTZ,
    n_nuevas         INTEGER,
    n_actualizadas   INTEGER,
    estado           VARCHAR(10) NOT NULL DEFAULT 'en_curso'
                     CHECK (estado IN ('en_curso', 'ok', 'error')),
    detalle          TEXT
);
