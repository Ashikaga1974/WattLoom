"""
Wetter-API: Daten von Open-Meteo für alle Aktivitäten abrufen.
"""

import time

from fastapi import APIRouter, BackgroundTasks

from backend.database import db_connection
from backend.weather import fetch_weather

router = APIRouter(tags=["weather"])

# In-Memory-Status des laufenden Fetch-Jobs
_job: dict = {
    "running": False,
    "total": 0,
    "done": 0,
    "skipped": 0,  # kein Track / keine Koordinaten
    "errors": 0,
}


def _fetch_all_job() -> None:
    """
    Background-Task: holt Wetter für alle Aktivitäten ohne Wetterdaten.
    Nutzt den ersten Track-Punkt mit gültigen Koordinaten als Standort.
    0,1 s Pause zwischen Requests – Open-Meteo-Fair-Use.
    """
    global _job
    _job = {"running": True, "total": 0, "done": 0, "skipped": 0, "errors": 0}

    with db_connection() as conn:
        rows = conn.execute("""
            SELECT
                a.id,
                a.start_date,
                (SELECT lat FROM track_points WHERE activity_id = a.id AND lat IS NOT NULL LIMIT 1) AS lat,
                (SELECT lon FROM track_points WHERE activity_id = a.id AND lon IS NOT NULL LIMIT 1) AS lon
            FROM activities a
            WHERE a.weather_temp_c IS NULL
            ORDER BY a.start_date DESC
        """).fetchall()

    _job["total"] = len(rows)

    for row in rows:
        lat = row["lat"]
        lon = row["lon"]

        if lat is None or lon is None:
            _job["skipped"] += 1
            continue

        weather = fetch_weather(lat, lon, row["start_date"])

        if weather is None:
            _job["errors"] += 1
        else:
            with db_connection() as conn:
                conn.execute(
                    """
                    UPDATE activities
                    SET weather_temp_c = ?, weather_wind_ms = ?, weather_wind_deg = ?, weather_precip_mm = ?
                    WHERE id = ?
                    """,
                    (
                        weather["temp_c"],
                        weather["wind_ms"],
                        weather["wind_deg"],
                        weather["precip_mm"],
                        row["id"],
                    ),
                )
                conn.commit()
            _job["done"] += 1

        time.sleep(0.1)

    _job["running"] = False


@router.post("/weather/fetch-all")
def weather_fetch_all(background_tasks: BackgroundTasks):
    """Startet den Wetter-Fetch im Hintergrund (nur wenn kein Job läuft)."""
    if _job["running"]:
        return {"ok": False, "message": "Bereits läuft"}
    background_tasks.add_task(_fetch_all_job)
    return {"ok": True, "message": "Gestartet"}


@router.get("/weather/status")
def weather_status():
    """Aktueller Stand: laufender Job + Gesamt-Statistik."""
    with db_connection() as conn:
        total = conn.execute("SELECT COUNT(*) FROM activities").fetchone()[0]
        with_weather = conn.execute(
            "SELECT COUNT(*) FROM activities WHERE weather_temp_c IS NOT NULL"
        ).fetchone()[0]

    return {
        **_job,
        "total_activities": total,
        "with_weather": with_weather,
        "without_weather": total - with_weather,
    }
