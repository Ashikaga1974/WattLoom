"""
Matcht selbst definierte Streckenabschnitte (custom_segments, siehe database.py) gegen
Aktivitäts-Tracks – WattLooms eigenes, kleines Gegenstück zu Strava-Segmenten.

Baut auf demselben Distanz-Marken-Prinzip wie der Streckenvergleich (path_match_fraction
in backend/utils.py) auf, aber statt zwei komplette Fahrten ab Distanz 0 zu vergleichen,
wird zunächst der Punkt im Aktivitäts-Track gesucht, der dem Segment-Startpunkt am
nächsten liegt (Kandidat), und ab dort relativ zum Segment gematcht. Steigende Distanz-
Marken erzwingen dabei implizit dieselbe Fahrtrichtung wie bei der Segment-Definition –
ein Rückweg über dieselben Koordinaten liefert fallende statt steigende Marken-Treffer
und matcht damit nicht (gewünschtes Verhalten, siehe CLAUDE.md-Absprache).
"""
import bisect
import json
import sqlite3

from backend.importer.power_estimator import (
    DEFAULT_BIKE_KG, DEFAULT_CRR, DEFAULT_CDA,
    estimate_power_from_points, _get_weight_kg, _get_float_setting,
)
from backend.utils import (
    MS_TO_KMH, haversine_m, parse_iso_ts,
    track_distance_index, nearest_track_point, path_match_fraction,
)

# Kandidatensuche: Aktivitäts-Punkte innerhalb dieses Radius um den Segment-Startpunkt
START_RADIUS_M = 50.0
# Marken-Abgleich entlang des Segments (enger als beim Streckenvergleich, da Segmente
# kürzer und die gewünschte Übereinstimmung präziser ist als "gleiche große Route")
MARK_STEP_KM = 0.1
MARK_RADIUS_KM = 0.05
MAX_CONSECUTIVE_MISS = 1
MIN_MATCH_FRACTION = 0.85
# Track muss ab dem Kandidaten-Start mindestens so viel der Segmentlänge abdecken,
# sonst endete die Fahrt mitten im Segment (kein vollständiger Durchgang)
MIN_COVERAGE_FRACTION = 0.9
# Grenzwert, ab dem eine Kandidaten-Häufung als neuer, unabhängiger Durchgang zählt
# (statt derselben GPS-Passage) – 5 Punkte Abstand in der sortierten Trefferliste
CLUSTER_GAP_POINTS = 5
# Weniger Distanzzuwachs zwischen zwei Track-Punkten gilt am Segment-Start als Stillstand
STANDSTILL_M = 1.0
# Stillstandserkennung kurz vor dem Segment-Ende (siehe _trim_end_standstill)
END_WINDOW_M = 50.0
STOP_GAP_S = 10.0
MIN_MOVING_SPEED_MS = 1.0


def _load_activity_points(conn: sqlite3.Connection, activity_id: int) -> list[dict]:
    """Lädt alle Track-Punkte einer Aktivität mit den für das Matching + die
    Kennzahlenberechnung nötigen Feldern, aufsteigend nach kumulativer Distanz."""
    rows = conn.execute(
        """SELECT timestamp, lat, lon, altitude_m, distance_m, speed_ms, hr
           FROM track_points
           WHERE activity_id = ? AND lat IS NOT NULL AND lon IS NOT NULL
                 AND distance_m IS NOT NULL AND timestamp IS NOT NULL
           ORDER BY distance_m, timestamp""",
        (activity_id,),
    ).fetchall()
    return [dict(r) for r in rows]


def _cluster_candidate_indices(indices: list[int]) -> list[list[int]]:
    """Gruppiert sortierte Kandidaten-Indizes in Häufungen (ein Durchgang am Segment-
    Start), damit derselbe physische Durchgang nicht mehrfach als eigener Versuch
    gewertet wird."""
    if not indices:
        return []
    clusters = [[indices[0]]]
    for idx in indices[1:]:
        if idx - clusters[-1][-1] <= CLUSTER_GAP_POINTS:
            clusters[-1].append(idx)
        else:
            clusters.append([idx])
    return clusters


