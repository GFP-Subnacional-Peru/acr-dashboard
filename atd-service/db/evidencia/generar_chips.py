"""
Genera la evidencia satelital ANTES / DESPUÉS de cada alerta con Sentinel-2 L2A.

- Escenas: catálogo STAC público de Element84 (Earth Search), mismo origen que usa el toolbox H2.
- Recorte: solo se lee la ventana alrededor de la alerta (COG por HTTP), sin descargar la escena.
- Si la GDB ya trae el ID de escena (md_img_ant / md_img_dep) se respeta; si no, se busca
  la escena más reciente con poca nubosidad local antes y después de la fecha de la alerta.
- Resultado: PNG con el contorno de la alerta en amarillo, guardado en atd.evidencia.

Se ejecuta dentro del contenedor GDAL:
  docker compose run --rm gdal python3 /evidencia/generar_chips.py --acr ACR_CHU --anio 2026 --mes 4
"""
import argparse
import datetime as dt
import json
import os
import sys
import urllib.request

import numpy as np
from osgeo import gdal, ogr, osr

gdal.UseExceptions()
gdal.PushErrorHandler("CPLQuietErrorHandler")
gdal.SetConfigOption("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY_DIR")
gdal.SetConfigOption("CPL_VSIL_CURL_ALLOWED_EXTENSIONS", ".tif")
gdal.SetConfigOption("GDAL_HTTP_MAX_RETRY", "3")
gdal.SetConfigOption("GDAL_HTTP_RETRY_DELAY", "2")

STAC = "https://earth-search.aws.element84.com/v1"
COLECCION = "sentinel-2-l2a"
MEDIA_VENTANA_M = 450          # recorte de ~900 m x 900 m alrededor de la alerta
PIXELES = 360
MAX_NUBES_ESCENA = 70          # filtro grueso por escena; luego se mide la nubosidad local
MAX_NUBES_LOCAL = 0.20         # en el centro del recorte, donde está la alerta
SCL_NUBE = [0, 3, 8, 9, 10]    # sin dato, sombra de nube, nube media, nube alta, cirros


def pg():
    return ogr.Open(
        f"PG:host={os.environ['PGHOST']} dbname={os.environ['PGDATABASE']} "
        f"user={os.environ['PGUSER']} password={os.environ['PGPASSWORD']}", update=1)


def stac_item(item_id):
    with urllib.request.urlopen(f"{STAC}/collections/{COLECCION}/items/{item_id}", timeout=30) as r:
        return json.load(r)


def stac_buscar(lon, lat, desde, hasta, descendente):
    cuerpo = {
        "collections": [COLECCION],
        "intersects": {"type": "Point", "coordinates": [lon, lat]},
        "datetime": f"{desde.isoformat()}T00:00:00Z/{hasta.isoformat()}T23:59:59Z",
        "query": {"eo:cloud_cover": {"lt": MAX_NUBES_ESCENA}},
        "sortby": [{"field": "properties.datetime", "direction": "desc" if descendente else "asc"}],
        "limit": 12,
    }
    req = urllib.request.Request(f"{STAC}/search", data=json.dumps(cuerpo).encode(),
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=40) as r:
        return json.load(r).get("features", [])


def nubosidad_centro(item, bounds):
    """Fracción de nube/sombra/sin dato (capa SCL) en la mitad central del recorte."""
    x0, y0, x1, y1 = bounds
    dx, dy = (x1 - x0) / 4, (y1 - y0) / 4
    scl = gdal.Warp("", f"/vsicurl/{item['assets']['scl']['href']}", format="MEM", dstSRS="EPSG:3857",
                    outputBounds=(x0 + dx, y0 + dy, x1 - dx, y1 - dy), width=45, height=45,
                    resampleAlg="near").ReadAsArray()
    return float((scl == 0).mean()), float(np.isin(scl, SCL_NUBE).mean())


