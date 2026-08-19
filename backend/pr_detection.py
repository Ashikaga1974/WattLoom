"""
Erkennt neue persönliche Bestzeiten (Best-by-Distance) direkt nach einem Import.

Vergleicht den best_by_distance-Snapshot von vor und nach dem Einfügen neuer
Aktivitäten – kein zusätzlicher Cache nötig, da die Berechnung selbst über alle
Tracks nur ~2-3s dauert (siehe backend/api/analytics.py, /analytics/best-by-distance).
"""
from backend.api.analytics import _best_by_distance_map


def snapshot(conn) -> dict:
    return _best_by_distance_map(conn)


def detect_and_record(conn, before: dict) -> list[dict]:
    """
    Vergleicht `before` (Snapshot vor dem Import) mit dem aktuellen Stand und legt
    für jede Distanz, die sich verbessert hat, einen pr_events-Eintrag an.
    Distanzen ohne vorherigen Bestwert (before[d] is None) zählen nicht als PR –
    sonst würde der allererste Import jede Distanz als "neuen Rekord" melden.
    """
    after = _best_by_distance_map(conn)
    new_events = []
    for d_km, after_best in after.items():
        before_best = before.get(d_km)
        if after_best is None or before_best is None:
            continue
        if after_best['activity_id'] == before_best['activity_id']:
            continue
        if after_best['best_time_s'] >= before_best['best_time_s']:
            continue
        new_events.append({
            'distance_km': d_km,
            'best_time_s': after_best['best_time_s'],
            'best_speed_kmh': after_best['best_speed_kmh'],
            'activity_id': after_best['activity_id'],
            'activity_name': after_best['activity_name'],
            'previous_time_s': before_best['best_time_s'],
        })

    if new_events:
        with conn:
            conn.executemany(
                """INSERT INTO pr_events
                   (distance_km, best_time_s, best_speed_kmh, activity_id, activity_name, previous_time_s)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                [
                    (e['distance_km'], e['best_time_s'], e['best_speed_kmh'],
                     e['activity_id'], e['activity_name'], e['previous_time_s'])
                    for e in new_events
                ],
            )
    return new_events
