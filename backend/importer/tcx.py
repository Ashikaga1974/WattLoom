"""
TCX-Parser: liest .tcx / .tcx.gz via lxml und schreibt track_points und laps.
Segment-Efforts gibt es in TCX nicht.
"""

import gzip
import math
import sqlite3
from lxml import etree


# ---------------------------------------------------------------------------
# Geräteerkennung
# ---------------------------------------------------------------------------

def read_tcx_device(data: bytes, *, compressed: bool) -> str:
    """Liest Gerätenamen aus dem Creator-Element einer TCX-Datei.
    Garmin TCX: <Activity><Creator><Name> hat Vorrang vor root-Attribut."""
    _NS = {"ns": "http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"}
    try:
        raw = gzip.decompress(data) if compressed else data
        root = etree.fromstring(raw.lstrip())
        # Creator-Name innerhalb der ersten Activity (zuverlässigster Ort)
        names = root.xpath(".//ns:Creator/ns:Name", namespaces=_NS)
        if names and names[0].text and names[0].text.strip():
            return names[0].text.strip()
        # Fallback: root-Attribut (ältere TCX-Dateien)
        creator = root.get("creator", "").strip()
        if creator:
            return creator
    except Exception:
        pass
    return "Unbekannt"


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Luftlinien-Distanz zwischen zwei GPS-Punkten in Metern."""
    R = 6_371_000
    p = math.pi / 180
    a = (math.sin((lat2 - lat1) * p / 2) ** 2
         + math.cos(lat1 * p) * math.cos(lat2 * p) * math.sin((lon2 - lon1) * p / 2) ** 2)
    return 2 * R * math.asin(math.sqrt(a))

NS = {
    "ns": "http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2",
    "ns2": "http://www.garmin.com/xmlschemas/ActivityExtension/v2",
}


def _text(el, xpath: str) -> str | None:
    found = el.xpath(xpath, namespaces=NS)
    return found[0].text if found else None


def _float(el, xpath: str) -> float | None:
    v = _text(el, xpath)
    try:
        return float(v) if v else None
    except ValueError:
        return None


def _int(el, xpath: str) -> int | None:
    v = _text(el, xpath)
    try:
        return int(v) if v else None
    except ValueError:
        return None


def import_tcx(conn: sqlite3.Connection, activity_id: int, data: bytes, *, compressed: bool) -> None:
    raw = gzip.decompress(data) if compressed else data
    # Einige Garmin-TCX-Dateien haben führende Whitespace-Zeichen vor der XML-Deklaration
    raw = raw.lstrip()
    root = etree.fromstring(raw)

    points: list[tuple] = []
    laps: list[tuple] = []

    # Zustand für kumulative Haversine-Distanz (Fallback wenn kein DistanceMeters)
    cum_dist: float = 0.0
    prev_lat: float | None = None
    prev_lon: float | None = None
    has_native_dist: bool | None = None  # None = noch unbekannt

    for lap_idx, lap_el in enumerate(root.xpath(".//ns:Lap", namespaces=NS)):
        start_time = lap_el.get("StartTime")

        total_time = _float(lap_el, "ns:TotalTimeSeconds")
        distance = _float(lap_el, "ns:DistanceMeters")
        max_speed = _float(lap_el, "ns:MaximumSpeed")
        avg_hr = _float(lap_el, "ns:AverageHeartRateBpm/ns:Value")
        max_hr = _int(lap_el, "ns:MaximumHeartRateBpm/ns:Value")
        calories = _float(lap_el, "ns:Calories")

        laps.append((
            activity_id,
            lap_idx,
            start_time,
            total_time,
            distance,
            None,        # avg_speed – aus TCX nicht direkt verfügbar
            max_speed,
            avg_hr,
            max_hr,
            None, None, None, None,  # power, cadence, elevation
        ))

        for tp_el in lap_el.xpath(".//ns:Trackpoint", namespaces=NS):
            ts = _text(tp_el, "ns:Time")
            lat = _float(tp_el, "ns:Position/ns:LatitudeDegrees")
            lon = _float(tp_el, "ns:Position/ns:LongitudeDegrees")
            alt = _float(tp_el, "ns:AltitudeMeters")
            dist = _float(tp_el, "ns:DistanceMeters")
            hr = _int(tp_el, "ns:HeartRateBpm/ns:Value")

            # Erweiterungsfelder (Garmin ActivityExtension)
            speed = _float(tp_el, ".//ns2:Speed")
            cadence = _int(tp_el, ".//ns2:RunCadence") or _int(tp_el, "ns:Cadence")
            power = _int(tp_el, ".//ns2:Watts")

            # Beim ersten Punkt mit bekanntem dist-Status festlegen ob native Distanz vorhanden
            if has_native_dist is None and dist is not None:
                has_native_dist = True
            elif has_native_dist is None and dist is None and lat is not None:
                has_native_dist = False

            # Fallback: kumulative Haversine-Distanz wenn kein natives DistanceMeters
            if dist is not None:
                cum_dist = dist
            elif not has_native_dist and lat is not None and lon is not None:
                if prev_lat is not None and prev_lon is not None:
                    cum_dist += _haversine_m(prev_lat, prev_lon, lat, lon)
                dist = cum_dist

            if lat is not None and lon is not None:
                prev_lat, prev_lon = lat, lon

            points.append((
                activity_id, ts, lat, lon, alt, dist, speed, hr, power, cadence, None,
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
