"""
KPIs y gráficos desde centroides filtrados por año / ACR / ámbito.
"""
from __future__ import annotations

import pandas as pd

from services.deforestacion_service import filtrar_centroides
from services.decretos_service import ACR_DECRETOS

_NOMBRE_POR_CODIGO = dict(zip(ACR_DECRETOS["codigo"], ACR_DECRETOS["nombre_completo"]))


def _clasificar_categoria(causa: str) -> str:
    c = str(causa or "").strip().lower()
    if c == "natural" or c == "14":
        return "natural"
    if ("falsa" in c and "alerta" in c) or c == "99":
        return "falsa"
    # Códigos numéricos antrópicos conocidos
    try:
        code = int(float(c))
        if code == 14:
            return "natural"
        if code == 99:
            return "falsa"
    except (TypeError, ValueError):
        pass
    return "antropico"


def _preparar(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return df
    out = df.copy()
    out["area"] = pd.to_numeric(out["area"], errors="coerce").fillna(0.0)
    if "causa" not in out.columns:
        out["causa"] = "Sin especificar"
    out["causa"] = out["causa"].fillna("Sin especificar")

    # Mapear códigos md_causa (1=Agricultura, …) a nombre de dominio GDB
    from services.deforestacion_vectors_service import MD_CAUSA_NOMBRES, _causa_code, _causa_nombre

    def _norm_causa(val):
        code = _causa_code(val)
        if code is not None:
            return MD_CAUSA_NOMBRES.get(code, f"Causa {code}")
        return _causa_nombre(val)

    out["causa"] = out["causa"].map(_norm_causa).astype(str)
    out["categoria"] = out["causa"].map(_clasificar_categoria)
    return out


def _sumar_categorias(df: pd.DataFrame) -> tuple[float, float, float, float]:
    ant = float(df.loc[df["categoria"] == "antropico", "area"].sum())
    nat = float(df.loc[df["categoria"] == "natural", "area"].sum())
    fal = float(df.loc[df["categoria"] == "falsa", "area"].sum())
    total = ant + nat + fal
    return total, ant, nat, fal


def kpis_desde_centroides(
    centroides_df: pd.DataFrame,
    departamento: str = "todos",
    ambito: str = "acr",
    acr_filtros: list[str] | None = None,
    anno_desde: int | None = None,
    anno_hasta: int | None = None,
) -> dict | None:
    if centroides_df.empty or "causa" not in centroides_df.columns:
        return None

    filtered = filtrar_centroides(
        centroides_df,
        departamento,
        ambito or "acr",
        acr_filtros,
        anno_desde=anno_desde,
        anno_hasta=anno_hasta,
    )
    df = _preparar(filtered)
    if df.empty:
        return {
            "total_hectareas": 0.0,
            "total_antropico": 0.0,
            "total_natural": 0.0,
            "total_falsa": 0.0,
            "pct_antropico": 0.0,
            "pct_natural": 0.0,
            "pct_falsa": 0.0,
            "causa_principal": "Sin datos",
            "causa_principal_ha": 0.0,
            "causa_principal_pct": 0.0,
        }

    total, ant, nat, fal = _sumar_categorias(df)

    ant_df = df[df["categoria"] == "antropico"]
    if ant_df.empty:
        causa_principal = "Sin datos"
        causa_ha = 0.0
    else:
        por_causa = ant_df.groupby("causa")["area"].sum()
        # Ignorar vacíos / sin especificar al elegir la principal
        valid = por_causa[
            ~por_causa.index.astype(str).str.strip().str.lower().isin(
                {"sin especificar", "sin datos", "n/a", "na", "none", "null", "nan", ""}
            )
        ]
        use = valid if not valid.empty else por_causa
        causa_principal = str(use.idxmax())
        causa_ha = float(use.max())

    def _pct(part: float) -> float:
        return round((part / total) * 100, 1) if total > 0 else 0.0

    return {
        "total_hectareas": round(total, 2),
        "total_antropico": round(ant, 2),
        "total_natural": round(nat, 2),
        "total_falsa": round(fal, 2),
        "pct_antropico": _pct(ant),
        "pct_natural": _pct(nat),
        "pct_falsa": _pct(fal),
        "causa_principal": causa_principal,
        "causa_principal_ha": round(causa_ha, 2),
        "causa_principal_pct": _pct(causa_ha),
    }


def graficos_desde_centroides(
    centroides_df: pd.DataFrame,
    departamento: str = "todos",
    ambito: str | None = "acr",
    acr_filtros: list[str] | None = None,
    anno_desde: int | None = None,
    anno_hasta: int | None = None,
) -> dict | None:
    if centroides_df.empty or "causa" not in centroides_df.columns:
        return None

    ambito_val = ambito or "acr"
    filtered = filtrar_centroides(
        centroides_df,
        departamento,
        ambito_val,
        acr_filtros,
        anno_desde=anno_desde,
        anno_hasta=anno_hasta,
    )
    df = _preparar(filtered)
    n_filtros = len(acr_filtros) if acr_filtros else 0

    out: dict = {
        "modo": "nacional",
        "composicion": None,
        "causas_top5": None,
        "distribucion": None,
        "comparativa": None,
    }

    if df.empty:
        return out

    if n_filtros == 1:
        out["modo"] = "individual"
        total, ant, nat, fal = _sumar_categorias(df)
        out["composicion"] = [
            {"Categoria": "Origen antrópico", "Hectareas": ant, "Color": "#d9534f"},
            {"Categoria": "Natural", "Hectareas": nat, "Color": "#5cb85c"},
            {"Categoria": "Falsa alerta", "Hectareas": fal, "Color": "#f0ad4e"},
        ]
        out["distribucion"] = {
            "total": total,
            "items": [
                {
                    "Categoria": "Origen antrópico",
                    "Hectareas": ant,
                    "Porcentaje": round((ant / total) * 100, 1) if total else 0,
                    "Color": "#d9534f",
                },
                {
                    "Categoria": "Natural",
                    "Hectareas": nat,
                    "Porcentaje": round((nat / total) * 100, 1) if total else 0,
                    "Color": "#5cb85c",
                },
                {
                    "Categoria": "Falsa alerta",
                    "Hectareas": fal,
                    "Porcentaje": round((fal / total) * 100, 1) if total else 0,
                    "Color": "#f0ad4e",
                },
            ],
        }
        ant_df = df[df["categoria"] == "antropico"]
        if not ant_df.empty:
            top = (
                ant_df.groupby("causa")["area"]
                .sum()
                .reset_index()
                .rename(columns={"causa": "Causa", "area": "Area_Ha"})
                .sort_values("Area_Ha", ascending=False)
                .head(5)
            )
            out["causas_top5"] = top.to_dict(orient="records")

    elif n_filtros >= 2:
        out["modo"] = "comparativa"
        rows = []
        for codigo in acr_filtros or []:
            codes = {codigo}
            if ambito_val == "ambos":
                codes.add(codigo.replace("ACR_", "ZI_", 1))
            sub = df[df["codigo"].isin(codes)]
            if sub.empty:
                continue
            total, ant, nat, fal = _sumar_categorias(sub)
            nombre = _NOMBRE_POR_CODIGO.get(codigo, codigo)
            nombre_corto = nombre.replace("ACR ", "")
            if ambito_val == "ambos":
                nombre_corto += " (ACR+ZI)"
            rows.append(
                {
                    "Nombre_corto": nombre_corto,
                    "Antropico": ant,
                    "Perdida_natural": nat,
                    "Falsa_alerta": fal,
                }
            )
        if rows:
            out["comparativa"] = rows

    return out
