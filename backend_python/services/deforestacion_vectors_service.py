"""Polígonos MonitoreoDeforestacionAcumulado (Loreto, San Martín, Cusco)."""
from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Iterator

from core.config import PROJECT_ROOT

ATD_ROOT = PROJECT_ROOT / "www" / "reportes_atd"

# codigo dashboard → (departamento_folder, slug archivo)
CODIGO_SLUGS: dict[str, tuple[str, str]] = {
    # Loreto
    "ACR_AA": ("loreto", "ampiyacu_apayacu"),
    "ACR_ANPCH": ("loreto", "nanay"),
    "ACR_MK": ("loreto", "maijuna_kichwa"),
    "ACR_CTT": ("loreto", "comunal_tahuayo"),
    "ZI_AA": ("loreto", "zi_aa"),
    "ZI_ANPCH": ("loreto", "zi_anpch"),
    "ZI_CTT": ("loreto", "zi_ctt"),
    "ZI_MK": ("loreto", "zi_mk"),
    # San Martín
    "ACR_BSM": ("san_martin", "bosques_shunte"),
    "ACR_CE": ("san_martin", "cordillera_escalera"),
    "ZI_BSM": ("san_martin", "zi_bsm"),
    "ZI_CE": ("san_martin", "zi_ce"),
    # Cusco
    "ACR_CHQ": ("cusco", "choquequirao"),
    "ACR_CHU": ("cusco", "chuyapi_urusayhua"),
    "ACR_QK": ("cusco", "qeros_kosnipata"),
    "ZI_CHQ": ("cusco", "zi_chq"),
    "ZI_CHU": ("cusco", "zi_chu"),
    "ZI_QK": ("cusco", "zi_qk"),
}

DEPT_CODES: dict[str, set[str]] = {
    "loreto": {c for c, (d, _) in CODIGO_SLUGS.items() if d == "loreto"},
    "san_martin": {c for c, (d, _) in CODIGO_SLUGS.items() if d == "san_martin"},
    "cusco": {c for c, (d, _) in CODIGO_SLUGS.items() if d == "cusco"},
}

VECTOR_DEPTOS = set(DEPT_CODES.keys())
LORETO_CODIGOS = DEPT_CODES["loreto"]  # compat exports antiguos
ALL_VECTOR_CODIGOS = set(CODIGO_SLUGS.keys())

_GEOJSON_CACHE: dict[str, dict] = {}
_PROPS_CACHE: dict[str, list[dict]] = {}
# En Render free (~512 MB) cachear GeoJSON grandes tumba el proceso (502).
_MAX_GEOJSON_CACHE_BYTES = 3_500_000

