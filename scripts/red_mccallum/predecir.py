"""Aplica la red a un recorte y escribe el mapa de oclusión del artículo.

El mapa marca qué parte de la imagen hizo subir la probabilidad. Con la
extensión del recorte (EPSG:3857, columnas rec_* del cuaderno) esa zona
caliente se guarda como un polígono borrador. Es una propuesta de contorno,
no el polígono oficial de GeoBosques.
"""
from __future__ import annotations

import argparse
import csv
import json
import math
from pathlib import Path

import numpy as np
import torch
from PIL import Image

from comun import CAUSAS, UMBRAL_ALTO, cargar, dispositivo, leer_imagen

SALIDAS = Path(__file__).resolve().parent / "salidas"
PESOS = SALIDAS / "resnet18.pt"


def oclusion(red, tensor, device, lado=32, paso=32):
    """Caída de la probabilidad al tapar cada cuadro. Más calor = más decisivo."""
    red.eval()
    with torch.no_grad():
        _, causa = red(tensor.to(device))
        prob = torch.softmax(causa, 1)[0]
        clase = int(prob.argmax())
        base = float(prob[clase])
        _, _, alto, ancho = tensor.shape
        mapa = np.zeros((alto, ancho), dtype=np.float32)
        cuenta = np.zeros((alto, ancho), dtype=np.float32)
        for y in range(0, alto - lado + 1, paso):
            for x in range(0, ancho - lado + 1, paso):
                tapa = tensor.clone()
                tapa[:, :, y:y + lado, x:x + lado] = 0
                _, causa_tapa = red(tapa.to(device))
                caida = base - float(torch.softmax(causa_tapa, 1)[0, clase])
                mapa[y:y + lado, x:x + lado] += max(caida, 0)
                cuenta[y:y + lado, x:x + lado] += 1
    return mapa / np.maximum(cuenta, 1), clase, base


def guardar_mapa(mapa, destino):
    m = mapa - mapa.min()
    m = m / (m.max() + 1e-8)
    rojo = (255 * m).astype(np.uint8)
    azul = (255 * (1 - m)).astype(np.uint8)
    verde = np.zeros_like(rojo)
    Image.fromarray(np.dstack([rojo, verde, azul]), mode="RGB").save(destino)


def a4326(x, y):
    lon = x / 20037508.342789244 * 180.0
    lat = math.degrees(math.atan(math.sinh(y / 20037508.342789244 * math.pi)))
    return [round(lon, 6), round(lat, 6)]


def poligono(mapa, bounds, umbral=0.55):
    xmin, ymin, xmax, ymax = bounds
    m = mapa / (mapa.max() + 1e-8)
    ys, xs = np.where(m >= umbral)
    if len(xs) == 0:
        return None
    alto, ancho = mapa.shape
    x0, x1 = int(xs.min()), int(xs.max())
    y0, y1 = int(ys.min()), int(ys.max())

    def esquina(px, py):
        X = xmin + (px / ancho) * (xmax - xmin)
        Y = ymax - (py / alto) * (ymax - ymin)
        return a4326(X, Y)

    anillo = [
        esquina(x0, y0), esquina(x1, y0), esquina(x1, y1), esquina(x0, y1), esquina(x0, y0),
    ]
    return anillo


def predecir_una(red, device, ruta, bounds):
    tensor = leer_imagen(ruta, False).unsqueeze(0)
    with torch.no_grad():
        binaria, causa = red(tensor.to(device))
        p_def = float(torch.softmax(binaria, 1)[0, 1])
        pc = torch.softmax(causa, 1)[0]
        idx = int(pc.argmax())
        p_causa = float(pc[idx])
    from comun import CAUSA_DE_IDX

    causa_id = CAUSA_DE_IDX[idx]
    mapa, _, _ = oclusion(red, tensor, device)
    return {
        "imagen": str(ruta),
        "deforestacion": p_def >= 0.5,
        "probabilidad_deforestacion": round(p_def, 4),
        "causa_id": causa_id,
        "causa": CAUSAS[causa_id],
        "probabilidad_causa": round(p_causa, 4),
        "confiabilidad": "Alto" if p_causa >= UMBRAL_ALTO else "Bajo",
        "mapa": mapa,
        "bounds": bounds,
    }


def bounds_de(fila):
    try:
        return [float(fila[k]) for k in ("rec_xmin", "rec_ymin", "rec_xmax", "rec_ymax")]
    except (TypeError, ValueError):
        return None


