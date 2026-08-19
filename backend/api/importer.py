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


def _run_power_estimation() -> None:
    """Schätzt Leistung für alle Radtouren mit Track-Daten (bulk, inline)."""
    from backend.database import db_connection
    from backend.importer.power_estimator import estimate_and_store, _get_weight_kg

    with db_connection() as conn:
        weight_kg = _get_weight_kg(conn)

    if weight_kg is None:
        print("  Leistungsschätzung übersprungen – kein Körpergewicht in Einstellungen")
        return

    with db_connection() as conn:
        ids = [
            r[0]
            for r in conn.execute(
                "SELECT id FROM activities WHERE has_track = 1 ORDER BY start_date DESC"
            ).fetchall()
        ]

    done = 0
    for activity_id in ids:
        try:
            with db_connection() as conn:
                if estimate_and_store(conn, activity_id):
                    done += 1
        except Exception as exc:
            logger.error("Leistungsschätzung activity %s: %s", activity_id, exc)

    print(f"  Leistungsschätzung: {done}/{len(ids)} Aktivitäten geschätzt")
    logger.info("Leistungsschätzung abgeschlossen: %d/%d Aktivitäten", done, len(ids))


def _fmt_hms(seconds: float) -> str:
    """34:12 unter einer Stunde, sonst 1:02:33."""
    s = round(seconds)
    h, rem = divmod(s, 3600)
    m, s = divmod(rem, 60)
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"


def _sync_app_after_import() -> None:
    """Stößt den MyBikingApp-Sync direkt nach einem Import an (analog zum automatischen
    Wetter-Fetch) statt den manuellen Button in den Einstellungen zu erfordern."""
    from backend.api.app_sync import _do_sync

    try:
        result = _do_sync()
        if not result["ok"]:
            logger.warning("MyBikingApp-Sync nach Import fehlgeschlagen: %s", result["message"])
    except Exception as exc:
        logger.error("MyBikingApp-Sync nach Import fehlgeschlagen: %s", exc)


def _check_new_prs(baseline: dict) -> None:
    """Vergleicht den Best-by-Distance-Snapshot von vor dem Import mit dem aktuellen
    Stand und meldet neue persönliche Bestzeiten (siehe backend/pr_detection.py)."""
    from backend.database import db_connection
    from backend.pr_detection import detect_and_record

    try:
        with db_connection() as conn:
            events = detect_and_record(conn, baseline)
        for e in events:
            print(f"  🏆 Neuer PR: {e['distance_km']:.0f} km in {_fmt_hms(e['best_time_s'])} ({e['activity_name']})")
            logger.info("Neuer PR: %.0f km in %.0fs (activity %s)", e["distance_km"], e["best_time_s"], e["activity_id"])
    except Exception as exc:
        logger.error("PR-Check fehlgeschlagen: %s", exc)


def _run_import() -> None:
    from backend.importer.pipeline import run_import, _find_latest_zip
    from backend.api.weather import _fetch_all_job
    from backend.database import db_connection
    from backend.pr_detection import snapshot

    stream = _ListStream()
    old_stdout = sys.stdout
    sys.stdout = stream
    try:
        zip_path = _find_latest_zip()
        with _lock:
            _state["zip_name"] = zip_path.name

        with db_connection() as conn:
            baseline = snapshot(conn)

        run_import(zip_path)

        print("→ Wetter abrufen …")
        _fetch_all_job()

        print("→ Leistung schätzen …")
        _run_power_estimation()

        print("→ Bestzeiten prüfen …")
        _check_new_prs(baseline)

        print("→ MyBikingApp-Sync …")
        _sync_app_after_import()

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
    from backend.pr_detection import snapshot

    try:
        with db_connection() as conn:
            baseline = snapshot(conn)
            result = import_single_fit(conn, data, bike_id or None)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    logger.info("FIT-Import: %s (activity %s, is_ride=%s)", file.filename, result["activity_id"], result["is_ride"])

    # Wetter direkt nach dem Import für neue Radtouren abrufen
    if result.get("is_ride"):
        _fetch_weather_for_activity(result["activity_id"])
        _estimate_power_for_activity(result["activity_id"])
        _check_new_prs(baseline)
        _sync_app_after_import()

    return result


