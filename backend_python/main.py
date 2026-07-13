"""
API FastAPI + servidor web del Dashboard ACR (reemplazo R Shiny).
Ejecutar: uvicorn main:app --reload --port 8000
"""
from __future__ import annotations

import io
import sys
import zipfile
from contextlib import asynccontextmanager
from datetime import date
from pathlib import Path
from typing import Any

_BACKEND_ROOT = Path(__file__).resolve().parent
_PROJECT_ROOT = _BACKEND_ROOT.parent
_FRONTEND_DIR = _PROJECT_ROOT / "frontend"
_WWW_MAPAS = _PROJECT_ROOT / "www" / "mapas"
if not _WWW_MAPAS.exists():
    _WWW_MAPAS = _PROJECT_ROOT / "mapas"

if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))

import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from core.serializers import dataframe_to_records
from services.centroides_stats_service import graficos_desde_centroides, kpis_desde_centroides
from services.region_insights_service import region_insights
from services.atd_reportes_service import cargar_catalogo_atd, resolver_archivo_atd
from services.dashboard_service import datos_para_graficos
from services.decretos_service import ACR_DECRETOS, obtener_info_decreto
from core.rds_bridge import load_centroides_deforestacion
from services.deforestacion_service import filtrar_centroides, resumen_centroides_por_region
from services.deforestacion_vectors_service import (
    LORETO_CODIGOS,
    _merge_kpis,
    graficos_desde_acumulado,
    kpis_desde_acumulado,
    load_acumulado_vectors,
    loreto_en_alcance,
)
from services.estadisticas_service import estadisticas_a_catalogo
from services.filtros_config import ACR_OPCIONES_POR_DEPTO
from services.filtros_service import (
    get_estadisticas,
    obtener_causas_filtradas,
    obtener_datos_filtrados,
)
from services.kpis_service import generar_resumen_kpis
from services.geometrias_service import build_map_layers
from services.temporal_service import calcular_variacion_anual, serie_temporal
from services.tendencias_service import analizar_tendencias

_APP_STATE: dict[str, Any] = {}


def _get_centroides_cached() -> pd.DataFrame:
    """Carga diferida: el servidor abre al instante; el mapa carga en segundo plano."""
    if _APP_STATE.get("_centroides_loaded"):
        return _APP_STATE.get("centroides", pd.DataFrame())
    print("Cargando puntos del mapa (puede tardar unos segundos)...", flush=True)
    centroides = load_centroides_deforestacion()
    _APP_STATE["centroides"] = centroides
    _APP_STATE["deforestacion_rows"] = len(centroides)
    _APP_STATE["centroides_resumen"] = resumen_centroides_por_region(centroides)
    _APP_STATE["_centroides_loaded"] = True
    print(f"Mapa listo: {len(centroides)} puntos.", flush=True)
    return centroides


def _loreto_acrs_seleccionados(acrs: list[str] | None) -> list[str]:
    if not acrs:
        return []
    return [c for c in acrs if c in LORETO_CODIGOS]


def _centroides_excluyendo_loreto(
    centroides_df: pd.DataFrame,
    departamento: str,
    ambito: str,
    acr_filtros: list[str] | None,
    anno_desde: int | None,
    anno_hasta: int | None,
) -> pd.DataFrame:
    otros = [c for c in (acr_filtros or []) if c not in LORETO_CODIGOS]
    depto = departamento
    if depto == "loreto":
        return pd.DataFrame()
    if depto == "todos" and acr_filtros and not otros:
        return pd.DataFrame()
    filtros = otros if acr_filtros else acr_filtros
    df = filtrar_centroides(
        centroides_df, depto, ambito, filtros, anno_desde=anno_desde, anno_hasta=anno_hasta
    )
    if df.empty:
        return df
    return df[~df["codigo"].isin(LORETO_CODIGOS)]


