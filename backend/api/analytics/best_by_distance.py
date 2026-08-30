from datetime import datetime
from fastapi import APIRouter
from backend.cache import get_or_set
from backend.database import db_connection
from backend.utils import MS_TO_KMH
from ._shared import RIDE_TYPES

router = APIRouter(prefix="/analytics", tags=["analytics"])

MAX_PLAUSIBLE_SPEED_MS = 25.0  # 90 km/h – GPS-/Device-Sprünge (Tunnel, Satellitenverlust) oberhalb dessen kappen


def _clean_cumulative_distance(dist: list, elapsed: list, max_speed_ms: float = MAX_PLAUSIBLE_SPEED_MS) -> list:
    """
    Kappt pro Schritt den Distanzzuwachs auf max_speed_ms, damit einzelne
    GPS-Sprünge (z.B. mehrere km in 1s nach Signalverlust) keine unrealistischen
    Best-Effort-Segmente erzeugen. Negative/zeitlose Schritte zählen als 0 Zuwachs.
    """
    cleaned = [dist[0]]
    for k in range(1, len(dist)):
        dt = elapsed[k] - elapsed[k - 1]
        delta = dist[k] - dist[k - 1]
        if dt <= 0 or delta < 0:
            delta = 0.0
        else:
            delta = min(delta, max_speed_ms * dt)
        cleaned.append(cleaned[-1] + delta)
    return cleaned


def _fastest_segment(dist: list, elapsed: list, target_m: float):
    """
    Kürzeste Zeit für ein zusammenhängendes Segment mit Distanz >= target_m,
    per Sliding Window (Zwei-Zeiger) über die kumulierte Distanz `dist` und
    die dazugehörigen Sekunden `elapsed` (beide aufsteigend, gleiche Länge).
    Gibt (start_idx, end_idx, zeit_s) zurück oder None, wenn kein Segment reicht.
    """
    n = len(dist)
    i = 0
    best_t = None
    best_idx = None
    for j in range(n):
        while i < j and dist[j] - dist[i] >= target_m:
            i += 1
        if i > 0 and dist[j] - dist[i - 1] >= target_m:
            t = elapsed[j] - elapsed[i - 1]
            if t > 0 and (best_t is None or t < best_t):
                best_t = t
                best_idx = (i - 1, j)
    return (*best_idx, best_t) if best_idx else None


BEST_BY_DISTANCE_BUCKETS_KM = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70]


def _best_by_distance_map(conn) -> dict:
    """
    Kern von best_by_distance(): berechnet für jede Zieldistanz das schnellste
    zusammenhängende Segment über alle Fahrten mit Track-Daten hinweg und gibt
    das rohe {distance_km: best_or_None}-Dict zurück (ohne Auffüllen der Lücken).
    Als eigene Funktion extrahiert, damit backend/pr_detection.py denselben Snapshot
    vor und nach einem Import berechnen und auf neue persönliche Bestzeiten vergleichen kann.
    """
    max_speed_row = conn.execute(
        "SELECT value FROM config WHERE key = 'max_plausible_speed_ms'"
    ).fetchone()
    max_speed_ms = float(max_speed_row["value"]) if max_speed_row else MAX_PLAUSIBLE_SPEED_MS

    ph = ','.join('?' * len(RIDE_TYPES))
    activities = conn.execute(f"""
        SELECT id, name, start_date_local AS date, distance_m, smart_device
        FROM activities
        WHERE activity_type IN ({ph}) AND distance_m > 0
    """, RIDE_TYPES).fetchall()

    best = {d_km: None for d_km in BEST_BY_DISTANCE_BUCKETS_KM}

    for act in activities:
        targets_m = [d_km * 1000 for d_km in BEST_BY_DISTANCE_BUCKETS_KM if d_km * 1000 <= act['distance_m']]
        if not targets_m:
            continue

        points = conn.execute("""
            SELECT timestamp, distance_m
            FROM track_points
            WHERE activity_id = ? AND distance_m IS NOT NULL AND timestamp IS NOT NULL
            ORDER BY id
        """, (act['id'],)).fetchall()
        if len(points) < 2:
            continue

        try:
            elapsed = [datetime.fromisoformat(p['timestamp']).timestamp() for p in points]
        except ValueError:
            continue
        dist = _clean_cumulative_distance([p['distance_m'] for p in points], elapsed, max_speed_ms)

        for target_m in targets_m:
            d_km = target_m / 1000
            segment = _fastest_segment(dist, elapsed, target_m)
            if not segment:
                continue
            start_idx, end_idx, t = segment
            current = best[d_km]
            if current is not None and t >= current['best_time_s']:
                continue
            best[d_km] = {
                'distance_km':        d_km,
                'best_speed_kmh':     round((dist[end_idx] - dist[start_idx]) / t * MS_TO_KMH, 1),
                'best_time_s':        round(t),
                'activity_id':        act['id'],
                'activity_name':      act['name'],
                'smart_device':       act['smart_device'],
                'date':               act['date'],
                'actual_distance_km': round((dist[end_idx] - dist[start_idx]) / 1000, 1),
            }
    return best


@router.get("/best-by-distance")
def best_by_distance():
    """
    Für jede Zieldistanz das schnellste zusammenhängende Segment (Best Effort)
    über alle Fahrten mit Track-Daten hinweg – nicht die schnellste Gesamtfahrt
    in der Nähe der Zieldistanz, sondern der schnellste Abschnitt exakt dieser
    Länge innerhalb einer beliebigen Fahrt (analog Strava "Best Efforts").

    Ergebnis wird gecacht (siehe backend/cache.py) – die Sliding-Window-Suche über
    alle Tracks dauert bei wachsender Datenmenge spürbar lange; Invalidierung
    passiert explizit nach jedem Import/Reset (backend/api/importer.py).
    """

    def _compute() -> dict:
        with db_connection() as conn:
            return _best_by_distance_map(conn)

    best = get_or_set("best_by_distance", _compute)

    results = []
    for d_km in BEST_BY_DISTANCE_BUCKETS_KM:
        results.append(best[d_km] or {
            'distance_km':        d_km,
            'best_speed_kmh':     None,
            'best_time_s':        None,
            'activity_id':        None,
            'activity_name':      None,
            'smart_device':       None,
            'date':               None,
            'actual_distance_km': None,
        })

    return {'buckets': results}


@router.get("/pr-events")
def pr_events():
    """Noch nicht verworfene, erkannte neue persönliche Bestzeiten (siehe pr_detection.py)."""
    with db_connection() as conn:
        rows = conn.execute("SELECT * FROM pr_events ORDER BY distance_km ASC").fetchall()
        return [dict(r) for r in rows]


@router.delete("/pr-events/{event_id}")
def dismiss_pr_event(event_id: int):
    with db_connection() as conn:
        with conn:
            conn.execute("DELETE FROM pr_events WHERE id = ?", (event_id,))
    return {"ok": True}