def ficha_visor():
    """Una pasada por el cuaderno, sin mapa de oclusión, y la deja en el visor."""
    from comun import CAUSA_DE_IDX

    if not PESOS.exists():
        print("Todavía no hay pesos. Corre entrenar.py")
        return 1
    cuaderno = SALIDAS / "muestras.csv"
    if not cuaderno.exists():
        print("Falta el cuaderno. Corre preparar.py")
        return 1
    with cuaderno.open(encoding="utf-8") as f:
        filas = [r for r in csv.DictReader(f) if Path(r["imagen"]).exists()]
    device = dispositivo()
    red, _ = cargar(PESOS, device)
    out = {}
    lote = 32
    for i in range(0, len(filas), lote):
        grupo = filas[i:i + lote]
        xs = torch.stack([leer_imagen(r["imagen"], False) for r in grupo]).to(device)
        with torch.no_grad():
            binaria, causa = red(xs)
            pdef = torch.softmax(binaria, 1)[:, 1]
            pc = torch.softmax(causa, 1)
            idx = pc.argmax(1)
        for j, fila in enumerate(grupo):
            causa_id = CAUSA_DE_IDX[int(idx[j])]
            p = float(pc[j, int(idx[j])])
            out[fila["codigo"]] = {
                "causa": CAUSAS[causa_id],
                "causa_id": causa_id,
                "probabilidad": round(p, 4),
                "confiabilidad": "Alto" if p >= UMBRAL_ALTO else "Bajo",
                "deforestacion": round(float(pdef[j]), 4),
            }
        print(f"{min(i + lote, len(filas))}/{len(filas)}", flush=True)
    texto = json.dumps(out, ensure_ascii=False)
    (SALIDAS / "propuestas.json").write_text(texto, encoding="utf-8")
    visor = Path(__file__).resolve().parents[2] / "atd-service" / "src" / "main" / "resources" / "static" / "propuestas.json"
    visor.write_text(texto, encoding="utf-8")
    print(f"Ficha lista: {len(out)} alertas → {visor}")
    return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--imagen", help="Un PNG o JPG")
    ap.add_argument("--cuaderno", action="store_true", help="Recorre salidas/muestras.csv")
    ap.add_argument("--ficha", action="store_true", help="Solo la causa, para mostrarla en el visor local")
    ap.add_argument("--limite", type=int, default=20)
    args = ap.parse_args()
    if args.ficha:
        return ficha_visor()
    if not PESOS.exists():
        print("Todavía no hay pesos. Corre entrenar.py")
        return 1
    device = dispositivo()
    red, _ = cargar(PESOS, device)
    trabajos = []
    if args.imagen:
        trabajos.append((args.imagen, None, Path(args.imagen).stem))
    if args.cuaderno or not args.imagen:
        cuaderno = SALIDAS / "muestras.csv"
        if cuaderno.exists():
            with cuaderno.open(encoding="utf-8") as f:
                for i, fila in enumerate(csv.DictReader(f)):
                    if i >= args.limite:
                        break
                    trabajos.append((fila["imagen"], bounds_de(fila), fila["codigo"]))
    if not trabajos:
        print("Pasa --imagen ruta.png o genera el cuaderno con preparar.py")
        return 1
    mapas = SALIDAS / "mapas"
    mapas.mkdir(parents=True, exist_ok=True)
    rasgos = []
    resumen = []
    for ruta, bounds, nombre in trabajos:
        r = predecir_una(red, device, ruta, bounds)
        mapa = r.pop("mapa")
        guardar_mapa(mapa, mapas / f"{nombre}.png")
        anillo = poligono(mapa, bounds) if bounds and all(v is not None for v in bounds) else None
        print(
            f"{nombre}: {r['causa']} ({r['probabilidad_causa']:.2f}, {r['confiabilidad']})"
            f" · deforestación {r['probabilidad_deforestacion']:.2f}"
        )
        resumen.append(r | {"codigo": nombre, "mapa": str(mapas / f"{nombre}.png")})
        if anillo:
            rasgos.append({
                "type": "Feature",
                "properties": {"codigo": nombre, "causa": r["causa"], "confiabilidad": r["confiabilidad"]},
                "geometry": {"type": "Polygon", "coordinates": [anillo]},
            })
    (SALIDAS / "predicciones.json").write_text(json.dumps(resumen, ensure_ascii=False, indent=2), encoding="utf-8")
    if rasgos:
        geo = {"type": "FeatureCollection", "features": rasgos}
        (SALIDAS / "propuesta.geojson").write_text(json.dumps(geo), encoding="utf-8")
        print(f"Borrador de contorno: {SALIDAS / 'propuesta.geojson'}")
    print(f"Mapas de oclusión: {mapas}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
