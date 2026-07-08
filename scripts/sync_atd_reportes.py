#!/usr/bin/env python3
"""
Sincroniza reportes ATD desde el toolbox GFP hacia www/reportes_atd/ + manifest.json.
"""
from __future__ import annotations

import json
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "www" / "reportes_atd"
DEFAULT_SOURCE = Path(
    r"C:\Users\Favio Campos Rivera\Desktop\GFP-Subnacional\2026\LBD_2026"
    r"\reporte_atd_loreto\output\salidas"
)

REGION_PACKAGES = {
    "global": ("Informe_ATD_preliminar", "Todas las regiones"),
    "loreto": ("ATD_Loreto", "Loreto"),
    "cusco": ("ATD_Cuzco", "Cusco"),
    "san_martin": ("ATD_San_Martin", "San Martín"),
}

ACR_LABELS = {
    "ACR01": "Cordillera Escalera",
    "ACR04": "Comunal Tamshiyacu Tahuayo",
    "ACR07": "Choquequirao",
    "ACR09": "Ampiyacu Apayacu",
    "ACR10": "Alto Nanay Pintuyacu Chambira",
    "ACR17": "Maijuna Kichwa",
    "ACR18": "Medio Putumayo",
    "ACR21": "Bosques de Shunté y Mishollo",
    "ACR26": "Chuyapi Urusayhua",
    "ACR30": "Q'eros Kosñipata",
}

PDF_RE = re.compile(r"ATD_(\d{4})_(ACR\d+)_(\d+)_OID(\d+)\.pdf$", re.I)
GUIA_BY_REGION = {
    "global": "guia/GUIA_ATD_TOOLBOX.html",
    "loreto": "guia/GUIA_ATD_LORETO.html",
    "cusco": "guia/GUIA_ATD_CUZCO.html",
    "san_martin": "guia/GUIA_ATD_SAN_MARTIN.html",
}


def _read_json(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


def _parse_pdf(name: str) -> dict:
    m = PDF_RE.match(name)
    if not m:
        return {"archivo": name, "titulo": name.replace(".pdf", "").replace("_", " ")}
    year, acr, num, oid = m.groups()
    acr = acr.upper()
    label = ACR_LABELS.get(acr, acr)
    return {
        "archivo": name,
        "titulo": f"Alerta {year} — {label}",
        "subtitulo": f"{acr} · OID {oid} · Informe #{num}",
        "acr": acr,
        "acr_nombre": label,
        "anno": int(year),
        "oid": oid,
        "numero": num,
    }


def _copy_if_exists(src: Path, dst: Path) -> bool:
    if not src.exists() or not src.is_file():
        return False
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)
    return True


def sync_region(source: Path, region_key: str, pkg_folder: str, label: str) -> dict:
    pkg = source / pkg_folder
    dest = OUT / region_key
    if dest.exists():
        shutil.rmtree(dest)
    dest.mkdir(parents=True, exist_ok=True)

    periodo = _read_json(pkg / "periodo_reporte_atd.json")
    stats = _read_json(pkg / "output" / "cuadro_causas_monitoreo.json")

    pdfs = []
    for pdf in sorted((pkg / "pdfs").glob("*.pdf")) if (pkg / "pdfs").exists() else []:
        if pdf.name.startswith("EJEMPLO"):
            continue
        rel = Path("pdfs") / pdf.name
        _copy_if_exists(pdf, dest / rel)
        item = _parse_pdf(pdf.name)
        item["url"] = f"/reportes_atd/{region_key}/{rel.as_posix()}"
        pdfs.append(item)

    docs = []
    docs_dir = pkg / "docs"
    if docs_dir.exists():
        for pdf in sorted(docs_dir.glob("*.pdf")):
            rel = Path("docs") / pdf.name
            _copy_if_exists(pdf, dest / rel)
            docs.append({
                "archivo": pdf.name,
                "titulo": "Ejemplo de reporte ATD",
                "url": f"/reportes_atd/{region_key}/{rel.as_posix()}",
            })

    swipe = []
    doc_atd = pkg / "documentacion_atd"
    if doc_atd.exists():
        for html in sorted(doc_atd.glob("*.html")):
            rel = Path("documentacion_atd") / html.name
            _copy_if_exists(html, dest / rel)
            kind = "swipe" if "swipe" in html.name.lower() else "doc"
            title = html.stem.replace("ATD_", "").replace("_", " ")
            swipe.append({
                "archivo": html.name,
                "titulo": title,
                "tipo": kind,
                "url": f"/reportes_atd/{region_key}/{rel.as_posix()}",
            })

    guia = None
    guia_rel = GUIA_BY_REGION.get(region_key)
    if guia_rel:
        src_guia = pkg / guia_rel
        if _copy_if_exists(src_guia, dest / Path(guia_rel).name):
            guia = {
                "titulo": "Guía operativa del toolbox ATD",
                "url": f"/reportes_atd/{region_key}/{Path(guia_rel).name}",
            }

    metodologia = None
    proc = None
    for html in (doc_atd.glob("*.html") if doc_atd.exists() else []):
        if "metodologia" in html.name.lower():
            metodologia = f"/reportes_atd/{region_key}/documentacion_atd/{html.name}"
        if "procedimiento" in html.name.lower():
            proc = f"/reportes_atd/{region_key}/documentacion_atd/{html.name}"

    return {
        "id": region_key,
        "label": label,
        "paquete": pkg_folder,
        "disponible": pkg.exists(),
        "periodo": periodo,
        "estadisticas": stats,
        "n_reportes": len(pdfs),
        "reportes_pdf": pdfs,
        "ejemplos_pdf": docs,
        "documentacion": swipe,
        "guia": guia,
        "metodologia_url": metodologia,
        "procedimiento_url": proc,
    }


def main() -> int:
    import os

    source = Path(os.environ.get("ATD_SALIDAS_SOURCE", DEFAULT_SOURCE))
    if not source.exists():
        print(f"ERROR: no existe {source}")
        return 1

    OUT.mkdir(parents=True, exist_ok=True)
    regiones = [
        sync_region(source, key, folder, label)
        for key, (folder, label) in REGION_PACKAGES.items()
    ]

    manifest = {
        "generado": datetime.now(timezone.utc).isoformat(),
        "fuente": str(source),
        "titulo": "Alertas Tempranas de Deforestación (GeoBosques)",
        "descripcion": (
            "Reportes ATD generados con el toolbox GFP Subnacional: descarga Geobosques (H1), "
            "fotointerpretación satelital (H2) y validación con informe PDF (H3)."
        ),
        "flujo": [
            {"paso": "H1", "nombre": "Descarga Geobosques", "icono": "fa-cloud-download-alt"},
            {"paso": "H2", "nombre": "Visor satelital", "icono": "fa-satellite"},
            {"paso": "H3", "nombre": "Reporte PDF validado", "icono": "fa-file-pdf"},
        ],
        "regiones": regiones,
    }

    manifest_path = OUT / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    total_pdfs = sum(r["n_reportes"] for r in regiones)
    print(f"OK: {total_pdfs} reportes PDF -> {OUT}")
    print(f"Manifest: {manifest_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
