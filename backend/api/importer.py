import logging
import threading
import sys
from fastapi import APIRouter, File, Form, HTTPException, UploadFile

router = APIRouter(prefix="/import", tags=["import"])
logger = logging.getLogger(__name__)

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
        logger.error("ZIP-Import fehlgeschlagen: %s", exc, exc_info=True)
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


@router.post("/fit-file")
async def import_fit_file(
    file: UploadFile = File(...),
    bike_id: str | None = Form(None),
) -> dict:
    """
    Importiert eine einzelne .fit-Datei direkt in die DB.
    bike_id ist nur für Radtouren (sport: cycling/generic) erforderlich;
    Workouts werden ohne Rad in other_activities gespeichert.
    """
    if not file.filename or not file.filename.lower().endswith(".fit"):
        raise HTTPException(status_code=400, detail="Nur .fit-Dateien werden unterstützt")

    data = await file.read()

    from backend.database import db_connection
    from backend.importer.fit_single import import_single_fit

    try:
        with db_connection() as conn:
            result = import_single_fit(conn, data, bike_id or None)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    logger.info("FIT-Import: %s (activity %s, is_ride=%s)", file.filename, result["activity_id"], result["is_ride"])

    # Wetter direkt nach dem Import für neue Radtouren abrufen
    if result.get("is_ride"):
        _fetch_weather_for_activity(result["activity_id"])

    return result


def _fetch_weather_for_activity(activity_id: int) -> None:
    """Holt Wetter für eine neu importierte Radtour. Fehler werden nur geloggt."""
    from backend.database import db_connection
    from backend.weather import fetch_weather

    try:
        with db_connection() as conn:
            row = conn.execute(
                """SELECT a.start_date, tp.lat, tp.lon
                   FROM activities a
                   JOIN track_points tp ON tp.activity_id = a.id
                   WHERE a.id = ? AND tp.lat IS NOT NULL AND tp.lon IS NOT NULL
                   ORDER BY tp.timestamp LIMIT 1""",
                (activity_id,),
            ).fetchone()

        if not row:
            logger.info("Kein Track-Punkt mit Koordinaten für activity %s – Wetter übersprungen", activity_id)
            return

        weather = fetch_weather(row["lat"], row["lon"], row["start_date"])
        if weather is None:
            return

        with db_connection() as conn:
            with conn:
                conn.execute(
                    """UPDATE activities
                       SET weather_temp_c=?, weather_wind_ms=?, weather_wind_deg=?, weather_precip_mm=?
                       WHERE id=?""",
                    (weather["temp_c"], weather["wind_ms"], weather["wind_deg"], weather["precip_mm"], activity_id),
                )
        logger.info("Wetter für activity %s: %.1f°C, %.1f m/s", activity_id, weather["temp_c"] or 0, weather["wind_ms"] or 0)

    except Exception as exc:
        logger.error("Wetter-Fetch für activity %s fehlgeschlagen: %s", activity_id, exc)


@router.post("/reset")
def reset_db():
    """Löscht alle importierten Daten, behält nur die config-Tabelle (Gewicht etc.)."""
    with _lock:
        if _state["status"] == "running":
            return {"ok": False, "message": "Import läuft gerade – bitte warten"}

    from backend.database import db_connection, init_db
    with db_connection() as conn:
        conn.executescript("""
            DELETE FROM track_points WHERE activity_id > 0;
            DELETE FROM laps WHERE activity_id > 0;
            DELETE FROM segment_efforts WHERE activity_id > 0;
            DELETE FROM media WHERE activity_id > 0;
            DELETE FROM route_points;
            DELETE FROM routes;
            DELETE FROM bike_components;
            DELETE FROM activities WHERE id > 0;
            DELETE FROM other_activities;
            DELETE FROM bikes;
        """)
    init_db()
    return {"ok": True}
