# Contorno borrador para Loreto a partir del par Sentinel ya guardado.
# No es una red entrenada: mide la caída de verde entre el antes y el después
# y dibuja el claro que queda en el centro del recorte.
import io
import json
import math
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[1]
SALIDA = ROOT / "atd-service" / "src" / "main" / "resources" / "static" / "limites" / "propuesta_loreto.geojson"
API = "http://localhost:8081"
R = 6378137.0
VECINOS = ((-1, 0), (-1, 1), (0, 1), (1, 1), (1, 0), (1, -1), (0, -1), (-1, -1))


def a_lonlat(x, y):
    lon = x / R * 180 / math.pi
    lat = (2 * math.atan(math.exp(y / R)) - math.pi / 2) * 180 / math.pi
    return [round(lon, 6), round(lat, 6)]


def trazar(borde, y, x):
    h, w = borde.shape
    inicio = (y, x)
    anillo = [inicio]
    # El siguiente se busca girando a la izquierda desde donde se llegó.
    llegada = 4
    cy, cx = y, x
    for _ in range(6000):
        hallado = False
        for k in range(8):
            d = (llegada + k) % 8
            ny, nx = cy + VECINOS[d][0], cx + VECINOS[d][1]
            if 0 <= ny < h and 0 <= nx < w and borde[ny, nx]:
                cy, cx = ny, nx
                llegada = (d + 5) % 8
                anillo.append((cy, cx))
                hallado = True
                break
        if not hallado or (len(anillo) > 8 and (cy, cx) == inicio):
            break
    return anillo


def simplificar(pts, tol):
    if len(pts) < 4:
        return pts

    def dist(p, a, b):
        ax, ay = a
        bx, by = b
        px, py = p
        dx, dy = bx - ax, by - ay
        if dx == 0 and dy == 0:
            return math.hypot(px - ax, py - ay)
        t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
        return math.hypot(px - (ax + t * dx), py - (ay + t * dy))

    def rec(ini, fin):
        a, b = pts[ini], pts[fin]
        k, mayor = None, 0
        for i in range(ini + 1, fin):
            d = dist(pts[i], a, b)
            if d > mayor:
                mayor, k = d, i
        if k is not None and mayor > tol:
            return rec(ini, k)[:-1] + rec(k, fin)
        return [a, b]

    return rec(0, len(pts) - 1)


def contorno(antes, despues, rec):
    a = np.asarray(Image.open(io.BytesIO(antes)).convert("RGB"), np.float32)
    d = np.asarray(Image.open(io.BytesIO(despues)).convert("RGB"), np.float32)
    if a.shape != d.shape:
        return None
    h, w = a.shape[:2]
    verde_a = a[:, :, 1] - 0.55 * a[:, :, 0] - 0.15 * a[:, :, 2]
    verde_d = d[:, :, 1] - 0.55 * d[:, :, 0] - 0.15 * d[:, :, 2]
    caida = ndimage.gaussian_filter(np.clip(verde_a - verde_d, 0, None), 1.15)
    centro = caida[h // 3 : 2 * h // 3, w // 3 : 2 * w // 3]
    umbral = max(16.0, float(np.quantile(centro, 0.78)))
    mascara = ndimage.binary_opening(ndimage.binary_closing(caida >= umbral, iterations=2), iterations=1)
    etiquetas, n = ndimage.label(mascara)
    mejor = None
    mejor_nota = -1
    for i in range(1, n + 1):
        ys, xs = np.where(etiquetas == i)
        area = ys.size
        if area < 60 or area > 50000:
            continue
        my, mx = float(ys.mean()), float(xs.mean())
        lejos = ((my - h / 2) / (h / 2)) ** 2 + ((mx - w / 2) / (w / 2)) ** 2
        if lejos > 0.5:
            continue
        nota = area / (1 + 5 * lejos)
        if nota > mejor_nota:
            mejor_nota = nota
            mejor = (ys, xs)
    if mejor is None:
        return None
    ys, xs = mejor
    comp = np.zeros((h, w), dtype=bool)
    comp[ys, xs] = True
    borde = comp & ~ndimage.binary_erosion(comp)
    ey, ex = np.where(borde)
    if ey.size < 12:
        return None
    k = int(np.argmin(ey * w + ex))
    anillo = trazar(borde, int(ey[k]), int(ex[k]))
    if len(anillo) < 12:
        return None
    if anillo[0] != anillo[-1]:
        anillo.append(anillo[0])
    x0, y0, x1, y1 = rec
    coords = []
    for py, px in anillo:
        xm = x0 + (px + 0.5) / w * (x1 - x0)
        ym = y1 - (py + 0.5) / h * (y1 - y0)
        coords.append(a_lonlat(xm, ym))
    coords = simplificar(coords, 0.00004)
    if coords[0] != coords[-1]:
        coords.append(coords[0])
    if len(coords) < 4:
        return None
    return coords


def bajar(codigo, momento):
    url = f"{API}/api/atd/alertas/{codigo}/imagen/{momento}.png"
    with urllib.request.urlopen(url, timeout=40) as r:
        return r.read()


def main():
    import subprocess

    sql = """
        SELECT a.codigo, e.rec_xmin, e.rec_ymin, e.rec_xmax, e.rec_ymax
          FROM alerta a
          JOIN escena e ON e.alerta_id = a.id AND e.momento = 'despues' AND e.publica
         WHERE a.region_id = 1
         ORDER BY a.codigo
    """
    crudo = subprocess.check_output(
        ["docker", "compose", "exec", "-T", "db", "psql", "-U", "atd", "-d", "atd", "-t", "-A", "-F", "|", "-c", sql],
        cwd=ROOT / "atd-service",
    ).decode("utf-8", "replace")
    features = []
    filas = [ln for ln in crudo.splitlines() if "|" in ln]
    for i, ln in enumerate(filas, 1):
        codigo, x0, y0, x1, y1 = ln.split("|")
        try:
            coords = contorno(bajar(codigo, "antes"), bajar(codigo, "despues"), (float(x0), float(y0), float(x1), float(y1)))
        except Exception as e:
            print(f"{i}/{len(filas)} {codigo} error {e}")
            continue
        if not coords:
            print(f"{i}/{len(filas)} {codigo} sin claro")
            continue
        features.append({
            "type": "Feature",
            "properties": {"codigo": codigo, "origen": "cambio_sentinel"},
            "geometry": {"type": "Polygon", "coordinates": [coords]},
        })
        print(f"{i}/{len(filas)} {codigo} ok {len(coords)} pts")
    SALIDA.parent.mkdir(parents=True, exist_ok=True)
    SALIDA.write_text(json.dumps({"type": "FeatureCollection", "features": features}, ensure_ascii=False), encoding="utf-8")
    print(f"LISTO {len(features)} de {len(filas)} -> {SALIDA}")


if __name__ == "__main__":
    main()
