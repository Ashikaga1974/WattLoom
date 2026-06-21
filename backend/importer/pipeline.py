"""
Import-Pipeline: liest den Strava-Export-ZIP und befüllt die SQLite-DB.
Reihenfolge: bikes → activities (CSV) → track-Dateien (FIT/TCX/GPX) → routes → media
"""

import csv
import logging
import zipfile
import io
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from backend.database import db_connection, init_db

logger = logging.getLogger(__name__)

DOWNLOAD_DIR = Path(__file__).parent.parent.parent / "download"

# Aktivitäten ohne Bike-Zuordnung in Strava bekommen dieses Bike als Fallback.
DEFAULT_BIKE_ID = "stevens"


def _find_latest_zip() -> Path:
    zips = sorted(DOWNLOAD_DIR.glob("*.zip"), key=lambda p: p.stat().st_mtime, reverse=True)
    if not zips:
        raise FileNotFoundError(f"Kein ZIP-Archiv in {DOWNLOAD_DIR} gefunden")
    return zips[0]


# ---------------------------------------------------------------------------
# Hilfsfunktionen
# ---------------------------------------------------------------------------

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _to_int(v: Any) -> int | None:
    try:
        return int(float(v)) if v not in (None, "", "None") else None
    except (ValueError, TypeError):
        return None


def _to_float(v: Any) -> float | None:
    try:
        return float(v) if v not in (None, "", "None") else None
    except (ValueError, TypeError):
        return None


def _to_bool(v: Any) -> int:
    """Strava CSV nutzt '0.0'/'1.0' oder 'True'/'False'."""
    s = str(v).strip().lower()
    return 1 if s in ("true", "1", "1.0") else 0


_STRAVA_DATE_FMT = "%b %d, %Y, %I:%M:%S %p"


def _parse_date(v: str | None) -> str | None:
    """Strava-Datum ('Jun 17, 2023, 8:59:12 AM') → ISO8601-String."""
    if not v:
        return None
    try:
        return datetime.strptime(v, _STRAVA_DATE_FMT).isoformat()
    except ValueError:
        return v  # Fallback: Originalwert behalten


# ---------------------------------------------------------------------------
# Bikes
# ---------------------------------------------------------------------------

def import_bikes(zf: zipfile.ZipFile) -> dict[str, str]:
    """Importiert Bikes und gibt Name→ID-Mapping zurück.
    bikes.csv hat keine ID-Spalte – wir nutzen den Namen direkt als ID."""
    with zf.open("bikes.csv") as f:
        reader = csv.DictReader(io.TextIOWrapper(f, encoding="utf-8"))
        rows = list(reader)

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


# ---------------------------------------------------------------------------
# Activities (CSV)
# ---------------------------------------------------------------------------

RIDE_TYPES = {"Ride", "VirtualRide", "EBikeRide", "GravelRide", "MountainBikeRide"}
OTHER_TYPES = {"Workout", "Weight Training"}


def import_activities_csv(
    zf: zipfile.ZipFile,
    bike_name_to_id: dict[str, str] | None = None,
) -> tuple[list[dict], dict[str, int]]:
    """Gibt (rides, media_map) zurück.
    media_map: Dateiname → activity_id für alle Aktivitäten mit Fotos."""
    with zf.open("activities.csv") as f:
        reader = csv.DictReader(io.TextIOWrapper(f, encoding="utf-8"))
        rows = list(reader)

    rides = [r for r in rows if r.get("Activity Type") in RIDE_TYPES]
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
        with conn:
            for r in rides:
                activity_id = _to_int(r.get("Activity ID"))
                if activity_id is None:
                    continue
                # Bike: 'Activity Gear' enthält den Namen → auf ID mappen; kein Gear → Fallback
                gear_name = r.get("Activity Gear") or ""
                bike_id = bike_map.get(gear_name) or (gear_name.lower().replace(" ", "_") if gear_name else None)
                if not bike_id:
                    bike_id = DEFAULT_BIKE_ID

                filename = r.get("Filename") or None
                if filename and filename.endswith(".fit.gz"):
                    smart_device = "Amazfit"
                elif filename and filename.endswith(".tcx.gz"):
                    smart_device = "Cyplus"
                elif filename:
                    # GPX oder anderes bekanntes Format – Gerät unbekannt
                    smart_device = "Unbekannt"
                else:
                    # Kein Dateiname im CSV → bestehenden Wert in der DB behalten
                    existing = conn.execute(
                        "SELECT smart_device FROM activities WHERE id = ?", (activity_id,)
                    ).fetchone()
                    smart_device = existing["smart_device"] if existing else "Unbekannt"

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
                    r.get("Activity Type"),
                    r.get("Activity Type"),
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


# ---------------------------------------------------------------------------
# Other Activities (Workout, Weight Training)
# ---------------------------------------------------------------------------

