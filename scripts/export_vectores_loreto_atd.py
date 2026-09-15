#!/usr/bin/env python3
"""Exporta gpo_anp_monit + MonitoreoDeforestacion desde GDB Loreto ATD."""
from __future__ import annotations

import json
from pathlib import Path

import geopandas as gpd
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "www" / "reportes_atd" / "loreto"
VECTORES_OUT = OUT_DIR / "vectores_loreto.geojson"
MONITOREO_OUT = OUT_DIR / "monitoreo_loreto.geojson"
ACUMULADO_DIR = OUT_DIR / "acumulado"

GDB = Path(
    r"C:\Users\Favio Campos Rivera\Desktop\GFP-Subnacional\2026\LBD_2026"
    r"\reporte_atd_loreto\output\salidas\ATD_Loreto\GDB"
    r"\Linea_base_deforestación_Loreto.gdb"
)

CAUSA_TIPO = {
    1: "Antropogenico",
    14: "Natural",
    99: "Falsa alerta",
    6: "Natural",
}

ACR_CODE = {
    "ACR09": "ACR_AA",
    "ACR04": "ACR_CTT",
    "ACR10": "ACR_ANPCH",
    "ACR17": "ACR_MK",
    "ACR18": "ACR_MP",
}

ACR_ZONA_KEY = {
    "ACR09": "Ampiyacu Apayacu",
    "ACR04": "Comunal Tahuayo",
    "ACR10": "Nanay",
    "ACR17": "Maijuna Kichwa",
    "ACR18": "Medio Putumayo",
}

ZI_CODIGO = {
    "ZI AA": "ZI_AA",
    "ZI ANPCH": "ZI_ANPCH",
    "ZI CTT": "ZI_CTT",
    "ZI MK": "ZI_MK",
}

ZI_LABEL = {
    "ZI_AA": "ZI Ampiyacu",
    "ZI_ANPCH": "ZI Alto Nanay",
    "ZI_CTT": "ZI Tahuayo",
    "ZI_MK": "ZI Maijuna",
}

ZONA_SLUG = {
    "Ampiyacu Apayacu": "ampiyacu_apayacu",
    "Comunal Tahuayo": "comunal_tahuayo",
    "Nanay": "nanay",
    "Maijuna Kichwa": "maijuna_kichwa",
    "ZI AA": "zi_aa",
    "ZI ANPCH": "zi_anpch",
    "ZI CTT": "zi_ctt",
    "ZI MK": "zi_mk",
}


def _find_gdb() -> Path:
    if GDB.exists():
        return GDB
    alt = Path(
        r"C:\Users\Favio Campos Rivera\Desktop\GFP-Subnacional\2026\LBD_2026"
        r"\reporte_atd_loreto\output\salidas\Informe_ATD_preliminar\GDB"
    )
    for p in sorted(alt.glob("Linea_base_deforestaci*n_Loreto*.gdb")):
        if "backup" not in p.name.lower():
            return p
    raise FileNotFoundError(f"No Loreto GDB: {GDB}")


def export_boundaries(gdb: Path) -> list[dict]:
    gdf = gpd.read_file(gdb, layer="gpo_anp_monit").to_crs(4326)
    gdf["geometry"] = gdf.geometry.simplify(0.0008, preserve_topology=True)
    features = []
    for _, row in gdf.iterrows():
        codi = str(row.get("acr_codi") or "").strip()
        nombre = str(row.get("acr_nomb") or codi).strip()
        is_zi = codi.upper().startswith("ZI")
        if is_zi:
            code = ZI_CODIGO.get(codi, codi.replace(" ", "_").upper())
            nombre = ZI_LABEL.get(code, nombre)
        else:
            code = ACR_CODE.get(codi.upper(), codi.upper())
        features.append({
            "type": "Feature",
            "properties": {
                "codigo": code,
                "nombre": nombre,
                "tipo": "zi" if is_zi else "acr",
                "acr_codi": codi,
            },
            "geometry": row.geometry.__geo_interface__,
        })
    return features


def _zona_key_acum(row) -> str:
    zi = row.get("zi_codi")
    if pd.notna(zi) and str(zi).strip():
        return str(zi).strip()
    anp = str(row.get("anp_codi") or "").strip().upper()
    return ACR_ZONA_KEY.get(anp, anp)


def _codigo_acum(row, zona_key: str) -> str:
    """Dashboard codigo: ACR_*/ZI_* for KPIs; keep ZI labels as-is."""
    zi = row.get("zi_codi")
    if pd.notna(zi) and str(zi).strip():
        z = str(zi).strip()
        return ZI_CODIGO.get(z, z.replace(" ", "_").upper())
    anp = str(row.get("anp_codi") or "").strip().upper()
    return ACR_CODE.get(anp, anp)