def _kpis_combinados(
    centroides_df: pd.DataFrame,
    departamento: str,
    ambito: str,
    acr_filtros: list[str] | None,
    anno_desde: int | None,
    anno_hasta: int | None,
) -> dict | None:
    loreto_k = None
    if loreto_en_alcance(departamento, acr_filtros):
        loreto_sel = _loreto_acrs_seleccionados(acr_filtros) or None
        loreto_k = kpis_desde_acumulado(
            "loreto", ambito, loreto_sel, anno_desde=anno_desde, anno_hasta=anno_hasta
        )

    otros_k = None
    if departamento != "loreto":
        df = _centroides_excluyendo_loreto(
            centroides_df, departamento, ambito, acr_filtros, anno_desde, anno_hasta
        )
        if not df.empty:
            otros_k = kpis_desde_centroides(
                df, departamento if departamento != "todos" else "todos", ambito, None,
                anno_desde=anno_desde, anno_hasta=anno_hasta,
            )

    if loreto_k and otros_k:
        return _merge_kpis(loreto_k, otros_k)
    return loreto_k or otros_k


def _graficos_combinados(
    centroides_df: pd.DataFrame,
    departamento: str,
    ambito: str | None,
    acr_filtros: list[str] | None,
    anno_desde: int | None,
    anno_hasta: int | None,
) -> dict | None:
    amb = ambito or "acr"
    acrs = acr_filtros or []
    loreto_sel = _loreto_acrs_seleccionados(acrs)
    otros_sel = [c for c in acrs if c not in LORETO_CODIGOS]

    g_loreto = None
    if loreto_en_alcance(departamento, acr_filtros):
        if not acrs or loreto_sel:
            g_loreto = graficos_desde_acumulado(
                "loreto", amb, loreto_sel or None, anno_desde=anno_desde, anno_hasta=anno_hasta
            )

    g_otros = None
    if departamento != "loreto" and (not acrs or otros_sel):
        df = _centroides_excluyendo_loreto(
            centroides_df, departamento, amb, acr_filtros, anno_desde, anno_hasta
        )
        if not df.empty:
            g_otros = graficos_desde_centroides(
                df, departamento if departamento != "todos" else "todos", amb, None,
                anno_desde=anno_desde, anno_hasta=anno_hasta,
            )

    if g_loreto and not g_otros:
        return g_loreto
    if g_otros and not g_loreto:
        return g_otros
    if g_loreto and g_otros:
        if len(acrs) == 1:
            return g_loreto
        if g_loreto.get("modo") == "comparativa" and g_otros.get("modo") == "comparativa":
            merged = dict(g_loreto)
            merged["comparativa"] = (g_loreto.get("comparativa") or []) + (g_otros.get("comparativa") or [])
            merged["modo"] = "comparativa"
            return merged
        return g_loreto if loreto_sel and not otros_sel else g_otros
    return None


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Iniciando dashboard...", flush=True)
    est = get_estadisticas()
    _APP_STATE["estadisticas"] = est
    _APP_STATE["catalogo"] = estadisticas_a_catalogo(est)
    _APP_STATE["centroides"] = pd.DataFrame()
    _APP_STATE["_centroides_loaded"] = False
    geo_dir = _PROJECT_ROOT / "data" / "cache" / "geojson"
    if not (geo_dir / "acr_all.geojson").exists():
        print(
            "AVISO: faltan poligonos del mapa. Ejecute exportar_datos.bat (paso 2 GeoJSON).",
            flush=True,
        )
    print("Servidor listo. Abra: http://127.0.0.1:8000", flush=True)
    yield
    _APP_STATE.clear()


