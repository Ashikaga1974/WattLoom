"""
Stellt sicher, dass ein erneuter Track-Import derselben Aktivität die Trackpunkte
NICHT verdoppelt (idempotenter ZIP-Re-Import). Deckt den Helper clear_track_data
sowie den realen GPX-Parser-Pfad ab.
"""
from backend.importer import clear_track_data
from backend.importer.gpx import import_gpx


def _count(conn, table: str, activity_id: int) -> int:
    return conn.execute(
        f"SELECT COUNT(*) FROM {table} WHERE activity_id = ?", (activity_id,)
    ).fetchone()[0]


# Minimaler, aber gültiger GPX-Track mit drei Punkten
_GPX = b"""<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Test" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><trkseg>
    <trkpt lat="52.5200" lon="13.4050"><ele>34</ele><time>2026-01-01T10:00:00Z</time></trkpt>
    <trkpt lat="52.5210" lon="13.4060"><ele>35</ele><time>2026-01-01T10:00:10Z</time></trkpt>
    <trkpt lat="52.5220" lon="13.4070"><ele>36</ele><time>2026-01-01T10:00:20Z</time></trkpt>
  </trkseg></trk>
</gpx>"""


def test_gpx_reimport_does_not_duplicate_track_points(db):
    db.execute("INSERT INTO activities (id, name) VALUES (?, ?)", (123, "Testfahrt"))
    db.commit()

    import_gpx(db, 123, _GPX, compressed=False)
    first = _count(db, "track_points", 123)
    assert first == 3

    # Zweiter Import derselben Aktivität (simuliert erneuten ZIP-Export-Import)
    import_gpx(db, 123, _GPX, compressed=False)
    second = _count(db, "track_points", 123)
    assert second == 3, f"Trackpunkte verdoppelt: {first} → {second}"


def test_clear_track_data_removes_all_track_tables_for_activity(db):
    db.execute("INSERT INTO activities (id, name) VALUES (?, ?)", (123, "A"))
    db.execute("INSERT INTO activities (id, name) VALUES (?, ?)", (456, "B"))
    for act in (123, 456):
        db.execute("INSERT INTO track_points (activity_id, lat, lon) VALUES (?, 1.0, 2.0)", (act,))
        db.execute("INSERT INTO laps (activity_id, lap_number) VALUES (?, 0)", (act,))
        db.execute("INSERT INTO segment_efforts (activity_id, name) VALUES (?, 'S')", (act,))
    db.commit()

    with db:
        clear_track_data(db, 123)

    # Ziel-Aktivität leer …
    assert _count(db, "track_points", 123) == 0
    assert _count(db, "laps", 123) == 0
    assert _count(db, "segment_efforts", 123) == 0
    # … andere Aktivität unberührt
    assert _count(db, "track_points", 456) == 1
    assert _count(db, "laps", 456) == 1
    assert _count(db, "segment_efforts", 456) == 1
