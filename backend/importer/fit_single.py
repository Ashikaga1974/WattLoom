"""
Einzelimport einer externen .fit-Datei (kein Strava-ZIP).
Erkennt anhand des Sport-Typs selbst, ob die Aktivität als Radfahrt (activities)
oder als sonstiges Workout (other_activities) gespeichert wird.
"""
import io
import sqlite3
from datetime import datetime, timezone
from typing import Any

import fitparse

from backend.importer.fit import _SafeProcessor, _val, import_fit
from backend.utils import haversine_m


# Sportarten die als Radfahrt in activities landen
_CYCLING_SPORTS: set[str] = {"cycling", "generic"}

# Anzeigename für Sport/Sub-Sport in other_activities.sport_type
_SUB_SPORT_LABELS: dict[str, str] = {
    "strength_training": "Krafttraining",
    "yoga":              "Yoga",
    "cardio_training":   "Cardio",
    "flexibility_training": "Dehnen",
    "warm_up":           "Aufwärmen",
    "cool_down":         "Abkühlen",
}

_SPORT_LABELS: dict[str, str] = {
    "generic":   "Training",
    "training":  "Training",
    "running":   "Laufen",
    "walking":   "Gehen",
    "swimming":  "Schwimmen",
    "hiking":    "Wandern",
    "yoga":      "Yoga",
    "fitness_equipment": "Fitness",
}



def import_single_fit(conn: sqlite3.Connection, fit_bytes: bytes, bike_id: str | None = None) -> dict:
    """
    Importiert eine einzelne .fit-Datei direkt in die DB (ohne Strava-ZIP).
    - Radtouren (sport: cycling/generic) → activities; bike_id ist dann Pflicht.
    - Alles andere                       → other_activities; bike_id wird ignoriert.
    Gibt {"activity_id": int, "name": str, "is_ride": bool} zurück.
    Wirft ValueError bei Duplikat, fehlendem Pflichtfeld oder fehlendem bike_id für Radtouren.
    """
    fit = fitparse.FitFile(io.BytesIO(fit_bytes), data_processor=_SafeProcessor())

    session_msg = None
    device_hint = ""
    for msg in fit.get_messages():
        if msg.name == "session" and session_msg is None:
            session_msg = msg
        elif msg.name == "file_id" and not device_hint:
            pn = _val(msg, "product_name")
            if pn:
                device_hint = f" ({pn})"

    if session_msg is None:
        raise ValueError("Keine session-Message in der FIT-Datei gefunden")

    def sv(field: str) -> Any:
        return _val(session_msg, field)

    # start_time → UTC-Datetime und activity_id
    start_raw = sv("start_time")
    if start_raw is None:
        raise ValueError("start_time fehlt in der FIT-Datei")
    if isinstance(start_raw, datetime):
        start_dt = start_raw.replace(tzinfo=timezone.utc)
    else:
        start_dt = datetime.fromtimestamp(631065600 + int(start_raw), tz=timezone.utc)

    # Negativer Unix-Timestamp → kein Kollisionsrisiko mit positiven Strava-IDs
    activity_id = -int(start_dt.timestamp())
    start_date  = start_dt.strftime('%Y-%m-%dT%H:%M:%S')
    local_date  = start_dt.strftime("%d.%m.%Y")

    sport_raw = sv("sport")
    sport_str = str(sport_raw).lower() if sport_raw is not None else "cycling"

    # "generic" ohne bike_id → als Workout importieren (z.B. Morgentraining von Amazfit)
    # "cycling" ohne bike_id → Fehler (expliziter Rad-Sport braucht Bike-Zuweisung)
    if sport_str in _CYCLING_SPORTS:
        if bike_id:
            return _import_as_ride(conn, fit, fit_bytes, session_msg, sv,
                                   activity_id, start_date, local_date, device_hint, bike_id)
        if sport_str != "generic":
            raise ValueError("bike_id ist für Radtouren erforderlich")

    return _import_as_workout(conn, session_msg, sv,
                              activity_id, start_date, local_date, device_hint, sport_str)


# ── interne Helfer ────────────────────────────────────────────────────────────

