"""Catálogo de reportes ATD sincronizados en www/reportes_atd/."""
from __future__ import annotations

import json
from pathlib import Path

from core.config import PROJECT_ROOT

_MANIFEST: dict | None = None
_ATD_DIR = PROJECT_ROOT / "www" / "reportes_atd"


def _manifest_path() -> Path:
    return _ATD_DIR / "manifest.json"


def cargar_catalogo_atd() -> dict:
    global _MANIFEST
    if _MANIFEST is not None:
        return _MANIFEST
    path = _manifest_path()
    if not path.exists():
        return {
            "disponible": False,
            "mensaje": "Ejecute scripts/sync_atd_reportes.py para publicar reportes ATD.",
            "regiones": [],
        }
    data = json.loads(path.read_text(encoding="utf-8"))
    # No enviar filas detalladas al frontend (manifest muy pesado).
    for reg in data.get("regiones", []):
        stats = reg.get("estadisticas")
        if isinstance(stats, dict) and "rows" in stats:
            stats = {k: v for k, v in stats.items() if k != "rows"}
            reg["estadisticas"] = stats
    data["disponible"] = True
    data["total_reportes"] = sum(int(r.get("n_reportes") or 0) for r in data.get("regiones", []))
    _MANIFEST = data
    return data


def region_por_departamento(departamento: str) -> str:
    return {
        "loreto": "loreto",
        "cusco": "cusco",
        "san_martin": "san_martin",
        "todos": "global",
    }.get(departamento, "loreto")


def resolver_archivo_atd(region: str, ruta_relativa: str) -> Path | None:
    base = (_ATD_DIR / region).resolve()
    target = (base / ruta_relativa).resolve()
    if not str(target).startswith(str(base)):
        return None
    return target if target.is_file() else None
