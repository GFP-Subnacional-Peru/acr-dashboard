-- Normaliza staging.* (cargado por cargar_staging.sh) hacia las tablas definitivas de atd.
-- Es idempotente: se puede volver a ejecutar tras actualizar las GDB.
\set ON_ERROR_STOP on
SET search_path = atd, public;

BEGIN;

INSERT INTO ingesta (fuente) VALUES ('gdb_inicial');

-- Códigos del dashboard <-> códigos oficiales SERNANP usados en las GDB
CREATE TEMP TABLE acr_map (codigo text, oficial text, nombre text, region_id smallint) ON COMMIT DROP;
INSERT INTO acr_map VALUES
    ('ACR_AA',    'ACR09', 'Ampiyacu Apayacu',                 1),
    ('ACR_CTT',   'ACR04', 'Comunal Tamshiyacu Tahuayo',       1),
    ('ACR_ANPCH', 'ACR10', 'Alto Nanay - Pintuyacu Chambira',  1),
    ('ACR_MK',    'ACR17', 'Maijuna Kichwa',                   1),
    ('ACR_CE',    'ACR01', 'Cordillera Escalera',              2),
    ('ACR_BSM',   'ACR21', 'Bosques de Shunté y Mishollo',     2),
    ('ACR_CHQ',   'ACR07', 'Choquequirao',                     3),
    ('ACR_CHU',   'ACR26', 'Chuyapi Urusayhua',                3),
    ('ACR_QK',    'ACR30', 'Q''eros Kosñipata',                3);

-- ------------------------------------------------------------
-- Territorios (límites idénticos a los del dashboard)
-- ------------------------------------------------------------
WITH lim AS (
    SELECT codigo, 'ACR' AS tipo, codigo AS acr_codigo, geom FROM staging.limite_acr
    UNION ALL
    SELECT codigo, 'ZI', replace(codigo, 'ZI_', 'ACR_'), geom FROM staging.limite_zi
), dis AS (
    SELECT codigo, tipo, acr_codigo,
           ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_Union(geom)), 3))::geometry(MultiPolygon, 4326) AS geom
      FROM lim
     GROUP BY codigo, tipo, acr_codigo
)
INSERT INTO territorio (codigo, tipo, acr_codigo, codigo_oficial, nombre, region_id, area_ha, geom)
SELECT d.codigo, d.tipo, d.acr_codigo,
       CASE WHEN d.tipo = 'ACR' THEN m.oficial END,
       CASE WHEN d.tipo = 'ACR' THEN 'ACR ' ELSE 'ZI ' END || m.nombre,
       m.region_id,
       round((ST_Area(d.geom::geography) / 10000)::numeric, 2),
       d.geom
  FROM dis d
  JOIN acr_map m ON m.codigo = d.acr_codigo
ON CONFLICT (codigo) DO UPDATE SET
    tipo = EXCLUDED.tipo, acr_codigo = EXCLUDED.acr_codigo, codigo_oficial = EXCLUDED.codigo_oficial,
    nombre = EXCLUDED.nombre, region_id = EXCLUDED.region_id, area_ha = EXCLUDED.area_ha, geom = EXCLUDED.geom;

-- ------------------------------------------------------------
-- Alertas: unión de las 3 regiones con columnas homogéneas
-- ------------------------------------------------------------
CREATE TEMP TABLE stg ON COMMIT DROP AS
SELECT 1::smallint AS region_id, 'LOR' AS prefijo, 'Linea_base_deforestación_Loreto.gdb' AS gdb,
       oid, anp_codi, md_anno, md_mesrep, md_fecimg, md_fecimg_ant, md_sup, md_causa, md_conf, md_bosque,
       md_fuente, md_zonif, md_sector AS sector, md_exa, md_obs, md_editor, md_fecrev,
       md_img, md_img_ant, md_img_dep, md_sat_ant, md_sat_dep, md_este, md_norte, geom
  FROM staging.alerta_loreto
