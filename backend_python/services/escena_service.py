"""Foto del recorte de un polígono, del año pedido.

Sentinel-2 desde 2018 y Landsat de 2001 a 2017. Cualquier fecha del año
sirve, siempre que la escena tenga 30% de nube o menos.
"""

from __future__ import annotations

import json
import math
import threading
import urllib.error
import urllib.request
from collections import OrderedDict
from dataclasses import dataclass
from urllib.parse import urlencode

_STAC = "https://planetarycomputer.microsoft.com/api/stac/v1/search"
_RENDER = "https://planetarycomputer.microsoft.com/api/data/v1/item/bbox"
_ANIO_SENTINEL = 2018
_NUBE_MAX = 30
_CACHE: OrderedDict[tuple, "Escena"] = OrderedDict()
_LOCK = threading.Lock()
_MAX_CACHE = 48


class EscenaNoDisponible(Exception):
    pass


@dataclass(frozen=True)
class Escena:
    body: bytes
    fecha: str
    sensor: str


def obtener_escena(
    anio: int,
    west: float,
    south: float,
    east: float,
    north: float,
    retro: bool = False,
) -> Escena:
    _validar(anio, west, south, east, north)
    key = (
        ("antes-2016" if retro else anio),
        round(west, 5),
        round(south, 5),
        round(east, 5),
        round(north, 5),
    )
    with _LOCK:
        previa = _CACHE.get(key)
        if previa is not None:
            _CACHE.move_to_end(key)
            return previa
    escena = (
        _buscar_mucho_antes(west, south, east, north)
        if retro
        else _buscar_y_recortar(anio, west, south, east, north)
    )
    with _LOCK:
        _CACHE[key] = escena
        _CACHE.move_to_end(key)
        while len(_CACHE) > _MAX_CACHE:
            _CACHE.popitem(last=False)
    return escena


def _validar(anio: int, west: float, south: float, east: float, north: float) -> None:
    if anio < 2001 or anio > 2030:
        raise EscenaNoDisponible("Año fuera del periodo.")
    if not all(math.isfinite(v) for v in (west, south, east, north)):
        raise EscenaNoDisponible("Recorte inválido.")
    if east <= west or north <= south:
        raise EscenaNoDisponible("Recorte inválido.")
    if east - west > 0.25 or north - south > 0.25:
        raise EscenaNoDisponible("Recorte demasiado amplio.")
    if west < -180 or east > 180 or south < -90 or north > 90:
        raise EscenaNoDisponible("Recorte inválido.")


def _buscar_y_recortar(anio: int, west: float, south: float, east: float, north: float) -> Escena:
    sentinel = anio >= _ANIO_SENTINEL
    coleccion = "sentinel-2-l2a" if sentinel else "landsat-c2-l2"
    sensor = "Sentinel-2" if sentinel else "Landsat"
    rasgos = _orden(
        _buscar(coleccion, [west, south, east, north], anio),
        sentinel,
    )
    for rasgo in rasgos[:2]:
        nube = (rasgo.get("properties") or {}).get("eo:cloud_cover")
        if not isinstance(nube, (int, float)) or nube > _NUBE_MAX:
            continue
        item = str(rasgo.get("id") or "")
        if not item:
            continue
        fecha = str((rasgo.get("properties") or {}).get("datetime") or "")[:10]
        cuerpo = _render(coleccion, item, west, south, east, north, sentinel)
        if cuerpo:
            return Escena(body=cuerpo, fecha=fecha, sensor=sensor)
    raise EscenaNoDisponible("No hay una escena con 30% de nube o menos en ese año.")


def _buscar_mucho_antes(west: float, south: float, east: float, north: float) -> Escena:
    """2016 y 2017 no se ven bien. La foto sale de 2005 a 2011, bastante antes."""
    bbox = [west, south, east, north]
    rasgos = _orden(
        _buscar(
            "landsat-c2-l2",
            bbox,
            2010,
            plataforma="landsat-5",
            inicio="2005-01-01T00:00:00Z",
            fin="2011-12-31T23:59:59Z",
        ),
        False,
    )
    for rasgo in rasgos[:3]:
        item = str(rasgo.get("id") or "")
        if not item.startswith("LT05"):
            continue
        fecha = str((rasgo.get("properties") or {}).get("datetime") or "")[:10]
        cuerpo = _render("landsat-c2-l2", item, west, south, east, north, False)
        if cuerpo:
            return Escena(body=cuerpo, fecha=fecha, sensor="Landsat")
    raise EscenaNoDisponible("No hay una escena clara de antes de 2016 en este recorte.")


