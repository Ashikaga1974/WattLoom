"""
Endpunkte, die nichts mit fachlichen Daten zu tun haben: das Server-Log für den
"Protokoll"-Tab in den Einstellungen (Settings → Protokoll → Button "Abrufen", bewusst kein
automatisches Polling) und der Demo-Modus-Schalter (siehe backend/demo_mode.py).
"""
from fastapi import APIRouter
from pydantic import BaseModel

from backend import demo_mode
from backend.api.errors import api_error
from backend.api.importer import is_import_running
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


class DemoModeUpdate(BaseModel):
    active: bool


@router.get("/demo-mode")
def get_demo_mode():
    return {"active": demo_mode.is_active()}


@router.put("/demo-mode")
def set_demo_mode(body: DemoModeUpdate):
    # Ein laufender ZIP-Import schreibt über viele einzelne Verbindungen – ein Umschalten
    # mittendrin würde ihn auf zwei DBs verteilen
    if is_import_running():
        raise api_error(409, "import_running", "Während eines Imports nicht umschaltbar")
    if body.active:
        demo_mode.enable()
    else:
        demo_mode.disable()
    return {"active": demo_mode.is_active()}
