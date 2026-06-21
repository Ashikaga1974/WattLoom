"""
Wetterdaten von Open-Meteo Archive API abrufen.
Kostenlos, kein API-Key, stündliche Auflösung ab 1940.
https://archive-api.open-meteo.com
"""

import json
import logging
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from typing import Optional

from backend.utils import MS_TO_KMH

logger = logging.getLogger(__name__)

ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"


def fetch_weather(lat: float, lon: float, start_date_utc: str) -> Optional[dict]:
    """
    Holt Wetterdaten für eine Aktivität.

    start_date_utc: ISO8601 ohne 'Z', wie in DB gespeichert (z.B. '2023-06-17T08:59:12').
    Gibt dict zurück: temp_c, wind_ms, wind_deg, precip_mm – oder None bei Fehler.
    Wind kommt von Open-Meteo in km/h und wird in m/s umgerechnet.
    """
    try:
        dt = datetime.fromisoformat(start_date_utc).replace(tzinfo=timezone.utc)
    except ValueError:
        return None

    date_str = dt.strftime("%Y-%m-%d")
    # Ziel-Stunde als String im Format "YYYY-MM-DDTHH:00"
    target_hour = dt.strftime("%Y-%m-%dT%H:00")

    params = {
        "latitude": round(lat, 4),
        "longitude": round(lon, 4),
        "start_date": date_str,
        "end_date": date_str,
        "hourly": "temperature_2m,windspeed_10m,winddirection_10m,precipitation",
        "timezone": "UTC",
    }

    url = f"{ARCHIVE_URL}?{urllib.parse.urlencode(params)}"

    try:
        with urllib.request.urlopen(url, timeout=10) as resp:
            data = json.loads(resp.read())
    except Exception as exc:
        logger.warning("fetch_weather(%s, %s, %s) fehlgeschlagen: %s", lat, lon, start_date_utc, exc)
        return None

    hourly = data.get("hourly", {})
    times = hourly.get("time", [])

    # Stunden-Index per String-Match – robuster als Index-Arithmetik
    try:
        idx = times.index(target_hour)
    except ValueError:
        # Fallback: letzter verfügbarer Stunden-Wert des Tages
        idx = len(times) - 1 if times else None

    if idx is None:
        return None

    temps = hourly.get("temperature_2m", [])
    winds_kmh = hourly.get("windspeed_10m", [])
    wind_dirs = hourly.get("winddirection_10m", [])
    precips = hourly.get("precipitation", [])

    def safe(lst: list, i: int):
        return lst[i] if i < len(lst) else None

    wind_kmh = safe(winds_kmh, idx)
    # Open-Meteo liefert km/h → intern als m/s speichern (einheitlich mit avg_speed_ms)
    wind_ms = round(wind_kmh / MS_TO_KMH, 2) if wind_kmh is not None else None

    return {
        "temp_c": safe(temps, idx),
        "wind_ms": wind_ms,
        "wind_deg": safe(wind_dirs, idx),
        "precip_mm": safe(precips, idx),
    }
