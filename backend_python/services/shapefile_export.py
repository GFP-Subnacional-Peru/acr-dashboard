"""GeoJSON de polígonos → ZIP con shapefile (shp, shx, dbf, prj). Sin GDAL."""
from __future__ import annotations

import io
import json
import struct
import zipfile
from datetime import date
from pathlib import Path


def geojson_path_a_zip(path: Path, base: str) -> bytes:
    geo = json.loads(path.read_text(encoding="utf-8"))
    return geojson_a_zip(geo, base)


def geojson_a_zip(geo: dict, base: str) -> bytes:
    registros: list[tuple[list[list[tuple[float, float]]], dict]] = []
    for feat in geo.get("features") or []:
        anillos = _anillos((feat or {}).get("geometry") or {})
        if not anillos:
            continue
        registros.append((anillos, (feat or {}).get("properties") or {}))

    shp, shx = _shp_shx(registros)
    dbf = _dbf(registros)
    prj = (
        'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",'
        'SPHEROID["WGS_1984",6378137.0,298.257223563]],'
        'PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]'
    )
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(f"{base}.shp", shp)
        zf.writestr(f"{base}.shx", shx)
        zf.writestr(f"{base}.dbf", dbf)
        zf.writestr(f"{base}.prj", prj)
        zf.writestr(f"{base}.cpg", "UTF-8")
    return buf.getvalue()


def _anillos(geom: dict) -> list[list[tuple[float, float]]]:
    tipo = geom.get("type")
    coords = geom.get("coordinates") or []
    polys: list = []
    if tipo == "Polygon":
        polys = [coords]
    elif tipo == "MultiPolygon":
        polys = list(coords)
    else:
        return []
    out: list[list[tuple[float, float]]] = []
    for poly in polys:
        for i, ring in enumerate(poly or []):
            pts = _cerrar(_puntos(ring))
            if len(pts) >= 4:
                out.append(_orientar(pts, exterior=(i == 0)))
    return out


def _puntos(ring) -> list[tuple[float, float]]:
    pts = []
    for p in ring or []:
        if not isinstance(p, (list, tuple)) or len(p) < 2:
            continue
        try:
            pts.append((float(p[0]), float(p[1])))
        except (TypeError, ValueError):
            continue
    return pts


def _cerrar(pts: list[tuple[float, float]]) -> list[tuple[float, float]]:
    if len(pts) >= 3 and pts[0] != pts[-1]:
        return pts + [pts[0]]
    return pts


def _area(pts: list[tuple[float, float]]) -> float:
    a = 0.0
    for i in range(len(pts) - 1):
        x1, y1 = pts[i]
        x2, y2 = pts[i + 1]
        a += x1 * y2 - x2 * y1
    return a / 2.0


def _orientar(pts: list[tuple[float, float]], exterior: bool) -> list[tuple[float, float]]:
    """Shapefile: anillo exterior horario, hueco antihorario."""
    ccw = _area(pts) > 0
    if exterior and ccw:
        return list(reversed(pts))
    if not exterior and not ccw:
        return list(reversed(pts))
    return pts


def _caja(anillos: list[list[tuple[float, float]]]) -> tuple[float, float, float, float]:
    xs = [p[0] for ring in anillos for p in ring]
    ys = [p[1] for ring in anillos for p in ring]
    return min(xs), min(ys), max(xs), max(ys)


def _contenido(anillos: list[list[tuple[float, float]]]) -> bytes:
    xmin, ymin, xmax, ymax = _caja(anillos)
    partes = []
    puntos: list[tuple[float, float]] = []
    for ring in anillos:
        partes.append(len(puntos))
        puntos.extend(ring)
    cuerpo = struct.pack("<i4d", 5, xmin, ymin, xmax, ymax)
    cuerpo += struct.pack("<ii", len(partes), len(puntos))
    cuerpo += struct.pack(f"<{len(partes)}i", *partes)
    for x, y in puntos:
        cuerpo += struct.pack("<dd", x, y)
    return cuerpo


