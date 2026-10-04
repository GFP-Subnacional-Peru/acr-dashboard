#!/bin/bash
# Se ejecuta dentro del contenedor GDAL (docker compose run --rm gdal ...).
# Copia las capas de alertas de las 3 GDB oficiales y los límites ACR/ZI del dashboard
# al esquema "staging", todo reproyectado a WGS84 (EPSG:4326) y sin coordenadas M/Z.
set -euo pipefail

PG="PG:host=${PGHOST} dbname=${PGDATABASE} user=${PGUSER} password=${PGPASSWORD}"
ogrinfo "$PG" -q -sql "CREATE SCHEMA IF NOT EXISTS staging" >/dev/null

comun=(-f PostgreSQL -overwrite -t_srs EPSG:4326 -dim XY -nlt PROMOTE_TO_MULTI
       -lco SCHEMA=staging -lco OVERWRITE=YES -lco GEOMETRY_NAME=geom -lco LAUNDER=YES -lco SPATIAL_INDEX=NONE
       --config PG_USE_COPY YES)

for region in Loreto San_Martin Cuzco; do
  gdb=$(ls -d /gdb/Linea_base_deforestaci*_"${region}".gdb)
  tabla=$(echo "alerta_${region}" | tr '[:upper:]' '[:lower:]' | sed 's/cuzco/cusco/')
  echo "-> ${region}: $(basename "$gdb") / MonitoreoDeforestacion -> staging.${tabla}"
  ogr2ogr "${comun[@]}" -preserve_fid -lco FID=oid -nln "$tabla" "$PG" "$gdb" MonitoreoDeforestacion
done

echo "-> límites ACR / ZI del dashboard"
ogr2ogr "${comun[@]}" -nln limite_acr "$PG" /limites/acr_all.geojson
ogr2ogr "${comun[@]}" -nln limite_zi  "$PG" /limites/zi_all.geojson

echo "staging listo"
