SET search_path = atd, public;

ALTER TABLE alerta
    ADD COLUMN codigo_gdb    VARCHAR(50),   -- md_alert
    ADD COLUMN sector_pp057  VARCHAR(50);   -- ac_sepp057

-- Misma estructura de la capa MonitoreoDeforestacion de la GDB: cada campo con dominio
-- lleva su código (igual que en ArcGIS) y al lado su descripción (*_desc).
CREATE VIEW v_alerta_gdb AS
SELECT a.id,
       a.codigo                                                        AS codigo_atd,
       r.nombre                                                        AS region,
       acr.codigo_oficial                                              AS anp_codi,
       acr.nombre                                                      AS anp_codi_desc,
       CASE WHEN a.ambito = 'ZI' THEN replace(a.territorio_codigo, '_', ' ') END AS zi_codi,
       a.ambito,
       a.fuente_id                                                     AS md_fuente,
       f.nombre                                                        AS md_fuente_desc,
       a.causa_id                                                      AS md_causa,
       c.nombre                                                        AS md_causa_desc,
       c.resultado                                                     AS resultado,
       a.estado,
       a.anio                                                          AS md_anno,
       a.mes                                                           AS mes_imagen,
       a.mes_reporte                                                   AS md_mesrep,
       a.fecha_imagen                                                  AS md_fecimg,
       a.fecha_imagen_ant                                              AS md_fecimg_ant,
       a.superficie_ha                                                 AS md_sup,
       a.exa                                                           AS md_exa,
       a.confiabilidad_id                                              AS md_conf,
       cf.nombre                                                       AS md_conf_desc,
       a.tipo_bosque_id                                                AS md_bosque,
       tb.nombre                                                       AS md_bosque_desc,
       a.zonificacion                                                  AS md_zonif,
       z.nombre                                                        AS md_zonif_desc,
       a.observaciones                                                 AS md_obs,
       a.editor_gdb                                                    AS md_editor,
       a.validado_en                                                   AS md_fecrev,
       a.codigo_gdb                                                    AS md_alert,
       a.sector_pp057                                                  AS ac_sepp057,
       a.sector                                                        AS md_sector,
       a.img_referencia                                                AS md_img,
       a.img_antes                                                     AS md_img_ant,
       a.img_despues                                                   AS md_img_dep,
       a.sat_antes                                                     AS md_sat_ant,
       a.sat_despues                                                   AS md_sat_dep,
       a.este_utm                                                      AS md_este,
       a.norte_utm                                                     AS md_norte,
       a.origen_gdb,
       a.origen_oid                                                    AS objectid_gdb,
       a.geom
  FROM alerta a
  JOIN region r            ON r.id = a.region_id
  JOIN territorio acr      ON acr.codigo = a.acr_codigo
  LEFT JOIN cat_fuente f   ON f.id = a.fuente_id
  LEFT JOIN cat_causa c    ON c.id = a.causa_id
  LEFT JOIN cat_confiabilidad cf ON cf.id = a.confiabilidad_id
  LEFT JOIN cat_tipo_bosque tb   ON tb.id = a.tipo_bosque_id
  LEFT JOIN cat_zonificacion z   ON z.codigo = a.zonificacion;