UNION ALL
SELECT 2, 'SMA', 'Linea_base_deforestación_San_Martin.gdb',
       oid, anp_codi, md_anno, md_mesrep, md_fecimg, NULL, md_sup, md_causa, md_conf, md_bosque,
       md_fuente, md_zonif, ac_nomb, md_exa, md_obs, md_editor, NULL,
       md_img, NULL, NULL, NULL, NULL, md_este, md_norte, geom
  FROM staging.alerta_san_martin
UNION ALL
SELECT 3, 'CUS', 'Linea_base_deforestación_Cuzco.gdb',
       oid, anp_codi, md_anno, md_mesrep, md_fecimg, NULL, md_sup, md_causa, md_conf, md_bosque,
       md_fuente, md_zonif, ac_nomb, md_exa, md_obs, md_editor, NULL,
       md_img, NULL, NULL, NULL, NULL, md_este, md_norte, geom
  FROM staging.alerta_cusco;

CREATE TEMP TABLE alerta_nueva ON COMMIT DROP AS
SELECT s.*, m.codigo AS acr_codigo,
       ST_Multi(ST_CollectionExtract(ST_MakeValid(s.geom), 3))::geometry(MultiPolygon, 4326) AS geom_ok,
       ST_PointOnSurface(ST_MakeValid(s.geom))::geometry(Point, 4326) AS centro
  FROM stg s
  JOIN acr_map m ON m.oficial = s.anp_codi;

INSERT INTO alerta (
    codigo, region_id, territorio_codigo, acr_codigo, ambito,
    anio, mes, mes_reporte, fecha_imagen, fecha_imagen_ant, superficie_ha,
    fuente_id, confiabilidad_id, tipo_bosque_id, zonificacion, sector, exa,
    estado, causa_id, observaciones, validado_en, editor_gdb,
    img_antes, img_despues, sat_antes, sat_despues, img_referencia,
    este_utm, norte_utm, geom, centroide, origen_gdb, origen_capa, origen_oid)
SELECT
    n.prefijo || '-' || COALESCE(n.md_anno, extract(year FROM n.md_fecimg)::int) || '-' || lpad(n.oid::text, 4, '0'),
    n.region_id,
    CASE WHEN dentro.acr THEN n.acr_codigo ELSE replace(n.acr_codigo, 'ACR_', 'ZI_') END,
    n.acr_codigo,
    CASE WHEN dentro.acr THEN 'ACR' ELSE 'ZI' END,
    COALESCE(extract(year FROM n.md_fecimg)::int, n.md_anno),
    COALESCE(extract(month FROM n.md_fecimg)::int, 1),
    CASE WHEN n.md_mesrep BETWEEN 1 AND 12 THEN n.md_mesrep
         WHEN n.md_mesrep > 100000 THEN (n.md_mesrep / 100) % 100 END,
    n.md_fecimg::date,
    n.md_fecimg_ant::date,
    COALESCE(n.md_sup, ST_Area(n.geom_ok::geography) / 10000),
    (SELECT id FROM cat_fuente WHERE id = n.md_fuente),
    (SELECT id FROM cat_confiabilidad WHERE id = n.md_conf),
    (SELECT id FROM cat_tipo_bosque WHERE id = n.md_bosque),
    (SELECT z.codigo FROM cat_zonificacion z
      WHERE z.codigo = trim(n.md_zonif) OR lower(z.nombre) = lower(trim(n.md_zonif))),
    NULLIF(trim(n.sector), ''), NULLIF(trim(n.md_exa), ''),
    CASE WHEN c.id IS NOT NULL THEN 'validada' ELSE 'pendiente' END,
    c.id,
    NULLIF(trim(n.md_obs), ''),
    n.md_fecrev,
    NULLIF(trim(n.md_editor), ''),
    NULLIF(trim(n.md_img_ant), ''),
    COALESCE(NULLIF(trim(n.md_img_dep), ''), NULLIF(trim(n.md_img), '')),
    NULLIF(trim(n.md_sat_ant), ''),
    NULLIF(trim(n.md_sat_dep), ''),
    NULLIF(trim(n.md_img), ''),
    n.md_este, n.md_norte,
    n.geom_ok, n.centro,
    n.gdb, 'MonitoreoDeforestacion', n.oid
  FROM alerta_nueva n
  LEFT JOIN cat_causa c ON c.id = n.md_causa
  CROSS JOIN LATERAL (
      SELECT EXISTS (SELECT 1 FROM territorio t
                      WHERE t.codigo = n.acr_codigo AND ST_Intersects(t.geom, n.centro)) AS acr
  ) dentro
