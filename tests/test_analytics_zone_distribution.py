"""
Tests für backend/api/analytics/zone_distribution.py: zone_distribution().

Nutzt die db-Fixture aus conftest.py (In-Memory-SQLite) und patcht
analytics.db_connection, damit der Endpoint direkt gegen die Test-DB läuft.
"""
from contextlib import contextmanager

import backend.api.analytics.zone_distribution as analytics


def _patch_db(monkeypatch, conn):
    @contextmanager
    def fake_db_connection():
        yield conn
    monkeypatch.setattr(analytics, "db_connection", fake_db_connection)


def _insert_activity(conn, activity_id, start_date_local, has_track=1, max_hr=None):
    conn.execute(
        "INSERT INTO activities (id, start_date_local, has_track, distance_m, moving_time_s, max_hr) "
        "VALUES (?, ?, ?, 1000, 3600, ?)",
        (activity_id, start_date_local, has_track, max_hr),
    )


def _insert_points(conn, activity_id, points):
    for ts, hr in points:
        conn.execute(
            "INSERT INTO track_points (activity_id, timestamp, hr) VALUES (?, ?, ?)",
            (activity_id, ts, hr),
        )


class TestZoneDistribution:
    def test_easy_ride_falls_into_easy_bucket(self, db, monkeypatch):
        # hr_max Default 185 (keine config-Zeile) → 100 bpm = 54 % → Zone 1 (Regeneration)
        _patch_db(monkeypatch, db)
        _insert_activity(db, 1, "2026-05-01T08:00:00")
        _insert_points(db, 1, [
            ("2026-05-01T08:00:00", 100),
            ("2026-05-01T08:00:10", 100),
            ("2026-05-01T08:00:20", 100),
        ])
        db.commit()

        result = analytics.zone_distribution(year=None)

        assert result["easy_pct"] == 100.0
        assert result["moderate_pct"] == 0.0
        assert result["hard_pct"] == 0.0
        assert result["by_month"] == [{
            "month": "2026-05", "total_seconds": 20,
            "zone1_seconds": 20, "zone2_seconds": 0, "zone3_seconds": 0,
            "zone4_seconds": 0, "zone5_seconds": 0,
        }]

    def test_hard_ride_falls_into_hard_bucket(self, db, monkeypatch):
        # 180 bpm / 185 = 97 % → Zone 5 (VO2max)
        _patch_db(monkeypatch, db)
        _insert_activity(db, 2, "2026-05-02T08:00:00")
        _insert_points(db, 2, [
            ("2026-05-02T08:00:00", 180),
            ("2026-05-02T08:00:10", 180),
            ("2026-05-02T08:00:20", 180),
        ])
        db.commit()

        result = analytics.zone_distribution(year=None)

        assert result["hard_pct"] == 100.0
        assert result["easy_pct"] == 0.0

    def test_gps_gap_over_10s_is_not_counted(self, db, monkeypatch):
        # Zeitdelta > MAX_DELTA_SECONDS (10s) wird ignoriert, analog zones.py
        _patch_db(monkeypatch, db)
        _insert_activity(db, 3, "2026-05-03T08:00:00")
        _insert_points(db, 3, [
            ("2026-05-03T08:00:00", 100),
            ("2026-05-03T08:00:20", 100),
        ])
        db.commit()

        result = analytics.zone_distribution(year=None)

        assert result["total_seconds"] == 0

    def test_year_filter_excludes_other_years(self, db, monkeypatch):
        _patch_db(monkeypatch, db)
        _insert_activity(db, 4, "2025-01-01T08:00:00")
        _insert_points(db, 4, [("2025-01-01T08:00:00", 100), ("2025-01-01T08:00:05", 100)])
        _insert_activity(db, 5, "2026-01-01T08:00:00")
        _insert_points(db, 5, [("2026-01-01T08:00:00", 100), ("2026-01-01T08:00:05", 100)])
        db.commit()

        result = analytics.zone_distribution(year=2026)

        assert [m["month"] for m in result["by_month"]] == ["2026-01"]

    def test_activities_without_track_are_ignored(self, db, monkeypatch):
        _patch_db(monkeypatch, db)
        _insert_activity(db, 6, "2026-05-01T08:00:00", has_track=0)
        _insert_points(db, 6, [("2026-05-01T08:00:00", 100), ("2026-05-01T08:00:05", 100)])
        db.commit()

        result = analytics.zone_distribution(year=None)

        assert result["total_seconds"] == 0

    def test_hr_correction_shifts_zone_upward(self, db, monkeypatch):
        # 100 bpm / 185 = 54 % (Zone 1) + 8 Prozentpunkte Korrektur = 62 % -> Zone 2
        _patch_db(monkeypatch, db)
        db.execute("INSERT INTO config(key, value) VALUES ('hr_correction_enabled', '1')")
        db.execute("INSERT INTO config(key, value) VALUES ('hr_correction_pct', '8')")
        _insert_activity(db, 7, "2026-05-01T08:00:00")
        _insert_points(db, 7, [
            ("2026-05-01T08:00:00", 100),
            ("2026-05-01T08:00:10", 100),
        ])
        db.commit()

        result = analytics.zone_distribution(year=None)

        assert result["hr_correction_applied"] is True
        assert result["by_month"][0]["zone1_seconds"] == 0
        assert result["by_month"][0]["zone2_seconds"] == 10

    def test_hr_correction_since_excludes_earlier_activities(self, db, monkeypatch):
        _patch_db(monkeypatch, db)
        db.execute("INSERT INTO config(key, value) VALUES ('hr_correction_enabled', '1')")
        db.execute("INSERT INTO config(key, value) VALUES ('hr_correction_pct', '8')")
        db.execute("INSERT INTO config(key, value) VALUES ('hr_correction_since', '2026-06-01')")
        _insert_activity(db, 8, "2026-05-01T08:00:00")  # vor "since" -> unkorrigiert
        _insert_points(db, 8, [("2026-05-01T08:00:00", 100), ("2026-05-01T08:00:10", 100)])
        db.commit()

        result = analytics.zone_distribution(year=None)

        assert result["by_month"][0]["zone1_seconds"] == 10
        assert result["by_month"][0]["zone2_seconds"] == 0

    def test_prefers_observed_max_hr_over_config_fallback(self, db, monkeypatch):
        # Aktivität mit aufgezeichnetem max_hr=176 vorhanden -> hr_max=176 statt Config-Default 185
        # (Bugfix Session 2026-08-22: zone_distribution() nutzte bisher immer den Config-Wert,
        # inkonsistent zu zones.py/PMC/Fitness-Fingerprint, die den echten Messwert bevorzugen)
        # 160/176 = 90.9% -> Zone 5; mit dem alten Verhalten (160/185 = 86.5%) wäre es Zone 4 gewesen
        _patch_db(monkeypatch, db)
        _insert_activity(db, 9, "2026-05-01T08:00:00", max_hr=176)
        _insert_points(db, 9, [
            ("2026-05-01T08:00:00", 160),
            ("2026-05-01T08:00:10", 160),
        ])
        db.commit()

        result = analytics.zone_distribution(year=None)

        assert result["by_month"][0]["zone5_seconds"] == 10
        assert result["by_month"][0]["zone4_seconds"] == 0

    def test_no_data_returns_zeroed_response(self, db, monkeypatch):
        _patch_db(monkeypatch, db)

        result = analytics.zone_distribution(year=None)

        assert result["by_month"] == []
        assert result["total_seconds"] == 0
        assert result["easy_pct"] == 0.0
        assert all(z["pct"] == 0.0 for z in result["zones"])
