#!/usr/bin/env python3
"""Reexporta acumulado Loreto GeoJSON con zonificacion (md_zonif) + nombre_acr."""
from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

import geopandas as gpd
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "www" / "reportes_atd" / "loreto" / "acumulado"
BASE = Path(
    r"C:\Users\Favio Campos Rivera\Desktop\GFP-Subnacional\2026\LBD_2026"
    r"\reporte_atd_loreto\output\salidas\datos_actualizados_gdb_ver"
)

CAUSA_TIPO = {1: "Antropogenico", 14: "Natural", 99: "Falsa alerta", 6: "Natural"}

ZONIF = {
    "S": "Zona Silvestre",
    "AD": "Zona de Aprovechamiento Directo",
    "T": "Zona de Uso Turístico y Recreativo",
    "PE": "Zona de Protección Especial",
    "RC": "Zona de Recuperación",
    "UH": "Zona de Uso Especial",
    "Zona Silvestre": "Zona Silvestre",
    "Zona de Aprovechamiento Directo": "Zona de Aprovechamiento Directo",
    "Zona de Uso Directo": "Zona de Aprovechamiento Directo",
    "Zona de Uso Turístico y Recreativo": "Zona de Uso Turístico y Recreativo",
    "Zona de Uso Turistico y Recreativo": "Zona de Uso Turístico y Recreativo",
    "Zona de Protección Especial": "Zona de Protección Especial",
    "Zona de Recuperación": "Zona de Recuperación",
    "No Zonificado": "No zonificado",
}

# anp_codi -> (dashboard codigo, zona_key, slug, nombre completo)
ACR_BY_ANP = {
    "ACR09": ("ACR_AA", "Ampiyacu Apayacu", "ampiyacu_apayacu", "ACR Ampiyacu Apayacu"),
    "ACR04": ("ACR_CTT", "Comunal Tahuayo", "comunal_tahuayo", "ACR Comunal Tamshiyacu Tahuayo"),
    "ACR10": ("ACR_ANPCH", "Nanay", "nanay", "ACR Alto Nanay - Pintuyacu Chambira"),
    "ACR17": ("ACR_MK", "Maijuna Kichwa", "maijuna_kichwa", "ACR Maijuna Kichwa"),
}


def _i(val, default=0):
    try:
        return int(float(val)) if pd.notna(val) else default
    except Exception:
        return default


def _zonif(val) -> str:
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return ""
    s = str(val).strip()
    if not s or s.lower() in {"none", "nan", "n/a"}:
        return ""
    return ZONIF.get(s, s)


def _find_gdb() -> Path | None:
    hits = sorted(BASE.glob("Linea_base_deforestaci*Loreto*.gdb"))
    return hits[0] if hits else None


def export_loreto() -> None:
    gdb = _find_gdb()
    if not gdb:
        print("NO GDB in", BASE)
        return
    print("export from", gdb.name)
    gdf = gpd.read_file(str(gdb), layer="MonitoreoDeforestacionAcumulado").to_crs(4326)
    gdf = gdf[gdf.geometry.notna() & ~gdf.geometry.is_empty].copy()
    OUT.mkdir(parents=True, exist_ok=True)

    for anp, (codigo, zona_key, slug, nombre) in ACR_BY_ANP.items():
        sub = gdf[gdf["anp_codi"].astype(str).str.upper() == anp]
        features = []
        for _, row in sub.iterrows():
            causa = _i(row.get("md_causa"))
            anno = row.get("md_anno")
            try:
                anno_i = int(float(anno)) if pd.notna(anno) else None
            except Exception:
                anno_i = None
            area = round(float(row.get("md_sup") or 0), 4)
            z = _zonif(row.get("md_zonif"))
            features.append(
                {
                    "type": "Feature",
                    "properties": {
                        "zona_key": zona_key,
                        "codigo": codigo,
                        "nombre_acr": nombre,
                        "anp_codi": anp,
                        "zi_codi": "",
                        "sector": z,
                        "zonificacion": z,
                        "tipo": CAUSA_TIPO.get(causa, "Antropogenico"),
                        "causa": causa,
                        "area_ha": area,
                        "anno": anno_i,
                        "fuente": str(row.get("md_fuente") or ""),
                        "conf": str(row.get("md_conf") or ""),
                        "bosque": str(row.get("md_bosque") or ""),
                    },
                    "geometry": row.geometry.__geo_interface__,
                }
            )
        out = OUT / f"{slug}.geojson"
        out.write_text(
            json.dumps({"type": "FeatureCollection", "features": features}, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8",
        )
        counts = Counter(f["properties"]["zonificacion"] or "(vacio)" for f in features)
        print(codigo, len(features), "feats", counts.most_common(6))


def enrich_other_depts() -> None:
    """Cusco / San Martin: al menos nombre_acr; no tocar sector si no es zonif."""
    nombres = {v[0]: v[3] for v in ACR_BY_ANP.values()}
    nombres.update(
        {
            "ACR_BSM": "ACR Bosques de Shunté y Mishollo",
            "ACR_CE": "ACR Cordillera Escalera",
            "ACR_CHQ": "ACR Choquequirao",
            "ACR_CHU": "ACR Chuyapi Urusayhua",
            "ACR_QK": "ACR Q'eros Kosñipata",
        }
    )
    atd = ROOT / "www" / "reportes_atd"
    for fp in atd.rglob("acumulado/*.geojson"):
        if "loreto" in str(fp).replace("\\", "/"):
            continue
        data = json.loads(fp.read_text(encoding="utf-8"))
        ch = False
        for f in data.get("features") or []:
            p = f.get("properties") or {}
            cod = p.get("codigo") or ""
            nom = nombres.get(cod)
            if nom and p.get("nombre_acr") != nom:
                p["nombre_acr"] = nom
                ch = True
            f["properties"] = p
        if ch:
            fp.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
            print("enriched", fp.relative_to(atd))


def main():
    if not BASE.exists():
        print("BASE missing")
        return
    export_loreto()
    enrich_other_depts()
    print("OK")


if __name__ == "__main__":
    main()