def _import_as_ride(
    conn: sqlite3.Connection,
    fit: Any,
    fit_bytes: bytes,
    session_msg: Any,
    sv: Any,
    activity_id: int,
    start_date: str,
    local_date: str,
    device_hint: str,
    bike_id: str,
) -> dict:
    """Speichert eine Radtour in der activities-Tabelle."""
    _check_duplicate(conn, activity_id, start_date)

    distance_m  = sv("total_distance")
    moving_time = sv("total_timer_time")
    elapsed_time = sv("total_elapsed_time")

    avg_speed = sv("avg_speed") or sv("enhanced_avg_speed")
    if avg_speed is None and distance_m and moving_time and float(moving_time) > 0:
        avg_speed = float(distance_m) / float(moving_time)
    max_speed = sv("max_speed") or sv("enhanced_max_speed")

    activity_name = f"Radfahrt {local_date}{device_hint}"

    with conn:
        conn.execute("""
            INSERT INTO activities (
                id, name, activity_type, sport_type, start_date, start_date_local,
                timezone, distance_m, moving_time_s, elapsed_time_s,
                elevation_gain_m, elevation_loss_m,
                avg_speed_ms, max_speed_ms,
                avg_hr, max_hr, avg_power_w, max_power_w, avg_cadence,
                avg_temp_c, calories, bike_id, commute, trainer, manual,
                track_file, has_track, imported_at, smart_device
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, (
            activity_id,
            activity_name,
            "Ride",
            "Ride",
            start_date,
            start_date,
            None,
            distance_m,
            int(float(moving_time))  if moving_time  is not None else None,
            int(float(elapsed_time)) if elapsed_time is not None else None,
            sv("total_ascent"),
            sv("total_descent"),
            avg_speed,
            max_speed,
            sv("avg_heart_rate"),
            sv("max_heart_rate"),
            sv("avg_power"),
            sv("max_power"),
            sv("avg_cadence"),
            sv("avg_temperature"),
            sv("total_calories"),
            bike_id,
            0, 0, 1, None, 0,
            datetime.now(timezone.utc).isoformat(),
            "Amazfit",
        ))

    import_fit(conn, activity_id, fit_bytes, compressed=False)
    _fill_distance_if_missing(conn, activity_id)

    count = conn.execute(
        "SELECT COUNT(*) FROM track_points WHERE activity_id = ?", (activity_id,)
    ).fetchone()[0]
    if count > 0:
        with conn:
            conn.execute("UPDATE activities SET has_track=1 WHERE id=?", (activity_id,))

    return {"activity_id": activity_id, "name": activity_name, "is_ride": True}


def _import_as_workout(
    conn: sqlite3.Connection,
    session_msg: Any,
    sv: Any,
    activity_id: int,
    start_date: str,
    local_date: str,
    device_hint: str,
    sport_str: str,
) -> dict:
    """Speichert ein Nicht-Rad-Workout in der other_activities-Tabelle."""
    # Duplikat-Check in other_activities
    dup = conn.execute("SELECT id FROM other_activities WHERE id = ?", (activity_id,)).fetchone()
    if dup:
        start_label = start_date[:16].replace("T", " ")
        raise ValueError(
            f"Aktivität vom {start_label} UTC bereits importiert (ID {activity_id})"
        )

    sub_sport_raw = _val(session_msg, "sub_sport")
    sub_sport_str = str(sub_sport_raw).lower().replace(" ", "_") if sub_sport_raw else ""

    # Anzeigename: Sub-Sport hat Vorrang vor Sport
    sport_label = (
        _SUB_SPORT_LABELS.get(sub_sport_str)
        or _SPORT_LABELS.get(sport_str)
        or sport_str.replace("_", " ").title()
    )

    activity_name = f"{sport_label} {local_date}{device_hint}"
    moving_time  = sv("total_timer_time")
    elapsed_time = sv("total_elapsed_time")

    with conn:
        conn.execute("""
            INSERT INTO other_activities
                (id, name, sport_type, start_date_local,
                 moving_time_s, elapsed_time_s, avg_hr, max_hr, calories, imported_at)
            VALUES (?,?,?,?,?,?,?,?,?,?)
        """, (
            activity_id,
            activity_name,
            sport_label,
            start_date,
            int(float(moving_time))  if moving_time  is not None else None,
            int(float(elapsed_time)) if elapsed_time is not None else None,
            sv("avg_heart_rate"),
            sv("max_heart_rate"),
            sv("total_calories"),
            datetime.now(timezone.utc).isoformat(),
        ))

    return {"activity_id": activity_id, "name": activity_name, "is_ride": False}


def _check_duplicate(conn: sqlite3.Connection, activity_id: int, start_date: str) -> None:
    dup = conn.execute("SELECT id FROM activities WHERE id = ?", (activity_id,)).fetchone()
    if dup:
        start_label = start_date[:16].replace("T", " ")
        raise ValueError(
            f"Aktivität vom {start_label} UTC bereits importiert (ID {activity_id})"
        )


def _fill_distance_if_missing(conn: sqlite3.Connection, activity_id: int) -> None:
    """Berechnet und schreibt kumulative Distanz in track_points via Haversine.
    Wird nur ausgeführt wenn distance_m in allen Punkten NULL ist."""
    has_dist = conn.execute(
        "SELECT 1 FROM track_points WHERE activity_id = ? AND distance_m IS NOT NULL LIMIT 1",
        (activity_id,),
    ).fetchone()
    if has_dist:
        return

    rows = conn.execute(
        "SELECT id, lat, lon FROM track_points WHERE activity_id = ? ORDER BY timestamp",
        (activity_id,),
    ).fetchall()

    cum = 0.0
    prev_lat: float | None = None
    prev_lon: float | None = None
    updates: list[tuple[float, int]] = []

    for row in rows:
        lat, lon = row["lat"], row["lon"]
        if lat is not None and lon is not None and prev_lat is not None and prev_lon is not None:
            cum += haversine_m(prev_lat, prev_lon, lat, lon)
        updates.append((cum, row["id"]))
        if lat is not None and lon is not None:
            prev_lat, prev_lon = lat, lon

    with conn:
        conn.executemany("UPDATE track_points SET distance_m = ? WHERE id = ?", updates)