def recortar(item, bounds):
    """Devuelve el recorte RGB (dataset MEM en EPSG:3857)."""
    return gdal.Warp("", f"/vsicurl/{item['assets']['visual']['href']}", format="MEM",
                     dstSRS="EPSG:3857", outputBounds=bounds, width=PIXELES, height=PIXELES,
                     resampleAlg="cubic", dstNodata=None)


def realzar(ds):
    """Estiramiento común a las 3 bandas: por banda desbalancea el color y amplifica ruido en bosque homogéneo."""
    rgb = ds.ReadAsArray().astype(np.float32)
    validos = rgb.sum(axis=0) > 0
    if validos.mean() < 0.05:
        return
    lo, hi = np.percentile(rgb[:, validos], (1, 99.5))
    hi = max(hi, lo + 90)
    for b in range(3):
        estirada = np.clip((rgb[b] - lo) / (hi - lo), 0, 1) ** 0.85 * 255
        ds.GetRasterBand(b + 1).WriteArray(np.where(validos, estirada, 0).astype(np.uint8))


def dibujar_contorno(ds, wkt_3857):
    srs = osr.SpatialReference()
    srs.ImportFromEPSG(3857)
    vec = gdal.GetDriverByName("MEM").Create("", 0, 0, 0, gdal.GDT_Unknown)
    capa = vec.CreateLayer("c", srs, ogr.wkbUnknown)
    f = ogr.Feature(capa.GetLayerDefn())
    f.SetGeometry(ogr.CreateGeometryFromWkt(wkt_3857))
    capa.CreateFeature(f)
    gdal.Rasterize(ds, vec, bands=[1, 2, 3], burnValues=[255, 235, 59])


def a_png(ds):
    gdal.Translate("/vsimem/chip.png", ds, format="PNG")
    f = gdal.VSIFOpenL("/vsimem/chip.png", "rb")
    gdal.VSIFSeekL(f, 0, 2)
    n = gdal.VSIFTellL(f)
    gdal.VSIFSeekL(f, 0, 0)
    datos = gdal.VSIFReadL(1, n, f)
    gdal.VSIFCloseL(f)
    gdal.Unlink("/vsimem/chip.png")
    return datos


def elegir(candidatos, bounds):
    fechas_vistas = set()
    for item in candidatos:
        fecha = item["properties"]["datetime"][:10]
        if fecha in fechas_vistas:     # la misma pasada aparece en varios tiles solapados
            continue
        try:
            sin_cobertura, nubes = nubosidad_centro(item, bounds)
            if sin_cobertura > 0.5:
                continue
            if nubes > MAX_NUBES_LOCAL:
                print(f"      descartada {item['id']}: {nubes:.0%} nube/sombra sobre la alerta")
                fechas_vistas.add(fecha)
                continue
            return item, recortar(item, bounds), nubes
        except Exception as e:  # tile sin cobertura en la ventana: se prueba el siguiente de la misma fecha
            print(f"      descartada {item['id']}: {e}")
    return None, None, None


