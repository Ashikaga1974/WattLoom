"""
Einzelimport einer externen .gpx-Datei.
Erkennt anhand von <trk><type> bzw. bike_id ob die Aktivität als Radfahrt
(activities) oder als Workout (other_activities) gespeichert wird.
"""
import sqlite3
from datetime import datetime, timezone

from lxml import etree

from backend.importer.gpx import NS, _attr_float, _text_str, _text_float, _text_int, import_gpx
from backend.utils import haversine_m

# Sport-Strings die als Radfahrt in activities landen (case-insensitive)
# Zeitintervalle unter diesem Schwellwert (m/s) gelten als Pause und fließen
# nicht in die Moving Time ein – analog zu Stravas Logik (~1.4 m/s für Rad)
_MOVING_THRESHOLD_MS = 1.0  # ≈ 3.6 km/h

_CYCLING_SPORTS: set[str] = {"1", "ride", "cycling", "biking", "bike", "e-bike ride"}

_SPORT_LABELS: dict[str, str] = {
    "run":      "Laufen",
    "running":  "Laufen",
    "9":        "Laufen",
    "walk":     "Gehen",
    "walking":  "Gehen",
    "hike":     "Wandern",
    "hiking":   "Wandern",
    "swim":     "Schwimmen",
    "swimming": "Schwimmen",
}


def import_single_gpx(conn: sqlite3.Connection, gpx_bytes: bytes, bike_id: str | None = None) -> dict:
    """
    Importiert eine einzelne .gpx-Datei direkt in die DB.
    - Radtouren (<trk><type>: 1/Ride/cycling oder bike_id gesetzt) → activities
    - Alles andere                                                  → other_activities
    Gibt {"activity_id": int, "name": str, "is_ride": bool} zurück.
    """
    root = etree.fromstring(gpx_bytes)

    # Startzeit: <metadata><time> → erster Trackpunkt
    start_str = _text_str(root, "gpx:metadata/gpx:time")
    if not start_str:
        tpts = root.xpath(".//gpx:trkpt/gpx:time", namespaces=NS)
        start_str = tpts[0].text if tpts else None
    if not start_str:
        raise ValueError("Startzeit konnte nicht aus der GPX-Datei gelesen werden")

    try:
        start_dt = datetime.fromisoformat(start_str.replace("Z", "+00:00"))
    except ValueError:
        raise ValueError(f"Ungültiges Datum in der GPX-Datei: {start_str!r}")
    start_dt = start_dt.astimezone(timezone.utc)

    activity_id = -int(start_dt.timestamp())
    start_date  = start_dt.strftime('%Y-%m-%dT%H:%M:%S')
    local_date  = start_dt.strftime("%d.%m.%Y")

    # Aktivitätsname: <trk><name> → <metadata><name>
    trk_name = _text_str(root, "gpx:trk/gpx:name") or _text_str(root, "gpx:metadata/gpx:name")

    # Sport-Typ aus <trk><type>
    sport_raw = (_text_str(root, "gpx:trk/gpx:type") or "").strip()
    sport_lower = sport_raw.lower()

    # Gerät aus <creator>-Attribut
    creator = root.get("creator", "")
    device_hint = f" ({creator})" if creator else ""

    # Trackpunkte aggregieren: Distanz, Dauer, Elevation, HR
    trkpts = root.xpath(".//gpx:trkpt", namespaces=NS)
    stats = _aggregate_trackpoints(trkpts)

    # Sport-Routing: type-String → Radfahrt, oder bike_id als Signal
    is_ride = sport_lower in _CYCLING_SPORTS or (not sport_lower and bike_id is not None)

    if is_ride:
        if not bike_id:
            raise ValueError("bike_id ist für Radtouren erforderlich")
        name = trk_name or f"Radfahrt {local_date}{device_hint}"
        return _import_as_ride(
            conn, gpx_bytes, activity_id, start_date, local_date,
            name, device_hint, bike_id, stats,
        )

    sport_label = _SPORT_LABELS.get(sport_lower) or (sport_raw.replace("_", " ").title() if sport_raw else "Training")
    name = trk_name or f"{sport_label} {local_date}{device_hint}"
    return _import_as_workout(
        conn, activity_id, start_date, name, sport_label, stats,
    )


