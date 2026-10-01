"""
Tests für backend/pr_detection.py – insbesondere den inkrementellen Scan-Pfad
(detect_and_record(conn, before, activity_ids=[...])), der nach einem Einzelimport
nur die neu importierte Aktivität statt aller Aktivitäten neu scannt (siehe
backend/api/analytics/best_by_distance.py: _best_by_distance_map activity_ids/start).
"""
import sqlite3

from backend.pr_detection import detect_and_record, remove_events_for_zip_activities, snapshot

_PR_EVENTS_SCHEMA = """
CREATE TABLE IF NOT EXISTS pr_events (
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


def _insert_event(conn, activity_id, distance_km, created_at, dismissed_at=None):
    return conn.execute(
        "INSERT INTO pr_events (distance_km, best_time_s, activity_id, previous_time_s, created_at, dismissed_at) "
        "VALUES (?, 600.0, ?, 700.0, ?, ?)",
        (distance_km, activity_id, created_at, dismissed_at),
    ).lastrowid


def _dismissed_at(conn, event_id):
    row = conn.execute("SELECT dismissed_at FROM pr_events WHERE id = ?", (event_id,)).fetchone()
    return row[0] if row else "deleted"


class TestRemoveEventsForZipActivities:
    def test_zip_events_removed_single_import_events_kept(self, db):
        zip_event = _insert_event(db, 100, 5.0, "2026-09-01 10:00:00")
        single_event = _insert_event(db, -1, 10.0, "2026-09-01 10:00:00")

        remove_events_for_zip_activities(db)

        assert _dismissed_at(db, zip_event) == "deleted"
        assert _dismissed_at(db, single_event) is None

    def test_chain_of_zip_events_reactivates_single_import_event(self, db):
        # Einzelimport-PR → überholt von ZIP-PR 1 → überholt von ZIP-PR 2
        single = _insert_event(db, -1, 10.0, "2026-08-01 10:00:00", dismissed_at="2026-09-01 10:00:00")
        _insert_event(db, 100, 10.0, "2026-09-01 10:00:00", dismissed_at="2026-10-01 10:00:00")
        _insert_event(db, 200, 10.0, "2026-10-01 10:00:00")

        remove_events_for_zip_activities(db)

        assert _dismissed_at(db, single) is None
        assert db.execute("SELECT COUNT(*) FROM pr_events").fetchone()[0] == 1

    def test_user_dismissed_single_import_event_stays_dismissed(self, db):
        single = _insert_event(db, -1, 10.0, "2026-08-01 10:00:00", dismissed_at="2026-08-02 10:00:00")
        _insert_event(db, 100, 10.0, "2026-09-01 10:00:00")

        remove_events_for_zip_activities(db)

        assert _dismissed_at(db, single) == "2026-08-02 10:00:00"

    def test_cleanup_is_persisted_by_following_executescript(self, tmp_path):
        # reset_db() verlässt sich darauf, dass executescript die offene Transaktion
        # committet – db_connection() committet selbst nicht.
        path = tmp_path / "reset.db"
        conn = sqlite3.connect(path)
        conn.execute(_PR_EVENTS_SCHEMA)
        conn.commit()
        _insert_event(conn, 100, 5.0, "2026-09-01 10:00:00")
        conn.commit()

        remove_events_for_zip_activities(conn)
        conn.executescript("SELECT 1;")
        conn.close()

        conn = sqlite3.connect(path)
        assert conn.execute("SELECT COUNT(*) FROM pr_events").fetchone()[0] == 0
        conn.close()
