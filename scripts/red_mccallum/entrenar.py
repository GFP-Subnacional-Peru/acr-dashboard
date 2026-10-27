"""Entrena la ResNet18 con el cuaderno de preparar.py.

Parte de los pesos públicos de ResNet18 y los afina con el mismo optimizador
del artículo: SGD con momento, tasa 1e-3, lote 32, L2 5e-4, volteo horizontal
y vertical. El artículo usó 50 épocas sobre 43 108 imágenes. Con pocos
recortes propios, --epocas puede bajar: si no, la red se memoriza el cuaderno.
"""
from __future__ import annotations

import argparse
import json
import random
from collections import Counter
from pathlib import Path

import torch
from torch import nn
from torch.utils.data import DataLoader, Dataset, WeightedRandomSampler

from comun import (
    CAUSA_IDS,
    IDX_DE_CAUSA,
    LOTE,
    LR,
    MOMENTO,
    PESO_L2,
    RedMcCallum,
    dispositivo,
    leer_imagen,
)

SALIDAS = Path(__file__).resolve().parent / "salidas"
MUESTRAS = SALIDAS / "muestras.csv"


def leer_csv():
    import csv

    with MUESTRAS.open(encoding="utf-8") as f:
        return list(csv.DictReader(f))


def partir(filas, semilla):
    """60 % entrenamiento, 20 % validación, 20 % prueba, por causa."""
    azar = random.Random(semilla)
    grupos = {}
    for fila in filas:
        grupos.setdefault(int(fila["causa_id"]), []).append(fila)
    tren, val, prueba = [], [], []
    for grupo in grupos.values():
        azar.shuffle(grupo)
        n = len(grupo)
        if n < 5:
            tren.extend(grupo)
            continue
        n_val = max(1, round(n * 0.20))
        n_prueba = max(1, round(n * 0.20))
        prueba.extend(grupo[:n_prueba])
        val.extend(grupo[n_prueba:n_prueba + n_val])
        tren.extend(grupo[n_prueba + n_val:])
    return tren, val, prueba


class Muestras(Dataset):
    def __init__(self, filas, entrenar):
        self.filas = filas
        self.entrenar = entrenar

    def __len__(self):
        return len(self.filas)

    def __getitem__(self, i):
        fila = self.filas[i]
        causa = int(fila["causa_id"])
        imagen = leer_imagen(fila["imagen"], self.entrenar)
        binaria = 0 if causa == 99 else 1
        return imagen, binaria, IDX_DE_CAUSA[causa]


def cargador(filas, entrenar):
    ds = Muestras(filas, entrenar)
    if not entrenar:
        return DataLoader(ds, batch_size=LOTE, shuffle=False)
    cuentas = Counter(int(f["causa_id"]) for f in filas)
    pesos = [1.0 / cuentas[int(f["causa_id"])] for f in filas]
    toma = WeightedRandomSampler(pesos, num_samples=len(pesos), replacement=True)
    return DataLoader(ds, batch_size=min(LOTE, len(filas)), sampler=toma)


def paso(red, lote, device):
    x, y_bin, y_causa = (t.to(device) for t in lote)
    binaria, causa = red(x)
    perdida = nn.functional.cross_entropy(binaria, y_bin) + nn.functional.cross_entropy(causa, y_causa)
    acierto_bin = (binaria.argmax(1) == y_bin).sum().item()
    acierto_causa = (causa.argmax(1) == y_causa).sum().item()
    return perdida, acierto_bin, acierto_causa, len(y_bin)


def evaluar(red, datos, device):
    red.eval()
    perdida = acierto_bin = acierto_causa = total = 0
    with torch.no_grad():
        for lote in datos:
            p, b, c, n = paso(red, lote, device)
            perdida += float(p) * n
            acierto_bin += b
            acierto_causa += c
            total += n
    if total == 0:
        return {"perdida": None, "acuerdo_articulo": None, "acuerdo_causa": None, "n": 0}
    return {
        "perdida": round(perdida / total, 4),
        "acuerdo_articulo": round(acierto_bin / total, 4),
        "acuerdo_causa": round(acierto_causa / total, 4),
        "n": total,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--epocas", type=int, default=20)
    ap.add_argument("--semilla", type=int, default=18)
    args = ap.parse_args()
    if not MUESTRAS.exists():
        print("Falta el cuaderno. Primero corre preparar.py")
        return 1
    filas = [f for f in leer_csv() if int(f["causa_id"]) in IDX_DE_CAUSA and Path(f["imagen"]).exists()]
    if len(filas) < 8:
        print(f"Solo hay {len(filas)} recortes con causa. Hace falta juntar más antes de entrenar.")
        return 1
    tren, val, prueba = partir(filas, args.semilla)
    if not val:
        val = tren
        print("Hay muy pocas filas por causa: la validación repite el entrenamiento. El número no es una prueba independiente.")
    device = dispositivo()
    print(f"Equipo: {device}")
    print(f"Entrenamiento {len(tren)} · validación {len(val)} · prueba {len(prueba)}")
    print("Causas en el cuaderno:", dict(Counter(int(f['causa_id']) for f in filas)))
    red = RedMcCallum().to(device)
    opt = torch.optim.SGD(red.parameters(), lr=LR, momentum=MOMENTO, weight_decay=PESO_L2)
    mejor = None
    mejor_estado = None
    for epoca in range(1, args.epocas + 1):
        red.train()
        for lote in cargador(tren, True):
            opt.zero_grad()
            perdida, *_ = paso(red, lote, device)
            perdida.backward()
            opt.step()
        marca = evaluar(red, cargador(val, False), device)
        print(
            f"época {epoca:02d}  acuerdo con el artículo {marca['acuerdo_articulo']:.3f}"
            f"  acuerdo de causa {marca['acuerdo_causa']:.3f}"
        )
        if mejor is None or marca["perdida"] < mejor:
            mejor = marca["perdida"]
            mejor_estado = {k: v.detach().cpu().clone() for k, v in red.state_dict().items()}
    red.load_state_dict(mejor_estado)
    val_final = evaluar(red, cargador(val, False), device)
    examen = evaluar(red, cargador(prueba, False), device) if prueba else val_final
    SALIDAS.mkdir(parents=True, exist_ok=True)
    destino = SALIDAS / "resnet18.pt"
    torch.save({"pesos": red.state_dict(), "causas": CAUSA_IDS, "epocas": args.epocas}, destino)
    informe = {"validacion": val_final, "prueba": examen, "n_entrenamiento": len(tren), "n_prueba": len(prueba)}
    (SALIDAS / "informe.json").write_text(json.dumps(informe, indent=2), encoding="utf-8")
    print(f"Pesos: {destino}")
    print(
        f"Mejor validación: artículo {val_final['acuerdo_articulo']:.3f}"
        f" · causa {val_final['acuerdo_causa']:.3f}"
    )
    if prueba:
        print(
            f"Prueba no vista: acuerdo con el artículo {examen['acuerdo_articulo']:.3f}"
            f" · causa {examen['acuerdo_causa']:.3f} · n={examen['n']}"
        )
    print("Ese acuerdo es contra las causas ya guardadas por el especialista, no contra un censo nuevo.")
    return 0


if __name__ == "__main__":
    main()
