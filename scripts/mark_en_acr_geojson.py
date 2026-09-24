"""Marca `en_acr` en los GeoJSON acumulados de cada ACR.

Los acumulados ACR de Loreto incluyen polígonos de su Zona de Influencia
(duplicados del archivo zi_*.geojson). El mapa usa `en_acr=False` para no
mostrarlos cuando el ámbito es ACR.

Regla: un polígono del archivo ACR queda fuera (`en_acr=False`) si su centroide
cae fuera del límite ACR y además está en el archivo ZI, o si cae fuera del
límite y a más de ~300 m del borde (tolerancia por límites simplificados).
"""
from __future__ import annotations

import json
import math
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]
ACUM = BASE / "www" / "reportes_atd"
ACR_ALL = BASE / "data" / "cache" / "geojson" / "acr_all.geojson"
EDGE_TOL_DEG = 0.003

FILES = (
    ("loreto", "ampiyacu_apayacu", "zi_aa", "ACR_AA"),
    ("loreto", "nanay", "zi_anpch", "ACR_ANPCH"),
    ("loreto", "maijuna_kichwa", "zi_mk", "ACR_MK"),
    ("loreto", "comunal_tahuayo", "zi_ctt", "ACR_CTT"),
    ("san_martin", "bosques_shunte", "zi_bsm", "ACR_BSM"),
    ("san_martin", "cordillera_escalera", "zi_ce", "ACR_CE"),
    ("cusco", "choquequirao", "zi_chq", "ACR_CHQ"),
    ("cusco", "chuyapi_urusayhua", "zi_chu", "ACR_CHU"),
    ("cusco", "qeros_kosnipata", "zi_qk", "ACR_QK"),
)


def polygons_of(geom: dict) -> list:
    t = geom.get("type")
    if t == "Polygon":
        return [geom["coordinates"]]
    if t == "MultiPolygon":
        return geom["coordinates"]
    return []


def in_ring(x: float, y: float, ring: list) -> bool:
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / ((yj - yi) or 1e-15) + xi:
            inside = not inside
        j = i
    return inside


def in_polygons(x: float, y: float, polys: list) -> bool:
    for poly in polys:
        if in_ring(x, y, poly[0]) and not any(in_ring(x, y, h) for h in poly[1:]):
            return True
    return False


def seg_dist(px: float, py: float, ax: float, ay: float, bx: float, by: float) -> float:
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return math.hypot(px - ax, py - ay)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def near_edge(x: float, y: float, segments: list) -> bool:
    for ax, ay, bx, by in segments:
        if min(ax, bx) - EDGE_TOL_DEG > x or max(ax, bx) + EDGE_TOL_DEG < x:
            continue
        if min(ay, by) - EDGE_TOL_DEG > y or max(ay, by) + EDGE_TOL_DEG < y:
            continue
        if seg_dist(x, y, ax, ay, bx, by) <= EDGE_TOL_DEG:
            return True
    return False


def centroid(geom: dict) -> tuple[float, float] | None:
    polys = polygons_of(geom)
    if not polys or not polys[0] or not polys[0][0]:
        return None
    ring = polys[0][0]
    return sum(p[0] for p in ring) / len(ring), sum(p[1] for p in ring) / len(ring)


def feature_key(f: dict) -> tuple | None:
    c = centroid(f.get("geometry") or {})
    if not c:
        return None
    return ((f.get("properties") or {}).get("anno"), round(c[0], 4), round(c[1], 4))


def main() -> None:
    acr_all = json.loads(ACR_ALL.read_text(encoding="utf-8"))
    bounds: dict[str, list] = {}
    for f in acr_all["features"]:
        bounds.setdefault((f.get("properties") or {}).get("codigo"), []).extend(polygons_of(f["geometry"]))

    for folder, slug, zi_slug, code in FILES:
        path = ACUM / folder / "acumulado" / f"{slug}.geojson"
        zi_path = ACUM / folder / "acumulado" / f"{zi_slug}.geojson"
        polys = bounds.get(code)
        if not path.exists() or not polys:
            print(f"skip {slug}")
            continue
        segments = []
        for poly in polys:
            for ring in poly:
                for i in range(len(ring) - 1):
                    segments.append((ring[i][0], ring[i][1], ring[i + 1][0], ring[i + 1][1]))
        zi_keys: set = set()
        if zi_path.exists():
            zi_keys = {feature_key(f) for f in json.loads(zi_path.read_text(encoding="utf-8"))["features"]}

        data = json.loads(path.read_text(encoding="utf-8"))
        n_out_dup = n_out_far = 0
        for f in data.get("features", []):
            props = f.setdefault("properties", {})
            c = centroid(f.get("geometry") or {})
            en_acr = True
            if c and not in_polygons(c[0], c[1], polys):
                if feature_key(f) in zi_keys:
                    en_acr = False
                    n_out_dup += 1
                elif not near_edge(c[0], c[1], segments):
                    en_acr = False
                    n_out_far += 1
            props["en_acr"] = en_acr
        path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        total = len(data.get("features", []))
        print(f"{slug}: {total} polígonos · fuera por ZI={n_out_dup} · fuera lejos del borde={n_out_far}")


if __name__ == "__main__":
    main()
