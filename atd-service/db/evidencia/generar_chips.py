"""
Genera la evidencia satelital ANTES / DESPUÉS de cada alerta con Sentinel-2 L2A.

- Escenas: catálogo STAC público de Element84 (Earth Search), el mismo que usa el toolbox H2.
- Se respetan las escenas elegidas por el fotointérprete: la GDB trae la de DESPUÉS (md_img) y los
  JSON de imagenes_sentinel (montados en /escenas) traen la de ANTES de cada código de alerta.
  Si no existen, se busca la escena más cercana con nubosidad de escena <= 30 % y la alerta despejada.
- Recorte: solo se lee la ventana alrededor de la alerta (COG por HTTP), sin descargar la escena.
- Resultado: PNG en color natural SIN contorno, más la extensión del recorte (EPSG:3857), para que
  el visor y el PDF dibujen encima el polígono vigente (también si fue editado).

Se ejecuta dentro del contenedor GDAL:
  docker compose run --rm gdal python3 /evidencia/generar_chips.py --region 1 --limite 400
"""
import argparse
import concurrent.futures as cf
import datetime as dt
import glob
import json
import os
import sys
import urllib.request

import numpy as np
from osgeo import gdal, ogr

gdal.UseExceptions()
gdal.PushErrorHandler("CPLQuietErrorHandler")
gdal.SetConfigOption("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY_DIR")
gdal.SetConfigOption("CPL_VSIL_CURL_ALLOWED_EXTENSIONS", ".tif")
gdal.SetConfigOption("GDAL_HTTP_MAX_RETRY", "3")
gdal.SetConfigOption("GDAL_HTTP_RETRY_DELAY", "2")

STAC = "https://earth-search.aws.element84.com/v1"
COLECCION = "sentinel-2-l2a"
MEDIA_VENTANA_M = 750          # recorte de 1,5 km x 1,5 km alrededor de la alerta
PIXELES = 500
MAX_NUBES_ESCENA = 30          # % de nubes de la escena completa (filtro del catálogo)
MAX_NUBES_LOCAL = 0.20         # nube/sombra tolerada sobre la alerta (mitad central del recorte)
SCL_NUBE = [0, 3, 8, 9, 10]    # sin dato, sombra de nube, nube media, nube alta, cirros


def pg():
    return ogr.Open(
        f"PG:host={os.environ['PGHOST']} dbname={os.environ['PGDATABASE']} "
        f"user={os.environ['PGUSER']} password={os.environ['PGPASSWORD']}", update=1)


def escenas_fotointerprete(carpeta="/escenas"):
    """{codigo_reporte: {'A': id, 'D': id}} desde los JSON ATD_OID*_A/D.json del toolbox."""
    elegidas = {}
    archivos = sorted(glob.glob(os.path.join(carpeta, "ATD_OID*_[AD].json")), key=os.path.getmtime)
    for ruta in archivos:
        try:
            with open(ruta, encoding="utf-8") as f:
                j = json.load(f)
        except (OSError, ValueError):
            continue
        codigo = str(j.get("acr", "")).strip()
        if " - " in codigo and str(j.get("id", "")).startswith("S2"):
            elegidas.setdefault(codigo, {})[ruta[-6]] = j["id"]
    return elegidas


def stac_item(item_id):
    with urllib.request.urlopen(f"{STAC}/collections/{COLECCION}/items/{item_id}", timeout=30) as r:
        return json.load(r)


def stac_buscar(lon, lat, desde, hasta, descendente):
    cuerpo = {
        "collections": [COLECCION],
        "intersects": {"type": "Point", "coordinates": [lon, lat]},
        "datetime": f"{desde.isoformat()}T00:00:00Z/{hasta.isoformat()}T23:59:59Z",
        "query": {"eo:cloud_cover": {"lte": MAX_NUBES_ESCENA}},
        "sortby": [{"field": "properties.datetime", "direction": "desc" if descendente else "asc"}],
        "limit": 12,
    }
    req = urllib.request.Request(f"{STAC}/search", data=json.dumps(cuerpo).encode(),
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=40) as r:
        return json.load(r).get("features", [])


