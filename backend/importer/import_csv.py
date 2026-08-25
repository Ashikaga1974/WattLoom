"""Import von bikes.csv und activities.csv (Radtouren + andere Sportarten)."""

import csv
import io
import zipfile
from pathlib import Path

from backend.database import db_connection
from backend.importer.csv_helpers import (
    _ACTIVITY_COL_MAP, _BIKES_COL_MAP, _normalize_row, _now_iso,
    _to_bool, _to_float, _to_int, _parse_date,
)
from backend.importer.sport_codes import is_ride_sport, to_sport_code

# Aktivitäten ohne Bike-Zuordnung in Strava bekommen dieses Bike als Fallback.
DEFAULT_BIKE_ID = "stevens"

# Feste Allowlist erkannter Nicht-Rad-Aktivitätsarten aus dem Strava-CSV-Export – bewusst
# kein sport_codes.is_ride_sport()-Gegenstück ("nicht Ride"), da eine noch unbekannte
# Aktivitätsart in der CSV weiterhin komplett übersprungen werden soll statt automatisch
# als "training" importiert zu werden.
OTHER_TYPES = {"Workout", "Weight Training",
               "Training", "Gewichtstraining"}


def import_bikes(zf: zipfile.ZipFile) -> dict[str, str]:
    """Importiert Bikes und gibt Name→ID-Mapping zurück.
    bikes.csv hat keine ID-Spalte – wir nutzen den Namen direkt als ID."""
    with zf.open("bikes.csv") as f:
        reader = csv.DictReader(io.TextIOWrapper(f, encoding="utf-8"))
        rows = [_normalize_row(r, _BIKES_COL_MAP) for r in reader]

    name_to_id: dict[str, str] = {}

    with db_connection() as conn:
        with conn:
            for r in rows:
                name = r.get("Bike Name") or r.get("name") or ""
                if not name:
                    continue
                # ID = normierter Name (lowercase, Leerzeichen→underscore)
                bike_id = name.lower().replace(" ", "_")
                name_to_id[name] = bike_id
                conn.execute("""
                    INSERT OR REPLACE INTO bikes (id, name, brand, model, description, distance_m, retired)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (
                    bike_id,
                    name,
                    r.get("Bike Brand") or r.get("brand_name"),
                    r.get("Bike Model") or r.get("model_name"),
                    r.get("description"),
                    _to_float(r.get("converted_distance")),
                    0,
                ))

    print(f"  Bikes importiert: {len(rows)} → {name_to_id}")
    return name_to_id


def import_activities_csv(
    zf: zipfile.ZipFile,
    bike_name_to_id: dict[str, str] | None = None,
) -> tuple[list[dict], dict[str, int]]:
    """Gibt (rides, media_map) zurück.
    media_map: Dateiname → activity_id für alle Aktivitäten mit Fotos."""
    with zf.open("activities.csv") as f:
        reader = csv.DictReader(io.TextIOWrapper(f, encoding="utf-8"))
        rows = [_normalize_row(r, _ACTIVITY_COL_MAP) for r in reader]

    rides = [r for r in rows if is_ride_sport(r.get("Activity Type"))]
    bike_map = bike_name_to_id or {}

    # Media-Mapping aus allen Zeilen (nicht nur Rides) aufbauen
    media_map: dict[str, int] = {}
    for r in rows:
        act_id = _to_int(r.get("Activity ID"))
        for raw in (r.get("Media") or "").split("|"):
            fname = Path(raw.strip()).name
            if fname and act_id:
                media_map[fname] = act_id

    imported = 0
    with db_connection() as conn:
        default_bike_row = conn.execute(
            "SELECT value FROM config WHERE key = 'default_bike_id'"
        ).fetchone()
        default_bike_id = default_bike_row["value"] if default_bike_row else DEFAULT_BIKE_ID

        with conn:
            for r in rides:
                activity_id = _to_int(r.get("Activity ID"))
                if activity_id is None:
                    continue
                # Bike: 'Activity Gear' enthält den Namen → auf ID mappen; kein Gear → Fallback
                gear_name = r.get("Activity Gear") or ""
                bike_id = bike_map.get(gear_name) or (gear_name.lower().replace(" ", "_") if gear_name else None)
                if not bike_id:
                    bike_id = default_bike_id

                filename = r.get("Filename") or None
                if filename:
                    # Gerät wird nach dem Track-Import aus der Datei gelesen (import_tracks)
                    smart_device = "Unbekannt"
                else:
                    # Kein Dateiname im CSV → bestehenden Wert in der DB behalten
                    existing = conn.execute(
                        "SELECT smart_device FROM activities WHERE id = ?", (activity_id,)
                    ).fetchone()
                    smart_device = existing["smart_device"] if existing else "Unbekannt"

                sport_code = to_sport_code(r.get("Activity Type"))
                conn.execute("""
                    INSERT OR REPLACE INTO activities (
                        id, name, activity_type, sport_type, start_date, start_date_local,
                        timezone, distance_m, moving_time_s, elapsed_time_s,
                        elevation_gain_m, elevation_loss_m,
                        avg_speed_ms, max_speed_ms,
                        avg_hr, max_hr, avg_power_w, max_power_w, avg_cadence,
                        avg_temp_c, calories, bike_id, commute, trainer, manual,
                        track_file, imported_at, smart_device
                    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                """, (
                    activity_id,
                    r.get("Activity Name"),
                    sport_code,
                    sport_code,
                    _parse_date(r.get("Activity Date")),
                    _parse_date(r.get("Activity Date")),
                    r.get("Timezone") or r.get("UTC Offset"),
                    _to_float(r.get("Distance")),   # CSV: Meter
                    _to_int(r.get("Moving Time")),
                    _to_int(r.get("Elapsed Time")),
                    _to_float(r.get("Elevation Gain")),
                    _to_float(r.get("Elevation Loss")),
                    _to_float(r.get("Average Speed")),
                    _to_float(r.get("Max Speed")),
                    _to_float(r.get("Average Heart Rate")),
                    _to_int(r.get("Max Heart Rate")),
                    _to_float(r.get("Average Watts")),
                    _to_int(r.get("Max Watts")),
                    _to_float(r.get("Average Cadence")),
                    _to_float(r.get("Average Temp")),
                    _to_float(r.get("Calories")),
                    bike_id,
                    _to_bool(r.get("Commute")),
                    0,                          # trainer – kein verlässliches CSV-Feld
                    0,                          # manual – kein direktes CSV-Feld
                    filename,
                    _now_iso(),
                    smart_device,
                ))
                imported += 1
                if imported % 50 == 0:
                    print(f"  … {imported}/{len(rides)} Activities verarbeitet")
    print(f"  Activities importiert: {imported} Rides (von {len(rows)} gesamt)")
    return rides, media_map


def import_other_activities_csv(zf: zipfile.ZipFile) -> None:
    with zf.open("activities.csv") as f:
        reader = csv.DictReader(io.TextIOWrapper(f, encoding="utf-8"))
        all_rows = [_normalize_row(r, _ACTIVITY_COL_MAP) for r in reader]
    rows = [r for r in all_rows if r.get("Activity Type") in OTHER_TYPES]

    imported = 0
    with db_connection() as conn:
        with conn:
            for r in rows:
                activity_id = _to_int(r.get("Activity ID"))
                if activity_id is None:
                    continue
                conn.execute("""
                    INSERT OR REPLACE INTO other_activities (
                        id, name, sport_type, start_date_local,
                        moving_time_s, elapsed_time_s,
                        avg_hr, max_hr, calories, imported_at
                    ) VALUES (?,?,?,?,?,?,?,?,?,?)
                """, (
                    activity_id,
                    r.get("Activity Name"),
                    to_sport_code(r.get("Activity Type")),
                    _parse_date(r.get("Activity Date")),
                    _to_int(r.get("Moving Time")),
                    _to_int(r.get("Elapsed Time")),
                    _to_float(r.get("Average Heart Rate")),
                    _to_int(r.get("Max Heart Rate")),
                    _to_float(r.get("Calories")),
                    _now_iso(),
                ))
                imported += 1
    print(f"  Other Activities importiert: {imported} (Workout/Weight Training)")
