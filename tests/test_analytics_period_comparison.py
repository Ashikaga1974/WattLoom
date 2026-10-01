"""
Tests für backend/api/analytics/period_comparison.py ("Was hat sich verändert?").

Die Fenster- und Regel-Funktionen sind reine Funktionen und werden direkt geprüft; dazu ein
End-to-End-Test gegen den Endpunkt mit relativen Datumsangaben zu date.today().
"""
from contextlib import contextmanager
from datetime import date, datetime, timedelta

import pytest

import backend.api.analytics.period_comparison as period_module
import backend.api.analytics.pmc as pmc_module
from backend.api.analytics.period_comparison import (
    MIN_RIDES,
    best_efforts_in,
    build_insights,
    comparison_windows,
    period_comparison,
    summarize_rides,
)


def _patch_db(monkeypatch, conn):
    @contextmanager
    def fake_db_connection():
        yield conn
    monkeypatch.setattr(period_module, "db_connection", fake_db_connection)
    monkeypatch.setattr(pmc_module, "db_connection", fake_db_connection)


def _insert_ride(conn, activity_id, day: date, distance_m=30000, moving_s=4500, avg_hr=130.0, elevation=200):
    ts = f"{day.isoformat()}T08:00:00"
    conn.execute(
        """INSERT INTO activities (id, name, activity_type, start_date, start_date_local, distance_m,
                                   moving_time_s, elapsed_time_s, avg_hr, elevation_gain_m)
           VALUES (?, 'Ride', 'ride', ?, ?, ?, ?, ?, ?, ?)""",
        (activity_id, ts, ts, distance_m, moving_s, moving_s, avg_hr, elevation),
    )


def _insert_track(conn, activity_id, total_m, total_s, steps=24):
    start = datetime(2026, 1, 1, 8, 0, 0)
    for i in range(steps + 1):
        ts = (start + timedelta(seconds=total_s * i / steps)).isoformat()
        conn.execute(
            "INSERT INTO track_points (activity_id, timestamp, distance_m) VALUES (?, ?, ?)",
            (activity_id, ts, total_m * i / steps),
        )


def _summary(**overrides):
    base = {
        "rides": 10, "km": 300.0, "hours": 12.0, "elevation_m": 2000, "avg_speed_kmh": 25.0,
        "hr_rides": 10, "avg_hr": 130.0, "efficiency": 19.2, "active_weeks": 10, "ctl": 40.0,
        "best_efforts": {"10": 1200, "20": 2500, "30": 4300, "50": None},
    }
    base.update(overrides)
    return base


def _codes(insights):
    return [i["code"] for i in insights]


class TestComparisonWindows:
    def test_last_year_shifts_by_365_days(self):
        current, baseline = comparison_windows(date(2026, 10, 1), 90, "last_year")
        assert current == (date(2026, 7, 4), date(2026, 10, 1))
        assert baseline == (date(2025, 7, 4), date(2025, 10, 1))

    def test_previous_window_ends_right_before_current(self):
        current, baseline = comparison_windows(date(2026, 10, 1), 30, "previous")
        assert current == (date(2026, 9, 2), date(2026, 10, 1))
        assert baseline == (date(2026, 8, 3), date(2026, 9, 1))


class TestSummarizeRides:
    def test_speed_is_total_distance_over_total_time(self):
        # 10 km in 1 h + 50 km in 2 h → 60 km / 3 h = 20 km/h (Mittel der Fahrt-Schnitte wäre 17,5)
        rides = [
            {"start_date": "2026-09-01T08:00:00", "distance_m": 10000, "moving_time_s": 3600, "elevation_gain_m": 0, "avg_hr": None},
            {"start_date": "2026-09-02T08:00:00", "distance_m": 50000, "moving_time_s": 7200, "elevation_gain_m": 0, "avg_hr": None},
        ]
        assert summarize_rides(rides)["avg_speed_kmh"] == 20.0

    def test_hr_values_only_from_rides_with_hr(self):
        rides = [
            {"start_date": "2026-09-01T08:00:00", "distance_m": 25000, "moving_time_s": 3600, "elevation_gain_m": 0, "avg_hr": 125.0},
            {"start_date": "2026-09-02T08:00:00", "distance_m": 40000, "moving_time_s": 3600, "elevation_gain_m": 0, "avg_hr": None},
        ]
        summary = summarize_rides(rides)
        assert summary["hr_rides"] == 1
        assert summary["avg_hr"] == 125.0
        assert summary["efficiency"] == 20.0  # 25 km/h / 125 bpm × 100

    def test_active_weeks_counts_iso_weeks(self):
        rides = [
            {"start_date": d, "distance_m": 1000, "moving_time_s": 300, "elevation_gain_m": 0, "avg_hr": None}
            for d in ("2026-09-07T08:00:00", "2026-09-08T08:00:00", "2026-09-14T08:00:00")
        ]
        assert summarize_rides(rides)["active_weeks"] == 2

    def test_empty_window(self):
        summary = summarize_rides([])
        assert summary["rides"] == 0
        assert summary["avg_speed_kmh"] is None
        assert summary["efficiency"] is None