def _buscar(
    coleccion: str,
    bbox: list[float],
    anio: int,
    plataforma: str | None = None,
    inicio: str | None = None,
    fin: str | None = None,
) -> list[dict]:
    consulta: dict = {"eo:cloud_cover": {"lte": _NUBE_MAX}}
    if plataforma:
        consulta["platform"] = {"eq": plataforma}
    cuerpo = {
        "collections": [coleccion],
        "bbox": bbox,
        "datetime": f"{inicio}/{fin}" if inicio and fin else f"{anio}-01-01T00:00:00Z/{anio}-12-31T23:59:59Z",
        "query": consulta,
        "sortby": [{"field": "properties.eo:cloud_cover", "direction": "asc"}],
        "limit": 12,
        "fields": {
            "include": ["id", "properties.datetime", "properties.eo:cloud_cover"],
            "exclude": ["geometry", "assets", "links", "bbox"],
        },
    }
    try:
        data = _json(_STAC, cuerpo, 12)
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError) as exc:
        print(f"Escena búsqueda {coleccion} {anio}: {exc}", flush=True)
        return []
    rasgos = data.get("features") if isinstance(data, dict) else None
    return rasgos if isinstance(rasgos, list) else []


def _orden(rasgos: list[dict], sentinel: bool) -> list[dict]:
    def nube_de(rasgo: dict) -> float:
        nube = (rasgo.get("properties") or {}).get("eo:cloud_cover")
        return float(nube) if isinstance(nube, (int, float)) else 101.0

    limpios = [r for r in rasgos if nube_de(r) <= _NUBE_MAX]
    if sentinel:
        return sorted(limpios, key=nube_de)

    def grupo(rasgo: dict) -> int:
        # Landsat 7 queda al final: trae franjas negras aunque reporte poca nube.
        item = str(rasgo.get("id") or "")
        if item.startswith(("LC08", "LC09")):
            return 0
        if item.startswith(("LT05", "LT04")):
            return 1
        return 2

    return sorted(limpios, key=lambda r: (grupo(r), nube_de(r)))


def _render(
    coleccion: str,
    item: str,
    west: float,
    south: float,
    east: float,
    north: float,
    sentinel: bool,
) -> bytes | None:
    cos = math.cos(((south + north) / 2) * math.pi / 180)
    ancho_grados = (east - west) * max(cos, 0.2)
    alto_grados = north - south
    width = 480
    height = max(220, min(520, round(width * (alto_grados / ancho_grados)))) if ancho_grados else 480
    pares: list[tuple[str, str]] = [
        ("collection", coleccion),
        ("item", item),
        ("width", str(width)),
        ("height", str(height)),
        ("resampling", "bilinear"),
    ]
    if sentinel:
        pares.append(("assets", "visual"))
        pares.append(("color_formula", "gamma RGB 1.5 sigmoidal RGB 8 0.35"))
    else:
        pares.extend((("assets", banda) for banda in ("red", "green", "blue")))
        pares.append(("rescale", "7500,13000"))
        pares.append(("color_formula", "gamma RGB 1.35"))
    url = f"{_RENDER}/{west},{south},{east},{north}.jpg?{urlencode(pares)}"
    try:
        tipo, data = _bytes(url, 18)
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        print(f"Escena render {item}: {exc}", flush=True)
        return None
    if "image" not in tipo or len(data) < 4000 or not data.startswith(b"\xff\xd8"):
        return None
    return data


def _json(url: str, cuerpo: dict, timeout: int) -> dict:
    req = urllib.request.Request(
        url,
        data=json.dumps(cuerpo).encode(),
        headers={"Content-Type": "application/json", "User-Agent": "acr-dashboard"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _bytes(url: str, timeout: int) -> tuple[str, bytes]:
    req = urllib.request.Request(url, headers={"User-Agent": "acr-dashboard"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        tipo = resp.headers.get("Content-Type", "")
        return tipo, resp.read()
