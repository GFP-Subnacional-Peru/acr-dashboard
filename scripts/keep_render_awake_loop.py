#!/usr/bin/env python3
"""
Aviso local, solo si esta PC está encendida.
Lunes a viernes, de 7:50 a 18:00 hora de Lima: dashboard y alertas.
Fuera de ese horario no llama, y los servicios se apagan solos.
"""
from __future__ import annotations

import time
import urllib.error
import urllib.request
from datetime import datetime

URLS = (
    "https://acr-dashboard-5iqz.onrender.com/api/health",
    "https://acr-atd.onrender.com/api/atd/salud",
)
INTERVAL_SEC = 5 * 60
TIMEOUT = 120
LOG_PATH = None  # ruta opcional vía env ACR_KEEPALIVE_LOG


def _log_path() -> str | None:
    import os
    return os.environ.get("ACR_KEEPALIVE_LOG") or LOG_PATH


def en_horario_laboral() -> bool:
    now = datetime.now()
    if now.weekday() >= 5:
        return False
    minutos = now.hour * 60 + now.minute
    return (7 * 60 + 50) <= minutos < (18 * 60)


def ping() -> bool:
    ok = True
    for url in URLS:
        req = urllib.request.Request(url, headers={"User-Agent": "ACR-Dashboard-KeepAlive/1.0"})
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
                bien = resp.status == 200
                ok = ok and bien
                msg = f"{datetime.now():%Y-%m-%d %H:%M:%S} {url} HTTP {resp.status}\n"
        except Exception as e:
            ok = False
            msg = f"{datetime.now():%Y-%m-%d %H:%M:%S} {url} ERROR {e}\n"
        lp = _log_path()
        if lp:
            try:
                with open(lp, "a", encoding="utf-8") as f:
                    f.write(msg)
            except OSError:
                pass
    return ok


def main() -> None:
    while True:
        if en_horario_laboral():
            ping()
        time.sleep(INTERVAL_SEC)


if __name__ == "__main__":
    main()