def _segment_entry_index(points: list[dict], cluster: list[int], seg_start_lat: float, seg_start_lon: float) -> int:
    """Einstiegspunkt eines Durchgangs: der Cluster-Punkt, der dem Segment-Start am
    nächsten liegt – nicht der erste Punkt im START_RADIUS_M. Sonst beginnt die Messung
    bis zu 50m zu früh: Wartezeit an einer Ampel/Kreuzung vor dem Start zählt mit, und die
    Distanz-Marken sind um diesen Versatz verschoben (Segment matchte so nicht einmal mit
    seiner eigenen Quell-Aktivität). Steht die Fahrt genau am Start, wird der letzte
    Punkt des Stillstands genommen (Losfahren), damit die Standzeit nicht mitzählt."""
    idx = min(cluster, key=lambda i: haversine_m(points[i]["lat"], points[i]["lon"], seg_start_lat, seg_start_lon))
    while idx + 1 < len(points) and _is_standstill(points[idx], points[idx + 1]):
        idx += 1
    return idx


def _is_standstill(prev: dict, cur: dict) -> bool:
    """Stillstand zwischen zwei Track-Punkten: entweder praktisch kein Distanzzuwachs, oder
    eine Zeitlücke ohne nennenswerte Bewegung (Auto-Pause – Geräte zeichnen im Stand oft
    gar keine Punkte auf, dann fehlt der Stillstand als Punktfolge)."""
    dd = cur["distance_m"] - prev["distance_m"]
    if dd < STANDSTILL_M:
        return True
    t_prev, t_cur = parse_iso_ts(prev["timestamp"]), parse_iso_ts(cur["timestamp"])
    if t_prev is None or t_cur is None:
        return False
    dt = t_cur - t_prev
    return dt > STOP_GAP_S and dd / dt < MIN_MOVING_SPEED_MS


def _trim_end_standstill(sub: list[dict], rel_dists: list[float], end_i: int, segment_distance_m: float) -> int:
    """Gegenstück zu _segment_entry_index() am Segment-Ende: liegt der Endpunkt an einer
    Ampel/Kreuzung, steht die Fahrt oft wenige Meter davor – diese Wartezeit ist keine
    Segmentleistung. Findet innerhalb der letzten END_WINDOW_M einen Stillstand
    (_is_standstill) und gibt den Index davor zurück; die Rest-
    strecke rechnet der Aufrufer mit dem Segment-Tempo hoch. Ohne Stillstand: end_i."""
    window_start = bisect.bisect_left(rel_dists, segment_distance_m - END_WINDOW_M)
    for k in range(max(window_start, 1), end_i + 1):
        if _is_standstill(sub[k - 1], sub[k]):
            return k - 1
    return end_i


def _nearest_relative_index(rel_dists: list[float], target_m: float) -> int:
    """Index in rel_dists (aufsteigend, relativ zum Kandidaten-Start) am nächsten zu
    target_m – analog zu nearest_track_point(), gibt aber den Index statt der
    Koordinaten zurück (für Timestamp/HR-Zugriff am Trefferpunkt nötig)."""
    i = bisect.bisect_left(rel_dists, target_m)
    if i <= 0:
        return 0
    if i >= len(rel_dists):
        return len(rel_dists) - 1
    before, after = rel_dists[i - 1], rel_dists[i]
    return i - 1 if (target_m - before) <= (after - target_m) else i


