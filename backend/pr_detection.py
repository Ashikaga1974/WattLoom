"""
Erkennt neue persönliche Bestzeiten (Best-by-Distance) direkt nach einem Import.

Vergleicht den best_by_distance-Snapshot von vor und nach dem Einfügen neuer
Aktivitäten – kein zusätzlicher Cache nötig, da die Berechnung selbst über alle
Tracks nur ~2-3s dauert (siehe backend/api/analytics.py, /analytics/best-by-distance).
"""
from backend.api.analytics import _best_by_distance_map


def snapshot(conn) -> dict:
    return _best_by_distance_map(conn)


def detect_and_record(conn, before: dict, activity_ids: list[int] | None = None) -> list[dict]:
    """
    Vergleicht `before` (Snapshot vor dem Import) mit dem aktuellen Stand und legt
    für jede Distanz, die sich verbessert hat, einen pr_events-Eintrag an.
    Distanzen ohne vorherigen Bestwert (before[d] is None) zählen nicht als PR –
    sonst würde der allererste Import jede Distanz als "neuen Rekord" melden.

    `activity_ids`: bei einem Einzelimport (genau 1-2 neue Aktivitäten bekannt) wird
    NUR für diese neu gescannt statt alle ~400 Aktivitäten erneut komplett durchzurechnen
    (siehe _best_by_distance_map) – `before` ist bereits der korrekte volle Scan ohne
    diese Aktivitäten, das Ergebnis ist damit identisch zu einem kompletten Re-Scan.
    None (Default, z.B. beim ZIP-Bulk-Import mit vielen neuen Aktivitäten) behält das
    bisherige Verhalten (voller Re-Scan) bei.
    """
    if activity_ids is not None:
        after = _best_by_distance_map(conn, activity_ids=activity_ids, start=before)
    else:
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
        # Verhindert doppelte Dashboard-Kacheln, wenn dieselbe Aktivität (z.B. nach
        # Löschen + Reimport) für dieselbe Distanz erneut als "neuer PR" erkannt wird.
        # dismissed_at wird ignoriert: ein bereits verworfener/überholter Eintrag für
        # dieselbe Aktivität+Distanz soll nicht erneut angelegt werden.
        already_recorded = conn.execute(
            "SELECT 1 FROM pr_events WHERE distance_km = ? AND activity_id = ?",
            (d_km, after_best['activity_id']),
        ).fetchone()
        if already_recorded:
            continue
        new_events.append({
            'distance_km': d_km,
            'best_time_s': after_best['best_time_s'],
            'best_speed_kmh': after_best['best_speed_kmh'],
            'activity_id': after_best['activity_id'],
            'activity_name': after_best['activity_name'],
            'activity_date': after_best['date'],
            'previous_time_s': before_best['best_time_s'],
        })

    if new_events:
        with conn:
            # Alte, noch nicht verworfene Events derselben Distanz sind durch den
            # neuen Rekord überholt - sonst zeigt das Dashboard mehrere "Bestzeiten"
            # für dieselbe Distanz gleichzeitig an. Nur als überholt markieren statt
            # löschen, die Historie bleibt in der DB erhalten.
            conn.executemany(
                "UPDATE pr_events SET dismissed_at = datetime('now') WHERE distance_km = ? AND dismissed_at IS NULL",
                [(e['distance_km'],) for e in new_events],
            )
            conn.executemany(
                """INSERT INTO pr_events
                   (distance_km, best_time_s, best_speed_kmh, activity_id, activity_name, activity_date, previous_time_s)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                [
                    (e['distance_km'], e['best_time_s'], e['best_speed_kmh'],
                     e['activity_id'], e['activity_name'], e['activity_date'], e['previous_time_s'])
                    for e in new_events
                ],
            )
    return new_events


# Toleranz zwischen dismissed_at der überholten und created_at der neuen Events:
# detect_and_record() setzt beide per datetime('now') in zwei getrennten Statements,
# an einer Sekundengrenze können sie daher leicht auseinanderliegen.
_SUPERSEDE_TOLERANCE = '-5 seconds'


def remove_events_for_activity(conn, activity_id: int) -> None:
    """
    Löscht alle pr_events einer Aktivität (beim Löschen der Aktivität aufrufen, sonst
    zeigt das Dashboard PRs einer nicht mehr existierenden Fahrt) und reaktiviert pro
    Distanz das jüngste Event, das durch ein noch aktives Event dieser Aktivität
    überholt wurde. Committet nicht – Teil der Lösch-Transaktion des Aufrufers.

    Vom Nutzer verworfene Events dieser Aktivität reaktivieren nichts: die Kachel war
    bewusst weg. Vor dem neuen PR manuell verworfene Vorgänger bleiben ebenfalls weg,
    da nur Events mit dismissed_at ab created_at des gelöschten Events zurückkommen.
    """
    _remove_events(conn, "activity_id = ?", (activity_id,))


def remove_events_for_zip_activities(conn) -> None:
    """
    Gegenstück zu remove_events_for_activity() für /import/reset, das alle ZIP-Aktivitäten
    (id > 0) löscht. Einzelimport-PRs, die nur durch ZIP-PRs überholt waren, werden wieder
    aktiv. Committet nicht.
    """
    _remove_events(conn, "activity_id > 0", ())


def _remove_events(conn, where_sql: str, params: tuple) -> None:
    """
    Löscht die per where_sql gewählten pr_events einzeln in absteigender ID-Reihenfolge;
    war ein Event aktiv, wird sein direkter Vorgänger derselben Distanz reaktiviert.
    Die Reihenfolge löst Ketten korrekt auf: wird ein reaktivierter Vorgänger selbst
    gelöscht, ist er beim Bearbeiten aktiv und reicht die Reaktivierung weiter.
    """
    events = conn.execute(
        f"SELECT id FROM pr_events WHERE {where_sql} ORDER BY id DESC", params
    ).fetchall()
    for (event_id,) in events:
        # Status frisch lesen – kann durch eine vorherige Iteration reaktiviert worden sein
        event = conn.execute(
            "SELECT distance_km, created_at, dismissed_at FROM pr_events WHERE id = ?", (event_id,)
        ).fetchone()
        conn.execute("DELETE FROM pr_events WHERE id = ?", (event_id,))
        if event[2] is not None:
            continue
        conn.execute(
            """UPDATE pr_events SET dismissed_at = NULL
               WHERE id = (
                   SELECT id FROM pr_events
                   WHERE distance_km = ? AND dismissed_at >= datetime(?, ?)
                   ORDER BY id DESC LIMIT 1
               )""",
            (event[0], event[1], _SUPERSEDE_TOLERANCE),
        )
