"""
Tests für backend/api/heatmap.py: get_heatmap() inkl. Caching (backend/cache.py).

Nutzt die db-Fixture aus conftest.py (In-Memory-SQLite) und patcht
heatmap.db_connection, damit der Endpoint direkt gegen die Test-DB läuft.
"""
from contextlib import contextmanager

import backend.api.heatmap as heatmap
import backend.cache as cache
from backend.api.heatmap import get_heatmap


def _patch_db(monkeypatch, conn):
    @contextmanager
    def fake_db_connection():
        yield conn
    monkeypatch.setattr(heatmap, "db_connection", fake_db_connection)


def _insert_point(conn, activity_id, lat, lon, start_date="2026-05-01T08:00:00"):
    conn.execute(
        "INSERT OR IGNORE INTO activities (id, name, activity_type, start_date, start_date_local, distance_m) "
        "VALUES (?, 'Ride', 'ride', ?, ?, 1000.0)",
        (activity_id, start_date, start_date),
    )
    conn.execute(
        "INSERT INTO track_points (activity_id, lat, lon) VALUES (?, ?, ?)",
        (activity_id, lat, lon),
    )


class TestHeatmapEndpoint:
    def test_returns_points_with_coordinates_only(self, db, monkeypatch):
        _patch_db(monkeypatch, db)
        _insert_point(db, 1, 50.0, 8.0)
        _insert_point(db, 1, None, None)  # ohne Koordinaten → ausgeschlossen
        db.commit()

        result = get_heatmap(simplify=1, year=None)
        assert result["count"] == 1
        assert result["points"] == [[50.0, 8.0]]

    def test_year_filter(self, db, monkeypatch):
        _patch_db(monkeypatch, db)
        _insert_point(db, 1, 50.0, 8.0, start_date="2025-05-01T08:00:00")
        _insert_point(db, 2, 51.0, 9.0, start_date="2026-05-01T08:00:00")
        db.commit()

        result = get_heatmap(simplify=1, year=2026)
        assert result["points"] == [[51.0, 9.0]]


class TestHeatmapCaching:
    def test_second_call_returns_cached_result_without_recomputing(self, db, monkeypatch):
        _patch_db(monkeypatch, db)
        _insert_point(db, 1, 50.0, 8.0)
        db.commit()
        first = get_heatmap(simplify=1, year=None)

        _insert_point(db, 2, 51.0, 9.0)
        db.commit()
        second = get_heatmap(simplify=1, year=None)

        assert second == first  # aus dem Cache, neuer Punkt fehlt noch

    def test_invalidate_forces_recomputation(self, db, monkeypatch):
        _patch_db(monkeypatch, db)
        _insert_point(db, 1, 50.0, 8.0)
        db.commit()
        get_heatmap(simplify=1, year=None)

        _insert_point(db, 2, 51.0, 9.0)
        db.commit()
        cache.invalidate()
        result = get_heatmap(simplify=1, year=None)

        assert result["count"] == 2

    def test_different_simplify_or_year_use_separate_cache_entries(self, db, monkeypatch):
        _patch_db(monkeypatch, db)
        _insert_point(db, 1, 50.0, 8.0, start_date="2026-05-01T08:00:00")
        db.commit()

        result_2026 = get_heatmap(simplify=1, year=2026)
        result_all = get_heatmap(simplify=1, year=None)

        assert result_2026["count"] == 1
        assert result_all["count"] == 1  # eigener Cache-Eintrag, nicht durch year=2026 verfälscht
