"""Tendencias dinámicas — modules/mod_prediccion.R"""
from __future__ import annotations

import numpy as np
import pandas as pd

from services.temporal_service import _load

ACR_NOMBRES = {
    "ACR_AA": "Ampiyacu Apayacu",
    "ACR_ANPCH": "Alto Nanay – Pintuyacu Chambira",
    "ACR_MK": "Maijuna Kichwa",
    "ACR_CTT": "Comunal Tamshiyacu Tahuayo",
    "ACR_BSM": "Bosques de Shunté y Mishollo",
    "ACR_CE": "Cordillera Escalera",
    "ACR_CHQ": "Choquequirao",
    "ACR_CHU": "Chuyapi Urusayhua",
    "ACR_QK": "Q'eros Kosñipata",
}

ACR_DEPTO = {
    "ACR_AA": "loreto",
    "ACR_ANPCH": "loreto",
    "ACR_MK": "loreto",
    "ACR_CTT": "loreto",
    "ACR_BSM": "san_martin",
    "ACR_CE": "san_martin",
    "ACR_CHQ": "cusco",
    "ACR_CHU": "cusco",
    "ACR_QK": "cusco",
}

COLORES_COMPARATIVA = [
    "#C0392B",
    "#1A5276",
    "#B9770E",
    "#6C3483",
    "#117A65",
    "#E67E22",
    "#1C2833",
    "#1A7A4C",
    "#7B241C",
]


def _nombre_acr(cod: str) -> str:
    return ACR_NOMBRES.get(cod, str(cod).replace("ACR_", "").replace("_", " "))


def analizar_tendencias(
    tipo_analisis: str = "general",
    acr_seleccion: list[str] | None = None,
    rango_anios: tuple[int, int] = (2001, 2025),
    mostrar_tendencia: bool = True,
    causa: str | None = None,
) -> dict:
    df = _load()
    if df.empty:
        return {"series": [], "titulo": "Sin datos temporales"}

    y0, y1 = rango_anios
    causa_txt = (causa or "").strip()
    if causa_txt and causa_txt.lower() not in {"todas", "todos"}:
        return _analizar_por_causa(
            tipo_analisis, acr_seleccion, y0, y1, mostrar_tendencia, causa_txt
        )
    datos = df[(df["Anio"] >= y0) & (df["Anio"] <= y1)].copy()

    if tipo_analisis in ("individual", "comparativa") and acr_seleccion:
        datos = datos[datos["ACR_codigo"].isin(acr_seleccion)]

    if datos.empty:
        return {"series": [], "titulo": "Sin datos para los filtros"}

    if tipo_analisis == "general":
        agg = datos.groupby("Anio", as_index=False)["Deforestacion_ha"].sum()
        agg["ACR_codigo"] = "TOTAL"
        agg["Cambio_Pct"] = _pct_change(agg["Deforestacion_ha"].values)
        series = [_serie_from_df(agg, "Deforestación acumulada", "#0B6E4F", mostrar_tendencia)]
        titulo = f"Tendencia de deforestación · {y0}–{y1}"
        return {"tipo": tipo_analisis, "titulo": titulo, "series": series}

    if tipo_analisis == "individual" and acr_seleccion:
        cod = acr_seleccion[0]
        nombre = _nombre_acr(cod)
        sub = datos[datos["ACR_codigo"] == cod].sort_values("Anio")
        sub["Cambio_Pct"] = _pct_change(sub["Deforestacion_ha"].values)
        series = [_serie_from_df(sub, nombre, "#0B6E4F", mostrar_tendencia)]
        titulo = f"Tendencia de deforestación · {nombre}"
        return {"tipo": tipo_analisis, "titulo": titulo, "series": series}

    # comparativa
    series = []
    for i, cod in enumerate(sorted(datos["ACR_codigo"].unique())):
        sub = datos[datos["ACR_codigo"] == cod].sort_values("Anio")
        sub["Cambio_Pct"] = _pct_change(sub["Deforestacion_ha"].values)
        color = COLORES_COMPARATIVA[i % len(COLORES_COMPARATIVA)]
        series.append(_serie_from_df(sub, _nombre_acr(cod), color, mostrar_tendencia))
    return {
        "tipo": tipo_analisis,
        "titulo": "Comparativa de tendencias entre ACR",
        "series": series,
    }


def _codigos(tipo_analisis: str, acr_seleccion: list[str] | None) -> list[str]:
    if tipo_analisis in ("individual", "comparativa") and acr_seleccion:
        return [c for c in acr_seleccion if c in ACR_DEPTO]
    return list(ACR_DEPTO)


def _analizar_por_causa(tipo, acr_seleccion, y0, y1, mostrar_tendencia, causa: str) -> dict:
    """Serie anual real de los polígonos cuya causa coincide. No rellena años sin pérdida."""
    from services.deforestacion_vectors_service import iter_acumulado_properties

    codigos = _codigos(tipo, acr_seleccion)
    if tipo == "individual" and codigos:
        codigos = codigos[:1]
    por_acr: dict[str, dict[int, float]] = {c: {} for c in codigos}
    for cod in codigos:
        depto = ACR_DEPTO.get(cod)
        if not depto:
            continue
        for row in iter_acumulado_properties(depto, "acr", [cod], y0, y1):
            if (row.get("causa_nombre") or "") != causa:
                continue
            anio = int(row["anno"])
            por_acr[cod][anio] = por_acr[cod].get(anio, 0.0) + float(row.get("area_ha") or 0)

    series = []
    for i, cod in enumerate(codigos):
        anos = sorted(por_acr[cod])
        if not anos:
            continue
        filas = [
            {"Anio": a, "Deforestacion_ha": round(por_acr[cod][a], 2), "Cambio_Pct": None}
            for a in anos
        ]
        frame = pd.DataFrame(filas)
        color = COLORES_COMPARATIVA[i % len(COLORES_COMPARATIVA)]
        nombre = causa if len(codigos) == 1 and tipo != "comparativa" else _nombre_acr(cod)
        series.append(_serie_from_df(frame, nombre, color, mostrar_tendencia and len(frame) >= 2))
    titulo = f"Pérdida por causa · {causa} · {y0}–{y1}"
    if not series:
        titulo = f"Sin polígonos de «{causa}» en {y0}–{y1}"
    return {
        "tipo": tipo,
        "titulo": titulo,
        "series": series,
        "causa": causa,
        "fuente": "poligonos",
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
            {"Anio": int(a), "valor": round(float(b), 2)} for a, b in zip(x, trend_y)
        ]
        serie["tendencia_nombre"] = f"Tendencia · {name}"
    return serie