def _cabecera(longitud_palabras: int, xmin: float, ymin: float, xmax: float, ymax: float) -> bytes:
    cab = struct.pack(">iiiiii", 9994, 0, 0, 0, 0, longitud_palabras)
    cab += struct.pack("<ii", 1000, 5)
    cab += struct.pack("<8d", xmin, ymin, xmax, ymax, 0, 0, 0, 0)
    return cab


def _shp_shx(registros) -> tuple[bytes, bytes]:
    if not registros:
        vacio = _cabecera(50, 0, 0, 0, 0)
        return vacio, vacio
    shapes = [_contenido(anillos) for anillos, _ in registros]
    # 100 bytes de cabecera = 50 palabras de 16 bits
    palabras = 50
    offsets = []
    for shp in shapes:
        offsets.append(palabras)
        palabras += 4 + (len(shp) // 2)
    xs0, ys0, xs1, ys1 = [], [], [], []
    for anillos, _ in registros:
        xmin, ymin, xmax, ymax = _caja(anillos)
        xs0.append(xmin)
        ys0.append(ymin)
        xs1.append(xmax)
        ys1.append(ymax)
    shp = bytearray(_cabecera(palabras, min(xs0), min(ys0), max(xs1), max(ys1)))
    shx_palabras = 50 + 4 * len(shapes)
    shx = bytearray(_cabecera(shx_palabras, min(xs0), min(ys0), max(xs1), max(ys1)))
    for i, cuerpo in enumerate(shapes, start=1):
        shp += struct.pack(">ii", i, len(cuerpo) // 2)
        shp += cuerpo
        shx += struct.pack(">ii", offsets[i - 1], len(cuerpo) // 2)
    return bytes(shp), bytes(shx)


def _campo_dbf(nombre: str, tipo: str, largo: int, dec: int = 0) -> bytes:
    raw = nombre.encode("ascii")[:11]
    raw = raw + b"\x00" * (11 - len(raw))
    return raw + struct.pack("<cI2B", tipo.encode("ascii"), 0, largo, dec) + b"\x00" * 14


def _texto(valor, largo: int) -> bytes:
    s = "" if valor is None else str(valor)
    raw = s.encode("utf-8", errors="replace")[:largo]
    return raw + b" " * (largo - len(raw))


def _numero(valor, largo: int, dec: int) -> bytes:
    try:
        n = float(valor)
        txt = f"{n:.{dec}f}" if dec else str(int(n))
    except (TypeError, ValueError):
        txt = ""
    txt = txt[:largo]
    return txt.rjust(largo).encode("ascii")


def _dbf(registros) -> bytes:
    campos = [
        ("CODIGO", "C", 20, 0),
        ("ANNO", "N", 4, 0),
        ("AREA_HA", "N", 12, 2),
        ("TIPO", "C", 24, 0),
        ("CAUSA", "C", 40, 0),
    ]
    hoy = date.today()
    n = len(registros)
    cab_len = 32 + 32 * len(campos) + 1
    rec_len = 1 + sum(c[2] for c in campos)
    cab = struct.pack(
        "<4B I HH 20x",
        3,
        hoy.year - 1900,
        hoy.month,
        hoy.day,
        n,
        cab_len,
        rec_len,
    )
    for nombre, tipo, largo, dec in campos:
        cab += _campo_dbf(nombre, tipo, largo, dec)
    cab += b"\r"
    filas = bytearray()
    for _, props in registros:
        filas += b" "
        filas += _texto(props.get("codigo") or props.get("nombre_acr") or "", 20)
        filas += _numero(props.get("anno"), 4, 0)
        filas += _numero(props.get("area_ha"), 12, 2)
        filas += _texto(props.get("tipo") or "", 24)
        causa = props.get("causa_nombre") or props.get("causa") or ""
        filas += _texto(causa, 40)
    return cab + bytes(filas)
