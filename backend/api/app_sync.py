"""
Stößt den MyBikingApp-Sync (SQLite -> Neon) manuell per Button an.

MyBikingApp ist ein eigenständiges Repo mit eigenem venv (psycopg/dotenv sind
dort installiert, nicht in MyBikings venv) - dieser Endpoint ruft dessen
sync/push_to_cloud.py deshalb als Subprocess mit dem MyBikingApp-eigenen
Python-Interpreter auf, statt Code zu teilen. MyBiking selbst bleibt davon
unberührt (kein Import, keine Abhängigkeit im Code) - nur dieser eine
Endpoint kennt den Pfad zum Nachbar-Repo.
"""

import logging
import subprocess
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter

from backend.database import db_connection

router = APIRouter(prefix="/app-sync", tags=["app-sync"])
logger = logging.getLogger(__name__)

# Absoluter Pfad zum Schwester-Repo - Sascha entwickelt auf einer einzigen
# Maschine, daher bewusst hardcodiert statt konfigurierbar.
MYBIKINGAPP_DIR = Path("/home/sascha/Projekte/MyBikingApp")
MYBIKINGAPP_PYTHON = MYBIKINGAPP_DIR / ".venv" / "bin" / "python3"
SYNC_SCRIPT = MYBIKINGAPP_DIR / "sync" / "push_to_cloud.py"

_CONFIG_KEYS = {
    "at": "app_sync_last_at",
    "status": "app_sync_last_status",
    "message": "app_sync_last_message",
}


def _save_result(ok: bool, message: str) -> str:
    ran_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")
    with db_connection() as conn:
        for key, value in (
            (_CONFIG_KEYS["at"], ran_at),
            (_CONFIG_KEYS["status"], "ok" if ok else "error"),
            (_CONFIG_KEYS["message"], message),
        ):
            conn.execute(
                "INSERT INTO config(key, value) VALUES(?, ?) "
                "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                (key, value),
            )
        conn.commit()
    return ran_at


@router.post("/run")
def run_app_sync():
    """Führt push_to_cloud.py synchron aus (~10-15s) und liefert das Ergebnis direkt zurück."""
    if not SYNC_SCRIPT.exists() or not MYBIKINGAPP_PYTHON.exists():
        return {"ok": False, "message": f"MyBikingApp nicht gefunden unter {MYBIKINGAPP_DIR}"}

    try:
        result = subprocess.run(
            [str(MYBIKINGAPP_PYTHON), str(SYNC_SCRIPT)],
            cwd=MYBIKINGAPP_DIR,
            capture_output=True,
            text=True,
            timeout=120,
        )
        ok = result.returncode == 0
        message = result.stdout.strip() if ok else (result.stderr.strip() or "Sync fehlgeschlagen")
    except subprocess.TimeoutExpired:
        ok = False
        message = "Sync-Timeout nach 120s"

    if not ok:
        logger.warning("App-Sync fehlgeschlagen: %s", message)

    ran_at = _save_result(ok, message)
    return {"ok": ok, "message": message, "ran_at": ran_at}


@router.get("/status")
def app_sync_status():
    """Letztes Sync-Ergebnis, ohne einen neuen Lauf zu starten."""
    with db_connection() as conn:
        rows = conn.execute(
            "SELECT key, value FROM config WHERE key IN (?, ?, ?)",
            (_CONFIG_KEYS["at"], _CONFIG_KEYS["status"], _CONFIG_KEYS["message"]),
        ).fetchall()
    data = {r["key"]: r["value"] for r in rows}
    return {
        "last_synced_at": data.get(_CONFIG_KEYS["at"]),
        "last_status": data.get(_CONFIG_KEYS["status"]),
        "last_message": data.get(_CONFIG_KEYS["message"]),
    }