def nubosidad_centro(item, bounds):
    """Fracción sin dato y fracción de nube/sombra (capa SCL) en la mitad central del recorte."""
    x0, y0, x1, y1 = bounds
    dx, dy = (x1 - x0) / 4, (y1 - y0) / 4
    scl = gdal.Warp("", f"/vsicurl/{item['assets']['scl']['href']}", format="MEM", dstSRS="EPSG:3857",
                    outputBounds=(x0 + dx, y0 + dy, x1 - dx, y1 - dy), width=50, height=50,
                    resampleAlg="near").ReadAsArray()
    return float((scl == 0).mean()), float(np.isin(scl, SCL_NUBE).mean())


def recortar(item, bounds):
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


def a_png(ds):
    ruta = f"/vsimem/chip_{id(ds)}.png"
    gdal.Translate(ruta, ds, format="PNG")
    f = gdal.VSIFOpenL(ruta, "rb")
    gdal.VSIFSeekL(f, 0, 2)
    n = gdal.VSIFTellL(f)
    gdal.VSIFSeekL(f, 0, 0)
    datos = gdal.VSIFReadL(1, n, f)
    gdal.VSIFCloseL(f)
    gdal.Unlink(ruta)
    return datos


def elegir(candidatos, bounds, elegida_id=None):
    """Primera escena con la alerta cubierta y despejada. La elegida por el fotointérprete no se
    descarta por nubes: solo si no cubre la alerta."""
    fechas_vistas = set()
    for item in candidatos:
        fecha = item["properties"]["datetime"][:10]
        propia = item["id"] == elegida_id
        if fecha in fechas_vistas and not propia:     # la misma pasada aparece en varios tiles
            continue
        try:
            sin_cobertura, nubes = nubosidad_centro(item, bounds)
            if sin_cobertura > 0.5:
                continue
            fechas_vistas.add(fecha)
            if nubes > MAX_NUBES_LOCAL and not propia:
                continue
            return item, recortar(item, bounds), nubes
        except Exception:  # tile sin cobertura en la ventana: se prueba el siguiente
            continue
    return None, None, None


def procesar(a, elegidas):
    """Busca y recorta ANTES/DESPUÉS. Corre en un hilo: no toca la base."""
    gdal.PushErrorHandler("CPLQuietErrorHandler")  # el manejador de errores de GDAL es por hilo
    try:
        return _procesar(a, elegidas)
    finally:
        gdal.PopErrorHandler()


def _procesar(a, elegidas):
    fecha = dt.date.fromisoformat(a["fecha"])
    m = MEDIA_VENTANA_M
    bounds = (a["x"] - m, a["y"] - m, a["x"] + m, a["y"] + m)
    propias = elegidas.get(a["codigo_reporte"] or "", {})
    id_dep = a["img_despues"] if (a["img_despues"] or "").startswith("S2") else propias.get("D")
    id_ant = a["img_antes"] if (a["img_antes"] or "").startswith("S2") else propias.get("A")

    def candidatos(id_propio, desde, hasta, desc):
        lista = []
        if id_propio:
            try:
                lista.append(stac_item(id_propio))
            except Exception:
                pass
        return lista + stac_buscar(a["lon"], a["lat"], desde, hasta, desc)

    dep, ds_dep, n_dep = elegir(candidatos(id_dep, fecha - dt.timedelta(days=3),
                                           fecha + dt.timedelta(days=45), False), bounds, id_dep)
    if not dep:
        return a, None, "sin escena DESPUÉS utilizable"
    fecha_dep = dt.date.fromisoformat(dep["properties"]["datetime"][:10])
    ant, ds_ant, n_ant = elegir(candidatos(id_ant, fecha_dep - dt.timedelta(days=180),
                                           fecha_dep - dt.timedelta(days=10), True), bounds, id_ant)
    if not ant:
        return a, None, "sin escena ANTES utilizable"
    salida = []
    for momento, item, ds, nubes in (("antes", ant, ds_ant, n_ant), ("despues", dep, ds_dep, n_dep)):
        realzar(ds)
        salida.append((momento, item, nubes, a_png(ds)))
    return a, (bounds, salida), f"antes={ant['id']}  despues={dep['id']}"


