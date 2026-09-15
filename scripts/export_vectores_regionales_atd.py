#!/usr/bin/env python3
"""Exporta MonitoreoDeforestacionAcumulado de San Martín y Cusco (mismo esquema que Loreto)."""
from __future__ import annotations

import json
from pathlib import Path

import geopandas as gpd
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
SALIDAS = Path(
    r"C:\Users\Favio Campos Rivera\Desktop\GFP-Subnacional\2026\LBD_2026"
    r"\reporte_atd_loreto\output\salidas"
)
PRELIM_GDB_CANDIDATES = [
    SALIDAS / "Informe_ATD_preliminar" / "GDB" / "Linea_base_deforestación_San_Martin",
    SALIDAS / "Informe_ATD_preliminar" / "GDB" / "Linea_base_deforestacion_San_Martin",
]
PRELIM_GDB = next((p for p in PRELIM_GDB_CANDIDATES if p.is_dir()), None)
if PRELIM_GDB is None:
    for p in sorted((SALIDAS / "Informe_ATD_preliminar" / "GDB").glob("Linea_base_deforestaci*_San_Martin")):
        if p.is_dir() and (p / "gdb_monit_template_ACR_CE.gdb").exists():
            PRELIM_GDB = p
            break
if PRELIM_GDB is None:
    PRELIM_GDB = SALIDAS / "Informe_ATD_preliminar" / "GDB"

CAUSA_TIPO = {
    1: "Antropogenico",
    14: "Natural",
    99: "Falsa alerta",
    6: "Natural",
}

# ── Cusco ──────────────────────────────────────────────────────────
CUSCO_GDB = SALIDAS / "ATD_Cuzco" / "GDB"
CUSCO_OUT = ROOT / "www" / "reportes_atd" / "cusco" / "acumulado"
CUSCO_ACR = {"ACR07": "ACR_CHQ", "ACR26": "ACR_CHU", "ACR30": "ACR_QK"}
CUSCO_ZI = {
    "Zona de influencia ACR Choquequirao": "ZI_CHQ",
    "Zona de influencia ACR Chuyapi Urusayhua": "ZI_CHU",
    "Zona de influencia ACR Qeros Kosñipata": "ZI_QK",
    "Zona de influencia ACR Qeros Kosnipata": "ZI_QK",
    "Zona de influencia ACR Q'eros Kosñipata": "ZI_QK",
}
CUSCO_SLUG = {
    "ACR_CHQ": "choquequirao",
    "ACR_CHU": "chuyapi_urusayhua",
    "ACR_QK": "qeros_kosnipata",
    "ZI_CHQ": "zi_chq",
    "ZI_CHU": "zi_chu",
    "ZI_QK": "zi_qk",
}
CUSCO_ZONA = {
    "ACR_CHQ": "Choquequirao",
    "ACR_CHU": "Chuyapi Urusayhua",
    "ACR_QK": "Qeros Kosnipata",
    "ZI_CHQ": "ZI Choquequirao",
    "ZI_CHU": "ZI Chuyapi",
    "ZI_QK": "ZI Qeros",
}

# ── San Martín ─────────────────────────────────────────────────────
SM_GDB = SALIDAS / "ATD_San_Martin" / "GDB"
SM_OUT = ROOT / "www" / "reportes_atd" / "san_martin" / "acumulado"
SM_ACR = {"ACR01": "ACR_CE", "ACR21": "ACR_BSM"}
SM_SLUG = {
    "ACR_CE": "cordillera_escalera",
    "ACR_BSM": "bosques_shunte",
    "ZI_CE": "zi_ce",
    "ZI_BSM": "zi_bsm",
}
SM_ZONA = {
    "ACR_CE": "Cordillera Escalera",
    "ACR_BSM": "Bosques de Shunte y Mishollo",
    "ZI_CE": "ZI Cordillera Escalera",
    "ZI_BSM": "ZI BOSHUMI",
}


def _find_gdb(folder: Path, pattern: str) -> Path:
    matches = sorted(folder.glob(pattern))
    if not matches:
        raise FileNotFoundError(f"No GDB {pattern!r} en {folder}")
    return matches[0]


