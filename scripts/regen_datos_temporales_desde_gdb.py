#!/usr/bin/env python3
"""Regenerate utils/datos_temporales_acr.R (and data/) from GDB ACR polygons.

Reads MonitoreoDeforestacionAcumulado from Loreto / San Martín / Cusco GDBs,
filters ACR-only (excludes ZI), groups by ACR name + md_anno, sums md_sup.

Keeps ALL md_causa values (same as export_vectores_* scripts — no filter).
"""
from __future__ import annotations

from pathlib import Path

import geopandas as gpd
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
SALIDAS = Path(
    r"C:\Users\Favio Campos Rivera\Desktop\GFP-Subnacional\2026\LBD_2026"
    r"\reporte_atd_loreto\output\salidas"
)

UTILS_OUT = ROOT / "utils" / "datos_temporales_acr.R"
DATA_OUT = ROOT / "data" / "datos_temporales_acr.R"

# anp_codi → (Region, ACR display name matching temporal_service.ACR_NAME_TO_CODE)
ACR_MAP: dict[str, tuple[str, str]] = {
    # Loreto (same codes as export_vectores_loreto_atd.py; exclude ACR18 Medio Putumayo)
    "ACR09": ("Loreto", "Ampiyacu Apayacu"),
    "ACR10": ("Loreto", "Alto Nanay Pintuyacu Chambira"),
    "ACR04": ("Loreto", "Comunal Tamshiyacu Tahuayo"),
    "ACR17": ("Loreto", "Maijuna Kichwa"),
    # San Martín
    "ACR01": ("San Martín", "Cordillera Escalera"),
    "ACR21": ("San Martín", "Bosques de Shunté y Mishollo"),
    # Cusco
    "ACR07": ("Cusco", "Choquequirao"),
    "ACR26": ("Cusco", "Chuyapi Urusayhua"),
    "ACR30": ("Cusco", "Q'eros Kosñipata"),
}

# tribble variable names / section order (matches existing R file)
TRIBBLE_ORDER = [
    ("Cusco", "Choquequirao", "cusco_chq", "CUSCO - Choquequirao"),
    ("Cusco", "Chuyapi Urusayhua", "cusco_chu", "CUSCO - Chuyapi Urusayhua"),
    ("Cusco", "Q'eros Kosñipata", "cusco_qk", "CUSCO - Q'eros Kosñipata"),
    ("San Martín", "Cordillera Escalera", "sm_ce", "SAN MARTÍN - Cordillera Escalera"),
    ("San Martín", "Bosques de Shunté y Mishollo", "sm_bsm", "SAN MARTÍN - Bosques de Shunté y Mishollo"),
    ("Loreto", "Ampiyacu Apayacu", "loreto_aa", "LORETO - Ampiyacu Apayacu"),
    ("Loreto", "Alto Nanay Pintuyacu Chambira", "loreto_anpch", "LORETO - Alto Nanay Pintuyacu Chambira"),
    ("Loreto", "Comunal Tamshiyacu Tahuayo", "loreto_ctt", "LORETO - Comunal Tamshiyacu Tahuayo"),
    ("Loreto", "Maijuna Kichwa", "loreto_mk", "LORETO - Maijuna Kichwa"),
]

YEARS = list(range(2001, 2027))  # include 2026 when present in GDB


def _find_gdb(folder: Path, pattern: str = "Linea_base_deforestaci*.gdb") -> Path:
    if not folder.exists():
        raise FileNotFoundError(f"No folder: {folder}")
    matches = [
        p
        for p in sorted(folder.glob(pattern))
        if p.is_dir() and "backup" not in p.name.lower()
    ]
    if not matches:
        raise FileNotFoundError(f"No GDB {pattern!r} in {folder}")
    return matches[0]


def _is_zi(row) -> bool:
    zi = row.get("zi_codi")
    if pd.notna(zi) and str(zi).strip():
        return True
    anp = str(row.get("anp_codi") or "").strip()
    if anp.upper().startswith("ZI"):
        return True
    if "influencia" in anp.lower():
        return True
    return False


def _read_acr_rows(gdb: Path, region_label: str) -> pd.DataFrame:
    print(f"  reading {gdb} ...", flush=True)
    gdf = gpd.read_file(gdb, layer="MonitoreoDeforestacionAcumulado")
    rows = []
    skipped_zi = 0
    skipped_other = 0
    for _, row in gdf.iterrows():
        if _is_zi(row):
            skipped_zi += 1
            continue
        anp = str(row.get("anp_codi") or "").strip().upper()
        mapped = ACR_MAP.get(anp)
        if not mapped:
            skipped_other += 1
            continue
        region, acr_name = mapped
        try:
            anno = int(float(row.get("md_anno"))) if pd.notna(row.get("md_anno")) else None
        except (TypeError, ValueError):
            anno = None
        if anno is None:
            continue
        try:
            ha = float(row.get("md_sup") or 0)
        except (TypeError, ValueError):
            ha = 0.0
        rows.append({"Region": region, "ACR": acr_name, "Anio": anno, "Deforestacion_ha": ha})
    print(
        f"    {region_label}: kept={len(rows)}  skipped_zi={skipped_zi}  skipped_other={skipped_other}",
        flush=True,
    )
    return pd.DataFrame(rows)


def load_all() -> tuple[pd.DataFrame, dict[str, float]]:
    sources = [
        (SALIDAS / "ATD_Loreto" / "GDB", "Loreto"),
        (SALIDAS / "ATD_San_Martin" / "GDB", "San Martín"),
        (SALIDAS / "ATD_Cuzco" / "GDB", "Cusco"),
    ]
    parts = []
    gdb_totals: dict[str, float] = {}
    for folder, label in sources:
        gdb = _find_gdb(folder)
        print(f"GDB {label}: {gdb.name}")
        part = _read_acr_rows(gdb, label)
        parts.append(part)
        if not part.empty:
            for acr, s in part.groupby("ACR")["Deforestacion_ha"].sum().items():
                gdb_totals[acr] = gdb_totals.get(acr, 0.0) + float(s)
    df = pd.concat(parts, ignore_index=True) if parts else pd.DataFrame()
    return df, gdb_totals


