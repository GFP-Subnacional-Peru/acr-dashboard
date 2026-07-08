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

REGION_ZONAS = {
    "loreto": {
        "Comunal Tahuayo", "Maijuna Kichwa", "Nanay",
        "ZI AA", "ZI ANPCH", "ZI CTT", "ZI MK",
    },
    "cusco": {"Choquequirao", "Chuyapi Urusayhua", "Q'eros Kosñipata", "ZI CHQ", "ZI CHU", "ZI QK"},
    "san_martin": {"Bosques de Shunté y Mishollo", "Cordillera Escalera", "ZI BOSHUMI", "ZI CE"},
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


def _filter_stats_for_region(stats: dict, region_key: str) -> dict:
    if not stats or region_key == "global":
        return stats
    zonas = REGION_ZONAS.get(region_key)
    if not zonas or not stats.get("rows"):
        return stats
    rows = [r for r in stats["rows"] if r.get("zona") in zonas]
    if not rows:
        return stats
    by_tipo: dict[str, dict] = {}
    by_zona_tipo: dict[str, dict] = {}
    total_ha = 0.0
    for r in rows:
        tipo = r.get("tipo") or "Sin clasificar"
        zona = r.get("zona") or ""
        ha = float(r.get("ha") or 0)
        total_ha += ha
        bt = by_tipo.setdefault(tipo, {"n": 0, "ha": 0.0})
        bt["n"] += 1
        bt["ha"] = round(bt["ha"] + ha, 4)
        key = f"{zona}|{tipo}"
        bzt = by_zona_tipo.setdefault(key, {"n": 0, "ha": 0.0})
        bzt["n"] += 1
        bzt["ha"] = round(bzt["ha"] + ha, 4)
    return {
        "total": len(rows),
        "total_ha": round(total_ha, 2),
        "by_tipo": by_tipo,
        "zonas": sorted({r.get("zona") for r in rows if r.get("zona")}),
        "by_zona_tipo": by_zona_tipo,
        "rows": rows,
    }


def _sync_sentinel(pkg: Path, dest: Path, region_key: str, pdfs: list[dict]) -> list[dict]:
    src = pkg / "imagenes_sentinel"
    if not src.exists():
        return []
    dst = dest / "imagenes_sentinel"
    if dst.exists():
        shutil.rmtree(dst)
    shutil.copytree(src, dst)

    pdf_by_oid = {p["oid"]: p for p in pdfs if p.get("oid")}
    demo_alertas = []
    oids = sorted({f.stem.split("_")[1].replace("OID", "") for f in src.glob("ATD_OID*_A.json")})
    for oid in oids:
        a_meta = _read_json(src / f"ATD_OID{oid}_A.json")
        d_meta = _read_json(src / f"ATD_OID{oid}_D.json")
        a_png = src / f"ATD_OID{oid}_A.png"
        d_png = src / f"ATD_OID{oid}_D.png"
        if not a_png.exists():
            continue
        base = f"/reportes_atd/{region_key}/imagenes_sentinel"
        pdf = pdf_by_oid.get(oid)
        demo_alertas.append({
            "oid": oid,
            "acr": a_meta.get("acr") or pdf.get("acr_nombre") if pdf else "",
            "acr_codigo": pdf.get("acr") if pdf else "",
            "titulo": pdf.get("titulo") if pdf else f"Alerta OID {oid}",
            "pdf_url": pdf.get("url") if pdf else None,
            "bbox": a_meta.get("bbox_wgs84"),
            "antes": {
                "fecha": a_meta.get("fecha"),
                "sat": a_meta.get("sat", "Sentinel-2"),
                "etiqueta": "ANTES",
                "imagen": f"{base}/ATD_OID{oid}_A.png",
            },
            "despues": {
                "fecha": d_meta.get("fecha"),
                "sat": d_meta.get("sat", "Sentinel-2"),
                "etiqueta": "DESPUÉS",
                "imagen": f"{base}/ATD_OID{oid}_D.png" if d_png.exists() else None,
            },
        })
    return demo_alertas


def _resumen_acr_zi(stats: dict) -> dict:
    acr: dict = {}
    zi: dict = {}
    for key, val in (stats.get("by_zona_tipo") or {}).items():
        if "|" not in key:
            continue
        zona, tipo = key.split("|", 1)
        bucket = zi if zona.strip().upper().startswith("ZI") else acr
        z = bucket.setdefault(zona, {"n": 0, "ha": 0.0, "tipos": {}})
        z["n"] += int(val.get("n") or 0)
        z["ha"] = round(z["ha"] + float(val.get("ha") or 0), 4)
        z["tipos"][tipo] = {"n": val.get("n"), "ha": val.get("ha")}
    for bucket in (acr, zi):
        for z in bucket.values():
            z["ha"] = round(z["ha"], 2)
    return {
        "acr": dict(sorted(acr.items(), key=lambda x: -x[1]["n"])),
        "zi": dict(sorted(zi.items(), key=lambda x: -x[1]["n"])),
    }


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

    demo_alertas = _sync_sentinel(pkg, dest, region_key, pdfs)
    if region_key == "loreto":
        loreto_oids = {"1009", "1542", "1546", "1552", "1553", "1554"}
        demo_alertas = [a for a in demo_alertas if str(a.get("oid")) in loreto_oids]
        demo_alertas.sort(
            key=lambda a: (
                0 if str(a.get("oid")) == "1009" else 1,
                int(a.get("oid") or 0),
            )
        )
    else:
        pdf_oids = {str(p.get("oid")) for p in pdfs if p.get("oid")}
        if pdf_oids:
            demo_alertas = [a for a in demo_alertas if str(a.get("oid")) in pdf_oids]
        demo_alertas.sort(key=lambda a: (0 if a.get("pdf_url") else 1, int(a.get("oid") or 0)))
    if not stats.get("total") and region_key != "global":
        global_stats = _read_json(source / "Informe_ATD_preliminar" / "output" / "cuadro_causas_monitoreo.json")
        stats = _filter_stats_for_region(global_stats, region_key)

    return {
        "id": region_key,
        "label": label,
        "paquete": pkg_folder,
        "disponible": pkg.exists(),
        "periodo": periodo,
        "estadisticas": stats,
        "resumen_acr_zi": _resumen_acr_zi(stats),
        "n_reportes": len(pdfs),
        "reportes_pdf": pdfs,
        "ejemplos_pdf": docs,
        "documentacion": swipe,
        "demo_alertas": demo_alertas,
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

    import subprocess
    import sys

    subprocess.run([sys.executable, str(ROOT / "scripts" / "export_vectores_loreto_atd.py")], check=False)

    logo_files = {
        "logo_gfp.png": source / "ATD_Loreto" / "logos" / "logo_gfp.png",
        "logo_basel.png": source / "ATD_Loreto" / "logos" / "logo_basel.png",
        "logo_SECO.jpg": source / "ATD_Loreto" / "logos" / "logo_SECO.jpg",
    }
    assets_dir = OUT / "assets"
    assets_dir.mkdir(parents=True, exist_ok=True)
    for name, logo_src in logo_files.items():
        if logo_src.is_file():
            shutil.copy2(logo_src, assets_dir / name)
            print(f"Logo -> {assets_dir / name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
