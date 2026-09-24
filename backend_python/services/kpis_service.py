"""
KPIs — traducción de utils/KPI_Calculator.R y calcular_kpis_cached en cache_manager.R.
"""
from __future__ import annotations

from datetime import date

import pandas as pd

from services.estadisticas_service import EstadisticasConsolidadas
from services.filtros_service import obtener_causas_filtradas, obtener_datos_filtrados


def calcular_total_hectareas(datos: pd.DataFrame) -> float:
    if datos is None or datos.empty:
        return 0.0
    return round(float(datos["Total"].sum(skipna=True)), 2)


def identificar_causa_principal(datos_causas: pd.DataFrame) -> str:
    if datos_causas is None or datos_causas.empty:
        return "Sin datos"
    idx = datos_causas["Area_Ha"].idxmax()
    return str(datos_causas.loc[idx, "Causa"])


def generar_resumen_kpis(
    est: EstadisticasConsolidadas,
    filtros: list[str] | None = None,
    depto: str = "todos",
    ambito: str = "acr",
) -> dict:
    """Equivalente a generar_resumen_kpis() en KPI_Calculator.R."""
    if filtros:
        if ambito == "acr":
            datos = obtener_datos_filtrados(est, filtros, depto, "acr")
        elif ambito == "zi":
            datos = obtener_datos_filtrados(est, filtros, depto, "zi")
        else:
            datos = pd.concat(
                [
                    obtener_datos_filtrados(est, filtros, depto, "acr"),
                    obtener_datos_filtrados(est, filtros, depto, "zi"),
                ],
                ignore_index=True,
            )
    else:
        if ambito == "zi":
            datos = obtener_datos_filtrados(est, None, depto, "zi")
        elif ambito == "acr":
            datos = obtener_datos_filtrados(est, None, depto, "acr")
        else:
            datos = pd.concat(
                [
                    obtener_datos_filtrados(est, None, depto, "acr"),
                    obtener_datos_filtrados(est, None, depto, "zi"),
                ],
                ignore_index=True,
            )

    causas = obtener_causas_filtradas(est, filtros, depto, ambito)
    causa_principal = identificar_causa_principal(causas)
    if causas is not None and not causas.empty:
        causa_ha = float(causas["Area_Ha"].max())
    else:
        causa_ha = 0.0

    total_antropico = float(datos["Antropico"].sum(skipna=True))
    total_natural = float(datos["Perdida_natural"].sum(skipna=True))
    total_falsa = float(datos["Falsa_alerta"].sum(skipna=True))
    # Pérdida de bosque = antrópico + natural (la falsa alerta no es deforestación)
    total_ha = round(total_antropico + total_natural, 2)

    def _pct(part: float) -> float:
        return round((part / total_ha) * 100, 1) if total_ha > 0 else 0.0

    gross = total_ha + total_falsa
    return {
        "total_hectareas": total_ha,
        "total_antropico": total_antropico,
        "total_natural": total_natural,
        "total_falsa": total_falsa,
        "pct_antropico": _pct(total_antropico),
        "pct_natural": _pct(total_natural),
        "pct_falsa": round((total_falsa / gross) * 100, 1) if gross > 0 else 0.0,
        "causa_principal": causa_principal,
        "causa_principal_ha": round(causa_ha, 2),
        "causa_principal_pct": _pct(causa_ha),
        "n_acrs": int(len(datos)),
        "fecha_calculo": date.today().isoformat(),
    }