def export_acumulado(gdb: Path) -> dict[str, int]:
    gdf = gpd.read_file(gdb, layer="MonitoreoDeforestacionAcumulado").to_crs(4326)
    gdf = gdf[gdf.geometry.notna() & ~gdf.geometry.is_empty].copy()
    # Sin simplify: vértices = Feature Class GDB
    gdf = gdf[gdf.geometry.notna() & ~gdf.geometry.is_empty].copy()
    gdf["zona_key"] = gdf.apply(_zona_key_acum, axis=1)
    ACUMULADO_DIR.mkdir(parents=True, exist_ok=True)
    counts: dict[str, int] = {}
    area_by_codigo: dict[str, float] = {}
    for zona_key, grp in gdf.groupby("zona_key"):
        slug = ZONA_SLUG.get(zona_key, str(zona_key).lower().replace(" ", "_"))
        features = []
        for idx, row in grp.iterrows():
            causa = row.get("md_causa")
            try:
                causa_i = int(float(causa)) if pd.notna(causa) else 0
            except (TypeError, ValueError):
                causa_i = 0
            anno = row.get("md_anno")
            try:
                anno_i = int(float(anno)) if pd.notna(anno) else None
            except (TypeError, ValueError):
                anno_i = None
            area = round(float(row.get("md_sup") or 0), 4)
            codigo = _codigo_acum(row, zona_key)
            area_by_codigo[codigo] = area_by_codigo.get(codigo, 0.0) + float(row.get("md_sup") or 0)
            features.append({
                "type": "Feature",
                "properties": {
                    "zona_key": zona_key,
                    "codigo": codigo,
                    "anp_codi": str(row.get("anp_codi") or ""),
                    "zi_codi": str(row.get("zi_codi") or "") if pd.notna(row.get("zi_codi")) else "",
                    "sector": str(row.get("ac_nomb") or ""),
                    "tipo": CAUSA_TIPO.get(causa_i, "Antropogenico"),
                    "causa": causa_i,
                    "area_ha": area,
                    "anno": anno_i,
                    "fuente": str(row.get("md_fuente") or ""),
                    "conf": str(row.get("md_conf") or ""),
                    "bosque": str(row.get("md_bosque") or ""),
                },
                "geometry": row.geometry.__geo_interface__,
            })
        out_path = ACUMULADO_DIR / f"{slug}.geojson"
        out_path.write_text(
            json.dumps({"type": "FeatureCollection", "features": features}, ensure_ascii=False),
            encoding="utf-8",
        )
        counts[zona_key] = len(features)
    manifest = {
        "zonas": {
            k: {
                "slug": ZONA_SLUG.get(k, str(k).lower().replace(" ", "_")),
                "n": v,
            }
            for k, v in counts.items()
        }
    }
    (ACUMULADO_DIR / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    # Compare GeoJSON-derived sums vs raw GDB md_sup by codigo
    print("\n=== area_ha sum by codigo (exported) vs GDB md_sup ===")
    gdb_sum = (
        gdf.assign(
            _codigo=gdf.apply(lambda r: _codigo_acum(r, r["zona_key"]), axis=1),
            _sup=pd.to_numeric(gdf["md_sup"], errors="coerce").fillna(0),
        )
        .groupby("_codigo")["_sup"]
        .sum()
    )
    for codigo in sorted(set(area_by_codigo) | set(gdb_sum.index)):
        exp = area_by_codigo.get(codigo, 0.0)
        gdb_v = float(gdb_sum.get(codigo, 0.0))
        diff_pct = abs(exp - gdb_v) / gdb_v * 100 if gdb_v else (0.0 if exp == 0 else 100.0)
        print(f"  {codigo:12s}  geojson={exp:12.4f}  gdb={gdb_v:12.4f}  diff%={diff_pct:.4f}")
    return counts


def _zona_key(row) -> str:
    zi = row.get("zona_influencia")
    if pd.notna(zi) and str(zi).strip():
        return str(zi).strip()
    anp = str(row.get("anp_codi") or "").strip().upper()
    return ACR_ZONA_KEY.get(anp, anp)


def export_monitoreo(gdb: Path) -> list[dict]:
    gdf = gpd.read_file(gdb, layer="MonitoreoDeforestacion").to_crs(4326)
    gdf["geometry"] = gdf.geometry.simplify(0.00025, preserve_topology=True)
    features = []
    for idx, row in gdf.iterrows():
        causa = row.get("md_causa")
        try:
            causa_i = int(float(causa)) if pd.notna(causa) else 0
        except (TypeError, ValueError):
            causa_i = 0
        zona_key = _zona_key(row)
        zi = row.get("zona_influencia")
        is_zi = pd.notna(zi) and str(zi).strip().startswith("ZI")
        codigo = ZI_CODIGO.get(str(zi).strip(), "") if is_zi else str(row.get("anp_codi") or "")
        features.append({
            "type": "Feature",
            "properties": {
                "zona_key": zona_key,
                "zona_codigo": codigo,
                "tipo_zona": "zi" if is_zi else "acr",
                "anp_codi": str(row.get("anp_codi") or ""),
                "oid": str(int(row.name) + 1) if isinstance(row.name, int) else str(idx + 1),
                "tipo": CAUSA_TIPO.get(causa_i, "Antropogenico"),
                "area_ha": round(float(row.get("md_sup") or 0), 4),
                "causa": causa_i,
                "anno": int(float(row.get("md_anno") or 2026)) if pd.notna(row.get("md_anno")) else 2026,
            },
            "geometry": row.geometry.__geo_interface__,
        })
    return features


def main() -> int:
    import sys

    only_acum = "--acumulado-only" in sys.argv or "acumulado" in [a.lower() for a in sys.argv[1:]]
    gdb = _find_gdb()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"OK GDB: {gdb}")

    if not only_acum:
        boundaries = export_boundaries(gdb)
        VECTORES_OUT.write_text(
            json.dumps({"type": "FeatureCollection", "features": boundaries}, ensure_ascii=False),
            encoding="utf-8",
        )
        monitoreo = export_monitoreo(gdb)
        MONITOREO_OUT.write_text(
            json.dumps({"type": "FeatureCollection", "features": monitoreo}, ensure_ascii=False),
            encoding="utf-8",
        )
        print(f"  {len(boundaries)} límites -> {VECTORES_OUT.name}")
        print(f"  {len(monitoreo)} alertas MonitoreoDeforestacion -> {MONITOREO_OUT.name}")

    acumulado = export_acumulado(gdb)
    print(f"  {sum(acumulado.values())} polígonos acumulado -> {ACUMULADO_DIR.name}/")
    for z, n in sorted(acumulado.items(), key=lambda x: -x[1]):
        print(f"    {z}: {n}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
