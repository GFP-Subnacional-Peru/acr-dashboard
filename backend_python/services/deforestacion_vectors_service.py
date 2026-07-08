"""Polígonos MonitoreoDeforestacionAcumulado (Loreto) para el mapa principal."""
from __future__ import annotations

import json
from pathlib import Path

from core.config import PROJECT_ROOT

ACUMULADO_DIR = PROJECT_ROOT / "www" / "reportes_atd" / "loreto" / "acumulado"

CODIGO_SLUGS: dict[str, str] = {
    "ACR_AA": "ampiyacu_apayacu",
    "ACR_ANPCH": "nanay",
    "ACR_MK": "maijuna_kichwa",
    "ACR_CTT": "comunal_tahuayo",
    "ZI_AA": "zi_aa",
    "ZI_ANPCH": "zi_anpch",
    "ZI_CTT": "zi_ctt",
    "ZI_MK": "zi_mk",
}

LORETO_ACR = {"ACR_AA", "ACR_ANPCH", "ACR_MK", "ACR_CTT"}
LORETO_ZI = {"ZI_AA", "ZI_ANPCH", "ZI_CTT", "ZI_MK"}
LORETO_CODIGOS = LORETO_ACR | LORETO_ZI
SLUG_TO_CODIGO = {v: k for k, v in CODIGO_SLUGS.items()}

_EMPTY_KPIS = {
    "total_hectareas": 0.0,
    "total_antropico": 0.0,
    "total_natural": 0.0,
    "total_falsa": 0.0,
    "pct_antropico": 0.0,
    "pct_natural": 0.0,
    "pct_falsa": 0.0,
    "causa_principal": "Sin datos",
}


def loreto_en_alcance(departamento: str, acrs: list[str] | None) -> bool:
    if departamento == "loreto":
        return True
    if departamento != "todos":
        return False
    if not acrs:
        return True
    return any(c in LORETO_CODIGOS for c in acrs)


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
        area = float(p.get("area_ha") or 0)
        cat = _clasificar_tipo(p.get("tipo"))
        if cat == "natural":
            nat += area
        elif cat == "falsa":
            fal += area
        else:
            ant += area
            sec = str(p.get("sector") or "Sin especificar").strip() or "Sin especificar"
            sectores[sec] = sectores.get(sec, 0.0) + area
    total = ant + nat + fal
    return total, ant, nat, fal, sectores


def _kpis_from_features(features: list[dict]) -> dict:
    if not features:
        return dict(_EMPTY_KPIS)
    total, ant, nat, fal, sectores = _sumar_features(features)

    def _pct(part: float) -> float:
        return round((part / total) * 100, 1) if total > 0 else 0.0

    causa = max(sectores, key=sectores.get) if sectores else "Sin datos"
    return {
        "total_hectareas": round(total, 2),
        "total_antropico": round(ant, 2),
        "total_natural": round(nat, 2),
        "total_falsa": round(fal, 2),
        "pct_antropico": _pct(ant),
        "pct_natural": _pct(nat),
        "pct_falsa": _pct(fal),
        "causa_principal": causa,
    }


def _merge_kpis(a: dict, b: dict) -> dict:
    total = float(a.get("total_hectareas") or 0) + float(b.get("total_hectareas") or 0)
    ant = float(a.get("total_antropico") or 0) + float(b.get("total_antropico") or 0)
    nat = float(a.get("total_natural") or 0) + float(b.get("total_natural") or 0)
    fal = float(a.get("total_falsa") or 0) + float(b.get("total_falsa") or 0)

    def _pct(part: float) -> float:
        return round((part / total) * 100, 1) if total > 0 else 0.0

    causa_a = str(a.get("causa_principal") or "Sin datos")
    causa_b = str(b.get("causa_principal") or "Sin datos")
    if causa_a == "Sin datos":
        causa = causa_b
    elif causa_b == "Sin datos":
        causa = causa_a
    else:
        causa = causa_a if float(a.get("total_antropico") or 0) >= float(b.get("total_antropico") or 0) else causa_b

    return {
        "total_hectareas": round(total, 2),
        "total_antropico": round(ant, 2),
        "total_natural": round(nat, 2),
        "total_falsa": round(fal, 2),
        "pct_antropico": _pct(ant),
        "pct_natural": _pct(nat),
        "pct_falsa": _pct(fal),
        "causa_principal": causa,
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
            if codigo not in LORETO_CODIGOS:
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
) -> list[str]:
    if departamento != "loreto":
        return []
    if acrs:
        return [CODIGO_SLUGS[c] for c in acrs if c in CODIGO_SLUGS]
    if ambito == "acr":
        codes = LORETO_ACR
    elif ambito == "zi":
        codes = LORETO_ZI
    else:
        codes = LORETO_ACR | LORETO_ZI
    return [CODIGO_SLUGS[c] for c in sorted(codes) if c in CODIGO_SLUGS]


def load_acumulado_vectors(
    departamento: str = "loreto",
    ambito: str = "acr",
    acrs: list[str] | None = None,
    anno_desde: int | None = None,
    anno_hasta: int | None = None,
    limit: int = 0,
) -> dict:
    slugs = _slugs_for_filters(departamento, ambito, acrs)
    if not slugs or not ACUMULADO_DIR.is_dir():
        return {
            "type": "FeatureCollection",
            "features": [],
            "meta": {"source": "MonitoreoDeforestacionAcumulado", "available": False},
        }

    lo = anno_desde if anno_desde is not None else 2001
    hi = anno_hasta if anno_hasta is not None else 2025
    if lo > hi:
        lo, hi = hi, lo

    features: list[dict] = []
    for slug in slugs:
        path = ACUMULADO_DIR / f"{slug}.geojson"
        if not path.exists():
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        for f in data.get("features", []):
            props = dict(f.get("properties") or {})
            anno = props.get("anno")
            if anno is not None:
                try:
                    y = int(anno)
                    if y < lo or y > hi:
                        continue
                except (TypeError, ValueError):
                    continue
            else:
                continue
            codigo = SLUG_TO_CODIGO.get(slug)
            if codigo:
                props["codigo"] = codigo
            feat = {**f, "properties": props}
            features.append(feat)
            if limit > 0 and len(features) >= limit:
                break
        if limit > 0 and len(features) >= limit:
            break

    return {
        "type": "FeatureCollection",
        "features": features,
        "meta": {
            "source": "MonitoreoDeforestacionAcumulado",
            "departamento": departamento,
            "count": len(features),
            "slugs": slugs,
            "anno_desde": lo,
            "anno_hasta": hi,
            "available": True,
        },
    }
