"""
Tests für backend/api/analytics/best_by_distance.py: best_by_distance() / _best_by_distance_map().

Deckt die zwei Bausteine ab, die historisch am fehleranfälligsten waren:
- _clean_cumulative_distance(): GPS-Sprung-Filter (MAX_PLAUSIBLE_SPEED_MS)
- _fastest_segment(): Sliding-Window-Suche nach dem schnellsten Segment >= Zieldistanz

Nutzt die db-Fixture aus conftest.py (In-Memory-SQLite) und patcht
analytics.db_connection, damit der Endpoint direkt gegen die Test-DB läuft.
"""
from contextlib import contextmanager

import backend.api.analytics.best_by_distance as analytics
from backend.api.analytics.best_by_distance import (
    _clean_cumulative_distance,
    _fastest_segment,
    best_by_distance,
)


def _patch_db(monkeypatch, conn):
    @contextmanager
    def fake_db_connection():
        yield conn
    monkeypatch.setattr(analytics, "db_connection", fake_db_connection)


def _insert_ride(conn, activity_id, distance_m, name="Test-Ride", smart_device=None):
    conn.execute(
        "INSERT INTO activities (id, name, activity_type, start_date_local, distance_m, smart_device) "
        "VALUES (?, ?, 'ride', '2026-05-01T08:00:00', ?, ?)",
        (activity_id, name, distance_m, smart_device),
    )


def _insert_points(conn, activity_id, rows):
    """rows: Liste aus (timestamp_iso, distance_m)."""
    for ts, dist in rows:
        conn.execute(
            "INSERT INTO track_points (activity_id, timestamp, distance_m) VALUES (?, ?, ?)",
            (activity_id, ts, dist),
        )


# ── _clean_cumulative_distance ──────────────────────────────────────────────

class TestCleanCumulativeDistance:
    def test_normal_progression_unchanged(self):
        dist = [0.0, 10.0, 20.0, 30.0]
        elapsed = [0.0, 1.0, 2.0, 3.0]
        cleaned = _clean_cumulative_distance(dist, elapsed, max_speed_ms=25.0)
        assert cleaned == dist

    def test_gps_jump_capped_to_max_speed(self):
        # 500m in 1s = 500 m/s, weit über max_speed_ms=25 -> auf 25 m/s gekappt
        dist = [0.0, 500.0]
        elapsed = [0.0, 1.0]
        cleaned = _clean_cumulative_distance(dist, elapsed, max_speed_ms=25.0)
        assert cleaned[1] == 25.0

    def test_negative_delta_treated_as_zero(self):
        # Distanz läuft rückwärts (Messfehler) -> kein negativer Zuwachs
        dist = [100.0, 90.0]
        elapsed = [0.0, 1.0]
        cleaned = _clean_cumulative_distance(dist, elapsed, max_speed_ms=25.0)
        assert cleaned[1] == 100.0

    def test_zero_or_negative_dt_treated_as_zero_growth(self):
        # Doppelter/rückwärtiger Zeitstempel -> kein Zuwachs statt Division-Fehler
        dist = [0.0, 50.0]
        elapsed = [5.0, 5.0]
        cleaned = _clean_cumulative_distance(dist, elapsed, max_speed_ms=25.0)
        assert cleaned[1] == 0.0

    def test_cumulative_over_multiple_jumps(self):
        dist = [0.0, 500.0, 510.0]
        elapsed = [0.0, 1.0, 2.0]
        cleaned = _clean_cumulative_distance(dist, elapsed, max_speed_ms=25.0)
        # Erster Sprung gekappt auf 25, zweiter Schritt (10m in 1s) bleibt unangetastet
        assert cleaned == [0.0, 25.0, 35.0]


# ── _fastest_segment ─────────────────────────────────────────────────────────

class TestFastestSegment:
    def test_exact_length_segment_found(self):
        dist = [0.0, 1000.0, 2000.0, 3000.0]
        elapsed = [0.0, 100.0, 200.0, 300.0]
        result = _fastest_segment(dist, elapsed, target_m=2000.0)
        assert result is not None
        start_idx, end_idx, t = result
        assert dist[end_idx] - dist[start_idx] >= 2000.0
        assert t == 200.0

    def test_no_segment_reaches_target_returns_none(self):
        dist = [0.0, 500.0, 900.0]
        elapsed = [0.0, 50.0, 90.0]
        assert _fastest_segment(dist, elapsed, target_m=2000.0) is None

    def test_picks_fastest_among_multiple_candidates(self):
        # Zwei mögliche 1000m-Segmente: 0->1000 in 200s, 1000->2000 in 80s (schneller)
        dist = [0.0, 1000.0, 2000.0]
        elapsed = [0.0, 200.0, 280.0]
        start_idx, end_idx, t = _fastest_segment(dist, elapsed, target_m=1000.0)
        assert t == 80.0
        assert (start_idx, end_idx) == (1, 2)

    def test_single_point_cannot_form_segment(self):
        assert _fastest_segment([0.0], [0.0], target_m=1000.0) is None


# ── best_by_distance() Endpoint ──────────────────────────────────────────────

