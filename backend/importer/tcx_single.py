"""
Einzelimport einer externen .tcx-Datei (kein Strava-ZIP).
Erkennt anhand des Sport-Typs ob die Aktivität als Radfahrt (activities)
oder als sonstiges Workout (other_activities) gespeichert wird.
"""
import sqlite3
from datetime import datetime, timezone

from lxml import etree

from backend.importer.tcx import NS, _float, _int, _text, import_tcx, read_tcx_device
from backend.importer.sport_codes import to_sport_code


# Sport-Attribute die als Radfahrt in activities landen (case-insensitive)
_CYCLING_SPORTS: set[str] = {"biking", "cycling", "bike"}


def import_single_tcx(conn: sqlite3.Connection, tcx_bytes: bytes, bike_id: str | None = None) -> dict:
    """
    Importiert eine einzelne .tcx-Datei direkt in die DB.
    - Radtouren (Sport: biking/cycling) → activities; bike_id ist dann Pflicht.
    - Alles andere                      → other_activities; bike_id wird ignoriert.
    Gibt {"activity_id": int, "name": str, "is_ride": bool} zurück.
    """
    raw = tcx_bytes.lstrip()
    root = etree.fromstring(raw)

    acts = root.xpath(".//ns:Activity", namespaces=NS)
    if not acts:
        raise ValueError("Kein <Activity>-Element in der TCX-Datei gefunden")
    activity_el = acts[0]

    sport_lower = activity_el.get("Sport", "").strip().lower()

    # Startzeit: <Id> → Lap StartTime → erster Trackpoint
    start_str = _text(activity_el, "ns:Id")
    if not start_str:
        laps_els = activity_el.xpath("ns:Lap", namespaces=NS)
        if laps_els:
            start_str = laps_els[0].get("StartTime")
    if not start_str:
        tps = activity_el.xpath(".//ns:Trackpoint/ns:Time", namespaces=NS)
        start_str = tps[0].text if tps else None
    if not start_str:
        raise ValueError("Startzeit konnte nicht aus der TCX-Datei gelesen werden")

    try:
        start_dt = datetime.fromisoformat(start_str.replace("Z", "+00:00"))
    except ValueError:
        raise ValueError(f"Ungültiges Datum in der TCX-Datei: {start_str!r}")
    start_dt = start_dt.astimezone(timezone.utc)

    # Negativer Unix-Timestamp → kein Kollisionsrisiko mit positiven Strava-IDs
    activity_id = -int(start_dt.timestamp())
    start_date  = start_dt.strftime('%Y-%m-%dT%H:%M:%S')

    # Laps aggregieren
    laps = activity_el.xpath("ns:Lap", namespaces=NS)
    total_time     = sum((_float(lap, "ns:TotalTimeSeconds") or 0.0) for lap in laps) or None
    total_distance = sum((_float(lap, "ns:DistanceMeters")  or 0.0) for lap in laps) or None

    # Kalorien: Activity-Ebene hat Vorrang vor Lap-Summe
    cal_activity   = _float(activity_el, "ns:Calories")
    cal_laps       = sum((_float(lap, "ns:Calories") or 0.0) for lap in laps) or None
    total_calories = cal_activity if cal_activity is not None else cal_laps

    # HR aus Laps: Standard-TCX nutzt <AverageHeartRateBpm><Value>, Mi Fitness direkt <HeartRateBpm>
    hr_vals: list[float] = []
    for lap in laps:
        v = _float(lap, "ns:AverageHeartRateBpm/ns:Value") or _float(lap, "ns:HeartRateBpm")
        if v is not None:
            hr_vals.append(v)
    avg_hr = round(sum(hr_vals) / len(hr_vals)) if hr_vals else None

    max_hr_vals = [_int(lap, "ns:MaximumHeartRateBpm/ns:Value") for lap in laps]
    max_hr = max((v for v in max_hr_vals if v is not None), default=None)

    # Mi Fitness und ähnliche Apps setzen Sport="" – wenn bike_id übergeben wurde,
    # ist das ein hinreichendes Signal dass es eine Radfahrt ist.
    is_ride = sport_lower in _CYCLING_SPORTS or (sport_lower == "" and bike_id is not None)

    if is_ride:
        if not bike_id:
            raise ValueError("bike_id ist für Radtouren erforderlich")
        return _import_as_ride(
            conn, tcx_bytes, activity_id, start_date,
            bike_id, total_time, total_distance, total_calories, avg_hr, max_hr,
        )

    return _import_as_workout(
        conn, tcx_bytes, activity_id, start_date,
        sport_lower, total_time, total_calories, avg_hr, max_hr,
    )