def match_segment_in_activity(
    conn: sqlite3.Connection,
    segment_points: list[dict],
    segment_distance_m: float,
    activity_id: int,
    activity_points: list[dict] | None = None,
) -> dict | None:
    """
    Prüft, ob/wo eine Aktivität das Segment durchfährt, und berechnet bei Treffer die
    Kennzahlen für den getroffenen Abschnitt. Gibt None zurück, wenn kein hinreichend
    guter Treffer gefunden wurde. Bei mehreren Durchgängen (z.B. Rundkurs) wird der
    schnellste gewertet – Mehrfach-Efforts pro Aktivität werden bewusst nicht gespeichert
    (siehe CLAUDE.md-Absprache).

    `activity_points`: optional vorab geladen (Bulk-Matching lädt pro Aktivität nur
    einmal, unabhängig von der Segmentanzahl).
    """
    points = activity_points if activity_points is not None else _load_activity_points(conn, activity_id)
    if len(points) < 5:
        return None

    seg_start_lat, seg_start_lon = segment_points[0]["lat"], segment_points[0]["lon"]
    seg_index = track_distance_index([(p["dist_m"], p["lat"], p["lon"]) for p in segment_points])

    candidate_indices = [
        i for i, p in enumerate(points)
        if haversine_m(p["lat"], p["lon"], seg_start_lat, seg_start_lon) <= START_RADIUS_M
    ]
    if not candidate_indices:
        return None

    best: dict | None = None

    for cluster in _cluster_candidate_indices(candidate_indices):
        start_idx = _segment_entry_index(points, cluster, seg_start_lat, seg_start_lon)
        base_dist = points[start_idx]["distance_m"]

        # Nur den für dieses Segment relevanten Ausschnitt betrachten (Segmentlänge + Puffer)
        end_bound = start_idx
        limit = base_dist + segment_distance_m * 1.3
        while end_bound < len(points) - 1 and points[end_bound + 1]["distance_m"] <= limit:
            end_bound += 1
        sub = points[start_idx:end_bound + 1]
        if len(sub) < 2:
            continue

        if sub[-1]["distance_m"] - base_dist < segment_distance_m * MIN_COVERAGE_FRACTION:
            continue  # Fahrt endet vor dem Segmentende – kein vollständiger Durchgang

        sub_index = track_distance_index([(p["distance_m"] - base_dist, p["lat"], p["lon"]) for p in sub])
        frac = path_match_fraction(
            seg_index, sub_index,
            mark_step_km=MARK_STEP_KM, mark_radius_km=MARK_RADIUS_KM,
            min_common_marks=2, max_consecutive_miss=MAX_CONSECUTIVE_MISS,
        )
        if frac is None or frac < MIN_MATCH_FRACTION:
            continue

        rel_dists = [p["distance_m"] - base_dist for p in sub]
        end_i = _nearest_relative_index(rel_dists, segment_distance_m)
        end_i = _trim_end_standstill(sub, rel_dists, end_i, segment_distance_m)

        start_ts = parse_iso_ts(sub[0]["timestamp"])
        end_ts = parse_iso_ts(sub[end_i]["timestamp"])
        if start_ts is None or end_ts is None:
            continue
        moving_s = end_ts - start_ts
        if moving_s <= 0:
            continue

        actual_dist_m = sub[end_i]["distance_m"] - sub[0]["distance_m"]
        if actual_dist_m <= 0:
            continue
        avg_speed_ms = actual_dist_m / moving_s
        avg_speed_kmh = avg_speed_ms * MS_TO_KMH
        # Reststrecke bis zum Segmentende mit Segment-Tempo hochrechnen – nur nennenswert,
        # wenn _trim_end_standstill() einen Stillstand kurz vor dem Ende abgeschnitten hat
        time_s = moving_s + max(0.0, segment_distance_m - rel_dists[end_i]) / avg_speed_ms

        hr_values = [p["hr"] for p in sub[:end_i + 1] if p["hr"] is not None]
        avg_hr = sum(hr_values) / len(hr_values) if hr_values else None

        result = {
            "time_s": round(time_s),
            "avg_speed_kmh": round(avg_speed_kmh, 1),
            "avg_hr": round(avg_hr, 1) if avg_hr is not None else None,
            "avg_power_w": None,
            "norm_power_w": None,
            "match_pct": round(frac * 100, 1),
        }

        weight_kg = _get_weight_kg(conn)
        if weight_kg is not None:
            power_pts = [
                {"ts": parse_iso_ts(p["timestamp"]), "lat": p["lat"], "lon": p["lon"],
                 "alt": p["altitude_m"], "v": p["speed_ms"]}
                for p in sub[:end_i + 1]
                if p["speed_ms"] is not None and p["speed_ms"] >= 0
            ]
            bike_kg = _get_float_setting(conn, "bike_kg", DEFAULT_BIKE_KG)
            crr = _get_float_setting(conn, "crr", DEFAULT_CRR)
            cda = _get_float_setting(conn, "cda", DEFAULT_CDA)
            avg_w, norm_w = estimate_power_from_points(power_pts, weight_kg, bike_kg=bike_kg, crr=crr, cda=cda)
            result["avg_power_w"] = avg_w
            result["norm_power_w"] = norm_w

        if best is None or result["time_s"] < best["time_s"]:
            best = result

    return best