def import_other_activities_csv(zf: zipfile.ZipFile) -> None:
    with zf.open("activities.csv") as f:
        reader = csv.DictReader(io.TextIOWrapper(f, encoding="utf-8"))
        rows = [r for r in reader if r.get("Activity Type") in OTHER_TYPES]

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
                    r.get("Activity Type"),
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


# ---------------------------------------------------------------------------
# Track-Dateien
# ---------------------------------------------------------------------------

def import_tracks(zf: zipfile.ZipFile, rides: list[dict]) -> None:
    from backend.importer import fit, tcx, gpx

    ok = err = skip = 0
    total = len(rides)

    with db_connection() as conn:
        for i, r in enumerate(rides):
            filename = r.get("Filename")
            if not filename:
                skip += 1
                continue

            activity_id = _to_int(r.get("Activity ID"))
            try:
                with zf.open(filename) as raw:
                    data = raw.read()
            except KeyError:
                print(f"  WARN: {filename} nicht in ZIP")
                logger.warning("Track-Datei nicht in ZIP: %s (activity %s)", filename, activity_id)
                err += 1
                continue

            try:
                if filename.endswith(".fit.gz"):
                    fit.import_fit(conn, activity_id, data, compressed=True)
                elif filename.endswith(".fit"):
                    fit.import_fit(conn, activity_id, data, compressed=False)
                elif filename.endswith(".tcx.gz"):
                    tcx.import_tcx(conn, activity_id, data, compressed=True)
                elif filename.endswith(".tcx"):
                    tcx.import_tcx(conn, activity_id, data, compressed=False)
                elif filename.endswith(".gpx.gz"):
                    gpx.import_gpx(conn, activity_id, data, compressed=True)
                elif filename.endswith(".gpx"):
                    gpx.import_gpx(conn, activity_id, data, compressed=False)
                else:
                    skip += 1
                    continue

                with conn:
                    conn.execute("UPDATE activities SET has_track=1 WHERE id=?", (activity_id,))
                ok += 1
                if ok % 25 == 0:
                    print(f"  … {ok}/{total} Tracks importiert ({err} Fehler)")
            except Exception as exc:
                print(f"  ERR [{filename}]: {exc}")
                logger.error("Track-Import fehlgeschlagen [%s, activity %s]: %s", filename, activity_id, exc, exc_info=True)
                err += 1

    print(f"  Tracks: {ok} OK, {err} Fehler, {skip} übersprungen")


# ---------------------------------------------------------------------------
# Routen (GPX-Dateien unter routes/)
# ---------------------------------------------------------------------------

def import_routes(zf: zipfile.ZipFile) -> None:
    from backend.importer import gpx as gpx_mod

    route_files = [n for n in zf.namelist() if n.startswith("routes/") and n.endswith(".gpx")]

    with db_connection() as conn:
        for path in route_files:
            with zf.open(path) as f:
                data = f.read()
            gpx_mod.import_route(conn, Path(path).name, data)

    print(f"  Routen importiert: {len(route_files)}")


# ---------------------------------------------------------------------------
# Media-Metadaten
# ---------------------------------------------------------------------------

MEDIA_DIR = Path(__file__).parent.parent.parent / "data" / "media"


def import_media(zf: zipfile.ZipFile, media_map: dict[str, int]) -> None:
    """Extrahiert Mediadateien nach data/media/ und verknüpft sie mit Aktivitäten."""
    MEDIA_DIR.mkdir(parents=True, exist_ok=True)

    media_files = [
        n for n in zf.namelist()
        if n.startswith("media/") and not n.endswith("/")
    ]
    with db_connection() as conn:
        with conn:
            for path in media_files:
                fname = Path(path).name
                activity_id = media_map.get(fname)

                with zf.open(path) as f:
                    (MEDIA_DIR / fname).write_bytes(f.read())

                conn.execute(
                    "INSERT OR REPLACE INTO media (activity_id, filename) VALUES (?, ?)",
                    (activity_id, fname),
                )
    print(f"  Media importiert: {len(media_files)} Dateien ({len(media_map)} verknüpft)")


# ---------------------------------------------------------------------------
# Haupteinstieg
# ---------------------------------------------------------------------------

def run_import(zip_path: Path | None = None) -> None:
    if zip_path is None:
        zip_path = _find_latest_zip()
    print(f"Starte Import aus: {zip_path}")
    init_db()

    with zipfile.ZipFile(zip_path, "r") as zf:
        print("→ Bikes …")
        bike_map = import_bikes(zf)

        print("→ Activities (CSV) …")
        rides, media_map = import_activities_csv(zf, bike_map)

        print("→ Other Activities (CSV) …")
        import_other_activities_csv(zf)

        print("→ Track-Dateien …")
        import_tracks(zf, rides)

        print("→ Routen …")
        import_routes(zf)

        print("→ Media …")
        import_media(zf, media_map)

    print("Import abgeschlossen.")


if __name__ == "__main__":
    run_import()  # auto-detektiert neueste ZIP in download/
