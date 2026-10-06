"""
Copia los logos del toolbox H3 a src/main/resources/reporte/logos con nombres normalizados y
reducidos a 360 px de lado mayor (el PDF los muestra a ~2 cm). Se ejecuta en el contenedor GDAL:
  docker run --rm -v <salidas>:/salidas:ro -v <atd-service>:/atd ghcr.io/osgeo/gdal:ubuntu-small-latest \
      python3 /atd/db/carga/preparar_logos.py
"""
import os
from osgeo import gdal

gdal.UseExceptions()
ORIGEN = "/salidas"
DESTINO = "/atd/src/main/resources/reporte/logos"
LADO = 360

LOGOS = {
    "gfp.png": "ATD_Loreto/logos/logo_gfp.png",
    "seco.png": "ATD_Loreto/logos/logo_SECO.jpg",
    "basel.png": "ATD_Loreto/logos/logo_basel.png",
    "gore_1.png": "ATD_Loreto/logos/logo_gore.png",
    "gerencia_1.png": "ATD_Loreto/logos/logo_grrnga.png",
    "acr_ACR04.png": "ATD_Loreto/logos/logo_anp_ACR04.jpeg",
    "acr_ACR09.png": "ATD_Loreto/logos/logo_anp_ACR09.jpeg",
    "acr_ACR10.png": "ATD_Loreto/logos/logo_anp_ACR10.png",
    "acr_ACR17.png": "ATD_Loreto/logos/logo_anp_ACR17.jpeg",
    "gore_2.png": "ATD_San_Martin/logos/Logo_GORE_san_Martin.png",
    "gerencia_2.png": "ATD_San_Martin/logos/LOGO ARA.png",
    "acr_ACR01.png": "ATD_San_Martin/logos/ACR - CE.jpg.jpeg",
    "acr_ACR21.png": "ATD_San_Martin/logos/ACR - BOSHUMI.png",
    "gore_3.png": "ATD_Cuzco/logos/Logo_GORE_Cuzco.png",
    "gerencia_3.png": "ATD_Cuzco/logos/Logo_Gerencia_CUzco_Color.png",
    "acr_ACR07.png": "ATD_Cuzco/logos/ACR_Choquequirao.png",
    "acr_ACR26.png": "ATD_Cuzco/logos/Logo Chuyapi Urusayhua_Mesa de trabajo 1.png",
    "acr_ACR30.png": "ATD_Cuzco/logos/QEROS - LOGO POSITIVO.png",
}

os.makedirs(DESTINO, exist_ok=True)
for nombre, rel in LOGOS.items():
    src = gdal.Open(os.path.join(ORIGEN, rel))
    w, h = src.RasterXSize, src.RasterYSize
    escala = min(1.0, LADO / max(w, h))
    paleta = src.GetRasterBand(1).GetColorTable() is not None
    gdal.Translate(os.path.join(DESTINO, nombre), src, format="PNG",
                   width=max(1, round(w * escala)), height=max(1, round(h * escala)),
                   resampleAlg="average", rgbExpand="rgba" if paleta else None)
    print(f"{nombre:18s} {w}x{h} -> {round(w * escala)}x{round(h * escala)}")
