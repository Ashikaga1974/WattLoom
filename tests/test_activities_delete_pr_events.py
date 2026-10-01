"""
Tests für delete_activity() + backend/pr_detection.py: remove_events_for_activity() –
PR-Events einer gelöschten Aktivität dürfen nicht verwaist auf dem Dashboard bleiben,
und die durch sie überholten Vorgänger-PRs müssen wieder aktiv werden.
"""
from contextlib import contextmanager

import backend.api.activities as activities
from backend.api.activities import delete_activity


def _patch_db(monkeypatch, conn):
    @contextmanager
    def fake_db_connection():
        yield conn
    monkeypatch.setattr(activities, "db_connection", fake_db_connection)


def _insert_ride(conn, activity_id):
    conn.execute(
        "INSERT INTO activities (id, name, activity_type, start_date_local, distance_m) "
        "VALUES (?, 'Ride', 'ride', '2026-05-01T08:00:00', 6000.0)",
        (activity_id,),
    )


def _insert_event(conn, activity_id, distance_km, created_at, dismissed_at=None):
    return conn.execute(
        "INSERT INTO pr_events (distance_km, best_time_s, activity_id, previous_time_s, created_at, dismissed_at) "
        "VALUES (?, 600.0, ?, 700.0, ?, ?)",
        (distance_km, activity_id, created_at, dismissed_at),
    ).lastrowid


def _dismissed_at(conn, event_id):
    row = conn.execute("SELECT dismissed_at FROM pr_events WHERE id = ?", (event_id,)).fetchone()
    return row["dismissed_at"] if row else "deleted"


class TestDeleteActivityPrEvents:
    def test_events_of_deleted_activity_are_removed(self, db, monkeypatch):
        _patch_db(monkeypatch, db)
        _insert_ride(db, 1)
        own = _insert_event(db, 1, 5.0, "2026-10-01 10:00:00")
        db.commit()

        delete_activity(1)

        assert _dismissed_at(db, own) == "deleted"

    def test_superseded_predecessor_is_reactivated(self, db, monkeypatch):
        _patch_db(monkeypatch, db)
        _insert_ride(db, 1)
        _insert_ride(db, 2)
        # Vorgänger wurde beim Anlegen des neuen PRs als überholt markiert (1s vor created_at,
        # wie an einer Sekundengrenze zwischen UPDATE und INSERT möglich)
        old = _insert_event(db, 1, 10.0, "2026-09-01 10:00:00", dismissed_at="2026-10-01 10:59:59")
        _insert_event(db, 2, 10.0, "2026-10-01 11:00:00")
        db.commit()

        delete_activity(2)

        assert _dismissed_at(db, old) is None

    def test_only_latest_predecessor_is_reactivated(self, db, monkeypatch):
        _patch_db(monkeypatch, db)
        for activity_id in (1, 2, 3):
            _insert_ride(db, activity_id)
        oldest = _insert_event(db, 1, 10.0, "2026-08-01 10:00:00", dismissed_at="2026-09-01 10:00:00")
        middle = _insert_event(db, 2, 10.0, "2026-09-01 10:00:00", dismissed_at="2026-10-01 10:00:00")
        _insert_event(db, 3, 10.0, "2026-10-01 10:00:00")
        db.commit()

        delete_activity(3)

        assert _dismissed_at(db, middle) is None
        assert _dismissed_at(db, oldest) == "2026-09-01 10:00:00"

    def test_manually_dismissed_predecessor_stays_dismissed(self, db, monkeypatch):
        _patch_db(monkeypatch, db)
        _insert_ride(db, 1)
        _insert_ride(db, 2)
        # Vom Nutzer verworfen, lange bevor der neue PR kam
        old = _insert_event(db, 1, 10.0, "2026-09-01 10:00:00", dismissed_at="2026-09-02 10:00:00")
        _insert_event(db, 2, 10.0, "2026-10-01 10:00:00")
        db.commit()

        delete_activity(2)

        assert _dismissed_at(db, old) == "2026-09-02 10:00:00"

    def test_dismissed_own_event_reactivates_nothing(self, db, monkeypatch):
        _patch_db(monkeypatch, db)
        _insert_ride(db, 1)
        _insert_ride(db, 2)
        old = _insert_event(db, 1, 10.0, "2026-09-01 10:00:00", dismissed_at="2026-10-01 10:00:00")
        _insert_event(db, 2, 10.0, "2026-10-01 10:00:00", dismissed_at="2026-10-02 10:00:00")
        db.commit()

        delete_activity(2)

        assert _dismissed_at(db, old) == "2026-10-01 10:00:00"

    def test_other_distances_are_untouched(self, db, monkeypatch):
        _patch_db(monkeypatch, db)
        _insert_ride(db, 1)
        _insert_ride(db, 2)
        other = _insert_event(db, 1, 20.0, "2026-09-01 10:00:00", dismissed_at="2026-10-01 10:00:00")
        _insert_event(db, 2, 10.0, "2026-10-01 10:00:00")
        db.commit()

        delete_activity(2)

        assert _dismissed_at(db, other) == "2026-10-01 10:00:00"