def _causa_i(val) -> int:
    try:
        return int(float(val)) if pd.notna(val) else 0
    except (TypeError, ValueError):
        return 0


def _anno_i(val) -> int | None:
    try:
        return int(float(val)) if pd.notna(val) else None
    except (TypeError, ValueError):
        return None


def _area_ha(val) -> float:
    """md_sup → ha; None/NaN no deben llegar al GeoJSON."""
    try:
        if val is None or (isinstance(val, float) and pd.isna(val)) or pd.isna(val):
            return 0.0
        x = float(val)
        if pd.isna(x):
            return 0.0
        return round(x, 4)
    except (TypeError, ValueError):
        return 0.0


def _feature_row(row, zona_key: str, codigo: str) -> dict:
    causa = _causa_i(row.get("md_causa"))
    return {
        "type": "Feature",
        "properties": {
            "zona_key": zona_key,
            "codigo": codigo,
            "anp_codi": str(row.get("anp_codi") or ""),
            "zi_codi": str(row.get("zi_codi") or "") if pd.notna(row.get("zi_codi")) else "",
            "sector": str(row.get("ac_nomb") or ""),
            "tipo": CAUSA_TIPO.get(causa, "Antropogenico"),
            "causa": causa,
            "area_ha": _area_ha(row.get("md_sup")),
            "anno": _anno_i(row.get("md_anno")),
            "fuente": str(row.get("md_fuente") or ""),
            "conf": str(row.get("md_conf") or ""),
            "bosque": str(row.get("md_bosque") or ""),
        },
        "geometry": row.geometry.__geo_interface__,
    }