def aggregate(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return df
    g = (
        df.groupby(["Region", "ACR", "Anio"], as_index=False)["Deforestacion_ha"]
        .sum()
    )
    # Fill missing years with 0 for each ACR in TRIBBLE_ORDER
    filled = []
    for region, acr, _, _ in TRIBBLE_ORDER:
        sub = g[(g["Region"] == region) & (g["ACR"] == acr)]
        by_year = {int(r.Anio): float(r.Deforestacion_ha) for r in sub.itertuples()}
        for y in YEARS:
            filled.append(
                {
                    "Region": region,
                    "ACR": acr,
                    "Anio": y,
                    "Deforestacion_ha": by_year.get(y, 0.0),
                }
            )
    return pd.DataFrame(filled)


def _fmt_ha(v: float) -> str:
    """Compact but precise float for tribble (trim trailing zeros)."""
    s = f"{v:.10f}".rstrip("0").rstrip(".")
    if s == "-0":
        s = "0"
    return s if s else "0"


def render_r(df: pd.DataFrame) -> str:
    blocks = []
    var_names = []
    for region, acr, var, title in TRIBBLE_ORDER:
        var_names.append(var)
        lines = [
            f"# {title}",
            f"{var} <- tribble(",
            "  ~Region, ~ACR, ~Anio, ~Deforestacion_ha,",
        ]
        sub = df[(df["Region"] == region) & (df["ACR"] == acr)].sort_values("Anio")
        for r in sub.itertuples():
            lines.append(
                f'  "{r.Region}", "{r.ACR}", {int(r.Anio)}, {_fmt_ha(float(r.Deforestacion_ha))},'
            )
        # drop trailing comma on last data line
        if lines[-1].endswith(","):
            lines[-1] = lines[-1][:-1]
        lines.append(")")
        blocks.append("\n".join(lines))

    bind = ",\n  ".join(var_names)
    body = "\n\n".join(blocks)
    return f"""# ========================================
# DATOS TEMPORALES REALES POR ACR
# Regenerado desde GDB (scripts/regen_datos_temporales_desde_gdb.py)
# Suma md_sup ALL causas (sin filtrar falsa alerta) — ACR only, excluye ZI
# ========================================

library(dplyr)

{body}

# ========================================
# CONSOLIDAR TODO EN UNA LISTA
# ========================================
datos_temporales_reales <- bind_rows(
  {bind}
)

# Mapeo de códigos ACR
datos_temporales_reales <- datos_temporales_reales %>%
  mutate(
    ACR_codigo = case_when(
      ACR == "Choquequirao" ~ "ACR_CHQ",
      ACR == "Chuyapi Urusayhua" ~ "ACR_CHU",
      ACR == "Q'eros Kosñipata" ~ "ACR_QK",
      ACR == "Cordillera Escalera" ~ "ACR_CE",
      ACR == "Bosques de Shunté y Mishollo" ~ "ACR_BSM",
      ACR == "Ampiyacu Apayacu" ~ "ACR_AA",
      ACR == "Alto Nanay Pintuyacu Chambira" ~ "ACR_ANPCH",
      ACR == "Comunal Tamshiyacu Tahuayo" ~ "ACR_CTT",
      ACR == "Maijuna Kichwa" ~ "ACR_MK",
      TRUE ~ ACR
    )
  )

cat("✅ Datos temporales reales cargados exitosamente\\n")
cat(sprintf("   Total de registros: %d\\n", nrow(datos_temporales_reales)))
cat(sprintf("   ACRs únicas: %d\\n", length(unique(datos_temporales_reales$ACR_codigo))))
"""


def verify(df: pd.DataFrame, gdb_totals: dict[str, float]) -> None:
    print("\n=== Verify R series totals vs GDB (ACR, all causes) ===")
    print(f"{'ACR':40s} {'R_ha':>12s} {'GDB_ha':>12s} {'diff%':>10s}")
    ok = True
    for _, acr, _, _ in TRIBBLE_ORDER:
        r_ha = float(df.loc[df["ACR"] == acr, "Deforestacion_ha"].sum())
        g_ha = float(gdb_totals.get(acr, 0.0))
        diff = abs(r_ha - g_ha) / g_ha * 100 if g_ha else (0.0 if r_ha == 0 else 100.0)
        flag = "OK" if diff <= 0.5 else "FAIL"
        if diff > 0.5:
            ok = False
        print(f"{acr:40s} {r_ha:12.4f} {g_ha:12.4f} {diff:9.4f}%  {flag}")
    print("PASS within 0.5%" if ok else "FAIL: some ACRs exceed 0.5%")


def main() -> int:
    print("=== Regen datos_temporales_acr.R from GDB ===")
    raw, gdb_totals = load_all()
    if raw.empty:
        print("ERROR: no ACR rows read")
        return 1
    agg = aggregate(raw)
    text = render_r(agg)
    UTILS_OUT.write_text(text, encoding="utf-8")
    print(f"Wrote {UTILS_OUT}")
    if DATA_OUT.exists() or DATA_OUT.parent.exists():
        DATA_OUT.parent.mkdir(parents=True, exist_ok=True)
        DATA_OUT.write_text(text, encoding="utf-8")
        print(f"Wrote {DATA_OUT}")
    verify(agg, gdb_totals)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
