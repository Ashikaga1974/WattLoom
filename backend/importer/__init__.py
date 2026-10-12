import sqlite3


def clear_track_data(conn: sqlite3.Connection, activity_id: int) -> None:
    """Löscht alle vorhandenen Track-Daten einer Aktivität (track_points, laps,
    segment_efforts), bevor sie neu importiert werden. Grund: der ZIP-Re-Import
    ruft jeden Track erneut ab und die Parser fügen reine INSERTs aus – ohne dieses
    Aufräumen würden sich die Trackpunkte bei jedem erneuten Import derselben
    Aktivität verdoppeln.

    Muss innerhalb der Insert-Transaktion des jeweiligen Parsers aufgerufen werden,
    damit Löschen und Neu-Einfügen atomar sind: scheitert der Insert, wird auch das
    Löschen zurückgerollt und der bestehende Track bleibt erhalten.
    """
    conn.execute("DELETE FROM track_points    WHERE activity_id = ?", (activity_id,))
    conn.execute("DELETE FROM laps             WHERE activity_id = ?", (activity_id,))
    conn.execute("DELETE FROM segment_efforts  WHERE activity_id = ?", (activity_id,))
