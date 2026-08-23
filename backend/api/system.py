"""
Diagnose-Endpunkte, die nichts mit fachlichen Daten zu tun haben – aktuell nur das
Server-Log für den "Protokoll"-Tab in den Einstellungen (Settings → Protokoll → Button
"Abrufen"). Bewusst kein automatisches Polling im Frontend, nur Abruf auf Knopfdruck.
"""
from fastapi import APIRouter

from backend.paths import LOG_FILE

router = APIRouter(prefix="/system", tags=["system"])

_MAX_LINES = 1000


@router.get("/log")
def get_log():
    if not LOG_FILE.is_file():
        return {"lines": []}
    with LOG_FILE.open("r", encoding="utf-8", errors="replace") as f:
        lines = [line.rstrip("\n") for line in f]
    return {"lines": lines[-_MAX_LINES:]}