class TestBestByDistanceEndpoint:
    def test_no_activities_returns_all_none_buckets(self, db, monkeypatch):
        _patch_db(monkeypatch, db)
        result = best_by_distance()
        assert len(result["buckets"]) == len(analytics.BEST_BY_DISTANCE_BUCKETS_KM)
        assert all(b["best_time_s"] is None for b in result["buckets"])

    def test_ride_shorter_than_smallest_bucket_ignored(self, db, monkeypatch):
        _patch_db(monkeypatch, db)
        _insert_ride(db, 1, distance_m=3000.0)  # < 5 km, kleinster Bucket
        _insert_points(db, 1, [
            ("2026-05-01T08:00:00", 0.0),
            ("2026-05-01T08:10:00", 3000.0),
        ])
        result = best_by_distance()
        five_km = next(b for b in result["buckets"] if b["distance_km"] == 5)
        assert five_km["best_time_s"] is None

    def test_ride_fills_matching_bucket(self, db, monkeypatch):
        _patch_db(monkeypatch, db)
        _insert_ride(db, 1, distance_m=6000.0, name="Feierabendrunde")
        _insert_points(db, 1, [
            ("2026-05-01T08:00:00", 0.0),
            ("2026-05-01T08:10:00", 5000.0),
            ("2026-05-01T08:12:00", 6000.0),
        ])
        result = best_by_distance()
        five_km = next(b for b in result["buckets"] if b["distance_km"] == 5)
        assert five_km["best_time_s"] == 600
        assert five_km["activity_id"] == 1
        assert five_km["activity_name"] == "Feierabendrunde"

    def test_gps_jump_does_not_produce_unrealistic_best_effort(self, db, monkeypatch):
        # Ohne Filter würde ein 5km-"Sprung" in 1s ein unmögliches Best-Effort erzeugen.
        _patch_db(monkeypatch, db)
        db.execute(
            "INSERT INTO config (key, value) VALUES ('max_plausible_speed_ms', '25.0')"
        )
        _insert_ride(db, 1, distance_m=5000.0)
        _insert_points(db, 1, [
            ("2026-05-01T08:00:00", 0.0),
            ("2026-05-01T08:00:01", 5000.0),  # GPS-Sprung: 5000 m/s
        ])
        result = best_by_distance()
        five_km = next(b for b in result["buckets"] if b["distance_km"] == 5)
        # Nach Kappung auf 25 m/s ist die bereinigte Distanz nur 25m -> Ziel nicht erreicht
        assert five_km["best_time_s"] is None

    def test_faster_ride_replaces_previous_best(self, db, monkeypatch):
        _patch_db(monkeypatch, db)
        _insert_ride(db, 1, distance_m=5000.0, name="Langsam")
        _insert_points(db, 1, [
            ("2026-05-01T08:00:00", 0.0),
            ("2026-05-01T08:15:00", 5000.0),
        ])
        _insert_ride(db, 2, distance_m=5000.0, name="Schnell")
        _insert_points(db, 2, [
            ("2026-05-02T08:00:00", 0.0),
            ("2026-05-02T08:10:00", 5000.0),
        ])
        result = best_by_distance()
        five_km = next(b for b in result["buckets"] if b["distance_km"] == 5)
        assert five_km["activity_name"] == "Schnell"
        assert five_km["best_time_s"] == 600

    def test_non_ride_activity_type_excluded(self, db, monkeypatch):
        _patch_db(monkeypatch, db)
        conn = db
        conn.execute(
            "INSERT INTO activities (id, name, activity_type, start_date_local, distance_m) "
            "VALUES (1, 'Lauf', 'run', '2026-05-01T08:00:00', 6000.0)"
        )
        _insert_points(conn, 1, [
            ("2026-05-01T08:00:00", 0.0),
            ("2026-05-01T08:10:00", 6000.0),
        ])
        result = best_by_distance()
        five_km = next(b for b in result["buckets"] if b["distance_km"] == 5)
        assert five_km["best_time_s"] is None


# ── Caching (backend/cache.py) ──────────────────────────────────────────────
# best_by_distance() cacht sein Ergebnis unter dem Key "best_by_distance" (siehe
# CLAUDE.md "Live-Full-Table-Scans über track_points"). Die conftest.py-Fixture
# _clear_analytics_cache leert den Cache vor/nach jedem Test automatisch.

class TestBestByDistanceCaching:
    def test_second_call_returns_cached_result_without_recomputing(self, db, monkeypatch):
        _patch_db(monkeypatch, db)
        _insert_ride(db, 1, distance_m=6000.0, name="Erster Ritt")
        _insert_points(db, 1, [
            ("2026-05-01T08:00:00", 0.0),
            ("2026-05-01T08:10:00", 6000.0),
        ])
        first = best_by_distance()

        # Neue, schnellere Fahrt einfügen – OHNE den Cache zu invalidieren
        _insert_ride(db, 2, distance_m=6000.0, name="Schneller Ritt")
        _insert_points(db, 2, [
            ("2026-05-01T09:00:00", 0.0),
            ("2026-05-01T09:05:00", 6000.0),
        ])
        second = best_by_distance()

        assert second == first  # aus dem Cache, spiegelt die neue Fahrt noch nicht wider

    def test_invalidate_forces_recomputation(self, db, monkeypatch):
        import backend.cache as cache
        _patch_db(monkeypatch, db)
        _insert_ride(db, 1, distance_m=6000.0, name="Erster Ritt")
        _insert_points(db, 1, [
            ("2026-05-01T08:00:00", 0.0),
            ("2026-05-01T08:10:00", 6000.0),
        ])
        best_by_distance()

        _insert_ride(db, 2, distance_m=6000.0, name="Schneller Ritt")
        _insert_points(db, 2, [
            ("2026-05-01T09:00:00", 0.0),
            ("2026-05-01T09:05:00", 6000.0),
        ])
        cache.invalidate()
        result = best_by_distance()

        five_km = next(b for b in result["buckets"] if b["distance_km"] == 5)
        assert five_km["activity_name"] == "Schneller Ritt"
