"""Datos unificados para gráficos del dashboard (mod_graficos.R)."""
from __future__ import annotations

import pandas as pd

from services.estadisticas_service import EstadisticasConsolidadas
from services.filtros_service import obtener_causas_filtradas, obtener_datos_filtrados


def _get_datos_categoria(
    est: EstadisticasConsolidadas,
    filtros: list[str] | None,
    depto: str,
    ambito: str | None,
) -> pd.DataFrame:
    if ambito == "zi":
        return obtener_datos_filtrados(est, filtros, depto, "zi")
    if ambito == "ambos":
        return pd.concat(
            [
                obtener_datos_filtrados(est, filtros, depto, "acr"),
                obtener_datos_filtrados(est, filtros, depto, "zi"),
            ],
            ignore_index=True,
        )
    return obtener_datos_filtrados(est, filtros, depto, "acr")


def datos_para_graficos(
    est: EstadisticasConsolidadas,
    filtros: list[str] | None,
    depto: str,
    ambito: str | None,
) -> dict:
    n_filtros = len(filtros) if filtros else 0
    ambito_val = ambito or "acr"

    out: dict = {
        "modo": "nacional",
        "composicion": None,
        "causas_top5": None,
        "distribucion": None,
        "comparativa": None,
    }

    if n_filtros == 1:
        out["modo"] = "individual"
        datos = _get_datos_categoria(est, filtros, depto, ambito)
        if not datos.empty:
            row = datos.iloc[0]
            total = float(row["Total"])
            out["composicion"] = [
                {"Categoria": "Origen antrópico", "Hectareas": float(row["Antropico"]), "Color": "#d9534f"},
                {"Categoria": "Natural", "Hectareas": float(row["Perdida_natural"]), "Color": "#5cb85c"},
                {"Categoria": "Falsa alerta", "Hectareas": float(row["Falsa_alerta"]), "Color": "#f0ad4e"},
            ]
            out["distribucion"] = {
                "total": total,
                "items": [
                    {
                        "Categoria": "Origen antrópico",
                        "Hectareas": float(row["Antropico"]),
                        "Porcentaje": round((row["Antropico"] / total) * 100, 1) if total else 0,
                        "Color": "#d9534f",
                    },
                    {
                        "Categoria": "Natural",
                        "Hectareas": float(row["Perdida_natural"]),
                        "Porcentaje": round((row["Perdida_natural"] / total) * 100, 1) if total else 0,
                        "Color": "#5cb85c",
                    },
                    {
                        "Categoria": "Falsa alerta",
                        "Hectareas": float(row["Falsa_alerta"]),
                        "Porcentaje": round((row["Falsa_alerta"] / total) * 100, 1) if total else 0,
                        "Color": "#f0ad4e",
                    },
                ],
            }
        causas = obtener_causas_filtradas(est, filtros, depto, ambito_val)
        if not causas.empty:
            top = causas.sort_values("Area_Ha", ascending=False).head(5)
            out["causas_top5"] = top.to_dict(orient="records")

    elif n_filtros >= 2:
        out["modo"] = "comparativa"
        datos = _get_datos_categoria(est, filtros, depto, ambito)
        if ambito == "ambos" and not datos.empty:
            datos = datos.copy()
            datos["Sufijo"] = datos["Nombre"].apply(
                lambda n: " (ACR)" if str(n).startswith("ACR") else " (ZI)"
            )
            datos["Nombre_corto"] = (
                datos["Nombre"].str.replace("^ACR ", "", regex=True).str.replace("^ZI ", "", regex=True)
                + datos.get("Sufijo", "")
            )
        elif not datos.empty:
            datos = datos.copy()
            datos["Nombre_corto"] = (
                datos["Nombre"].str.replace("^ACR ", "", regex=True).str.replace("^ZI ", "", regex=True)
            )
        if not datos.empty:
            out["comparativa"] = datos[
                ["Nombre_corto", "Antropico", "Perdida_natural", "Falsa_alerta"]
            ].to_dict(orient="records")

    return out
