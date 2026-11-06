# -*- coding: utf-8 -*-
"""Recorta la semana 17–30 set 2026 del ráster GeoBosques a las ACR y sus zonas de influencia.

El ráster nacional es PNCB_ATD_UTM_01_273_R.tif. El valor del píxel es el día
transcurrido desde el 31-12-2025. 260 = 17 set 2026 y 273 = 30 set 2026.
"""
import json
from datetime import date, timedelta
from pathlib import Path

import rasterio
from rasterio.features import geometry_mask, shapes
from rasterio.warp import transform_geom
from rasterio.windows import from_bounds, transform as win_transform
from shapely.geometry import mapping, shape

TIF = Path(r"C:\Users\Favio Campos Rivera\AppData\Local\Temp\atd2026\PNCB_ATD_UTM_01_273_R.tif")
BASE = Path(__file__).resolve().parents[2] / "src" / "main" / "resources" / "static" / "limites"
SALIDA = BASE / "semana.geojson"
MIN_HA = 0.09
DESDE, HASTA = 260, 273


def territorios():
    for nombre, tipo in (("acr.geojson", "ACR"), ("zi.geojson", "ZI")):
        gj = json.loads((BASE / nombre).read_text(encoding="utf-8"))
        for ft in gj["features"]:
            codigo = ft["properties"].get("codigo")
            if not codigo:
                continue
            acr = codigo if tipo == "ACR" else codigo.replace("ZI_", "ACR_")
            yield codigo, acr, tipo, shape(ft["geometry"])


def region_de(acr):
    if acr in {"ACR_AA", "ACR_ANPCH", "ACR_CTT", "ACR_MK", "ACR_MPA"}:
        return "Loreto"
    if acr in {"ACR_CE", "ACR_BSM"}:
        return "San Martín"
    if acr in {"ACR_CHQ", "ACR_CHU", "ACR_QK"}:
        return "Cusco"
    return ""


def main():
    feats = []
    acrs = []
    with rasterio.open(TIF) as src:
        print(src.crs, src.width, src.height, flush=True)
        for codigo, acr, tipo, geom in territorios():
            if tipo == "ACR":
                acrs.append(geom)
            gj = transform_geom("EPSG:4326", src.crs, mapping(geom), precision=2)
            minx, miny, maxx, maxy = shape(gj).bounds
            ventana = from_bounds(minx, miny, maxx, maxy, src.transform).intersection(
                rasterio.windows.Window(0, 0, src.width, src.height)
            )
            ventana = ventana.round_offsets().round_lengths()
            if ventana.width < 1 or ventana.height < 1:
                print(codigo, "fuera del ráster", flush=True)
                continue
            datos = src.read(1, window=ventana)
            transf = win_transform(ventana, src.transform)
            fuera = geometry_mask([gj], out_shape=datos.shape, transform=transf, invert=False)
            datos = datos.copy()
            datos[fuera] = 0
            datos[(datos < DESDE) | (datos > HASTA)] = 0
            n = 0
            for figura, valor in shapes(datos, mask=datos > 0, transform=transf):
                poly = shape(figura)
                hectareas = poly.area / 10000.0
                if hectareas < MIN_HA:
                    continue
                wgs = shape(transform_geom(src.crs, "EPSG:4326", mapping(poly), precision=6))
                if tipo == "ZI" and any(g.covers(wgs.centroid) for g in acrs):
                    continue
                dia = date(2025, 12, 31) + timedelta(days=int(valor))
                feats.append({
                    "type": "Feature",
                    "properties": {
                        "region": region_de(acr),
                        "acr": acr,
                        "ambito": tipo,
                        "territorio": codigo,
                        "fecha": dia.isoformat(),
                        "ha": round(hectareas, 2),
                    },
                    "geometry": mapping(wgs),
                })
                n += 1
            print(f"{codigo} {n}", flush=True)
    SALIDA.write_text(
        json.dumps({"type": "FeatureCollection", "features": feats}, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print("total", len(feats), SALIDA, flush=True)


if __name__ == "__main__":
    main()