def _estimate_power_for_activity(activity_id: int) -> None:
    """Schätzt Leistung für eine importierte Radtour und speichert das Ergebnis."""
    from backend.database import db_connection
    from backend.importer.power_estimator import estimate_and_store
    try:
        with db_connection() as conn:
            estimate_and_store(conn, activity_id)
    except Exception as exc:
        logger.error("Leistungsschätzung für activity %s fehlgeschlagen: %s", activity_id, exc)


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


@router.post("/tcx-file")
async def import_tcx_file(
    file: UploadFile = File(...),
    bike_id: str | None = Form(None),
) -> dict:
    """
    Importiert eine einzelne .tcx-Datei direkt in die DB.
    bike_id ist nur für Radtouren (Sport: biking/cycling) erforderlich;
    Workouts werden ohne Rad in other_activities gespeichert.
    """
    if not file.filename or not file.filename.lower().endswith(".tcx"):
        raise HTTPException(status_code=400, detail="Nur .tcx-Dateien werden unterstützt")

    data = await file.read()

    from backend.database import db_connection
    from backend.importer.tcx_single import import_single_tcx
    from backend.pr_detection import snapshot

    try:
        with db_connection() as conn:
            baseline = snapshot(conn)
            result = import_single_tcx(conn, data, bike_id or None)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    logger.info("TCX-Import: %s (activity %s, is_ride=%s)", file.filename, result["activity_id"], result["is_ride"])

    if result.get("is_ride"):
        _fetch_weather_for_activity(result["activity_id"])
        _estimate_power_for_activity(result["activity_id"])
        _check_new_prs(baseline)
        _sync_app_after_import()

    return result


@router.post("/gpx-file")
async def import_gpx_file(
    file: UploadFile = File(...),
    bike_id: str | None = Form(None),
) -> dict:
    """
    Importiert eine einzelne .gpx-Datei direkt in die DB.
    bike_id ist nur für Radtouren erforderlich (oder als Signal wenn <type> fehlt);
    Workouts werden ohne Rad in other_activities gespeichert.
    """
    if not file.filename or not file.filename.lower().endswith(".gpx"):
        raise HTTPException(status_code=400, detail="Nur .gpx-Dateien werden unterstützt")

    data = await file.read()

    from backend.database import db_connection
    from backend.importer.gpx_single import import_single_gpx
    from backend.pr_detection import snapshot

    try:
        with db_connection() as conn:
            baseline = snapshot(conn)
            result = import_single_gpx(conn, data, bike_id or None)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    logger.info("GPX-Import: %s (activity %s, is_ride=%s)", file.filename, result["activity_id"], result["is_ride"])

    if result.get("is_ride"):
        _fetch_weather_for_activity(result["activity_id"])
        _estimate_power_for_activity(result["activity_id"])
        _check_new_prs(baseline)
        _sync_app_after_import()

    return result


def _recalculate_one_track_speeds(conn, activity_id: int) -> bool:
    """Berechnet speed_ms + distance_m aus lat/lon/timestamp für einen Track.
    Nur Aktivitäten mit mind. einem lat/lon-Punkt ohne speed_ms werden angefasst."""
    from datetime import datetime
    from backend.utils import haversine_m, smooth_speeds

    needs = conn.execute(
        "SELECT 1 FROM track_points WHERE activity_id=? AND lat IS NOT NULL AND speed_ms IS NULL LIMIT 1",
        (activity_id,),
    ).fetchone()
    if not needs:
        return False

    pts = conn.execute(
        "SELECT id, lat, lon, timestamp FROM track_points WHERE activity_id=? ORDER BY id",
        (activity_id,),
    ).fetchall()

    updates = []
    cum_dist = 0.0
    prev_lat = prev_lon = prev_ts = None

    for pt_id, lat, lon, ts_str in pts:
        ts_dt = None
        if ts_str:
            try:
                ts_dt = datetime.fromisoformat(ts_str)
            except ValueError:
                pass

        speed_ms = None
        if lat is not None and lon is not None:
            if prev_lat is not None:
                seg_m = haversine_m(prev_lat, prev_lon, lat, lon)
                cum_dist += seg_m
                if ts_dt is not None and prev_ts is not None:
                    dt_s = (ts_dt - prev_ts).total_seconds()
                    if dt_s > 0:
                        raw = seg_m / dt_s
                        # >40 m/s (144 km/h) = GPS-Artefakt → verwerfen
                        speed_ms = raw if raw <= 40.0 else None
            prev_lat, prev_lon = lat, lon
        if ts_dt is not None:
            prev_ts = ts_dt

        updates.append((speed_ms, cum_dist if cum_dist > 0 else None, pt_id))

    # GPS-Rauschen glätten
    raw_speeds = [u[0] for u in updates]
    smoothed = smooth_speeds(raw_speeds)
    updates = [(s, u[1], u[2]) for s, u in zip(smoothed, updates)]

    with conn:
        conn.executemany(
            "UPDATE track_points SET speed_ms=?, distance_m=? WHERE id=?",
            updates,
        )
    return True