app = FastAPI(
    title="Dashboard ACRs - Monitoreo de Deforestación",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def no_cache_frontend(request, call_next):
    """Evita que el iframe de WordPress / el navegador sirvan JS/CSS/HTML viejos."""
    response = await call_next(request)
    path = request.url.path or ""
    if path == "/" or path.endswith((".html", ".js", ".css")):
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response


# --- API ---

@app.get("/api/health")
def health() -> dict[str, Any]:
    """Respuesta rápida para Render (cold start); no carga el CSV pesado aquí."""
    cache_csv = _PROJECT_ROOT / "data" / "cache" / "centroides_deforestacion.csv"
    geo_dir = _PROJECT_ROOT / "data" / "cache" / "geojson"
    loaded = _APP_STATE.get("_centroides_loaded", False)
    n = len(_APP_STATE.get("centroides", pd.DataFrame()))
    return {
        "status": "ok",
        "centroides_mapa": n,
        "mapa_listo": cache_csv.exists() and cache_csv.stat().st_size > 100,
        "geojson_ready": (geo_dir / "acr_all.geojson").exists(),
        "centroides_cargados": loaded,
        "cache_csv": str(cache_csv),
    }


@app.get("/api/filtros/opciones-acr")
def opciones_acr(departamento: str = Query("todos")) -> dict:
    return {"departamento": departamento, "grupos": ACR_OPCIONES_POR_DEPTO.get(departamento, ACR_OPCIONES_POR_DEPTO["todos"])}


@app.get("/api/metadata/acrs")
def listar_acrs(
    departamento: str = Query("todos"),
    tipo: str = Query("acr"),
    acr: list[str] | None = Query(None),
) -> dict:
    est = _APP_STATE["estadisticas"]
    df = obtener_datos_filtrados(est, filtros=acr, departamento=departamento, tipo=tipo)  # type: ignore
    return {"departamento": departamento, "tipo": tipo, "count": len(df), "data": dataframe_to_records(df)}


@app.get("/api/categorias")
def categorias_consolidadas() -> dict:
    est = _APP_STATE["estadisticas"]
    return {
        "acr": dataframe_to_records(obtener_datos_filtrados(est, departamento="todos", tipo="acr")),
        "zi": dataframe_to_records(obtener_datos_filtrados(est, departamento="todos", tipo="zi")),
    }


@app.get("/api/causas")
def causas_endpoint(
    departamento: str = Query("todos"),
    ambito: str = Query("acr"),
    acr: list[str] | None = Query(None),
) -> dict:
    est = _APP_STATE["estadisticas"]
    df = obtener_causas_filtradas(est, filtros=acr, departamento=departamento, ambito=ambito)  # type: ignore
    return {"departamento": departamento, "ambito": ambito, "filtros": acr or [], "data": dataframe_to_records(df)}


@app.get("/api/kpis")
def kpis_endpoint(
    departamento: str = Query("todos"),
    ambito: str = Query("acr"),
    acr: list[str] | None = Query(None),
    anno_desde: int | None = Query(None, ge=2001, le=2030),
    anno_hasta: int | None = Query(None, ge=2001, le=2030),
) -> dict:
    est = _APP_STATE["estadisticas"]
    cent = _get_centroides_cached()
    kpis = _kpis_combinados(
        cent, departamento, ambito, acr, anno_desde=anno_desde, anno_hasta=anno_hasta
    )
    if kpis is None:
        kpis = kpis_desde_centroides(
            cent, departamento, ambito, acr, anno_desde=anno_desde, anno_hasta=anno_hasta
        )
    if kpis is None:
        kpis = generar_resumen_kpis(est, filtros=acr, depto=departamento, ambito=ambito)
    kpis["variacion_anual"] = calcular_variacion_anual(acr, departamento)
    ambito_eff = ambito if ambito else "acr"
    kpis["porcentaje_antropico_kpi"] = kpis.get("pct_antropico", 0)
    kpis["texto_ambito_kpi"] = (
        "DE ORIGEN ANTRÓPICO" if ambito_eff == "acr"
        else "EN ZONA DE INFLUENCIA" if ambito_eff == "zi"
        else "TOTAL (ACR + ZI)"
    )
    return kpis


@app.get("/api/graficos")
def graficos_endpoint(
    departamento: str = Query("todos"),
    ambito: str = Query(""),
    acr: list[str] | None = Query(None),
    anno_desde: int | None = Query(None, ge=2001, le=2030),
    anno_hasta: int | None = Query(None, ge=2001, le=2030),
) -> dict:
    est = _APP_STATE["estadisticas"]
    amb = ambito if ambito else None
    cent = _get_centroides_cached()
    graficos = _graficos_combinados(
        cent, departamento, amb, acr, anno_desde=anno_desde, anno_hasta=anno_hasta
    )
    if graficos is None:
        graficos = graficos_desde_centroides(
            cent, departamento, amb or "acr", acr, anno_desde=anno_desde, anno_hasta=anno_hasta
        )
    if graficos is not None:
        return graficos
    return datos_para_graficos(est, acr, departamento, amb)


@app.get("/api/tendencias")
def tendencias_endpoint(acr: list[str] | None = Query(None)) -> dict:
    return {"serie": serie_temporal(acr)}


@app.get("/api/tendencias/analisis")
def tendencias_analisis(
    tipo_analisis: str = Query("general"),
    acr: list[str] | None = Query(None),
    anio_min: int = Query(2001),
    anio_max: int = Query(2025),
    mostrar_tendencia: bool = Query(True),
) -> dict:
    """Equivalente a mod_prediccion.R tras clic en Generar Análisis."""
    return analizar_tendencias(
        tipo_analisis=tipo_analisis,
        acr_seleccion=acr,
        rango_anios=(anio_min, anio_max),
        mostrar_tendencia=mostrar_tendencia,
    )


@app.get("/api/map/layers")
def map_layers(
    departamento: str = Query("todos"),
    ambito: str = Query("acr"),
    acr: list[str] | None = Query(None),
) -> dict:
    """Polígonos ACR/ZI con popups enriquecidos — mod_mapa.R."""
    return build_map_layers(departamento, ambito or "acr", acr)


@app.get("/api/decretos/{codigo}")
def decreto_endpoint(codigo: str) -> dict:
    return obtener_info_decreto(codigo)


@app.get("/api/decretos")
def todos_decretos() -> dict:
    return {"data": dataframe_to_records(ACR_DECRETOS)}


@app.get("/api/region-insights")
def region_insights_endpoint() -> dict:
    cent = _get_centroides_cached()
    return region_insights(cent)


@app.get("/api/atd/catalogo")
def atd_catalogo_endpoint() -> dict:
    return cargar_catalogo_atd()


@app.get("/api/atd/archivo/{region}/{path:path}")
def atd_archivo_endpoint(region: str, path: str) -> FileResponse:
    archivo = resolver_archivo_atd(region, path)
    if not archivo:
        raise HTTPException(404, "Archivo ATD no encontrado")
    media = "application/pdf" if archivo.suffix.lower() == ".pdf" else "text/html"
    return FileResponse(archivo, media_type=media, filename=archivo.name)


@app.get("/api/deforestacion/vectors")
def deforestacion_vectors_endpoint(
    departamento: str = Query("loreto"),
    ambito: str = Query("acr"),
    acr: list[str] | None = Query(None),
    anno_desde: int | None = Query(None, ge=2001, le=2030),
    anno_hasta: int | None = Query(None, ge=2001, le=2030),
    limit: int = Query(0, ge=0, le=50000),
) -> dict:
    """Polígonos MonitoreoDeforestacionAcumulado (Loreto)."""
    return load_acumulado_vectors(
        departamento=departamento,
        ambito=ambito or "acr",
        acrs=acr,
        anno_desde=anno_desde,
        anno_hasta=anno_hasta,
        limit=limit,
    )


@app.get("/api/deforestacion/centroides")
def centroides_endpoint(
    departamento: str = Query("todos"),
    ambito: str = Query("acr"),
    acr: list[str] | None = Query(None),
    anno_desde: int | None = Query(None, ge=2001, le=2030),
    anno_hasta: int | None = Query(None, ge=2001, le=2030),
    limit: int = Query(0, ge=0, le=100000),
) -> dict:
    df = _get_centroides_cached()
    if df is None or df.empty:
        return {"count": 0, "returned": 0, "resumen": {}, "data": []}
    filtered = filtrar_centroides(
        df,
        departamento,
        ambito or "acr",
        acr,
        anno_desde=anno_desde,
        anno_hasta=anno_hasta,
    )
    subset = filtered if limit <= 0 else filtered.head(limit)
    return {
        "count": len(df),
        "filtered": len(filtered),
        "returned": len(subset),
        "resumen": _APP_STATE.get("centroides_resumen", {}),
        "data": dataframe_to_records(subset),
    }


@app.get("/api/catalogo/{tabla}")
def catalogo_tabla(tabla: str) -> dict:
    catalogo = _APP_STATE.get("catalogo", {})
    if tabla not in catalogo:
        return {"error": f"Tabla '{tabla}' no encontrada", "disponibles": sorted(catalogo.keys())}
    return {"tabla": tabla, "data": dataframe_to_records(catalogo[tabla])}


# --- Descargas (equivalente downloadHandler en server.R) ---
_MAP_PDF: dict[str, tuple[str, str]] = {
    "aa": ("MAPA_ACR_AA.pdf", "MAPA_ACR_Ampiyacu_Apayacu"),
    "anpch": ("MAPA_ACR_ANPCH.pdf", "MAPA_ACR_Alto_Nanay"),
    "ctt": ("MAPA_ACR_CTT.pdf", "MAPA_ACR_Tamshiyacu_Tahuayo"),
    "mk": ("MAPA_ACR_MK.pdf", "MAPA_ACR_Maijuna_Kichwa"),
    "chq": ("MAPA_CHOQUE_DEF.pdf", "MAPA_ACR_Choquequirao"),
    "chu": ("MAPA_CHUYAPI_ANEXO2.pdf", "MAPA_ACR_Chuyapi_Urusayhua"),
    "qk": ("MAPA_QEROS_ANEXO3.pdf", "MAPA_ACR_Qeros_Kosnipata"),
    "boshumi": ("25NOV17_Mapa_de_deforestación_en_ACR_BOSHUMI_y_su_ZI_A2.pdf", "MAPA_ACR_BOSHUMI"),
    "ce": ("25NOV17_Mapa_de_deforestación_en_ACR_CE_y_su_ZI_A2.pdf", "MAPA_ACR_Cordillera_Escalera"),
}


def _map_pdf_path(filename: str) -> Path | None:
    if not _WWW_MAPAS.exists():
        return None
    direct = _WWW_MAPAS / filename
    if direct.exists():
        return direct
    stem = filename.split(".")[0][:20]
    for candidate in _WWW_MAPAS.glob("*.pdf"):
        if stem in candidate.name or candidate.name.startswith(stem[:12]):
            return candidate
    return None


@app.get("/api/descargas/mapa/{map_id}")
def descargar_mapa_pdf(map_id: str) -> FileResponse:
    entry = _MAP_PDF.get(map_id.lower())
    if not entry:
        raise HTTPException(404, "Mapa no encontrado")
    path = _map_pdf_path(entry[0])
    if not path:
        raise HTTPException(404, "Mapa no disponible en este momento")
    out_name = f"{entry[1]}_{date.today().isoformat()}.pdf"
    return FileResponse(path, media_type="application/pdf", filename=out_name)


@app.get("/api/descargas/datos")
def descargar_datos_completo() -> StreamingResponse:
    """ZIP con cache CSV/GeoJSON — equivalente a btn_descargar_datos_completo."""
    cache = _PROJECT_ROOT / "data" / "cache"
    buf = io.BytesIO()
    n_files = 0
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        if cache.exists():
            for f in cache.rglob("*"):
                if f.is_file():
                    zf.write(f, f.relative_to(cache).as_posix())
                    n_files += 1
        readme = (
            "Dashboard ACR - paquete de datos exportados\n"
            f"Fecha: {date.today().isoformat()}\n"
            "Incluye centroides_deforestacion.csv y geojson/ si fueron generados con exportar_datos.bat\n"
        )
        zf.writestr("LEEME.txt", readme)
    if n_files == 0:
        raise HTTPException(404, "No hay datos en cache. Ejecute exportar_datos.bat primero.")
    buf.seek(0)
    fname = f"ACR_dashboard_datos_{date.today().isoformat()}.zip"
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


# --- Archivos estáticos (mapas Shiny www/mapas) ---
_ATD_REPORTES = _PROJECT_ROOT / "www" / "reportes_atd"
if _ATD_REPORTES.exists():
    app.mount("/reportes_atd", StaticFiles(directory=str(_ATD_REPORTES)), name="reportes_atd")

if _WWW_MAPAS.exists():
    app.mount("/mapas", StaticFiles(directory=str(_WWW_MAPAS)), name="mapas")

if _FRONTEND_DIR.exists():
    app.mount("/assets", StaticFiles(directory=str(_FRONTEND_DIR / "assets")), name="assets")

    @app.get("/favicon.ico", include_in_schema=False)
    def favicon():
        return FileResponse(_FRONTEND_DIR / "index.html")  # evita 404 en logs

    @app.get("/")
    def index():
        return FileResponse(
            _FRONTEND_DIR / "index.html",
            headers={
                "Cache-Control": "no-cache, no-store, must-revalidate",
                "Pragma": "no-cache",
                "Expires": "0",
            },
        )
else:

    @app.get("/")
    def index_missing():
        return {
            "mensaje": "Frontend no encontrado. Verifique la carpeta /frontend.",
            "api_docs": "/docs",
        }
