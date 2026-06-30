"""
FIT-Parser: liest .fit / .fit.gz-Dateien via fitparse und schreibt
track_points, laps und segment_efforts in die DB.
"""

import gzip
import io
import sqlite3
import struct
from datetime import datetime, timezone
from typing import Any

import fitparse

# FIT-Ungültig-Marker für sint32 (Koordinatenfelder)
_FIT_INVALID_SINT32 = 0x7FFFFFFF


# fitparse 1.2.0: process_type_date_time / _local_date_time / _localtime_into_day
# crashen wenn field_data.value ein Tupel ist (component fields in neueren FIT-Protokollen).
# Wir erben FitFileDataProcessor (keine km/h-Konvertierung – wir wollen Rohdaten in SI-Einheiten)
# und überschreiben nur die drei betroffenen Methoden.
class _SafeProcessor(fitparse.FitFileDataProcessor):
    def process_type_date_time(self, field_data):
        if isinstance(field_data.value, (tuple, list)):
            return
        super().process_type_date_time(field_data)

    def process_type_local_date_time(self, field_data):
        if isinstance(field_data.value, (tuple, list)):
            return
        super().process_type_local_date_time(field_data)

    def process_type_localtime_into_day(self, field_data):
        if isinstance(field_data.value, (tuple, list)):
            return
        super().process_type_localtime_into_day(field_data)


# ---------------------------------------------------------------------------
# Hilfsfunktionen
# ---------------------------------------------------------------------------

def _val(msg: fitparse.DataMessage, field: str) -> Any:
    """Gibt den Rohwert eines FIT-Felds zurück oder None.
    Neuere FIT-Protokolle können component fields als Tupel liefern – dann ersten Wert nehmen."""
    f = msg.get(field)
    if f is None:
        return None
    v = f.value
    if isinstance(v, (tuple, list)):
        return next((x for x in v if x is not None), None)
    return v


# ---------------------------------------------------------------------------
# Geräteerkennung
# ---------------------------------------------------------------------------

# Bekannte FIT-Hersteller-IDs → Gerätename (Fallback wenn product_name fehlt)
_MANUFACTURER_NAMES: dict[int, str] = {
    0:   "Redmi Watch 6",   # Xiaomi/Redmi; setzt kein product_name
    339: "Amazfit",
}

# (manufacturer_id, product_name) → Anzeigename (hat Vorrang vor product_name allein)
_PRODUCT_OVERRIDES: dict[tuple[int, str], str] = {
    (132, "M1"): "Cycplus - M1",
}


def read_fit_device(data: bytes, *, compressed: bool) -> str:
    """Liest Gerätenamen aus dem file_id-Record einer FIT-Datei.
    Priorität: product_name → Hersteller-ID → 'Unbekannt'."""
    try:
        raw = gzip.decompress(data) if compressed else data
        fp = fitparse.FitFile(io.BytesIO(raw), data_processor=_SafeProcessor())
        for msg in fp.get_messages("file_id"):
            fields = {f.name: f.value for f in msg.fields}

            # Hersteller-ID auflösen (wird für Overrides und Fallback benötigt)
            mfr = fields.get("manufacturer")
            # Redmi Watch 6 u.ä. liefern uint16 als 2-Byte-Tupel (big-endian)
            if isinstance(mfr, (tuple, list)) and len(mfr) == 2 and all(isinstance(b, int) for b in mfr):
                mfr = struct.unpack(">H", bytes(mfr))[0]

            # product_name: zuerst auf Override prüfen, dann direkt verwenden
            name = fields.get("product_name")
            if isinstance(name, str) and name.strip():
                if isinstance(mfr, int):
                    override = _PRODUCT_OVERRIDES.get((mfr, name.strip()))
                    if override:
                        return override
                return name.strip()

            # Hersteller-ID als Fallback (kein product_name vorhanden)
            if isinstance(mfr, int):
                label = _MANUFACTURER_NAMES.get(mfr)
                if label:
                    return label
    except Exception:
        pass
    return "Unbekannt"


def _val_coord(msg: fitparse.DataMessage, field: str) -> int | None:
    """Liest ein Koordinatenfeld (position_lat / position_long) als Semicircle-Integer.
    Amazfit/neuere FIT-Protokolle liefern das sint32 als 4-Byte-Tupel (big-endian).
    0x7FFFFFFF ist der FIT-Ungültig-Marker → None."""
    f = msg.get(field)
    if f is None:
        return None
    v = f.value
    if isinstance(v, (tuple, list)):
        if len(v) == 4 and all(isinstance(b, int) for b in v):
            # 4 Bytes big-endian → sint32
            val = struct.unpack(">i", bytes(v))[0]
            return None if val == _FIT_INVALID_SINT32 else val
        # anderes Tupel-Format: ersten gesetzten Wert nehmen
        return next((x for x in v if x is not None), None)
    if v == _FIT_INVALID_SINT32:
        return None
    return v


