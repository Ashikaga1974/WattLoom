"""
Einzelimport einer externen .fit-Datei (kein Strava-ZIP).
Extrahiert Aktivitäts-Metadaten aus dem session-Block und berechnet
kumulative Distanz via Haversine wenn kein distance-Feld in den records vorhanden.
"""
import io
import math
import sqlite3
from datetime import datetime, timezone
from typing import Any

import fitparse

from backend.importer.fit import _SafeProcessor, _val, import_fit


_SPORT_TO_ACTIVITY_TYPE: dict[str, str] = {
    "cycling": "Ride",
    "running": "Run",
    "walking": "Walk",
    "swimming": "Swim",
    "generic": "Ride",
}


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6_371_000.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = phi2 - phi1
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return 2.0 * R * math.asin(math.sqrt(max(0.0, min(1.0, a))))


def import_single_fit(conn: sqlite3.Connection, fit_bytes: bytes, bike_id: str) -> dict:
    """
    Importiert eine einzelne .fit-Datei direkt in die DB (ohne Strava-ZIP).
    Gibt {"activity_id": int, "name": str} zurück.
    Wirft ValueError bei Duplikat oder fehlenden Pflichtfeldern.
    """
    fit = fitparse.FitFile(io.BytesIO(fit_bytes), data_processor=_SafeProcessor())

    # Einmaliger Durchlauf für session + file_id
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
        # Garmin-Epoch: 631065600 Sekunden Offset zu Unix-Epoch
        start_dt = datetime.fromtimestamp(631065600 + int(start_raw), tz=timezone.utc)

    # Negativer Unix-Timestamp → kein Kollisionsrisiko mit positiven Strava-IDs
    activity_id = -int(start_dt.timestamp())
    start_date = start_dt.isoformat()

    # Duplikat-Check
    dup = conn.execute("SELECT id FROM activities WHERE id = ?", (activity_id,)).fetchone()
    if dup:
        raise ValueError(
            f"Aktivität vom {start_dt.strftime('%d.%m.%Y %H:%M')} UTC "
            f"bereits importiert (ID {activity_id})"
        )

    # Distanz und Zeiten
    distance_m = sv("total_distance")
    moving_time_s = sv("total_timer_time")
    elapsed_time_s = sv("total_elapsed_time")

    # avg_speed aus session oder berechnen
    avg_speed = sv("avg_speed") or sv("enhanced_avg_speed")
    if avg_speed is None and distance_m and moving_time_s and float(moving_time_s) > 0:
        avg_speed = float(distance_m) / float(moving_time_s)
    max_speed = sv("max_speed") or sv("enhanced_max_speed")

    # Sport → activity_type (kompatibel mit RIDE_TYPES-Filter im Backend)
    sport_raw = sv("sport")
    sport_str = str(sport_raw).lower() if sport_raw is not None else "cycling"
    activity_type = _SPORT_TO_ACTIVITY_TYPE.get(sport_str, "Ride")

    # Aktivitätsname generieren
    local_date = start_dt.strftime("%d.%m.%Y")
    activity_name = f"Radfahrt {local_date}{device_hint}"

    # Aktivität in DB einfügen
    with conn:
        conn.execute("""
            INSERT INTO activities (
                id, name, activity_type, sport_type, start_date, start_date_local,
                timezone, distance_m, moving_time_s, elapsed_time_s,
                elevation_gain_m, elevation_loss_m,
                avg_speed_ms, max_speed_ms,
                avg_hr, max_hr, avg_power_w, max_power_w, avg_cadence,
                avg_temp_c, calories, bike_id, commute, trainer, manual,
                track_file, has_track, imported_at
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, (
            activity_id,
            activity_name,
            activity_type,
            activity_type,
            start_date,
            start_date,       # start_date_local = UTC (kein Offset aus FIT bekannt)
            None,             # timezone
            distance_m,
            int(float(moving_time_s)) if moving_time_s is not None else None,
            int(float(elapsed_time_s)) if elapsed_time_s is not None else None,
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
            0,    # commute
            0,    # trainer
            1,    # manual = True (kein Strava-Import)
            None, # track_file
            0,    # has_track – wird nach Track-Import gesetzt
            datetime.now(timezone.utc).isoformat(),
        ))

    # Track-Punkte über bestehenden FIT-Parser importieren
    import_fit(conn, activity_id, fit_bytes, compressed=False)

    # Kumulative Distanz via Haversine berechnen wenn records kein distance-Feld haben
    _fill_distance_if_missing(conn, activity_id)

    # has_track setzen wenn Track-Punkte vorhanden
    count = conn.execute(
        "SELECT COUNT(*) FROM track_points WHERE activity_id = ?", (activity_id,)
    ).fetchone()[0]
    if count > 0:
        with conn:
            conn.execute("UPDATE activities SET has_track=1 WHERE id=?", (activity_id,))

    return {"activity_id": activity_id, "name": activity_name}


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
