"""Genera acumulado_lite/*.ndjson: polígonos listos para el mapa (livianos).

- Descarta lo que el mapa nunca muestra: falsas alertas, copias ZI dentro de ACR (en_acr=False), sin año.
- Propiedades ya resueltas (tipo, causa_nombre, fuente_nombre, zonificación) → el servidor no recalcula.
- Coordenadas a 5 decimales (~1 m) y sin vértices colineales/duplicados.
- Formato: 1ª línea "#{cabecera json}"; luego "anno<TAB>{feature json}" por polígono,
  para que el servidor filtre por año y concatene sin parsear geometrías.

Uso: python scripts/build_vectors_lite.py   (requiere shapely)
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from shapely.geometry import mapping, shape

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend_python"))

from services.deforestacion_vectors_service import (  # noqa: E402
    ATD_ROOT,
    CODIGO_SLUGS,
    _causa_nombre,
    _fuente_nombre,
    _nombre_acr,
    _tipo_desde_causa,
    _zonif_nombre,
)

DECIMALS = 5
SIMPLIFY_TOL = 0.000005


def _round_ring(ring):
    out = []
    for x, y in ring:
        pt = [round(x, DECIMALS), round(y, DECIMALS)]
        if not out or out[-1] != pt:
            out.append(pt)
    if out and out[0] != out[-1]:
        out.append(out[0])
    return out if len(out) >= 4 else None


def _lite_geometry(geom: dict) -> dict | None:
    try:
        g = shape(geom)
        s = g.simplify(SIMPLIFY_TOL, preserve_topology=True)
        if not s.is_empty:
            g = s
        gj = mapping(g)
    except Exception:  # noqa: BLE001
        gj = geom
    polys = gj["coordinates"] if gj["type"] == "MultiPolygon" else [gj["coordinates"]] if gj["type"] == "Polygon" else []
    out = []
    for poly in polys:
        rings = [_round_ring(r) for r in poly]
        if not rings or rings[0] is None:
            return geom
        out.append([r for r in rings if r is not None])
    if not out:
        return geom if geom.get("coordinates") else None
    if len(out) == 1:
        return {"type": "Polygon", "coordinates": out[0]}
    return {"type": "MultiPolygon", "coordinates": out}


def build_one(folder: str, slug: str, codigo: str) -> tuple[int, int, int, int] | None:
    src = ATD_ROOT / folder / "acumulado" / f"{slug}.geojson"
    if not src.exists():
        return None
    data = json.loads(src.read_text(encoding="utf-8"))
    lines: list[str] = []
    zonas: set[str] = set()
    nombre = _nombre_acr(codigo)
    total = 0
    for f in data.get("features") or []:
        total += 1
        raw = f.get("properties") or {}
        if codigo.startswith("ACR_") and raw.get("en_acr") is False:
            continue
        try:
            anno = int(raw.get("anno"))
        except (TypeError, ValueError):
            continue
        tipo = _tipo_desde_causa(raw.get("causa"), raw.get("tipo"))
        if tipo == "Falsa alerta":
            continue
        geom = _lite_geometry(f.get("geometry") or {})
        if geom is None:
            continue
        z = _zonif_nombre(raw.get("zonificacion") or raw.get("md_zonif") or raw.get("sector"))
        zona = raw.get("zona_key") or ""
        zonas.add(zona)
        props = {
            "codigo": codigo,
            "tipo": tipo,
            "anno": anno,
            "area_ha": raw.get("area_ha"),
            "causa_nombre": _causa_nombre(raw.get("causa")),
        }
        fuente = _fuente_nombre(raw.get("fuente"))
        if fuente:
            props["fuente_nombre"] = fuente
        if z:
            props["zonificacion"] = z
        feat = {"type": "Feature", "properties": props, "geometry": geom}
        lines.append(f"{anno}\t{json.dumps(feat, ensure_ascii=False, separators=(',', ':'))}")
    if len(zonas) > 1:
        raise SystemExit(f"{codigo}: zona_key no es única por archivo: {sorted(zonas)[:5]}")
    header = {"codigo": codigo, "nombre_acr": nombre, "zona_key": next(iter(zonas), "")}
    dst_dir = ATD_ROOT / folder / "acumulado_lite"
    dst_dir.mkdir(exist_ok=True)
    stale = dst_dir / f"{slug}.geojson"
    if stale.exists():
        stale.unlink()
    dst = dst_dir / f"{slug}.ndjson"
    body = "#" + json.dumps(header, ensure_ascii=False, separators=(",", ":")) + "\n" + "\n".join(lines) + "\n"
    dst.write_text(body, encoding="utf-8", newline="\n")
    return total, len(lines), src.stat().st_size, dst.stat().st_size


def main() -> None:
    tot_src = tot_dst = 0
    for codigo, (folder, slug) in sorted(CODIGO_SLUGS.items()):
        res = build_one(folder, slug, codigo)
        if res is None:
            print(f"  (sin archivo) {codigo}")
            continue
        n_in, n_out, s_in, s_out = res
        tot_src += s_in
        tot_dst += s_out
        print(f"{codigo:10s} {n_in:6d} → {n_out:6d} feats   {s_in/1e6:6.2f} MB → {s_out/1e6:5.2f} MB")
    print(f"TOTAL {tot_src/1e6:.1f} MB → {tot_dst/1e6:.1f} MB")


if __name__ == "__main__":
    main()