def _ts(msg: fitparse.DataMessage) -> str | None:
    """FIT-Timestamp → ISO8601-String (UTC)."""
    f = msg.get("timestamp")
    if f is None:
        return None
    v = f.value
    if isinstance(v, datetime):
        return v.replace(tzinfo=timezone.utc).isoformat()
    # Garmin-Epoch: 631065600 Sekunden Offset zu Unix-Epoch
    if isinstance(v, int):
        return datetime.fromtimestamp(631065600 + v, tz=timezone.utc).isoformat()
    # Amazfit/neuere FIT-Protokolle: uint32 als 4-Byte-Tupel (big-endian)
    if isinstance(v, (tuple, list)) and len(v) == 4 and all(isinstance(b, int) for b in v):
        garmin_ts = struct.unpack(">I", bytes(v))[0]
        return datetime.fromtimestamp(631065600 + garmin_ts, tz=timezone.utc).isoformat()
    return None


# ---------------------------------------------------------------------------
# Hauptfunktion
# ---------------------------------------------------------------------------

def import_fit(conn: sqlite3.Connection, activity_id: int, data: bytes, *, compressed: bool) -> None:
    """
    Parst eine FIT-Datei (ggf. gzip) und persistiert alle relevanten Nachrichten.
    Nutzt eine einzige DB-Transaktion pro Aktivität für Performance.
    """
    raw = gzip.decompress(data) if compressed else data
    fit = fitparse.FitFile(io.BytesIO(raw), data_processor=_SafeProcessor())

    points: list[tuple] = []
    laps: list[tuple] = []
    segments: list[tuple] = []

    lap_number = 0

    for msg in fit.get_messages():
        name = msg.name

        if name == "record":
            # Koordinaten kommen als Semicircles → Grad
            lat_sc = _val_coord(msg, "position_lat")
            lon_sc = _val_coord(msg, "position_long")
            lat = lat_sc * (180 / 2**31) if lat_sc is not None else None
            lon = lon_sc * (180 / 2**31) if lon_sc is not None else None

            # enhanced_* Felder haben Vorrang (bessere Auflösung in neueren Garmin-Geräten)
            alt = _val(msg, "enhanced_altitude") or _val(msg, "altitude")
            dist = _val(msg, "enhanced_distance") or _val(msg, "distance")
            speed = _val(msg, "enhanced_speed") or _val(msg, "speed")

            points.append((
                activity_id,
                _ts(msg),
                lat,
                lon,
                alt,
                dist,
                speed,
                _val(msg, "heart_rate"),
                _val(msg, "power"),
                _val(msg, "cadence"),
                _val(msg, "temperature"),
            ))

        elif name == "lap":
            laps.append((
                activity_id,
                lap_number,
                _ts(msg),
                _val(msg, "total_elapsed_time"),
                _val(msg, "total_distance"),
                _val(msg, "avg_speed"),
                _val(msg, "max_speed"),
                _val(msg, "avg_heart_rate"),
                _val(msg, "max_heart_rate"),
                _val(msg, "avg_power"),
                _val(msg, "max_power"),
                _val(msg, "avg_cadence"),
                _val(msg, "total_ascent"),
            ))
            lap_number += 1

        elif name == "segment_lap":
            segments.append((
                activity_id,
                _val(msg, "name"),
                _ts(msg),
                _val(msg, "total_elapsed_time"),
                _val(msg, "total_distance"),
                _val(msg, "avg_speed"),
                _val(msg, "max_speed"),
                _val(msg, "avg_heart_rate"),
                _val(msg, "max_heart_rate"),
                _val(msg, "avg_power"),
                _val(msg, "max_power"),
                _val(msg, "avg_cadence"),
                _val(msg, "total_ascent"),
                _val(msg, "status"),      # enthält manchmal Rang-Info
                None,                     # pr_rank – nicht immer vorhanden
            ))

    with conn:
        if points:
            conn.executemany("""
                INSERT INTO track_points
                    (activity_id, timestamp, lat, lon, altitude_m, distance_m,
                     speed_ms, hr, power_w, cadence, temp_c)
                VALUES (?,?,?,?,?,?,?,?,?,?,?)
            """, points)

        if laps:
            conn.executemany("""
                INSERT INTO laps
                    (activity_id, lap_number, start_time, total_time_s, distance_m,
                     avg_speed_ms, max_speed_ms, avg_hr, max_hr,
                     avg_power_w, max_power_w, avg_cadence, elevation_gain_m)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
            """, laps)

        if segments:
            conn.executemany("""
                INSERT INTO segment_efforts
                    (activity_id, name, start_time, elapsed_time_s, distance_m,
                     avg_speed_ms, max_speed_ms, avg_hr, max_hr,
                     avg_power_w, max_power_w, avg_cadence, total_ascent_m,
                     rank, pr_rank)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """, segments)
