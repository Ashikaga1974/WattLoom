"""
Tests für backend/pr_detection.py – insbesondere den inkrementellen Scan-Pfad
(detect_and_record(conn, before, activity_ids=[...])), der nach einem Einzelimport
nur die neu importierte Aktivität statt aller Aktivitäten neu scannt (siehe
backend/api/analytics/best_by_distance.py: _best_by_distance_map activity_ids/start).
"""
from backend.pr_detection import detect_and_record, snapshot

_PR_EVENTS_SCHEMA = """
CREATE TABLE pr_events (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    distance_km       REAL NOT NULL,
    best_time_s       REAL NOT NULL,
    best_speed_kmh    REAL,
    activity_id       INTEGER NOT NULL,
    activity_name     TEXT,
    activity_date     TEXT,
    previous_time_s   REAL NOT NULL,
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
    dismissed_at      TEXT
)
"""


def _insert_ride(conn, activity_id, distance_m, name="Test-Ride"):
    conn.execute(
        "INSERT INTO activities (id, name, activity_type, start_date_local, distance_m) "
        "VALUES (?, ?, 'ride', '2026-05-01T08:00:00', ?)",
        (activity_id, name, distance_m),
    )


def _insert_points(conn, activity_id, rows):
    for ts, dist in rows:
        conn.execute(
            "INSERT INTO track_points (activity_id, timestamp, distance_m) VALUES (?, ?, ?)",
            (activity_id, ts, dist),
        )


def _setup(db):
    db.execute(_PR_EVENTS_SCHEMA)


class TestDetectAndRecordIncremental:
    def test_faster_new_ride_recorded_as_pr(self, db):
        _setup(db)
        _insert_ride(db, 1, distance_m=6000.0, name="Alter Bestwert")
        _insert_points(db, 1, [
            ("2026-05-01T08:00:00", 0.0),
            ("2026-05-01T08:15:00", 6000.0),
        ])
        before = snapshot(db)

        _insert_ride(db, 2, distance_m=6000.0, name="Neuer Bestwert")
        _insert_points(db, 2, [
            ("2026-05-02T08:00:00", 0.0),
            ("2026-05-02T08:05:00", 6000.0),
        ])

        events = detect_and_record(db, before, activity_ids=[2])
        assert len(events) == 1
        assert events[0]["distance_km"] == 5.0
        assert events[0]["activity_id"] == 2
        assert events[0]["previous_time_s"] == 900  # 15 min

        row = db.execute("SELECT * FROM pr_events").fetchone()
        assert row["activity_id"] == 2

    def test_slower_new_ride_no_pr(self, db):
        _setup(db)
        _insert_ride(db, 1, distance_m=6000.0, name="Bestwert bleibt")
        _insert_points(db, 1, [
            ("2026-05-01T08:00:00", 0.0),
            ("2026-05-01T08:05:00", 6000.0),
        ])
        before = snapshot(db)

        _insert_ride(db, 2, distance_m=6000.0, name="Langsamer")
        _insert_points(db, 2, [
            ("2026-05-02T08:00:00", 0.0),
            ("2026-05-02T08:15:00", 6000.0),
        ])

        events = detect_and_record(db, before, activity_ids=[2])
        assert events == []
        assert db.execute("SELECT COUNT(*) c FROM pr_events").fetchone()["c"] == 0

    def test_first_ride_ever_not_counted_as_pr(self, db):
        # before ist komplett leer (keine Aktivitäten vor dem Import) – der allererste
        # Import darf nicht als "neuer Rekord" gemeldet werden (siehe Docstring).
        _setup(db)
        before = snapshot(db)

        _insert_ride(db, 1, distance_m=6000.0, name="Erste Fahrt")
        _insert_points(db, 1, [
            ("2026-05-01T08:00:00", 0.0),
            ("2026-05-01T08:15:00", 6000.0),
        ])

        events = detect_and_record(db, before, activity_ids=[1])
        assert events == []

    def test_incremental_matches_full_scan_result(self, db):
        """Kernaussage der Optimierung: der inkrementelle Pfad (activity_ids gesetzt)
        muss dieselben PR-Events liefern wie der vollständige Re-Scan (activity_ids=None)."""
        _setup(db)
        _insert_ride(db, 1, distance_m=6000.0, name="Alt")
        _insert_points(db, 1, [
            ("2026-05-01T08:00:00", 0.0),
            ("2026-05-01T08:15:00", 6000.0),
        ])
        before = snapshot(db)

        _insert_ride(db, 2, distance_m=6000.0, name="Neu")
        _insert_points(db, 2, [
            ("2026-05-02T08:00:00", 0.0),
            ("2026-05-02T08:05:00", 6000.0),
        ])

        events_incremental = detect_and_record(db, before, activity_ids=[2])
        db.execute("DELETE FROM pr_events")

        events_full = detect_and_record(db, before)

        assert events_incremental == events_full