class TestBuildInsights:
    def test_too_few_rides_gives_only_hint(self):
        insights = build_insights(_summary(rides=MIN_RIDES - 1), _summary())
        assert _codes(insights) == ["not_enough_rides"]

    def test_no_change_gives_fallback(self):
        assert _codes(build_insights(_summary(), _summary())) == ["no_notable_change"]

    def test_volume_change_above_threshold(self):
        insights = build_insights(_summary(km=360.0), _summary(km=300.0))
        assert insights[0] == {"code": "volume_up", "values": {"pct": 20}}

    def test_volume_change_below_threshold_is_ignored(self):
        assert "volume_up" not in _codes(build_insights(_summary(km=320.0), _summary(km=300.0)))

    def test_faster_at_similar_hr_replaces_efficiency_statement(self):
        current = _summary(avg_speed_kmh=26.0, avg_hr=131.0, efficiency=19.85)
        codes = _codes(build_insights(current, _summary()))
        assert "faster_similar_hr" in codes
        assert "efficiency_up" not in codes

    def test_faster_without_enough_hr_rides(self):
        codes = _codes(build_insights(_summary(avg_speed_kmh=26.0, hr_rides=2), _summary()))
        assert "faster" in codes
        assert "efficiency_up" not in codes

    def test_efficiency_drop_when_speed_unchanged(self):
        # Gleiches Tempo, deutlich höhere HF → Effizienz −5 %
        current = _summary(avg_hr=137.0, efficiency=18.24)
        assert "efficiency_down" in _codes(build_insights(current, _summary()))

    def test_best_efforts_compare_only_distances_with_both_values(self):
        current = _summary(best_efforts={"10": 1150, "20": 2600, "30": 4300, "50": 9000})
        insights = build_insights(current, _summary())
        assert {"code": "best_efforts_improved", "values": {"distances": "10"}} in insights
        assert {"code": "best_efforts_worse", "values": {"distances": "20"}} in insights

    def test_fitness_and_consistency(self):
        codes = _codes(build_insights(_summary(ctl=30.0, active_weeks=7), _summary()))
        assert "fitness_down" in codes
        assert "consistency_down" in codes


class TestBestEffortsIn:
    def test_only_given_activities_are_scanned(self, db):
        _insert_ride(db, 1, date(2026, 9, 1), distance_m=12000)
        _insert_track(db, 1, 12000, 1800)  # langsam: 10 km in 1500 s
        _insert_ride(db, 2, date(2025, 9, 1), distance_m=12000)
        _insert_track(db, 2, 12000, 1200)  # schnell, liegt aber außerhalb
        assert best_efforts_in(db, [1])["10"] == pytest.approx(1500, abs=1)

    def test_no_activities(self, db):
        assert best_efforts_in(db, []) == {"10": None, "20": None, "30": None, "50": None}


def test_endpoint_compares_windows(db, monkeypatch):
    _patch_db(monkeypatch, db)
    today = date.today()
    for i in range(6):
        _insert_ride(db, 100 + i, today - timedelta(days=5 + i * 7), distance_m=40000)
        _insert_ride(db, 200 + i, today - timedelta(days=365 + 5 + i * 7), distance_m=30000)
    _insert_ride(db, 300, today - timedelta(days=200))  # liegt in keinem der beiden Fenster
    db.commit()

    result = period_comparison(days=90, baseline="last_year")

    assert result["current"]["rides"] == 6
    assert result["previous"]["rides"] == 6
    assert result["current"]["km"] == 240.0
    assert result["current"]["ctl"] is not None
    assert {"code": "volume_up", "values": {"pct": 33}} in result["insights"]
