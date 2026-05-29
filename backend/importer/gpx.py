"""
GPX-Parser: liest .gpx / .gpx.gz via lxml.
import_gpx()  → track_points für eine Aktivität
import_route() → routes + route_points für gespeicherte Routen
"""

import gzip
import sqlite3
from lxml import etree

NS = {
    "gpx": "http://www.topografix.com/GPX/1/1",
    "gpxdata": "http://www.cluetrust.com/XML/GPXDATA/1/0",
    "ns3": "http://www.garmin.com/xmlschemas/TrackPointExtension/v1",
}


def _attr_float(el, name: str) -> float | None:
    v = el.get(name)
    try:
        return float(v) if v else None
    except ValueError:
        return None


def _text_float(el, xpath: str) -> float | None:
    found = el.xpath(xpath, namespaces=NS)
    try:
        return float(found[0].text) if found else None
    except (ValueError, TypeError):
        return None


def _text_int(el, xpath: str) -> int | None:
    found = el.xpath(xpath, namespaces=NS)
    try:
        return int(found[0].text) if found else None
    except (ValueError, TypeError):
        return None


def _text_str(el, xpath: str) -> str | None:
    found = el.xpath(xpath, namespaces=NS)
    return found[0].text if found else None


def _parse_trackpoints(root) -> list[tuple]:
    points: list[tuple] = []
    for tpt in root.xpath(".//gpx:trkpt", namespaces=NS):
        lat = _attr_float(tpt, "lat")
        lon = _attr_float(tpt, "lon")
        ts = _text_str(tpt, "gpx:time")
        alt = _text_float(tpt, "gpx:ele")
        hr = (
            _text_int(tpt, ".//gpxdata:hr")
            or _text_int(tpt, ".//ns3:TrackPointExtension/ns3:hr")
        )
        cadence = (
            _text_int(tpt, ".//gpxdata:cadence")
            or _text_int(tpt, ".//ns3:TrackPointExtension/ns3:cad")
        )
        points.append((lat, lon, ts, alt, None, None, hr, None, cadence, None))
    return points


def import_gpx(conn: sqlite3.Connection, activity_id: int, data: bytes, *, compressed: bool) -> None:
    raw = gzip.decompress(data) if compressed else data
    root = etree.fromstring(raw)
    points = _parse_trackpoints(root)

    with conn:
        if points:
            conn.executemany("""
                INSERT INTO track_points
                    (activity_id, lat, lon, timestamp, altitude_m, distance_m,
                     speed_ms, hr, power_w, cadence, temp_c)
                VALUES (?,?,?,?,?,?,?,?,?,?,?)
            """, [(activity_id, *p) for p in points])


def import_route(conn: sqlite3.Connection, filename: str, data: bytes) -> None:
    root = etree.fromstring(data)
    name = _text_str(root, "gpx:metadata/gpx:name") or _text_str(root, "gpx:rte/gpx:name") or filename
    desc = _text_str(root, "gpx:metadata/gpx:desc") or _text_str(root, "gpx:rte/gpx:desc")

    # Gesamtdistanz aus Routenpunkten annähern (optional)
    rte_points = [
        (i, _attr_float(pt, "lat"), _attr_float(pt, "lon"), _text_float(pt, "gpx:ele"))
        for i, pt in enumerate(root.xpath(".//gpx:rtept", namespaces=NS))
    ]
    # Fallback: trackpoints
    if not rte_points:
        rte_points = [
            (i, _attr_float(pt, "lat"), _attr_float(pt, "lon"), _text_float(pt, "gpx:ele"))
            for i, pt in enumerate(root.xpath(".//gpx:trkpt", namespaces=NS))
        ]

    with conn:
        cur = conn.execute(
            "INSERT INTO routes (name, description, source_file) VALUES (?,?,?)",
            (name, desc, filename),
        )
        route_id = cur.lastrowid
        if rte_points:
            conn.executemany(
                "INSERT INTO route_points (route_id, seq, lat, lon, altitude_m) VALUES (?,?,?,?,?)",
                [(route_id, seq, lat, lon, alt) for seq, lat, lon, alt in rte_points],
            )
