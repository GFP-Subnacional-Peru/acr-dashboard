"""Busca el recorte Sentinel de cada alerta que aún no está en la ficha y lo lee con la red.

No inventa una causa: si el catálogo no devuelve una escena usable, esa alerta
queda fuera. Las que ya tienen recorte guardado se leen de ese archivo.
"""
from __future__ import annotations

import io
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, timedelta
from pathlib import Path

API = "https://acr-atd.onrender.com/api/atd"
STAC = "https://earth-search.aws.element84.com/v1/search"
TITILER = "https://titiler.xyz/cog/bbox/"
RAIZ = Path(__file__).resolve().parents[2]
VISOR = RAIZ / "atd-service" / "src" / "main" / "resources" / "static" / "propuestas.json"
SALIDAS = Path(__file__).resolve().parent / "salidas"
CHIPS = SALIDAS / "chips_todas"
COLA = SALIDAS / "cola_todas.json"
SIN = SALIDAS / "sin_escena.json"

NUBES = 30
DIAS_DESPUES = 25


def pedir(url, cuerpo=None, timeout=60):
    data = None if cuerpo is None else json.dumps(cuerpo).encode()
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json", "User-Agent": "acr-atd-lectura"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as res:
        return json.load(res)


def alertas():
    territorios = pedir(f"{API}/territorios")
    acrs = [t["codigo"] for t in territorios if t.get("tipo") == "ACR"]
    out = {}
    for acr in acrs:
        periodos = pedir(f"{API}/periodos?acr={acr}&ambito=ambos")
        for p in periodos:
            url = f"{API}/alertas?acr={acr}&ambito=ambos&anio={p['anio']}&mes={p['mes']}"
            col = pedir(url, timeout=120)
            for f in col.get("features") or []:
                prop = f["properties"]
                codigo = prop["codigo"]
                if codigo in out:
                    continue
                geom = f.get("geometry") or {}
                out[codigo] = {
                    "codigo": codigo,
                    "fecha": (prop.get("fecha_imagen") or "")[:10],
                    "lon": prop.get("lon"),
                    "lat": prop.get("lat"),
                    "con_imagen": bool(prop.get("con_imagen")),
                    "bbox": caja(geom),
                }
            print(f"{acr} {p['anio']}-{p['mes']:02d}  acumuladas {len(out)}", flush=True)
    return out


def caja(geom):
    coords = []

    def walk(nodo):
        if isinstance(nodo, (list, tuple)):
            if len(nodo) >= 2 and isinstance(nodo[0], (int, float)):
                coords.append((float(nodo[0]), float(nodo[1])))
            else:
                for x in nodo:
                    walk(x)

    walk(geom.get("coordinates"))
    if not coords:
        return None
    xs = [c[0] for c in coords]
    ys = [c[1] for c in coords]
    return [min(xs), min(ys), max(xs), max(ys)]


def pad(bbox, lon, lat):
    """El recorte no puede quedar en un solo píxel: la red necesita ver el alrededor."""
    minimo = 0.008
    if bbox:
        cx = (bbox[0] + bbox[2]) / 2
        cy = (bbox[1] + bbox[3]) / 2
        half = max(bbox[2] - bbox[0], bbox[3] - bbox[1], minimo) / 2 + minimo
        return [cx - half, cy - half, cx + half, cy + half]
    if lon is None or lat is None:
        return None
    return [lon - minimo, lat - minimo, lon + minimo, lat + minimo]


def buscar_stac(fila, desde, hasta, nubes):
    cuerpo = {
        "collections": ["sentinel-2-l2a"],
        "intersects": {"type": "Point", "coordinates": [fila["lon"], fila["lat"]]},
        "datetime": f"{desde}T00:00:00Z/{hasta}T23:59:59Z",
        "query": {"eo:cloud_cover": {"lte": nubes}},
        "sortby": [{"field": "properties.eo:cloud_cover", "direction": "asc"}],
        "limit": 15,
    }
    raiz = pedir(STAC, cuerpo, timeout=40)
    halladas = []
    for item in raiz.get("features") or []:
        visual = ((item.get("assets") or {}).get("visual") or {}).get("href") or ""
        if not visual:
            continue
        fecha = (item.get("properties") or {}).get("datetime", "")[:10]
        cobertura = float((item.get("properties") or {}).get("eo:cloud_cover") or 0)
        distancia = abs((date.fromisoformat(fecha) - date.fromisoformat(fila["fecha"])).days) if fecha else 99
        halladas.append((cobertura, distancia, fecha, visual))
    halladas.sort()
    return [{"nubes": n, "fecha": f, "visual": v} for n, _, f, v in halladas[:4]]


def escenas(fila):
    """Hasta cuatro escenas claras cerca de la detección. Si una sale en blanco, se prueba la siguiente."""
    if not fila.get("fecha") or fila.get("lon") is None:
        return []
    inicio = date.fromisoformat(fila["fecha"])
    ventanas = (
        (inicio, inicio + timedelta(days=DIAS_DESPUES), NUBES),
        (inicio - timedelta(days=20), inicio + timedelta(days=DIAS_DESPUES), 45),
        (inicio - timedelta(days=45), inicio + timedelta(days=30), 70),
    )
    vistas = []
    vistos = set()
    for desde, hasta, nubes in ventanas:
        for escena in buscar_stac(fila, desde, hasta, nubes):
            if escena["visual"] in vistos:
                continue
            vistos.add(escena["visual"])
            vistas.append(escena)
            if len(vistas) >= 4:
                return vistas
    return vistas


def imagen_usable(destino):
    from PIL import Image

    try:
        im = Image.open(destino).convert("RGB").resize((24, 24))
    except Exception:
        return False
    pix = list(im.getdata())
    lum = [(r + g + b) / 3 for r, g, b in pix]
    media = sum(lum) / len(lum)
    var = sum((x - media) ** 2 for x in lum) / len(lum)
    return var >= 25