def guardar(con, alerta_id, bounds, momento, item, nubes, png):
    fecha = item["properties"]["datetime"][:10]
    nub_escena = item["properties"].get("eo:cloud_cover")
    nub_escena = "NULL" if nub_escena is None else round(float(nub_escena), 2)
    x0, y0, x1, y1 = bounds
    con.ExecuteSQL(f"""
        INSERT INTO atd.escena (alerta_id, momento, proveedor, escena_id, fecha, nubosidad, publica,
                                nubosidad_escena, rec_xmin, rec_ymin, rec_xmax, rec_ymax)
        VALUES ({alerta_id}, '{momento}', 'sentinel2', '{item['id']}', '{fecha}', {round(nubes * 100, 2)}, TRUE,
                {nub_escena}, {x0}, {y0}, {x1}, {y1})
        ON CONFLICT (alerta_id, momento, proveedor) DO UPDATE
           SET escena_id = EXCLUDED.escena_id, fecha = EXCLUDED.fecha, nubosidad = EXCLUDED.nubosidad,
               nubosidad_escena = EXCLUDED.nubosidad_escena,
               rec_xmin = EXCLUDED.rec_xmin, rec_ymin = EXCLUDED.rec_ymin,
               rec_xmax = EXCLUDED.rec_xmax, rec_ymax = EXCLUDED.rec_ymax
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
    ap.add_argument("--region", type=int, help="1 Loreto, 2 San Martín, 3 Cusco")
    ap.add_argument("--acr")
    ap.add_argument("--anio", type=int)
    ap.add_argument("--mes", type=int)
    ap.add_argument("--codigo", help="una sola alerta, p. ej. LOR-2026-0205")
    ap.add_argument("--limite", type=int, default=50)
    ap.add_argument("--hilos", type=int, default=4)
    ap.add_argument("--rehacer", action="store_true")
    args = ap.parse_args()

    filtros = ["a.fecha_imagen IS NOT NULL"]
    if args.region:
        filtros.append(f"a.region_id = {int(args.region)}")
    if args.acr:
        filtros.append(f"a.acr_codigo = '{args.acr.replace(chr(39), '')}'")
    if args.anio:
        filtros.append(f"a.anio = {int(args.anio)}")
    if args.mes:
        filtros.append(f"a.mes = {int(args.mes)}")
    if args.codigo:
        filtros.append(f"a.codigo = '{args.codigo.replace(chr(39), '')}'")
    if not args.rehacer:
        filtros.append("NOT EXISTS (SELECT 1 FROM atd.escena e WHERE e.alerta_id = a.id "
                       "AND e.momento = 'despues' AND e.rec_xmin IS NOT NULL)")

    con = pg()
    capa = con.ExecuteSQL(f"""
        SELECT a.id, a.codigo, a.codigo_reporte, a.fecha_imagen::text AS fecha, a.img_antes, a.img_despues,
               ST_X(a.centroide) AS lon, ST_Y(a.centroide) AS lat,
               ST_X(ST_Transform(a.centroide, 3857)) AS x, ST_Y(ST_Transform(a.centroide, 3857)) AS y
          FROM atd.alerta a
         WHERE {' AND '.join(filtros)}
         ORDER BY a.estado DESC, a.fecha_imagen DESC
         LIMIT {int(args.limite)}
    """)
    campos = ("id", "codigo", "codigo_reporte", "fecha", "img_antes", "img_despues", "lon", "lat", "x", "y")
    alertas = [{k: f.GetField(k) for k in campos} for f in capa]
    con.ReleaseResultSet(capa)
    elegidas = escenas_fotointerprete()
    print(f"{len(alertas)} alertas por procesar · {len(elegidas)} códigos con escenas del fotointérprete",
          flush=True)

    ok = 0
    with cf.ThreadPoolExecutor(max_workers=max(1, args.hilos)) as pool:
        futuros = [pool.submit(procesar, a, elegidas) for a in alertas]
        for i, fut in enumerate(cf.as_completed(futuros), 1):
            try:
                a, resultado, detalle = fut.result()
            except Exception as e:
                print(f"[{i}/{len(alertas)}] error: {e}", flush=True)
                continue
            if resultado:
                bounds, salida = resultado
                for momento, item, nubes, png in salida:
                    guardar(con, a["id"], bounds, momento, item, nubes, png)
                ok += 1
            print(f"[{i}/{len(alertas)}] {a['codigo']} ({a['codigo_reporte'] or '-'}): "
                  f"{'OK ' if resultado else ''}{detalle}", flush=True)
    print(f"Listo: {ok}/{len(alertas)} alertas con evidencia Sentinel-2", flush=True)
    return 0 if ok or not alertas else 1


if __name__ == "__main__":
    sys.exit(main())