def guardar(con, alerta_id, momento, item, nubes, png):
    fecha = item["properties"]["datetime"][:10]
    con.ExecuteSQL(f"""
        INSERT INTO atd.escena (alerta_id, momento, proveedor, escena_id, fecha, nubosidad, publica)
        VALUES ({alerta_id}, '{momento}', 'sentinel2', '{item['id']}', '{fecha}', {round(nubes * 100, 2)}, TRUE)
        ON CONFLICT (alerta_id, momento, proveedor) DO UPDATE
           SET escena_id = EXCLUDED.escena_id, fecha = EXCLUDED.fecha, nubosidad = EXCLUDED.nubosidad
    """)
    con.ExecuteSQL(f"""
        INSERT INTO atd.evidencia (alerta_id, escena_id, tipo, mime, contenido, descripcion)
        SELECT {alerta_id}, e.id, 'chip_{momento}', 'image/png', decode('{png.hex()}', 'hex'),
               'Sentinel-2 L2A color natural · ' || e.escena_id
          FROM atd.escena e
         WHERE e.alerta_id = {alerta_id} AND e.momento = '{momento}' AND e.proveedor = 'sentinel2'
        ON CONFLICT (alerta_id, tipo) DO UPDATE
           SET escena_id = EXCLUDED.escena_id, contenido = EXCLUDED.contenido,
               descripcion = EXCLUDED.descripcion, creado_en = now()
    """)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--acr")
    ap.add_argument("--anio", type=int)
    ap.add_argument("--mes", type=int)
    ap.add_argument("--limite", type=int, default=50)
    ap.add_argument("--rehacer", action="store_true")
    args = ap.parse_args()

    filtros = ["TRUE"]
    if args.acr:
        filtros.append(f"a.acr_codigo = '{args.acr.replace(chr(39), '')}'")
    if args.anio:
        filtros.append(f"a.anio = {int(args.anio)}")
    if args.mes:
        filtros.append(f"a.mes = {int(args.mes)}")
    if not args.rehacer:
        filtros.append("NOT EXISTS (SELECT 1 FROM atd.evidencia v WHERE v.alerta_id = a.id AND v.tipo = 'chip_despues')")

    con = pg()
    sql = f"""
        SELECT a.id, a.codigo, a.fecha_imagen::text AS fecha, a.img_antes, a.img_despues,
               ST_X(a.centroide) AS lon, ST_Y(a.centroide) AS lat,
               ST_AsText(ST_Buffer(ST_Boundary(ST_Transform(a.geom, 3857)), 2.5)) AS contorno,
               ST_X(ST_Transform(a.centroide, 3857)) AS x, ST_Y(ST_Transform(a.centroide, 3857)) AS y
          FROM atd.alerta a
         WHERE {' AND '.join(filtros)} AND a.fecha_imagen IS NOT NULL
         ORDER BY a.superficie_ha DESC
         LIMIT {int(args.limite)}
    """
    capa = con.ExecuteSQL(sql)
    alertas = [{k: f.GetField(k) for k in ("id", "codigo", "fecha", "img_antes", "img_despues",
                                         "lon", "lat", "contorno", "x", "y")} for f in capa]
    con.ReleaseResultSet(capa)
    print(f"{len(alertas)} alertas por procesar")

    ok = 0
    for i, a in enumerate(alertas, 1):
        fecha = dt.date.fromisoformat(a["fecha"])
        m = MEDIA_VENTANA_M
        bounds = (a["x"] - m, a["y"] - m, a["x"] + m, a["y"] + m)
        print(f"[{i}/{len(alertas)}] {a['codigo']} ({a['fecha']})")
        try:
            def candidatos(id_gdb, desde, hasta, desc):
                lista = []
                if id_gdb and id_gdb.startswith("S2"):
                    try:
                        lista.append(stac_item(id_gdb))
                    except Exception:
                        pass
                return lista + stac_buscar(a["lon"], a["lat"], desde, hasta, desc)

            dep, ds_dep, n_dep = elegir(candidatos(a["img_despues"], fecha - dt.timedelta(days=3),
                                                   fecha + dt.timedelta(days=45), False), bounds)
            if not dep:
                print("    sin escena DESPUÉS utilizable")
                continue
            fecha_dep = dt.date.fromisoformat(dep["properties"]["datetime"][:10])
            ant, ds_ant, n_ant = elegir(candidatos(a["img_antes"], fecha_dep - dt.timedelta(days=150),
                                                   fecha_dep - dt.timedelta(days=12), True), bounds)
            if not ant:
                print("    sin escena ANTES utilizable")
                continue
            for momento, item, ds, nubes in (("antes", ant, ds_ant, n_ant), ("despues", dep, ds_dep, n_dep)):
                realzar(ds)
                dibujar_contorno(ds, a["contorno"])
                guardar(con, a["id"], momento, item, nubes, a_png(ds))
            ok += 1
            print(f"    OK  antes={ant['id']}  despues={dep['id']}")
        except Exception as e:
            print(f"    error: {e}")
    print(f"Listo: {ok}/{len(alertas)} alertas con evidencia Sentinel-2")
    return 0 if ok or not alertas else 1


if __name__ == "__main__":
    sys.exit(main())