def _aggregate_trackpoints(trkpts: list) -> dict:
    """Berechnet Distanz, Moving Time, Elapsed Time, Elevation und HR."""
    total_dist_m  = 0.0
    elev_gain     = 0.0
    elev_loss     = 0.0
    moving_time_s = 0.0
    hr_values: list[int] = []

    prev_lat: float | None = None
    prev_lon: float | None = None
    prev_alt: float | None = None
    prev_ts:  datetime | None = None
    first_ts: datetime | None = None
    last_ts:  datetime | None = None

    for tpt in trkpts:
        lat    = _attr_float(tpt, "lat")
        lon    = _attr_float(tpt, "lon")
        alt    = _text_float(tpt, "gpx:ele")
        ts_str = _text_str(tpt, "gpx:time")
        hr     = (
            _text_int(tpt, ".//gpxdata:hr")
            or _text_int(tpt, ".//ns3:TrackPointExtension/ns3:hr")
        )

        ts_dt: datetime | None = None
        if ts_str:
            try:
                ts_dt = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
            except ValueError:
                pass

        if ts_dt is not None:
            if first_ts is None:
                first_ts = ts_dt
            last_ts = ts_dt

        if lat is not None and lon is not None and prev_lat is not None and prev_lon is not None:
            seg_m = haversine_m(prev_lat, prev_lon, lat, lon)
            total_dist_m += seg_m
            if ts_dt is not None and prev_ts is not None:
                dt_s = (ts_dt - prev_ts).total_seconds()
                # Nur Intervalle mit echter Bewegung zählen (analog Strava Moving Time)
                if dt_s > 0 and seg_m / dt_s >= _MOVING_THRESHOLD_MS:
                    moving_time_s += dt_s

        if alt is not None and prev_alt is not None:
            diff = alt - prev_alt
            if diff > 0:
                elev_gain += diff
            else:
                elev_loss += abs(diff)

        if hr is not None:
            hr_values.append(hr)

        prev_lat, prev_lon, prev_alt = lat, lon, alt
        if ts_dt is not None:
            prev_ts = ts_dt

    elapsed_s = int((last_ts - first_ts).total_seconds()) if (first_ts and last_ts) else None
    avg_hr    = round(sum(hr_values) / len(hr_values)) if hr_values else None

    return {
        "distance_m":       total_dist_m if total_dist_m > 0 else None,
        "moving_time_s":    int(moving_time_s) if moving_time_s > 0 else elapsed_s,
        "elapsed_s":        elapsed_s,
        "elevation_gain_m": round(elev_gain) if elev_gain > 0 else None,
        "elevation_loss_m": round(elev_loss) if elev_loss > 0 else None,
        "avg_hr":           avg_hr,
    }


# ── interne Helfer ─────────────────────────────────────────────────────────────

def _import_as_ride(
    conn: sqlite3.Connection,
    gpx_bytes: bytes,
    activity_id: int,
    start_date: str,
    local_date: str,
    name: str,
    device_hint: str,
    bike_id: str,
    stats: dict,
) -> dict:
    dup = conn.execute("SELECT id FROM activities WHERE id = ?", (activity_id,)).fetchone()
    if dup:
        raise ValueError(f"Aktivität vom {start_date[:16].replace('T', ' ')} UTC bereits importiert (ID {activity_id})")

    dist    = stats["distance_m"]
    moving  = stats["moving_time_s"]
    elapsed = stats["elapsed_s"]
    avg_speed = (dist / moving) if (dist and moving) else None

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
            activity_id, name, "Ride", "Ride",
            start_date, start_date, None,
            dist,
            moving, elapsed,
            stats["elevation_gain_m"], stats["elevation_loss_m"],
            avg_speed, None,
            stats["avg_hr"], None, None, None, None,
            None, None, bike_id,
            0, 0, 1, None, 0,
            datetime.now(timezone.utc).isoformat(),
            device_hint.strip(" ()") or None,
        ))

    import_gpx(conn, activity_id, gpx_bytes, compressed=False)

    count = conn.execute(
        "SELECT COUNT(*) FROM track_points WHERE activity_id = ?", (activity_id,)
    ).fetchone()[0]
    if count > 0:
        with conn:
            conn.execute("UPDATE activities SET has_track=1 WHERE id=?", (activity_id,))

    return {"activity_id": activity_id, "name": name, "is_ride": True}


def _import_as_workout(
    conn: sqlite3.Connection,
    activity_id: int,
    start_date: str,
    name: str,
    sport_label: str,
    stats: dict,
) -> dict:
    dup = conn.execute("SELECT id FROM other_activities WHERE id = ?", (activity_id,)).fetchone()
    if dup:
        raise ValueError(f"Aktivität vom {start_date[:16].replace('T', ' ')} UTC bereits importiert (ID {activity_id})")

    with conn:
        conn.execute("""
            INSERT INTO other_activities
                (id, name, sport_type, start_date_local,
                 moving_time_s, elapsed_time_s, avg_hr, max_hr, calories, imported_at)
            VALUES (?,?,?,?,?,?,?,?,?,?)
        """, (
            activity_id, name, sport_label, start_date,
            stats["elapsed_s"], stats["elapsed_s"],
            stats["avg_hr"], None, None,
            datetime.now(timezone.utc).isoformat(),
        ))

    return {"activity_id": activity_id, "name": name, "is_ride": False}
