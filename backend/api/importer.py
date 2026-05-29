import threading
import sys
from fastapi import APIRouter

router = APIRouter(prefix="/import", tags=["import"])

_state: dict = {
    "status": "idle",   # idle | running | done | error
    "log": [],
    "zip_name": None,
}
_lock = threading.Lock()


class _ListStream:
    """Leitet print()-Ausgaben zeilenweise in die Log-Liste um."""

    def __init__(self) -> None:
        self._buf = ""

    def write(self, s: str) -> None:
        self._buf += s
        while "\n" in self._buf:
            line, self._buf = self._buf.split("\n", 1)
            if line:
                with _lock:
                    _state["log"].append(line)

    def flush(self) -> None:
        pass


def _run_import() -> None:
    from backend.importer.pipeline import run_import, _find_latest_zip

    stream = _ListStream()
    old_stdout = sys.stdout
    sys.stdout = stream
    try:
        zip_path = _find_latest_zip()
        with _lock:
            _state["zip_name"] = zip_path.name
        run_import(zip_path)
        with _lock:
            _state["status"] = "done"
    except Exception as exc:
        sys.stdout = old_stdout
        with _lock:
            _state["log"].append(f"FEHLER: {exc}")
            _state["status"] = "error"
        return
    finally:
        sys.stdout = old_stdout


@router.post("/start")
def start_import():
    with _lock:
        if _state["status"] == "running":
            return {"status": "running", "message": "Import läuft bereits"}
        _state["status"] = "running"
        _state["log"] = []
        _state["zip_name"] = None

    threading.Thread(target=_run_import, daemon=True).start()
    return {"status": "running"}


@router.get("/status")
def import_status():
    with _lock:
        return {
            "status": _state["status"],
            "log": list(_state["log"]),
            "zip_name": _state["zip_name"],
        }


@router.post("/reset")
def reset_db():
    """Löscht alle importierten Daten, behält nur die config-Tabelle (Gewicht etc.)."""
    with _lock:
        if _state["status"] == "running":
            return {"ok": False, "message": "Import läuft gerade – bitte warten"}

    from backend.database import get_connection
    conn = get_connection()
    with conn:
        conn.executescript("""
            DELETE FROM track_points;
            DELETE FROM laps;
            DELETE FROM segment_efforts;
            DELETE FROM media;
            DELETE FROM route_points;
            DELETE FROM routes;
            DELETE FROM bike_components;
            DELETE FROM activities;
            DELETE FROM bikes;
        """)
    conn.close()
    return {"ok": True}
