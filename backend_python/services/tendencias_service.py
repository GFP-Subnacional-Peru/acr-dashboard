"""Tendencias dinámicas — modules/mod_prediccion.R"""
from __future__ import annotations

import numpy as np
import pandas as pd

from services.temporal_service import _load

COLORES_COMPARATIVA = [
    "#1a4d2e", "#006D5B", "#4CAF50", "#66c2a5", "#f0ad4e",
    "#d9534f", "#5cb85c", "#337ab7", "#8e44ad",
]


def analizar_tendencias(
    tipo_analisis: str = "general",
    acr_seleccion: list[str] | None = None,
    rango_anios: tuple[int, int] = (2001, 2025),
    mostrar_tendencia: bool = True,
) -> dict:
    df = _load()
    if df.empty:
        return {"series": [], "titulo": "Sin datos temporales"}

    y0, y1 = rango_anios
    datos = df[(df["Anio"] >= y0) & (df["Anio"] <= y1)].copy()

    if tipo_analisis in ("individual", "comparativa") and acr_seleccion:
        datos = datos[datos["ACR_codigo"].isin(acr_seleccion)]

    if datos.empty:
        return {"series": [], "titulo": "Sin datos para los filtros"}

    if tipo_analisis == "general":
        agg = datos.groupby("Anio", as_index=False)["Deforestacion_ha"].sum()
        agg["ACR_codigo"] = "TOTAL"
        agg["Cambio_Pct"] = _pct_change(agg["Deforestacion_ha"].values)
        series = [_serie_from_df(agg, "Deforestación", "#1a4d2e", mostrar_tendencia)]
        titulo = "Tendencia de Deforestación (2001-2025)"
        return {"tipo": tipo_analisis, "titulo": titulo, "series": series}

    if tipo_analisis == "individual" and acr_seleccion:
        cod = acr_seleccion[0]
        sub = datos[datos["ACR_codigo"] == cod].sort_values("Anio")
        sub["Cambio_Pct"] = _pct_change(sub["Deforestacion_ha"].values)
        series = [_serie_from_df(sub, cod, "#1a4d2e", mostrar_tendencia)]
        titulo = f"Tendencia de Deforestación - {cod}"
        return {"tipo": tipo_analisis, "titulo": titulo, "series": series}

    # comparativa
    series = []
    for i, cod in enumerate(sorted(datos["ACR_codigo"].unique())):
        sub = datos[datos["ACR_codigo"] == cod].sort_values("Anio")
        sub["Cambio_Pct"] = _pct_change(sub["Deforestacion_ha"].values)
        color = COLORES_COMPARATIVA[i % len(COLORES_COMPARATIVA)]
        series.append(_serie_from_df(sub, cod.replace("ACR_", ""), color, False))
    return {
        "tipo": tipo_analisis,
        "titulo": "Comparativa de Tendencias entre ACRs",
        "series": series,
    }


def _pct_change(values: np.ndarray) -> list:
    out = [None]
    for i in range(1, len(values)):
        prev = values[i - 1]
        if prev == 0 or np.isnan(prev):
            out.append(None)
        else:
            out.append(round(((values[i] - prev) / prev) * 100, 1))
    return out


def _serie_from_df(df: pd.DataFrame, name: str, color: str, trend: bool) -> dict:
    points = []
    for _, row in df.iterrows():
        points.append({
            "Anio": int(row["Anio"]),
            "Deforestacion_ha": float(row["Deforestacion_ha"]),
            "hover": (
                f"<b>Año:</b> {int(row['Anio'])}<br>"
                f"<b>Deforestación:</b> {row['Deforestacion_ha']:,.2f} ha"
            ),
        })
    serie = {"name": name, "color": color, "points": points}
    if trend and len(df) >= 2:
        x = df["Anio"].values.astype(float)
        y = df["Deforestacion_ha"].values.astype(float)
        coef = np.polyfit(x, y, 1)
        trend_y = coef[0] * x + coef[1]
        serie["tendencia"] = [
            {"Anio": int(a), "valor": float(b)} for a, b in zip(x, trend_y)
        ]
    return serie
