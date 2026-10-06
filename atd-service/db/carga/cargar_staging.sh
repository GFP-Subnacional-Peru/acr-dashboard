#!/bin/bash
# Se ejecuta dentro del contenedor GDAL (docker compose run --rm gdal ...).
# Copia las capas de alertas de las 3 GDB oficiales, los centros de vigilancia comunal y los
# límites ACR/ZI del dashboard al esquema "staging", todo en WGS84 (EPSG:4326) y sin M/Z.
# Loreto se toma de /gdb_loreto si está montada (GDB completa de ATD_Loreto); si no, de /gdb.
set -euo pipefail

PG="PG:host=${PGHOST} dbname=${PGDATABASE} user=${PGUSER} password=${PGPASSWORD}"
ogrinfo "$PG" -q -sql "CREATE SCHEMA IF NOT EXISTS staging" >/dev/null

comun=(-f PostgreSQL -overwrite -t_srs EPSG:4326 -dim XY -nlt PROMOTE_TO_MULTI
       -lco SCHEMA=staging -lco OVERWRITE=YES -lco GEOMETRY_NAME=geom -lco LAUNDER=YES -lco SPATIAL_INDEX=NONE
       --config PG_USE_COPY YES)

gdb_de() {
  local region=$1 dir=/gdb
  if [ "$region" = Loreto ] && ls -d /gdb_loreto/Linea_base_deforestaci*_Loreto.gdb >/dev/null 2>&1; then
    dir=/gdb_loreto
  fi
  ls -d "$dir"/Linea_base_deforestaci*_"${region}".gdb
}

for region in Loreto San_Martin Cuzco; do
  gdb=$(gdb_de "$region")
  tabla=$(echo "alerta_${region}" | tr '[:upper:]' '[:lower:]' | sed 's/cuzco/cusco/')
  echo "-> ${region}: ${gdb} / MonitoreoDeforestacion -> staging.${tabla}"
  ogr2ogr "${comun[@]}" -preserve_fid -lco FID=oid -nln "$tabla" "$PG" "$gdb" MonitoreoDeforestacion
  # Las GDB regionales no tienen exactamente los mismos campos: se completan los que falten.
  ogrinfo "$PG" -q -sql "ALTER TABLE staging.${tabla}
      ADD COLUMN IF NOT EXISTS md_fecimg_ant timestamptz, ADD COLUMN IF NOT EXISTS md_fecrev timestamptz,
      ADD COLUMN IF NOT EXISTS md_img_ant varchar, ADD COLUMN IF NOT EXISTS md_img_dep varchar,
      ADD COLUMN IF NOT EXISTS md_sat_ant varchar, ADD COLUMN IF NOT EXISTS md_sat_dep varchar,
      ADD COLUMN IF NOT EXISTS md_codigo varchar, ADD COLUMN IF NOT EXISTS md_sector varchar,
      ADD COLUMN IF NOT EXISTS ac_nomb varchar" >/dev/null
done

gestion=$(ls -d /gdb_loreto/GestionACR*.gdb /gdb/GestionACR*.gdb 2>/dev/null | head -1 || true)
if [ -n "$gestion" ]; then
  echo "-> centros de vigilancia comunal: ${gestion}"
  ogr2ogr -f PostgreSQL -overwrite -t_srs EPSG:4326 -dim XY -lco SCHEMA=staging -lco OVERWRITE=YES \
          -lco GEOMETRY_NAME=geom -lco LAUNDER=YES -nln cvc_gestion "$PG" "$gestion" CenVigComPunto
else
  ogrinfo "$PG" -q -sql "CREATE TABLE IF NOT EXISTS staging.cvc_gestion (codacr varchar, noment varchar, denomi varchar, geom geometry(Point, 4326))" >/dev/null
fi

echo "-> límites ACR / ZI del dashboard"
ogr2ogr "${comun[@]}" -nln limite_acr "$PG" /limites/acr_all.geojson
ogr2ogr "${comun[@]}" -nln limite_zi  "$PG" /limites/zi_all.geojson

echo "staging listo"