# ── interne Helfer ────────────────────────────────────────────────────────────

def _import_as_ride(
    conn: sqlite3.Connection,
    tcx_bytes: bytes,
    activity_id: int,
    start_date: str,
    bike_id: str,
    total_time: float | None,
    total_distance: float | None,
    total_calories: float | None,
    avg_hr: int | None,
    max_hr: int | None,
) -> dict:
    dup = conn.execute("SELECT id FROM activities WHERE id = ?", (activity_id,)).fetchone()
    if dup:
        raise ValueError(f"Aktivität vom {start_date[:16].replace('T', ' ')} UTC bereits importiert (ID {activity_id})")

    avg_speed = (total_distance / total_time) if (total_distance and total_time) else None
    # Kein komponierter deutscher Name mehr – siehe fit_single.py._import_as_ride.
    activity_name = None

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
            activity_id, activity_name, "ride", "ride",
            start_date, start_date, None,
            total_distance,
            int(total_time) if total_time else None,
            int(total_time) if total_time else None,
            None, None,
            avg_speed, None,
            avg_hr, max_hr, None, None, None,
            None, total_calories, bike_id,
            0, 0, 1, None, 0,
            datetime.now(timezone.utc).isoformat(),
            read_tcx_device(tcx_bytes, compressed=False),
        ))

    import_tcx(conn, activity_id, tcx_bytes, compressed=False)

    count = conn.execute(
        "SELECT COUNT(*) FROM track_points WHERE activity_id = ?", (activity_id,)
    ).fetchone()[0]
    if count > 0:
        with conn:
            conn.execute("UPDATE activities SET has_track=1 WHERE id=?", (activity_id,))

    return {
        "activity_id": activity_id, "name": activity_name, "is_ride": True,
        "sport_type": "ride", "start_date_local": start_date,
    }


def _import_as_workout(
    conn: sqlite3.Connection,
    tcx_bytes: bytes,
    activity_id: int,
    start_date: str,
    sport_lower: str,
    total_time: float | None,
    total_calories: float | None,
    avg_hr: int | None,
    max_hr: int | None,
) -> dict:
    dup = conn.execute("SELECT id FROM other_activities WHERE id = ?", (activity_id,)).fetchone()
    if dup:
        raise ValueError(f"Aktivität vom {start_date[:16].replace('T', ' ')} UTC bereits importiert (ID {activity_id})")

    sport_code = to_sport_code(sport_lower)
    activity_name = None

    with conn:
        conn.execute("""
            INSERT INTO other_activities
                (id, name, sport_type, start_date_local,
                 moving_time_s, elapsed_time_s, avg_hr, max_hr, calories, imported_at)
            VALUES (?,?,?,?,?,?,?,?,?,?)
        """, (
            activity_id, activity_name, sport_code, start_date,
            int(total_time) if total_time else None,
            int(total_time) if total_time else None,
            avg_hr, max_hr, total_calories,
            datetime.now(timezone.utc).isoformat(),
        ))

    # Kein import_tcx: track_points und laps haben FK auf activities, nicht other_activities

    return {
        "activity_id": activity_id, "name": activity_name, "is_ride": False,
        "sport_type": sport_code, "start_date_local": start_date,
    }
