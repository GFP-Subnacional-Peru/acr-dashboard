"""Foto del recorte de un polígono, del año pedido.

Sentinel-2 desde 2017 y Landsat de 2001 a 2016. El servicio público de Esri
solo conserva Sentinel de los últimos 14 meses, así que el histórico sale
de Planetary Computer: la escena con menos nube de ese año.
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
_ANIO_SENTINEL = 2017
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


def obtener_escena(anio: int, west: float, south: float, east: float, north: float) -> Escena:
    _validar(anio, west, south, east, north)
    key = (
        anio,
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
    escena = _buscar_y_recortar(anio, west, south, east, north)
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
    bbox = [west, south, east, north]
    vistos: set[str] = set()
    for inicio, fin, nube in _ventanas(anio):
        rasgos = _buscar(coleccion, bbox, inicio, fin, nube)
        for rasgo in _orden(rasgos, sentinel):
            item = str(rasgo.get("id") or "")
            if not item or item in vistos:
                continue
            vistos.add(item)
            fecha = str((rasgo.get("properties") or {}).get("datetime") or "")[:10]
            cuerpo = _render(coleccion, item, west, south, east, north, sentinel)
            if cuerpo:
                return Escena(body=cuerpo, fecha=fecha, sensor=sensor)
            if len(vistos) >= 4:
                break
        if len(vistos) >= 4:
            break
    raise EscenaNoDisponible("No hay una escena clara de ese año en este recorte.")


def _ventanas(anio: int) -> list[tuple[str, str, int]]:
    seco = (f"{anio}-06-01T00:00:00Z", f"{anio}-10-31T23:59:59Z", 25)
    año = (f"{anio}-01-01T00:00:00Z", f"{anio}-12-31T23:59:59Z", 50)
    amplio = (f"{anio}-01-01T00:00:00Z", f"{anio}-12-31T23:59:59Z", 90)
    return [seco, año, amplio]


def _buscar(coleccion: str, bbox: list[float], inicio: str, fin: str, nube: int) -> list[dict]:
    cuerpo = {
        "collections": [coleccion],
        "bbox": bbox,
        "datetime": f"{inicio}/{fin}",
        "query": {"eo:cloud_cover": {"lt": nube}},
        "sortby": [{"field": "properties.eo:cloud_cover", "direction": "asc"}],
        "limit": 8,
    }
    try:
        data = _json(_STAC, cuerpo, 20)
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError) as exc:
        print(f"Escena búsqueda {coleccion} {inicio[:4]}: {exc}", flush=True)
        return []
    rasgos = data.get("features") if isinstance(data, dict) else None
    return rasgos if isinstance(rasgos, list) else []


def _orden(rasgos: list[dict], sentinel: bool) -> list[dict]:
    if sentinel:
        return rasgos

    def llave(rasgo: dict) -> tuple:
        nube = (rasgo.get("properties") or {}).get("eo:cloud_cover")
        if not isinstance(nube, (int, float)):
            nube = 100
        item = str(rasgo.get("id") or "")
        reciente = 0 if item.startswith(("LC08", "LC09")) else 1
        return (reciente, nube)

    return sorted(rasgos, key=llave)


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
    width = 640
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
        tipo, data = _bytes(url, 28)
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
