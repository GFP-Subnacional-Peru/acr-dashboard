"""
Convierte a JPEG (calidad 88) las imágenes antes/después guardadas como PNG. Reduce la base ~4 veces
para que entre en el plan gratuito de la base en la nube.

  docker compose run --rm gdal python3 /evidencia/convertir_jpeg.py
"""
import os

from osgeo import gdal, ogr

gdal.UseExceptions()


def main():
    con = ogr.Open(
        f"PG:host={os.environ['PGHOST']} dbname={os.environ['PGDATABASE']} "
        f"user={os.environ['PGUSER']} password={os.environ['PGPASSWORD']}", update=1)
    capa = con.ExecuteSQL("SELECT id FROM atd.evidencia WHERE mime = 'image/png' AND contenido IS NOT NULL ORDER BY id")
    ids = [f.GetField(0) for f in capa]
    con.ReleaseResultSet(capa)
    antes = despues = 0
    for n, ev_id in enumerate(ids, 1):
        capa = con.ExecuteSQL(f"SELECT encode(contenido, 'hex') FROM atd.evidencia WHERE id = {ev_id}")
        png = bytes.fromhex(capa.GetNextFeature().GetField(0))
        con.ReleaseResultSet(capa)
        gdal.FileFromMemBuffer(f"/vsimem/e{ev_id}.png", png)
        gdal.Translate(f"/vsimem/e{ev_id}.jpg", f"/vsimem/e{ev_id}.png", format="JPEG", creationOptions=["QUALITY=88"])
        f = gdal.VSIFOpenL(f"/vsimem/e{ev_id}.jpg", "rb")
        gdal.VSIFSeekL(f, 0, 2)
        tam = gdal.VSIFTellL(f)
        gdal.VSIFSeekL(f, 0, 0)
        jpg = gdal.VSIFReadL(1, tam, f)
        gdal.VSIFCloseL(f)
        gdal.Unlink(f"/vsimem/e{ev_id}.png")
        gdal.Unlink(f"/vsimem/e{ev_id}.jpg")
        con.ExecuteSQL(f"UPDATE atd.evidencia SET contenido = decode('{jpg.hex()}', 'hex'), mime = 'image/jpeg', "
                       f"creado_en = now() WHERE id = {ev_id}")
        antes += len(png)
        despues += len(jpg)
        if n % 100 == 0 or n == len(ids):
            print(f"{n}/{len(ids)}  {antes / 1e6:.0f} MB -> {despues / 1e6:.0f} MB", flush=True)


if __name__ == "__main__":
    main()
