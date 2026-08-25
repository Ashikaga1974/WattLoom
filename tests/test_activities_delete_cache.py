"""
Test für backend/api/activities.py: delete_activity() muss den best_by_distance-/
heatmap-Cache (backend/cache.py) invalidieren – eine gelöschte Aktivität kann Teil
eines gecachten Bestzeiten-Segments oder Heatmap-Punkts gewesen sein.
"""
from contextlib import contextmanager

import backend.api.activities as activities
import backend.cache as cache
from backend.api.activities import delete_activity


def _patch_db(monkeypatch, conn):
    @contextmanager
    def fake_db_connection():
        yield conn
    monkeypatch.setattr(activities, "db_connection", fake_db_connection)


class TestDeleteActivityInvalidatesCache:
    def test_cache_entries_are_cleared_after_delete(self, db, monkeypatch):
        _patch_db(monkeypatch, db)
        db.execute(
            "INSERT INTO activities (id, name, activity_type, start_date_local, distance_m) "
            "VALUES (1, 'Ride', 'ride', '2026-05-01T08:00:00', 6000.0)"
        )
        db.commit()

        cache.get_or_set("best_by_distance", lambda: "stale")
        cache.get_or_set("heatmap:20:None", lambda: "stale")

        delete_activity(1)

        calls = []
        cache.get_or_set("best_by_distance", lambda: calls.append(1) or "fresh")
        assert calls == [1]  # wurde neu berechnet statt aus dem (invalidierten) Cache
