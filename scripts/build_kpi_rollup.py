"""Regenera www/reportes_atd/kpi_rollup.json (ha por código, año, tipo y causa).

Usa el mismo lector que los KPIs del backend, así que respeta `en_acr`
(polígonos de ZI copiados en los acumulados ACR no se cuentan como ACR).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BASE / "backend_python"))

from services.deforestacion_vectors_service import (  # noqa: E402
    ATD_ROOT,
    CODIGO_SLUGS,
    _props_list_for_file,
    _safe_float,
)


def main() -> None:
    agg: dict[tuple, float] = {}
    for codigo, (folder, slug) in sorted(CODIGO_SLUGS.items()):
        path = ATD_ROOT / folder / "acumulado" / f"{slug}.geojson"
        if not path.exists():
            print(f"skip {codigo}: no existe {path.name}")
            continue
        for p in _props_list_for_file(path, codigo):
            key = (codigo, p["anno"], p["tipo"], p.get("causa"))
            agg[key] = agg.get(key, 0.0) + _safe_float(p.get("area_ha"))

    rows = [
        {"codigo": c, "anno": y, "tipo": t, "causa": causa, "ha": round(ha, 4)}
        for (c, y, t, causa), ha in agg.items()
    ]
    out = ATD_ROOT / "kpi_rollup.json"
    out.write_text(json.dumps({"rows": rows}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{out.name}: {len(rows)} filas")


if __name__ == "__main__":
    main()