def _write_by_codigo(
    gdf: gpd.GeoDataFrame,
    out_dir: Path,
    codigo_fn,
    zona_map: dict[str, str],
    slug_map: dict[str, str],
    simplify: float = 0.0,
) -> dict[str, int]:
    out_dir.mkdir(parents=True, exist_ok=True)
    gdf = gdf.to_crs(4326)
    # Geometría fiel a la GDB: no simplify / no set_precision (evita “triángulos”)
    if simplify and simplify > 0:
        gdf["geometry"] = gdf.geometry.simplify(simplify, preserve_topology=True)
    gdf = gdf[~gdf.geometry.is_empty & gdf.geometry.notna()].copy()

    codes = []
    for _, row in gdf.iterrows():
        codes.append(codigo_fn(row))
    gdf = gdf.assign(_codigo=codes)
    gdf = gdf[gdf["_codigo"].notna()].copy()

    counts: dict[str, int] = {}
    for codigo, grp in gdf.groupby("_codigo"):
        slug = slug_map.get(codigo)
        if not slug:
            continue
        zona_key = zona_map.get(codigo, codigo)
        print(f"    escribiendo {codigo} ({len(grp)} feats)...", flush=True)
        features = [_feature_row(row, zona_key, codigo) for _, row in grp.iterrows()]
        out_path = out_dir / f"{slug}.geojson"
        out_path.write_text(
            json.dumps(
                {"type": "FeatureCollection", "features": features},
                ensure_ascii=False,
                separators=(",", ":"),
            ),
            encoding="utf-8",
        )
        mb = out_path.stat().st_size / (1024 * 1024)
        print(f"    -> {out_path.name}: {len(features)} feats, {mb:.1f} MB", flush=True)
        counts[codigo] = len(features)

    manifest = {
        "zonas": {
            codigo: {"slug": slug_map[codigo], "zona_key": zona_map.get(codigo, codigo), "n": n}
            for codigo, n in counts.items()
            if codigo in slug_map
        }
    }
    (out_dir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return counts


def _norm_zi_name(s: str) -> str:
    return (
        str(s or "")
        .replace("ñ", "n")
        .replace("Ñ", "N")
        .replace("'", "")
        .strip()
    )


def codigo_cusco(row) -> str | None:
    anp = str(row.get("anp_codi") or "").strip()
    if anp in CUSCO_ACR:
        return CUSCO_ACR[anp]
    if anp in CUSCO_ZI:
        return CUSCO_ZI[anp]
    # tolerant match for encoding variants of Qeros
    for k, v in CUSCO_ZI.items():
        if _norm_zi_name(k) == _norm_zi_name(anp):
            return v
    if "Choquequirao" in anp and "influencia" in anp.lower():
        return "ZI_CHQ"
    if "Chuyapi" in anp and "influencia" in anp.lower():
        return "ZI_CHU"
    if ("Qeros" in anp or "Q'eros" in anp or "Kos" in anp) and "influencia" in anp.lower():
        return "ZI_QK"
    return None


def codigo_sm_acr(row) -> str | None:
    anp = str(row.get("anp_codi") or "").strip()
    return SM_ACR.get(anp)


def export_cusco() -> dict[str, int]:
    gdb = _find_gdb(CUSCO_GDB, "Linea_base_deforestaci*.gdb")
    print(f"Cusco GDB: {gdb}")
    gdf = gpd.read_file(gdb, layer="MonitoreoDeforestacionAcumulado")
    return _write_by_codigo(gdf, CUSCO_OUT, codigo_cusco, CUSCO_ZONA, CUSCO_SLUG, 0.0)


def export_san_martin(only_zi: bool = False) -> dict[str, int]:
    counts: dict[str, int] = {}
    if not only_zi:
        gdb = _find_gdb(SM_GDB, "Linea_base_deforestaci*.gdb")
        print(f"San Martín GDB ACR: {gdb}")
        gdf_acr = gpd.read_file(gdb, layer="MonitoreoDeforestacionAcumulado")
        counts = _write_by_codigo(gdf_acr, SM_OUT, codigo_sm_acr, SM_ZONA, SM_SLUG, 0.0)

    # ZI desde plantillas (capas dedicadas)
    zi_sources = [
        (PRELIM_GDB / "gdb_monit_template_ACR_CE.gdb", "MonitoreoDeforestacionAcumulado_ZI_CE", "ZI_CE"),
        (PRELIM_GDB / "gdb_monit_template_ACR_BOSHUMI.gdb", "MonitoreoDeforestacionAcumulado_ZI_BOSHUMI", "ZI_BSM"),
    ]
    for path, layer, forced in zi_sources:
        if not path.exists():
            print(f"  AVISO: no existe {path}")
            continue
        print(f"  ZI layer {layer} @ {path.name}")
        gdf = gpd.read_file(path, layer=layer)
        # ZI: también fiel a GDB (sin simplify)
        part = _write_by_codigo(
            gdf,
            SM_OUT,
            lambda _row, c=forced: c,
            SM_ZONA,
            SM_SLUG,
            simplify=0.0,
        )
        counts.update(part)

    # reescribir manifest completo (incluye ACR ya exportados si solo ZI)
    if only_zi:
        for codigo, slug in SM_SLUG.items():
            if codigo.startswith("ACR_"):
                p = SM_OUT / f"{slug}.geojson"
                if p.exists() and codigo not in counts:
                    # conservar conteo ACR sin reabrir todo: leer feature count barato
                    try:
                        n = json.loads(p.read_text(encoding="utf-8")).get("features") or []
                        counts[codigo] = len(n)
                    except Exception:
                        pass

    manifest = {
        "zonas": {
            codigo: {"slug": SM_SLUG[codigo], "zona_key": SM_ZONA.get(codigo, codigo), "n": n}
            for codigo, n in counts.items()
            if codigo in SM_SLUG
        }
    }
    (SM_OUT / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return counts


def main() -> int:
    import sys

    only = (sys.argv[1:] or [""])[0].lower()
    if only not in ("", "cusco", "sm", "san_martin", "zi"):
        print("Uso: export_vectores_regionales_atd.py [cusco|sm|zi]")
        return 2

    if only in ("", "cusco"):
        print("=== Export Cusco ===")
        cusco = export_cusco()
        for k, n in sorted(cusco.items(), key=lambda x: -x[1]):
            print(f"  {k}: {n}")

    if only in ("", "sm", "san_martin", "zi"):
        print("=== Export San Martín ===")
        print(f"PRELIM_GDB: {PRELIM_GDB}")
        sm = export_san_martin(only_zi=(only == "zi"))
        for k, n in sorted(sm.items(), key=lambda x: -x[1]):
            print(f"  {k}: {n}")

    print("OK — vectores regionales listos.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
