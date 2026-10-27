"""Arma el cuaderno de entrenamiento: recorte DESPUÉS + causa de la base.

Cada PNG ATD_OID####_D.png se junta con alerta.origen_oid. Solo entran las
filas que ya tienen causa_id. Esa causa es la respuesta del especialista,
la misma que la red tiene que aprender a repetir.
"""
from __future__ import annotations

import csv
import os
import sys
from pathlib import Path

from comun import CAUSAS, FALSA

RAIZ = Path(__file__).resolve().parents[2]
CHIPS = RAIZ / "www" / "reportes_atd" / "global" / "imagenes_sentinel"
SALIDA = Path(__file__).resolve().parent / "salidas" / "muestras.csv"


def conectar():
    import psycopg

    return psycopg.connect(
        host=os.environ.get("ATD_DB_HOST", "localhost"),
        port=os.environ.get("ATD_DB_PORT", "5433"),
        dbname=os.environ.get("ATD_DB_NAME", "atd"),
        user=os.environ.get("ATD_DB_USER", "atd"),
        password=os.environ.get("ATD_DB_PASSWORD", "atd_local"),
        connect_timeout=8,
        options="-c search_path=atd,public",
    )


def filas(con):
    sql = """
        SELECT a.codigo, a.origen_oid, a.causa_id, c.resultado, c.nombre,
               a.confiabilidad_id, a.estado,
               e.rec_xmin, e.rec_ymin, e.rec_xmax, e.rec_ymax,
               ev.contenido
          FROM alerta a
          JOIN cat_causa c ON c.id = a.causa_id
          JOIN evidencia ev ON ev.alerta_id = a.id AND ev.tipo = 'chip_despues'
          LEFT JOIN escena e
            ON e.alerta_id = a.id AND e.momento = 'despues' AND e.proveedor = 'sentinel2'
         WHERE a.causa_id IS NOT NULL
    """
    with con.cursor() as cur:
        cur.execute(sql)
        cols = [d[0] for d in cur.description]
        return [dict(zip(cols, row)) for row in cur.fetchall()]


def main():
    print(f"PNG sueltos en disco (otro OID, no se usan de etiqueta): {len(list(CHIPS.glob('ATD_OID*_D.png')))}")
    try:
        con = conectar()
    except Exception as e:
        print("No pude abrir la base de alertas.")
        print("Enciende Docker y, en atd-service, corre: docker compose up -d db")
        print(f"Detalle: {e}")
        return 1
    with con:
        base = filas(con)
    carpeta = SALIDA.parent / "chips"
    carpeta.mkdir(parents=True, exist_ok=True)
    pares = []
    for r in base:
        destino = carpeta / f"{r['codigo']}.jpg"
        destino.write_bytes(bytes(r["contenido"]))
        pares.append(r | {"imagen": str(destino)})
    if not pares:
        print("No hay alertas con causa y con recorte Sentinel guardado.")
        return 1
    SALIDA.parent.mkdir(parents=True, exist_ok=True)
    campos = [
        "codigo", "origen_oid", "causa_id", "causa", "resultado", "estado",
        "confiabilidad_id", "rec_xmin", "rec_ymin", "rec_xmax", "rec_ymax", "imagen",
    ]
    with SALIDA.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=campos, extrasaction="ignore")
        w.writeheader()
        w.writerows(pares)
    from collections import Counter
    conteo = Counter(CAUSAS.get(int(r["causa_id"]), str(r["causa_id"])) for r in pares)
    falsas = sum(1 for r in pares if int(r["causa_id"]) == FALSA)
    print(f"Muestras listas: {len(pares)}  (falsas: {falsas})")
    for nombre, n in conteo.most_common():
        print(f"  {n:4d}  {nombre}")
    print(f"Cuaderno: {SALIDA}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