def _segment_bbox_activity_ids(conn: sqlite3.Connection, seg_start_lat: float, seg_start_lon: float) -> list[int]:
    """Grober Vorfilter: nur Aktivitäten, deren Track überhaupt einen Punkt nahe am
    Segment-Startpunkt hat (bbox-Näherung um START_RADIUS_M, kein echter Geo-Index
    vorhanden). Vermeidet, für jede Aktivität den kompletten Track laden zu müssen,
    wenn ihre Route offensichtlich nicht in der Nähe verläuft."""
    margin_lat = START_RADIUS_M / 111_000.0  # ~111km pro Breitengrad
    # Längengrad-Meter hängen von der Breite ab; grobe Überschätzung reicht für einen Vorfilter
    margin_lon = margin_lat * 1.6
    rows = conn.execute(
        """SELECT DISTINCT activity_id FROM track_points
           WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?""",
        (seg_start_lat - margin_lat, seg_start_lat + margin_lat,
         seg_start_lon - margin_lon, seg_start_lon + margin_lon),
    ).fetchall()
    return [r[0] for r in rows]


def store_effort(conn: sqlite3.Connection, segment_id: int, activity_id: int, result: dict) -> None:
    """Speichert/aktualisiert einen Segment-Treffer (Upsert über den UNIQUE-Index
    (segment_id, activity_id)). Gemeinsam genutzt von match_segment_against_all() und
    dem Einzelimport-Hook in backend/api/importer.py, damit die Upsert-SQL nicht doppelt
    gepflegt werden muss."""
    with conn:
        conn.execute(
            """INSERT INTO custom_segment_efforts
                   (segment_id, activity_id, time_s, avg_speed_kmh, avg_hr, avg_power_w, norm_power_w, match_pct)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(segment_id, activity_id) DO UPDATE SET
                   time_s=excluded.time_s, avg_speed_kmh=excluded.avg_speed_kmh,
                   avg_hr=excluded.avg_hr, avg_power_w=excluded.avg_power_w,
                   norm_power_w=excluded.norm_power_w, match_pct=excluded.match_pct""",
            (segment_id, activity_id, result["time_s"], result["avg_speed_kmh"],
             result["avg_hr"], result["avg_power_w"], result["norm_power_w"], result["match_pct"]),
        )


def match_segment_against_all(conn: sqlite3.Connection, segment: dict, activity_ids: list[int] | None = None) -> int:
    """
    Matcht ein Segment gegen mehrere Aktivitäten und speichert Treffer in
    custom_segment_efforts (ersetzt einen ggf. vorhandenen Effort derselben Aktivität).
    `activity_ids`: einzuschränkende Kandidatenmenge (z.B. eine neu importierte Aktivität);
    ohne Angabe wird per Bounding-Box-Vorfilter über alle Aktivitäten gesucht (rückwirkendes
    Matching beim Anlegen eines neuen Segments).
    Gibt die Anzahl neu/aktualisiert gespeicherter Efforts zurück.
    """
    segment_points = json.loads(segment["points"])
    segment_distance_m = segment["distance_m"]

    if activity_ids is None:
        activity_ids = _segment_bbox_activity_ids(conn, segment_points[0]["lat"], segment_points[0]["lon"])

    stored = 0
    for activity_id in activity_ids:
        # Die Quell-Aktivität, aus der das Segment ausgeschnitten wurde, matcht sich selbst
        # mit ~100% – das ist gewollt (liefert direkt einen ersten Effort/Referenzwert).
        result = match_segment_in_activity(conn, segment_points, segment_distance_m, activity_id)
        if result is None:
            continue
        store_effort(conn, segment["id"], activity_id, result)
        stored += 1
    return stored