_EMPTY_KPIS = {
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

# Dominio GDB CausaDeforestacion_1 (md_causa)
MD_CAUSA_NOMBRES: dict[int, str] = {
    1: "Agricultura",
    2: "Ganadería",
    3: "Extracción forestal",
    4: "Extracción de fauna",
    5: "Hidrobiológicos",
    6: "Minería",
    7: "Hidrocarburos",
    8: "Turismo",
    9: "Energía",
    10: "Transporte",
    11: "Ocupación humana",
    12: "Restos arqueológicos",
    13: "Otros",
    14: "Natural",
    15: "Incendio Antrópico",
    99: "Falsa alerta",
}

# Dominio GDB FuenteDeforestacion_1 (md_fuente)
MD_FUENTE_NOMBRES: dict[int, str] = {
    1: "Planet",
    2: "GLAD S2",
    3: "PNCB Landsat",
    4: "PeruSAT-1",
    5: "SPOT",
    6: "WorldView",
    7: "Sentinel-1",
    8: "Global Forest Watch",
    9: "Sentinel-2",
    10: "CBERS-4",
}

# Dominio GDB zonificación ACR (md_zonif)
MD_ZONIF_NOMBRES: dict[str, str] = {
    "S": "Zona Silvestre",
    "AD": "Zona de Aprovechamiento Directo",
    "T": "Zona de Uso Turístico y Recreativo",
    "PE": "Zona de Protección Especial",
    "RC": "Zona de Recuperación",
    "UH": "Zona de Uso Especial",
}

ACR_NOMBRES_COMPLETOS: dict[str, str] = {
    "ACR_AA": "ACR Ampiyacu Apayacu",
    "ACR_ANPCH": "ACR Alto Nanay - Pintuyacu Chambira",
    "ACR_CTT": "ACR Comunal Tamshiyacu Tahuayo",
    "ACR_MK": "ACR Maijuna Kichwa",
    "ACR_BSM": "ACR Bosques de Shunté y Mishollo",
    "ACR_CE": "ACR Cordillera Escalera",
    "ACR_CHQ": "ACR Choquequirao",
    "ACR_CHU": "ACR Chuyapi Urusayhua",
    "ACR_QK": "ACR Q'eros Kosñipata",
    "ZI_AA": "ZI Ampiyacu Apayacu",
    "ZI_ANPCH": "ZI Alto Nanay - Pintuyacu Chambira",
    "ZI_CTT": "ZI Comunal Tamshiyacu Tahuayo",
    "ZI_MK": "ZI Maijuna Kichwa",
    "ZI_BSM": "ZI Bosques de Shunté y Mishollo",
    "ZI_CE": "ZI Cordillera Escalera",
    "ZI_CHQ": "ZI Choquequirao",
    "ZI_CHU": "ZI Chuyapi Urusayhua",
    "ZI_QK": "ZI Q'eros Kosñipata",
}


def loreto_en_alcance(departamento: str, acrs: list[str] | None) -> bool:
    """Compat: True si Loreto entra en el filtro (también usado en main)."""
    return vectors_en_alcance(departamento, acrs, only="loreto")


def vectors_en_alcance(
    departamento: str,
    acrs: list[str] | None,
    only: str | None = None,
) -> bool:
    deptos = {only} if only else VECTOR_DEPTOS
    if departamento in deptos:
        return True
    if departamento != "todos":
        return False
    if not acrs:
        return True
    codes = set()
    for d in deptos:
        codes |= DEPT_CODES[d]
    return any(c in codes for c in acrs)


def _safe_float(val, default: float = 0.0) -> float:
    """Convierte a float; None / NaN / Inf / 'nan' → default (no propaga nan a KPIs)."""
    if val is None:
        return default
    if isinstance(val, str):
        s = val.strip().lower()
        if not s or s in {"nan", "none", "null", "inf", "-inf", "+inf"}:
            return default
    try:
        x = float(val)
    except (TypeError, ValueError):
        return default
    if math.isnan(x) or math.isinf(x):
        return default
    return x


def _causa_code(val) -> int | None:
    try:
        if val is None or (isinstance(val, float) and math.isnan(val)):
            return None
        return int(float(val))
    except (TypeError, ValueError):
        return None


def _causa_nombre(val) -> str:
    code = _causa_code(val)
    if code is None:
        s = str(val or "").strip()
        if s and s.lower() not in {"nan", "none", "null", ""}:
            # Ya viene texto (centroides legacy)
            return s
        return "Sin especificar"
    return MD_CAUSA_NOMBRES.get(code, f"Causa {code}")


def _fuente_nombre(val) -> str:
    code = _causa_code(val)  # same int parse
    if code is None:
        s = str(val or "").strip()
        return s if s and s.lower() not in {"nan", "none", "null"} else ""
    return MD_FUENTE_NOMBRES.get(code, str(code))


def _zonif_nombre(val) -> str:
    if val is None:
        return ""
    s = str(val).strip()
    if not s or s.lower() in {"none", "nan", "n/a", "null"}:
        return ""
    if s in MD_ZONIF_NOMBRES:
        return MD_ZONIF_NOMBRES[s]
    # Alias comunes del dominio
    aliases = {
        "zona de uso directo": "Zona de Aprovechamiento Directo",
        "no zonificado": "No zonificado",
        "no zonificada": "No zonificado",
    }
    low = s.lower()
    if low in aliases:
        return aliases[low]
    # Valores antiguos erróneos: nombre del ACR en "sector"
    if low.startswith("acr ") or low.startswith("zi ") or low.startswith("acr_") or low.startswith("zi_"):
        return ""
    if "zona" in low or "silvestre" in low or "aprovech" in low or "turist" in low or "zonific" in low:
        return s
    return ""


def _nombre_acr(codigo: str, fallback: str | None = None) -> str:
    if codigo and codigo in ACR_NOMBRES_COMPLETOS:
        return ACR_NOMBRES_COMPLETOS[codigo]
    fb = (fallback or "").strip()
    return fb or (codigo or "")


def _tipo_desde_causa(val, tipo_fallback: str | None = None) -> str:
    """Clasifica con md_causa (fuente oficial). 14=Natural, 99=Falsa, resto=Antrópico."""
    code = _causa_code(val)
    if code == 14:
        return "Natural"
    if code == 99:
        return "Falsa alerta"
    if code is not None:
        return "Antropogenico"
    t = str(tipo_fallback or "").strip().lower()
    if "natural" in t:
        return "Natural"
    if "falsa" in t:
        return "Falsa alerta"
    return "Antropogenico"


def _clasificar_tipo(tipo: str, causa=None) -> str:
    if causa is not None and _causa_code(causa) is not None:
        t = _tipo_desde_causa(causa).lower()
        if "natural" in t:
            return "natural"
        if "falsa" in t:
            return "falsa"
        return "antropico"
    t = str(tipo or "").strip().lower()
    if "natural" in t:
        return "natural"
    if "falsa" in t:
        return "falsa"
    return "antropico"


def _read_geojson(path: Path) -> dict:
    """Carga GeoJSON; solo cachea archivos chicos para no reventar memoria en Render."""
    key = str(path.resolve())
    cached = _GEOJSON_CACHE.get(key)
    if cached is not None:
        return cached
    raw = path.read_bytes()
    data = json.loads(raw.decode("utf-8"))
    if len(raw) <= _MAX_GEOJSON_CACHE_BYTES:
        _GEOJSON_CACHE[key] = data
    return data


def _props_list_for_file(path: Path, codigo: str) -> list[dict]:
    """Solo atributos (sin geometrías) — liviano para KPIs/series."""
    key = f"props::{path.resolve()}"
    cached = _PROPS_CACHE.get(key)
    if cached is not None:
        return cached
    data = json.loads(path.read_text(encoding="utf-8"))
    out: list[dict] = []
    for f in data.get("features") or []:
        raw = f.get("properties") or {}
        if codigo.startswith("ACR_") and raw.get("en_acr") is False:
            continue
        anno = raw.get("anno")
        if anno is None:
            continue
        try:
            y = int(anno)
        except (TypeError, ValueError):
            continue
        causa = raw.get("causa")
        out.append(
            {
                "codigo": codigo,
                "area_ha": raw.get("area_ha"),
                "tipo": _tipo_desde_causa(causa, raw.get("tipo")),
                "causa": causa,
                "causa_nombre": _causa_nombre(causa),
                "anno": y,
                "sector": raw.get("sector"),
            }
        )
    _PROPS_CACHE[key] = out
    return out


def warmup_acumulado_cache(ambito: str = "ambos") -> int:
    """Precarga índice de propiedades (no geometrías) para KPIs rápidos."""
    n = 0
    for folder, slug, codigo in _slugs_for_filters("todos", ambito, None):
        path = ATD_ROOT / folder / "acumulado" / f"{slug}.geojson"
        if not path.exists():
            continue
        _props_list_for_file(path, codigo)
        n += 1
    return n


def _sumar_props(props_list: list[dict]) -> tuple[float, float, float, float, dict[str, float]]:
    """Suma ha por categoría; el dict es causas antrópicas (md_causa → nombre)."""
    ant = nat = fal = 0.0
    causas_ant: dict[str, float] = {}
    for p in props_list:
        area = _safe_float(p.get("area_ha"))
        cat = _clasificar_tipo(p.get("tipo"), p.get("causa"))
        if cat == "natural":
            nat += area
        elif cat == "falsa":
            fal += area
        else:
            ant += area
            nombre = _causa_nombre(p.get("causa"))
            if nombre in {"Natural", "Falsa alerta"}:
                nombre = "Otros"
            causas_ant[nombre] = causas_ant.get(nombre, 0.0) + area
    total = ant + nat + fal
    return total, ant, nat, fal, causas_ant


def _sumar_features(features: list[dict]) -> tuple[float, float, float, float, dict[str, float]]:
    return _sumar_props([(f.get("properties") or {}) for f in features])


def _kpis_from_props(props_list: list[dict]) -> dict:
    if not props_list:
        return dict(_EMPTY_KPIS)
    total, ant, nat, fal, causas_ant = _sumar_props(props_list)

    def _pct(part: float) -> float:
        return round((part / total) * 100, 1) if total > 0 else 0.0

    if causas_ant:
        causa = max(causas_ant, key=causas_ant.get)
        causa_ha = _safe_float(causas_ant[causa])
    else:
        causa = "Sin datos"
        causa_ha = 0.0

    return {
        "total_hectareas": round(total, 2),
        "total_antropico": round(ant, 2),
        "total_natural": round(nat, 2),
        "total_falsa": round(fal, 2),
        "pct_antropico": _pct(ant),
        "pct_natural": _pct(nat),
        "pct_falsa": _pct(fal),
        "causa_principal": causa,
        "causa_principal_ha": round(causa_ha, 2),
        "causa_principal_pct": _pct(causa_ha),
    }


def _kpis_from_features(features: list[dict]) -> dict:
    return _kpis_from_props([(f.get("properties") or {}) for f in features])


def _merge_kpis(a: dict, b: dict) -> dict:
    total = _safe_float(a.get("total_hectareas")) + _safe_float(b.get("total_hectareas"))
    ant = _safe_float(a.get("total_antropico")) + _safe_float(b.get("total_antropico"))
    nat = _safe_float(a.get("total_natural")) + _safe_float(b.get("total_natural"))
    fal = _safe_float(a.get("total_falsa")) + _safe_float(b.get("total_falsa"))

    def _pct(part: float) -> float:
        return round((part / total) * 100, 1) if total > 0 else 0.0

    def _causa_ok(nombre: str, ha: float) -> bool:
        n = str(nombre or "").strip().lower()
        if ha <= 0:
            return False
        if not n or n in {
            "sin datos",
            "sin especificar",
            "n/a",
            "na",
            "none",
            "null",
            "nan",
        }:
            return False
        return True

    ha_a = _safe_float(a.get("causa_principal_ha"))
    ha_b = _safe_float(b.get("causa_principal_ha"))
    causa_a = str(a.get("causa_principal") or "Sin datos")
    causa_b = str(b.get("causa_principal") or "Sin datos")
    ok_a = _causa_ok(causa_a, ha_a)
    ok_b = _causa_ok(causa_b, ha_b)

    if ok_a and ok_b:
        # Misma causa → sumar; si distinta, quedarse con la de mayor ha
        if causa_a.strip().lower() == causa_b.strip().lower():
            causa, causa_ha = causa_a, ha_a + ha_b
        elif ha_a >= ha_b:
            causa, causa_ha = causa_a, ha_a
        else:
            causa, causa_ha = causa_b, ha_b
    elif ok_a:
        causa, causa_ha = causa_a, ha_a
    elif ok_b:
        causa, causa_ha = causa_b, ha_b
    else:
        causa, causa_ha = "Sin datos", 0.0

    return {
        "total_hectareas": round(total, 2),
        "total_antropico": round(ant, 2),
        "total_natural": round(nat, 2),
        "total_falsa": round(fal, 2),
        "pct_antropico": _pct(ant),
        "pct_natural": _pct(nat),
        "pct_falsa": _pct(fal),
        "causa_principal": causa,
        "causa_principal_ha": round(causa_ha, 2),
        "causa_principal_pct": _pct(causa_ha),
    }


def _anno_range(anno_desde: int | None, anno_hasta: int | None) -> tuple[int, int]:
    lo = anno_desde if anno_desde is not None else 2001
    hi = anno_hasta if anno_hasta is not None else 2026
    if lo > hi:
        lo, hi = hi, lo
    return lo, hi


def _any_acumulado_available(
    departamento: str,
    ambito: str,
    acrs: list[str] | None,
) -> bool:
    targets = _ambito_targets(departamento, ambito, acrs)
    if not targets:
        return False
    for folder, slug, _ in targets:
        if (ATD_ROOT / folder / "acumulado" / f"{slug}.geojson").exists():
            return True
    return False


def iter_acumulado_properties(
    departamento: str = "loreto",
    ambito: str = "acr",
    acrs: list[str] | None = None,
    anno_desde: int | None = None,
    anno_hasta: int | None = None,
) -> Iterator[dict]:
    """Yields property dicts (codigo, area_ha, tipo, anno, sector) without geometries."""
    targets = _ambito_targets(departamento, ambito, acrs)
    lo, hi = _anno_range(anno_desde, anno_hasta)

    for folder, slug, codigo in targets:
        path = ATD_ROOT / folder / "acumulado" / f"{slug}.geojson"
        if not path.exists():
            continue
        for row in _props_list_for_file(path, codigo):
            y = row.get("anno")
            if y is None or y < lo or y > hi:
                continue
            yield row


def kpis_desde_acumulado(
    departamento: str = "loreto",
    ambito: str = "acr",
    acrs: list[str] | None = None,
    anno_desde: int | None = None,
    anno_hasta: int | None = None,
) -> dict | None:
    roll = _kpis_from_rollup(departamento, ambito, acrs, anno_desde, anno_hasta)
    if roll is not None:
        return roll
    if not _any_acumulado_available(departamento, ambito, acrs):
        return None
    props = list(
        iter_acumulado_properties(departamento, ambito, acrs, anno_desde, anno_hasta)
    )
    return _kpis_from_props(props)


_ROLLUP_CACHE: dict | None = None


def _load_kpi_rollup() -> dict | None:
    global _ROLLUP_CACHE
    if _ROLLUP_CACHE is not None:
        return _ROLLUP_CACHE or None
    path = ATD_ROOT / "kpi_rollup.json"
    if not path.exists():
        _ROLLUP_CACHE = {}
        return None
    try:
        _ROLLUP_CACHE = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        _ROLLUP_CACHE = {}
        return None
    return _ROLLUP_CACHE


def _kpis_from_rollup(
    departamento: str,
    ambito: str,
    acrs: list[str] | None,
    anno_desde: int | None,
    anno_hasta: int | None,
) -> dict | None:
    data = _load_kpi_rollup()
    if not data or not data.get("rows"):
        return None
    targets = {c for _, _, c in _ambito_targets(departamento, ambito, acrs)}
    if not targets:
        return None
    lo, hi = _anno_range(anno_desde, anno_hasta)
    props: list[dict] = []
    for r in data["rows"]:
        codigo = r.get("codigo")
        if codigo not in targets:
            continue
        try:
            y = int(r.get("anno"))
        except (TypeError, ValueError):
            continue
        if y < lo or y > hi:
            continue
        props.append(
            {
                "codigo": codigo,
                "area_ha": r.get("ha"),
                "tipo": r.get("tipo"),
                "causa": r.get("causa"),
                "causa_nombre": _causa_nombre(r.get("causa")),
                "anno": y,
            }
        )
    if not props:
        return _EMPTY_KPIS.copy()
    return _kpis_from_props(props)


def causas_antropicas_desde_acumulado(
    departamento: str = "loreto",
    ambito: str = "acr",
    acrs: list[str] | None = None,
    anno_desde: int | None = None,
    anno_hasta: int | None = None,
) -> list[dict] | None:
    """Lista de causas antrópicas (nombre, ha) ordenada mayor→menor desde GDB/GeoJSON."""
    if not _any_acumulado_available(departamento, ambito, acrs):
        return None
    props = list(
        iter_acumulado_properties(departamento, ambito, acrs, anno_desde, anno_hasta)
    )
    if not props:
        return []
    _, _, _, _, causas_ant = _sumar_props(props)
    return [
        {"Causa": k, "Area_Ha": round(v, 2)}
        for k, v in sorted(causas_ant.items(), key=lambda x: x[1], reverse=True)
        if v > 0
    ]


def tabla_acrs_desde_acumulado(
    departamento: str = "loreto",
    ambito: str = "acr",
    acrs: list[str] | None = None,
    anno_desde: int | None = None,
    anno_hasta: int | None = None,
) -> list[dict] | None:
    """Filas por ACR (Total / Antrópico / Natural) respetando el período."""
    if not _any_acumulado_available(departamento, ambito, acrs):
        return None
    props = list(
        iter_acumulado_properties(departamento, ambito, acrs, anno_desde, anno_hasta)
    )
    from services.decretos_service import ACR_DECRETOS

    nombres = dict(zip(ACR_DECRETOS["codigo"], ACR_DECRETOS["nombre_completo"]))
    if acrs:
        codes = [c for _, _, c in _ambito_targets(departamento, ambito, acrs)]
    else:
        codes = sorted({p.get("codigo") for p in props if p.get("codigo")})
    rows: list[dict] = []
    for codigo in codes:
        if not codigo or str(codigo).startswith("ZI_"):
            if ambito == "acr":
                continue
        if ambito == "acr" and str(codigo).startswith("ZI_"):
            continue
        if ambito == "zi" and not str(codigo).startswith("ZI_"):
            continue
        sub = [p for p in props if p.get("codigo") == codigo]
        if not sub:
            continue
        total, ant, nat, fal, _ = _sumar_props(sub)
        # Total mostrado = antrópico + natural (sin falsa alerta), alineado a KPIs/gráficos
        total_vis = round(ant + nat, 2)
        nombre = nombres.get(codigo) or _nombre_acr(codigo)
        rows.append(
            {
                "Nombre": nombre if str(nombre).startswith(("ACR", "ZI")) else f"ACR {nombre}",
                "Total": total_vis,
                "Antropico": round(ant, 2),
                "Perdida_natural": round(nat, 2),
                "Falsa_alerta": round(fal, 2),
                "codigo": codigo,
            }
        )
    rows.sort(key=lambda r: float(r.get("Total") or 0), reverse=True)
    return rows


def serie_anual_desde_acumulado(
    departamento: str = "loreto",
    ambito: str = "acr",
    acrs: list[str] | None = None,
    anno_desde: int | None = None,
    anno_hasta: int | None = None,
) -> list[dict] | None:
    """Serie anual total / antrópico / natural desde GeoJSON acumulado."""
    if not _any_acumulado_available(departamento, ambito, acrs):
        return None
    props = list(
        iter_acumulado_properties(departamento, ambito, acrs, anno_desde, anno_hasta)
    )
    if not props:
        return []
    by_year: dict[int, dict[str, float]] = {}
    for p in props:
        y = p.get("anno")
        if y is None:
            continue
        try:
            yi = int(y)
        except (TypeError, ValueError):
            continue
        bucket = by_year.setdefault(yi, {"antropico": 0.0, "natural": 0.0, "total": 0.0})
        area = _safe_float(p.get("area_ha"))
        cat = _clasificar_tipo(p.get("tipo"), p.get("causa"))
        if cat == "natural":
            bucket["natural"] += area
        elif cat == "falsa":
            continue
        else:
            bucket["antropico"] += area
        bucket["total"] = bucket["antropico"] + bucket["natural"]
    return [
        {
            "Anio": y,
            "Deforestacion_ha": round(v["total"], 2),
            "Antropico_ha": round(v["antropico"], 2),
            "Natural_ha": round(v["natural"], 2),
        }
        for y, v in sorted(by_year.items())
    ]


def graficos_desde_acumulado(
    departamento: str = "loreto",
    ambito: str = "acr",
    acrs: list[str] | None = None,
    anno_desde: int | None = None,
    anno_hasta: int | None = None,
) -> dict | None:
    if not _any_acumulado_available(departamento, ambito, acrs):
        return None

    props = list(
        iter_acumulado_properties(departamento, ambito, acrs, anno_desde, anno_hasta)
    )
    n_filtros = len(acrs) if acrs else 0
    out: dict = {
        "modo": "nacional",
        "composicion": None,
        "causas_top5": None,
        "distribucion": None,
        "comparativa": None,
    }
    if not props:
        return out

    if n_filtros == 1:
        out["modo"] = "individual"
        total, ant, nat, fal, causas_ant = _sumar_props(props)
        out["composicion"] = [
            {"Categoria": "Origen antrópico", "Hectareas": ant, "Color": "#d9534f"},
            {"Categoria": "Natural", "Hectareas": nat, "Color": "#5cb85c"},
            {"Categoria": "Falsa alerta", "Hectareas": fal, "Color": "#f0ad4e"},
        ]
        out["distribucion"] = {
            "total": round(ant + nat, 2),
            "items": [
                {"Categoria": "Origen antrópico", "Hectareas": ant, "Porcentaje": round((ant / (ant + nat)) * 100, 1) if (ant + nat) else 0, "Color": "#d9534f"},
                {"Categoria": "Natural", "Hectareas": nat, "Porcentaje": round((nat / (ant + nat)) * 100, 1) if (ant + nat) else 0, "Color": "#5cb85c"},
            ],
        }
        if causas_ant:
            top = sorted(causas_ant.items(), key=lambda x: x[1], reverse=True)
            out["causas_top5"] = [{"Causa": k, "Area_Ha": round(v, 2)} for k, v in top]
    elif n_filtros >= 2:
        out["modo"] = "comparativa"
        from services.decretos_service import ACR_DECRETOS

        nombres = dict(zip(ACR_DECRETOS["codigo"], ACR_DECRETOS["nombre_completo"]))
        rows = []
        for codigo in acrs or []:
            if codigo not in ALL_VECTOR_CODIGOS:
                continue
            suffix = codigo.split("_", 1)[1]
            sub = [p for p in props if str(p.get("codigo") or "").split("_", 1)[-1] == suffix]
            if not sub:
                continue
            total, ant, nat, fal, _ = _sumar_props(sub)
            nombre = nombres.get(codigo, codigo).replace("ACR ", "")
            rows.append(
                {
                    "Nombre_corto": nombre,
                    "Antropico": ant,
                    "Perdida_natural": nat,
                    "Falsa_alerta": fal,
                }
            )
        if rows:
            out["comparativa"] = rows

    return out


def _slugs_for_filters(
    departamento: str,
    ambito: str,
    acrs: list[str] | None,
) -> list[tuple[str, str, str]]:
    """Lista de (departamento_folder, slug, codigo)."""
    if acrs:
        out = []
        for c in acrs:
            if c in CODIGO_SLUGS:
                folder, slug = CODIGO_SLUGS[c]
                if departamento in ("todos", folder) or (
                    departamento == "san_martin" and folder == "san_martin"
                ) or (departamento == "cusco" and folder == "cusco") or (
                    departamento == "loreto" and folder == "loreto"
                ):
                    out.append((folder, slug, c))
        return out

    if departamento == "todos":
        codes = set(ALL_VECTOR_CODIGOS)
    elif departamento in DEPT_CODES:
        codes = set(DEPT_CODES[departamento])
    else:
        return []

    if ambito == "acr":
        codes = {c for c in codes if c.startswith("ACR_")}
    elif ambito == "zi":
        codes = {c for c in codes if c.startswith("ZI_")}

    return [(CODIGO_SLUGS[c][0], CODIGO_SLUGS[c][1], c) for c in sorted(codes)]


def _ambito_targets(
    departamento: str,
    ambito: str,
    acrs: list[str] | None,
) -> list[tuple[str, str, str]]:
    """Archivos a leer: con ACR seleccionada, el ámbito decide ACR, ZI o ambos."""
    if not acrs:
        return _slugs_for_filters(departamento, ambito, None)
    codes: list[str] = []
    for c in acrs:
        suffix = c.split("_", 1)[1] if "_" in c else c
        if ambito in ("acr", "ambos"):
            codes.append(f"ACR_{suffix}")
        if ambito in ("zi", "ambos"):
            codes.append(f"ZI_{suffix}")
    codes = [c for c in dict.fromkeys(codes) if c in CODIGO_SLUGS]
    return _slugs_for_filters(departamento, ambito, codes)


def load_acumulado_vectors(
    departamento: str = "loreto",
    ambito: str = "acr",
    acrs: list[str] | None = None,
    anno_desde: int | None = None,
    anno_hasta: int | None = None,
    limit: int = 0,
) -> dict:
    targets = _ambito_targets(departamento, ambito, acrs)
    if not targets:
        return {
            "type": "FeatureCollection",
            "features": [],
            "meta": {"source": "MonitoreoDeforestacionAcumulado", "available": False},
        }

    lo, hi = _anno_range(anno_desde, anno_hasta)

    existing = [
        (folder, slug, codigo)
        for folder, slug, codigo in targets
        if (ATD_ROOT / folder / "acumulado" / f"{slug}.geojson").exists()
    ]
    # ACR siempre (incluye Ampiyacu / Nanay / Escalera). ZI gigantes se omiten en vista amplia.
    if limit > 0 and not acrs:
        kept = []
        for t in existing:
            folder, slug, codigo = t
            path_fc = ATD_ROOT / folder / "acumulado" / f"{slug}.geojson"
            try:
                fsize = path_fc.stat().st_size
            except OSError:
                continue
            if codigo.startswith("ACR_"):
                kept.append(t)  # nunca omitir ACR
            elif fsize <= 8_000_000:
                kept.append(t)
            # ZI > 8MB (p.ej. zi_ce ~33MB) → fuera en vista amplia
        existing = kept
    # ACR primero para que Ampiyacu / Nanay / etc. entren sí o sí
    existing.sort(key=lambda t: (0 if t[2].startswith("ACR_") else 1, t[2]))
    # Cupo justo por archivo: cada ACR recibe su parte (evita que Cusco “coma” el cupo)
    per_file = 0
    if limit > 0 and existing:
        per_file = max(400, (limit + len(existing) - 1) // len(existing))

    features: list[dict] = []
    loaded_slugs: list[str] = []
    limited = False

    for folder, slug, codigo in existing:
        if limit > 0 and len(features) >= limit:
            limited = True
            break
        path_fc = ATD_ROOT / folder / "acumulado" / f"{slug}.geojson"
        loaded_slugs.append(f"{folder}/{slug}")
        try:
            data = _read_geojson(path_fc)
        except Exception as exc:  # noqa: BLE001
            print(f"Skip geojson {path_fc.name}: {exc}", flush=True)
            continue
        n_this = 0
        # Cupo por archivo independiente: no reducir si ya hay otros (garantiza Nanay/Ampiyacu)
        file_cap = per_file if limit > 0 else 0
        for f in data.get("features", []):
            if file_cap > 0 and n_this >= file_cap:
                limited = True
                break
            if limit > 0 and len(features) >= limit:
                limited = True
                break
            props = dict(f.get("properties") or {})
            # Acumulados ACR de Loreto traen copia de su ZI (en_acr=False); la ZI sale de zi_*.geojson
            if codigo.startswith("ACR_") and props.get("en_acr") is False:
                continue
            anno = props.get("anno")
            if anno is None:
                continue
            try:
                y = int(anno)
                if y < lo or y > hi:
                    continue
            except (TypeError, ValueError):
                continue
            props["codigo"] = codigo
            props["nombre_acr"] = _nombre_acr(codigo, props.get("nombre_acr"))
            props["tipo"] = _tipo_desde_causa(props.get("causa"), props.get("tipo"))
            # No mostrar falsas alertas en el mapa interactivo
            if props["tipo"] == "Falsa alerta":
                continue
            props["causa_nombre"] = _causa_nombre(props.get("causa"))
            props["fuente_nombre"] = _fuente_nombre(props.get("fuente"))
            # Sector = zonificación ACR (no el nombre del ACR)
            z = _zonif_nombre(props.get("zonificacion") or props.get("md_zonif") or props.get("sector"))
            props["zonificacion"] = z
            props["sector"] = z
            features.append({**f, "properties": props})
            n_this += 1
        # Liberar referencia a GeoJSON enorme no cacheado
        if str(path_fc.resolve()) not in _GEOJSON_CACHE:
            data = None

    if limit > 0 and len(features) > limit:
        features = features[:limit]
        limited = True

    return {
        "type": "FeatureCollection",
        "features": features,
        "meta": {
            "source": "MonitoreoDeforestacionAcumulado",
            "departamento": departamento,
            "count": len(features),
            "slugs": loaded_slugs,
            "anno_desde": lo,
            "anno_hasta": hi,
            "available": bool(loaded_slugs),
            "limited": limited,
            "limit": limit if limit > 0 else None,
            "per_file": per_file or None,
        },
    }
