"""Polígonos MonitoreoDeforestacionAcumulado (Loreto, San Martín, Cusco)."""
from __future__ import annotations

import json
import math
from pathlib import Path

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


def _clasificar_tipo(tipo: str) -> str:
    t = str(tipo or "").strip().lower()
    if "natural" in t:
        return "natural"
    if "falsa" in t:
        return "falsa"
    return "antropico"


def _sumar_features(features: list[dict]) -> tuple[float, float, float, float, dict[str, float]]:
    ant = nat = fal = 0.0
    sectores: dict[str, float] = {}
    for f in features:
        p = f.get("properties") or {}
        area = _safe_float(p.get("area_ha"))
        cat = _clasificar_tipo(p.get("tipo"))
        if cat == "natural":
            nat += area
        elif cat == "falsa":
            fal += area
        else:
            ant += area
            sec = str(p.get("sector") or "").strip()
            if not sec or sec.lower() in {"nan", "none", "null", "—", "-"}:
                sec = "Sin especificar"
            sectores[sec] = sectores.get(sec, 0.0) + area
    total = ant + nat + fal
    return total, ant, nat, fal, sectores


def _kpis_from_features(features: list[dict]) -> dict:
    if not features:
        return dict(_EMPTY_KPIS)
    total, ant, nat, fal, sectores = _sumar_features(features)

    def _pct(part: float) -> float:
        return round((part / total) * 100, 1) if total > 0 else 0.0

    if sectores:
        causa = max(sectores, key=sectores.get)
        causa_ha = _safe_float(sectores[causa])
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


def _merge_kpis(a: dict, b: dict) -> dict:
    total = _safe_float(a.get("total_hectareas")) + _safe_float(b.get("total_hectareas"))
    ant = _safe_float(a.get("total_antropico")) + _safe_float(b.get("total_antropico"))
    nat = _safe_float(a.get("total_natural")) + _safe_float(b.get("total_natural"))
    fal = _safe_float(a.get("total_falsa")) + _safe_float(b.get("total_falsa"))

    def _pct(part: float) -> float:
        return round((part / total) * 100, 1) if total > 0 else 0.0

    ha_a = _safe_float(a.get("causa_principal_ha"))
    ha_b = _safe_float(b.get("causa_principal_ha"))
    causa_a = str(a.get("causa_principal") or "Sin datos")
    causa_b = str(b.get("causa_principal") or "Sin datos")
    if causa_a == "Sin datos" or ha_a <= 0:
        causa, causa_ha = causa_b, ha_b
    elif causa_b == "Sin datos" or ha_b <= 0:
        causa, causa_ha = causa_a, ha_a
    elif ha_a >= ha_b:
        causa, causa_ha = causa_a, ha_a
    else:
        causa, causa_ha = causa_b, ha_b

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


def kpis_desde_acumulado(
    departamento: str = "loreto",
    ambito: str = "acr",
    acrs: list[str] | None = None,
    anno_desde: int | None = None,
    anno_hasta: int | None = None,
) -> dict | None:
    geo = load_acumulado_vectors(departamento, ambito, acrs, anno_desde, anno_hasta)
    if not geo["meta"].get("available"):
        return None
    return _kpis_from_features(geo.get("features") or [])


def graficos_desde_acumulado(
    departamento: str = "loreto",
    ambito: str = "acr",
    acrs: list[str] | None = None,
    anno_desde: int | None = None,
    anno_hasta: int | None = None,
) -> dict | None:
    geo = load_acumulado_vectors(departamento, ambito, acrs, anno_desde, anno_hasta)
    if not geo["meta"].get("available"):
        return None

    features = geo.get("features") or []
    n_filtros = len(acrs) if acrs else 0
    out: dict = {
        "modo": "nacional",
        "composicion": None,
        "causas_top5": None,
        "distribucion": None,
        "comparativa": None,
    }
    if not features:
        return out

    if n_filtros == 1:
        out["modo"] = "individual"
        total, ant, nat, fal, sectores = _sumar_features(features)
        out["composicion"] = [
            {"Categoria": "Antrópico", "Hectareas": ant, "Color": "#d9534f"},
            {"Categoria": "Natural", "Hectareas": nat, "Color": "#5cb85c"},
            {"Categoria": "Falsa Alerta", "Hectareas": fal, "Color": "#f0ad4e"},
        ]
        out["distribucion"] = {
            "total": total,
            "items": [
                {"Categoria": "Antrópico", "Hectareas": ant, "Porcentaje": round((ant / total) * 100, 1) if total else 0, "Color": "#d9534f"},
                {"Categoria": "Natural", "Hectareas": nat, "Porcentaje": round((nat / total) * 100, 1) if total else 0, "Color": "#5cb85c"},
                {"Categoria": "Falsa Alerta", "Hectareas": fal, "Porcentaje": round((fal / total) * 100, 1) if total else 0, "Color": "#f0ad4e"},
            ],
        }
        if sectores:
            top = sorted(sectores.items(), key=lambda x: x[1], reverse=True)[:5]
            out["causas_top5"] = [{"Causa": k, "Area_Ha": round(v, 2)} for k, v in top]
    elif n_filtros >= 2:
        out["modo"] = "comparativa"
        from services.decretos_service import ACR_DECRETOS

        nombres = dict(zip(ACR_DECRETOS["codigo"], ACR_DECRETOS["nombre_completo"]))
        rows = []
        for codigo in acrs or []:
            if codigo not in ALL_VECTOR_CODIGOS:
                continue
            sub = [f for f in features if (f.get("properties") or {}).get("codigo") == codigo]
            if not sub:
                continue
            total, ant, nat, fal, _ = _sumar_features(sub)
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


def load_acumulado_vectors(
    departamento: str = "loreto",
    ambito: str = "acr",
    acrs: list[str] | None = None,
    anno_desde: int | None = None,
    anno_hasta: int | None = None,
    limit: int = 0,
) -> dict:
    targets = _slugs_for_filters(departamento, ambito, acrs)
    if not targets:
        return {
            "type": "FeatureCollection",
            "features": [],
            "meta": {"source": "MonitoreoDeforestacionAcumulado", "available": False},
        }

    lo = anno_desde if anno_desde is not None else 2001
    hi = anno_hasta if anno_hasta is not None else 2026
    if lo > hi:
        lo, hi = hi, lo

    features: list[dict] = []
    loaded_slugs: list[str] = []
    for folder, slug, codigo in targets:
        path = ATD_ROOT / folder / "acumulado" / f"{slug}.geojson"
        if not path.exists():
            continue
        loaded_slugs.append(f"{folder}/{slug}")
        data = json.loads(path.read_text(encoding="utf-8"))
        for f in data.get("features", []):
            props = dict(f.get("properties") or {})
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
            features.append({**f, "properties": props})
            if limit > 0 and len(features) >= limit:
                break
        if limit > 0 and len(features) >= limit:
            break

    available = bool(loaded_slugs)
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
            "available": available,
        },
    }