def _run_recalculate_track_speeds() -> None:
    """Backfill: speed_ms + distance_m für alle Tracks ohne Geschwindigkeitsdaten."""
    from backend.database import db_connection

    with db_connection() as conn:
        ids = [
            r[0]
            for r in conn.execute(
                "SELECT DISTINCT activity_id FROM track_points WHERE lat IS NOT NULL AND speed_ms IS NULL"
            ).fetchall()
        ]

    done = 0
    for activity_id in ids:
        try:
            with db_connection() as conn:
                if _recalculate_one_track_speeds(conn, activity_id):
                    done += 1
        except Exception as exc:
            logger.error("Track-Speed-Backfill activity %s: %s", activity_id, exc)

    print(f"  Track-Speed-Backfill: {done}/{len(ids)} Aktivitäten aktualisiert")
    logger.info("Track-Speed-Backfill abgeschlossen: %d/%d", done, len(ids))


@router.post("/recalculate-track-speeds")
def recalculate_track_speeds():
    """
    Berechnet speed_ms + distance_m aus lat/lon/timestamp für alle Tracks,
    bei denen diese Werte fehlen (z.B. GPX-Import vor 2026-06-30).
    Läuft im Hintergrund.
    """
    threading.Thread(target=_run_recalculate_track_speeds, daemon=True).start()
    return {"ok": True, "message": "Track-Speed-Backfill gestartet"}


@router.post("/recalculate-power")
def recalculate_power():
    """
    Schätzt Leistung für alle Radtouren mit Track-Daten (background-Thread).
    Überschreibt bestehende Schätzungen; echte avg_power_w-Werte bleiben unberührt.
    Gibt sofort Status-Info zurück; Fortschritt wird nicht weiter gemeldet.
    """
    from backend.database import db_connection
    from backend.importer.power_estimator import estimate_and_store, _get_weight_kg

    with db_connection() as conn:
        weight_kg = _get_weight_kg(conn)

    if weight_kg is None:
        return {"ok": False, "message": "Körpergewicht nicht gesetzt – bitte zuerst in den Einstellungen eintragen"}

    threading.Thread(target=_run_power_estimation, daemon=True).start()
    return {"ok": True, "message": "Leistungsschätzung gestartet"}


@router.post("/reset")
def reset_db():
    """Löscht Aktivitäten/Tracks/Laps, behält config, bikes und bike_components.
    bikes bleiben erhalten (nicht nur bike_components), da bike_components.bike_id
    per FOREIGN KEY darauf verweist – ein vorheriges DELETE FROM bikes brach hier mit
    IntegrityError ab, sobald noch Komponenten verbaut waren. Ein Re-Import überschreibt
    bestehende bikes-Zeilen ohnehin per INSERT OR REPLACE (siehe pipeline.py).
    Sichert die DB vorher nach data/backups/ – einziges Sicherheitsnetz gegen
    Fehlbedienung, da der tägliche systemd-Autostart-Job nicht direkt vor einem
    Reset läuft."""
    with _lock:
        if _state["status"] == "running":
            return {"ok": False, "message": "Import läuft gerade – bitte warten"}

    import shutil
    from datetime import datetime
    from backend.database import db_connection, init_db, DB_PATH

    backup_dir = DB_PATH.parent / "backups"
    backup_dir.mkdir(exist_ok=True)
    backup_name = f"mybiking_pre-reset_{datetime.now().strftime('%Y%m%d_%H%M%S')}.db"
    shutil.copy2(DB_PATH, backup_dir / backup_name)

    with db_connection() as conn:
        conn.executescript("""
            DELETE FROM track_points WHERE activity_id > 0;
            DELETE FROM laps WHERE activity_id > 0;
            DELETE FROM segment_efforts WHERE activity_id > 0;
            DELETE FROM media WHERE activity_id > 0;
            DELETE FROM route_points;
            DELETE FROM routes;
            DELETE FROM activities WHERE id > 0;
            DELETE FROM other_activities;
        """)
    init_db()
    return {"ok": True, "backup": backup_name}
