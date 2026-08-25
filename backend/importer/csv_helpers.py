from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from backend.paths import DOWNLOAD_DIR


def _find_latest_zip() -> Path:
    zips = sorted(DOWNLOAD_DIR.glob("*.zip"), key=lambda p: p.stat().st_mtime, reverse=True)
    if not zips:
        raise FileNotFoundError(f"Kein ZIP-Archiv in {DOWNLOAD_DIR} gefunden")
    return zips[0]


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


_STRAVA_DATE_FMT    = "%b %d, %Y, %I:%M:%S %p"   # englisch: Jun 17, 2023, 8:59:12 AM
_STRAVA_DATE_FMT_DE = "%d.%m.%Y, %H:%M:%S"        # deutsch:  29.06.2026, 16:23:46


def _parse_date(v: str | None) -> str | None:
    """Strava-Datum → ISO8601-String. Unterstützt EN- und DE-Format."""
    if not v:
        return None
    for fmt in (_STRAVA_DATE_FMT, _STRAVA_DATE_FMT_DE):
        try:
            return datetime.strptime(v, fmt).isoformat()
        except ValueError:
            continue
    return v  # Fallback: Originalwert behalten


# Mapping: deutsche Spaltennamen → englische (Strava-Export-Lokalisierung)
_ACTIVITY_COL_MAP: dict[str, str] = {
    "Aktivitäts-ID":                    "Activity ID",
    "Aktivitätsdatum":                  "Activity Date",
    "Name der Aktivität":               "Activity Name",
    "Aktivitätsart":                    "Activity Type",
    "Verstrichene Zeit":                "Elapsed Time",
    "Distanz":                          "Distance",
    "Max. Herzfrequenz":                "Max Heart Rate",
    "Pendeln":                          "Commute",
    "Aktivitätsausrüstung":             "Activity Gear",
    "Dateiname":                        "Filename",
    "Bewegungszeit":                    "Moving Time",
    "Höchstgeschw.":                    "Max Speed",
    "Durchschnittliche Geschwindigkeit": "Average Speed",
    "Höhenzunahme":                     "Elevation Gain",
    "Höhenunterschied":                 "Elevation Loss",
    "Durchschnittliche Trittfrequenz":  "Average Cadence",
    "Durchschnittliche Herzfrequenz":   "Average Heart Rate",
    "Max. Watt":                        "Max Watts",
    "Durchschnittliche Watt":           "Average Watts",
    "Kalorien":                         "Calories",
    "Durchschnittliche Temperatur":     "Average Temp",
    "Medien":                           "Media",
}

_BIKES_COL_MAP: dict[str, str] = {
    "Fahrradname":   "Bike Name",
    "Fahrradmarke":  "Bike Brand",
    "Fahrradmodell": "Bike Model",
}


def _normalize_row(row: dict, col_map: dict[str, str]) -> dict:
    """Benennt bekannte deutsche Spalten auf englische um; unbekannte bleiben."""
    return {col_map.get(k, k): v for k, v in row.items()}