ON CONFLICT (origen_gdb, origen_capa, origen_oid) DO UPDATE SET
    territorio_codigo = EXCLUDED.territorio_codigo, ambito = EXCLUDED.ambito,
    anio = EXCLUDED.anio, mes = EXCLUDED.mes, mes_reporte = EXCLUDED.mes_reporte,
    fecha_imagen = EXCLUDED.fecha_imagen, fecha_imagen_ant = EXCLUDED.fecha_imagen_ant,
    superficie_ha = EXCLUDED.superficie_ha, fuente_id = EXCLUDED.fuente_id,
    confiabilidad_id = EXCLUDED.confiabilidad_id, tipo_bosque_id = EXCLUDED.tipo_bosque_id,
    zonificacion = EXCLUDED.zonificacion, sector = EXCLUDED.sector, exa = EXCLUDED.exa,
    observaciones = EXCLUDED.observaciones, editor_gdb = EXCLUDED.editor_gdb,
    img_antes = EXCLUDED.img_antes, img_despues = EXCLUDED.img_despues,
    sat_antes = EXCLUDED.sat_antes, sat_despues = EXCLUDED.sat_despues,
    img_referencia = EXCLUDED.img_referencia, este_utm = EXCLUDED.este_utm, norte_utm = EXCLUDED.norte_utm,
    geom = EXCLUDED.geom, centroide = EXCLUDED.centroide,
    -- la validación web (fase 3) manda sobre la GDB: no se pisa una alerta validada en la web
    estado = CASE WHEN alerta.validado_por IS NULL THEN EXCLUDED.estado ELSE alerta.estado END,
    causa_id = CASE WHEN alerta.validado_por IS NULL THEN EXCLUDED.causa_id ELSE alerta.causa_id END,
    validado_en = CASE WHEN alerta.validado_por IS NULL THEN EXCLUDED.validado_en ELSE alerta.validado_en END,
    actualizado_en = now();

UPDATE ingesta
   SET terminado_en = now(), estado = 'ok',
       n_nuevas = (SELECT count(*) FROM alerta WHERE creado_en >= ingesta.iniciado_en),
       n_actualizadas = (SELECT count(*) FROM alerta WHERE creado_en < ingesta.iniciado_en
                                                      AND actualizado_en >= ingesta.iniciado_en),
       detalle = (SELECT count(*) FROM stg) || ' filas leídas; '
                 || (SELECT count(*) FROM stg WHERE anp_codi NOT IN (SELECT oficial FROM acr_map))
                 || ' fuera de las 9 ACR'
 WHERE id = (SELECT max(id) FROM ingesta);

COMMIT;

SELECT r.nombre AS region, a.acr_codigo, a.ambito, a.estado, count(*) AS alertas,
       round(sum(a.superficie_ha), 2) AS ha
  FROM alerta a JOIN region r ON r.id = a.region_id
 GROUP BY r.id, r.nombre, a.acr_codigo, a.ambito, a.estado
 ORDER BY r.id, a.acr_codigo, a.ambito, a.estado;

SELECT fuente, estado, n_nuevas, n_actualizadas, detalle FROM ingesta ORDER BY id DESC LIMIT 1;