def bajar(url, destino):
    for intento in range(4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "acr-atd-lectura"})
            with urllib.request.urlopen(req, timeout=90) as res:
                datos = res.read()
        except urllib.error.HTTPError as exc:
            if exc.code == 429 and intento < 3:
                time.sleep(4 * (intento + 1))
                continue
            raise
        if len(datos) < 800 or not (datos.startswith(b"\x89PNG") or datos.startswith(b"\xff\xd8\xff")):
            return False
        destino.write_bytes(datos)
        if imagen_usable(destino):
            return True
        destino.unlink(missing_ok=True)
        return False
    return False


def recorte(fila, visual):
    caja_alerta = pad(fila.get("bbox"), fila.get("lon"), fila.get("lat"))
    if not caja_alerta:
        return None
    oeste, sur, este, norte = caja_alerta
    q = urllib.parse.quote(visual, safe="")
    return (
        f"{TITILER}{oeste},{sur},{este},{norte}.png"
        f"?coord-crs=epsg:4326&width=512&height=512&url={q}"
    )


def asegurar_chip(fila):
    """ok: hay recorte. sin: el catálogo no tiene escena clara. fallo: se reintenta."""
    destino = CHIPS / f"{fila['codigo']}.png"
    if destino.exists() and destino.stat().st_size > 800:
        return "ok", destino
    if fila.get("con_imagen"):
        url = f"{API}/alertas/{fila['codigo']}/imagen/despues.png"
        for _ in range(3):
            try:
                if bajar(url, destino):
                    return "ok", destino
            except Exception:
                time.sleep(1.5)
        return "fallo", None
    try:
        candidatas = escenas(fila)
    except Exception:
        return "fallo", None
    if not candidatas:
        return "sin", None
    hubo_error = False
    for escena in candidatas:
        url = recorte(fila, escena["visual"])
        if not url:
            continue
        try:
            if bajar(url, destino):
                return "ok", destino
        except Exception:
            hubo_error = True
    return ("fallo" if hubo_error else "sin"), None


def cargar_ficha():
    if VISOR.exists():
        return json.loads(VISOR.read_text(encoding="utf-8"))
    return {}


def guardar(ficha):
    texto = json.dumps(ficha, ensure_ascii=False)
    VISOR.write_text(texto, encoding="utf-8")
    (SALIDAS / "propuestas.json").write_text(texto, encoding="utf-8")


def puntuar(ficha, rutas):
    import torch
    from PIL import Image

    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from comun import CAUSA_DE_IDX, CAUSAS, UMBRAL_ALTO, cargar, dispositivo, transformar

    pesos = SALIDAS / "resnet18.pt"
    device = dispositivo()
    red, _ = cargar(pesos, device)
    paso = transformar(False)
    codigos = list(rutas)
    lote = 16
    for i in range(0, len(codigos), lote):
        grupo = codigos[i:i + lote]
        xs = torch.stack([
            paso(Image.open(rutas[c]).convert("RGB")) for c in grupo
        ]).to(device)
        with torch.no_grad():
            binaria, causa = red(xs)
            pdef = torch.softmax(binaria, 1)[:, 1]
            pc = torch.softmax(causa, 1)
            idx = pc.argmax(1)
        for j, codigo in enumerate(grupo):
            causa_id = CAUSA_DE_IDX[int(idx[j])]
            p = float(pc[j, int(idx[j])])
            ficha[codigo] = {
                "causa": CAUSAS[causa_id],
                "causa_id": causa_id,
                "probabilidad": round(p, 4),
                "confiabilidad": "Alto" if p >= UMBRAL_ALTO else "Bajo",
                "deforestacion": round(float(pdef[j]), 4),
            }
        guardar(ficha)
        print(f"leidas {min(i + lote, len(codigos))}/{len(codigos)}  ficha {len(ficha)}", flush=True)


def main():
    SALIDAS.mkdir(exist_ok=True)
    CHIPS.mkdir(exist_ok=True)
    ficha = cargar_ficha()
    if COLA.exists():
        todas = json.loads(COLA.read_text(encoding="utf-8"))
    else:
        todas = alertas()
        COLA.write_text(json.dumps(todas, ensure_ascii=False), encoding="utf-8")
    sin = set(json.loads(SIN.read_text(encoding="utf-8"))) if SIN.exists() else set()
    faltan = [t for c, t in todas.items() if c not in ficha and c not in sin]
    print(f"alertas {len(todas)}  ya leidas {len(ficha)}  por leer {len(faltan)}", flush=True)

    rutas = {}
    nuevas_sin = []
    with ThreadPoolExecutor(max_workers=2) as pool:
        futuros = {pool.submit(asegurar_chip, fila): fila["codigo"] for fila in faltan}
        hechos = 0
        for fut in as_completed(futuros):
            codigo = futuros[fut]
            hechos += 1
            try:
                estado, ruta = fut.result()
            except Exception:
                estado, ruta = "fallo", None
            if estado == "ok":
                rutas[codigo] = ruta
            elif estado == "sin":
                nuevas_sin.append(codigo)
            if hechos % 25 == 0 or hechos == len(faltan):
                sin.update(nuevas_sin)
                SIN.write_text(json.dumps(sorted(sin), ensure_ascii=False), encoding="utf-8")
                print(f"recortes {hechos}/{len(faltan)}  con imagen {len(rutas)}  sin escena {len(sin)}", flush=True)
    if not rutas:
        print("No quedó ninguna imagen nueva por leer.")
        return 0
    puntuar(ficha, rutas)
    print(f"Listo. Ficha {len(ficha)}. Sin escena usable: {len(sin)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
