"""
Regressions-Tests für backend/api/analytics/overview.py.

Deckt alle bisher ungetesteten Endpunkte ab: time_heatmap, speed_hr, year_progress,
temp_correlation, wind_impact, weekly_volume, get_wrapped, hr_curve, cadence_analysis,
calories, speed_trend, weekend_weekday.

Kein Anspruch auf vollständige Abdeckung jedes Verzweigungspfads – Ziel ist ein
Snapshot der Response-Struktur (Top-Level-Keys vorhanden) plus 2-3 Rechenformeln
je Endpunkt, damit ein stiller Kalender-/Rundungs-Bug künftig auffällt statt erst
beim Anschauen der Seite im Browser.

Nutzt die db-Fixture aus conftest.py (In-Memory-SQLite) und patcht
overview.db_connection, damit die Endpunkte direkt gegen die Test-DB laufen.
"""
from contextlib import contextmanager
from datetime import date, timedelta

import backend.api.analytics.overview as overview
from backend.api.analytics.overview import (
    calories,
    cadence_analysis,
    get_wrapped,
    hr_curve,
    speed_hr,
    speed_trend,
    temp_correlation,
    time_heatmap,
    weekend_weekday,
    weekly_volume,
    wind_impact,
    year_progress,
)


def _patch_db(monkeypatch, conn):
    @contextmanager
    def fake_db_connection():
        yield conn
    monkeypatch.setattr(overview, "db_connection", fake_db_connection)


def _insert_activity(conn, id, start_date_local, distance_m=10000.0, moving_time_s=1800,
                      avg_speed_ms=5.56, avg_hr=140, max_hr=160, calories=300.0,
                      elevation_gain_m=100.0, activity_type="ride", bike_id="test_bike",
                      weather_temp_c=None, weather_wind_ms=None, name=None):
    conn.execute(
        """INSERT INTO activities
           (id, name, activity_type, sport_type, start_date, start_date_local, distance_m,
            moving_time_s, avg_speed_ms, avg_hr, max_hr, calories, elevation_gain_m, bike_id,
            weather_temp_c, weather_wind_ms)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (id, name or f"Ride {id}", activity_type, activity_type, start_date_local, start_date_local,
         distance_m, moving_time_s, avg_speed_ms, avg_hr, max_hr, calories, elevation_gain_m, bike_id,
         weather_temp_c, weather_wind_ms),
    )


def _insert_other_activity(conn, id, start_date_local, sport_type, moving_time_s=1800, calories=200.0):
    conn.execute(
        """INSERT INTO other_activities (id, name, sport_type, start_date_local, moving_time_s, calories)
           VALUES (?,?,?,?,?,?)""",
        (id, f"Workout {id}", sport_type, start_date_local, moving_time_s, calories),
    )


def _insert_track_point(conn, activity_id, hr=None, cadence=None, speed_ms=None):
    conn.execute(
        "INSERT INTO track_points (activity_id, hr, cadence, speed_ms) VALUES (?, ?, ?, ?)",
        (activity_id, hr, cadence, speed_ms),
    )


class TestTimeHeatmap:
    def test_ride_lands_in_correct_weekday_hour_bucket(self, db, monkeypatch):
        _patch_db(monkeypatch, db)
        # 2026-01-05 ist ein Montag, 08 Uhr → weekday_idx 0 (Formel: (%w + 6) % 7)
        d = date(2026, 1, 5)
        assert d.weekday() == 0
        _insert_activity(db, 1, "2026-01-05T08:15:00", moving_time_s=1800)
        db.commit()

        result = time_heatmap(year=None, tz_offset=0)
        cells = result["cells"]
        cell = next(c for c in cells if c["weekday"] == 0 and c["hour"] == 8)
        assert cell["ride_count"] == 1
        assert cell["ride_minutes"] == 30  # 1800s / 60
        assert cell["workout_count"] == 0

    def test_year_filter_excludes_other_years(self, db, monkeypatch):
        _patch_db(monkeypatch, db)
        _insert_activity(db, 1, "2025-06-01T08:00:00")
        _insert_activity(db, 2, "2026-06-01T08:00:00")
        db.commit()

        result = time_heatmap(year=2026, tz_offset=0)
        total_rides = sum(c["ride_count"] for c in result["cells"])
        assert total_rides == 1


class TestSpeedHr:
    def test_point_fields_match_input(self, db, monkeypatch):
        _patch_db(monkeypatch, db)
        _insert_activity(db, 1, "2026-03-01T08:00:00", distance_m=20000.0,
                          avg_speed_ms=6.0, avg_hr=140)
        db.commit()

        result = speed_hr()
        assert len(result["points"]) == 1
        p = result["points"][0]
        assert p["year"] == 2026
        assert p["month"] == "2026-03"
        assert p["speed_kmh"] == 21.6  # 6.0 * 3.6
        assert p["hr"] == 140
        assert p["dist_km"] == 20.0

    def test_filters_out_implausible_speed_and_missing_hr(self, db, monkeypatch):
        _patch_db(monkeypatch, db)
        _insert_activity(db, 1, "2026-03-01T08:00:00", avg_speed_ms=1.0, avg_hr=140)  # zu langsam
        _insert_activity(db, 2, "2026-03-02T08:00:00", avg_speed_ms=6.0, avg_hr=None)  # keine HF
        db.commit()

        result = speed_hr()
        assert result["points"] == []


class TestYearProgress:
    def test_cumulative_km_per_year(self, db, monkeypatch):
        _patch_db(monkeypatch, db)
        _insert_activity(db, 1, "2026-01-01T08:00:00", distance_m=10000.0)
        _insert_activity(db, 2, "2026-01-03T08:00:00", distance_m=15000.0)
        _insert_activity(db, 3, "2025-01-01T08:00:00", distance_m=5000.0)
        db.commit()

        result = year_progress()
        assert set(result["years"].keys()) == {"2025", "2026"}
        pts_2026 = result["years"]["2026"]
        # doy 1 → 10.0 km kumuliert, doy 3 → 25.0 km kumuliert
        assert pts_2026[0] == [1, 10.0]
        assert pts_2026[1] == [3, 25.0]


class TestTempCorrelation:
    def test_point_reflects_weather_and_ride_data(self, db, monkeypatch):
        _patch_db(monkeypatch, db)
        _insert_activity(db, 1, "2026-06-01T08:00:00", avg_speed_ms=6.0, avg_hr=140,
                          distance_m=30000.0, weather_temp_c=15.34)
        db.commit()

        result = temp_correlation()
        assert len(result["points"]) == 1
        p = result["points"][0]
        assert p["temp_c"] == 15.3
        assert p["speed_kmh"] == 21.6
        assert p["dist_km"] == 30.0
        assert p["year"] == 2026

    def test_missing_weather_excluded(self, db, monkeypatch):
        _patch_db(monkeypatch, db)
        _insert_activity(db, 1, "2026-06-01T08:00:00", weather_temp_c=None)
        db.commit()
        assert temp_correlation()["points"] == []


class TestWindImpact:
    def test_point_reflects_wind_and_ride_data(self, db, monkeypatch):
        _patch_db(monkeypatch, db)
        _insert_activity(db, 1, "2026-06-01T08:00:00", avg_speed_ms=6.0, avg_hr=140,
                          distance_m=30000.0, weather_wind_ms=4.567)
        db.commit()

        result = wind_impact()
        assert len(result["points"]) == 1
        p = result["points"][0]
        assert p["wind_ms"] == 4.57
        assert p["speed_kmh"] == 21.6
        assert p["dist_km"] == 30.0


class TestWeeklyVolume:
    def test_current_week_minutes_split_by_type(self, db, monkeypatch):
        _patch_db(monkeypatch, db)
        today = date.today()
        monday = today - timedelta(days=today.weekday())
        _insert_activity(db, 1, f"{monday.isoformat()}T08:00:00", moving_time_s=3600)
        _insert_other_activity(db, 2, f"{monday.isoformat()}T18:00:00", "strength_training", moving_time_s=1800)
        _insert_other_activity(db, 3, f"{monday.isoformat()}T19:00:00", "walking", moving_time_s=900)
        db.commit()

        result = weekly_volume(weeks=1)
        assert len(result) == 1
        week = result[0]
        assert week["weeks_ago"] == 0
        assert week["ride_minutes"] == 60
        assert week["weight_training_minutes"] == 30
        assert week["workout_minutes"] == 15


class TestWrapped:
    def test_totals_and_superlatives(self, db, monkeypatch):
        _patch_db(monkeypatch, db)
        _insert_activity(db, 1, "2026-03-02T08:00:00", distance_m=20000.0, avg_speed_ms=5.0,
                          elevation_gain_m=100.0, calories=400.0, bike_id="test_bike")
        _insert_activity(db, 2, "2026-06-15T08:00:00", distance_m=50000.0, avg_speed_ms=8.0,
                          elevation_gain_m=600.0, calories=900.0, bike_id="test_bike")
        db.commit()

        result = get_wrapped(year=2026, tz_offset=0)
        assert result["year"] == 2026
        assert result["totals"]["rides"] == 2
        assert result["totals"]["distance_km"] == 70.0
        assert result["best_ride"]["id"] == 2          # größte Distanz
        assert result["most_elevation_ride"]["id"] == 2
        assert result["fastest_ride"]["id"] == 2        # 8.0 m/s > 5.0 m/s, beide >=10km
        assert len(result["monthly_km"]) == 12
        assert result["monthly_km"][2] == 20.0   # März = Index 2
        assert result["monthly_km"][5] == 50.0   # Juni = Index 5

    def test_no_data_returns_empty_shape(self, db, monkeypatch):
        _patch_db(monkeypatch, db)
        result = get_wrapped(year=2026, tz_offset=0)
        assert result == {"year": None, "available_years": [], "totals": {}}


class TestHrCurve:
    def test_best_60s_window_is_max_of_sliding_average(self, db, monkeypatch):
        _patch_db(monkeypatch, db)
        _insert_activity(db, 1, "2026-04-01T08:00:00")
        db.commit()
        # 90 Sekunden HR-Werte: die letzten 60 haben den höheren Durchschnitt
        for hr in [100] * 30 + [150] * 60:
            _insert_track_point(db, 1, hr=hr)
        db.commit()

        result = hr_curve(year=None)
        assert result["durations_s"] == [60, 300, 600, 1200, 3600]
        assert result["best_hr"][0] == 150.0  # bestes 60s-Fenster: durchgehend 150
        # zu wenig Datenpunkte (90 < 300) → restliche Fenster bleiben 0.0
        assert result["best_hr"][1] == 0.0

    def test_year_filter_excludes_other_years(self, db, monkeypatch):
        _patch_db(monkeypatch, db)
        _insert_activity(db, 1, "2025-04-01T08:00:00")
        db.commit()
        for _ in range(60):
            _insert_track_point(db, 1, hr=140)
        db.commit()

        result = hr_curve(year=2026)
        assert result["best_hr"][0] == 0.0


class TestCadence:
    def test_stats_and_zones_from_track_points(self, db, monkeypatch):
        _patch_db(monkeypatch, db)
        _insert_activity(db, 1, "2026-05-01T08:00:00")
        db.commit()
        for cadence in [85, 85, 90, 60]:
            _insert_track_point(db, 1, cadence=cadence, hr=140, speed_ms=6.0)
        db.commit()

        result = cadence_analysis(year=None)
        assert result["stats"]["rides_with_cadence"] == 1
        assert result["stats"]["total_points"] == 4
        assert result["stats"]["avg_cadence"] == 80.0  # (85+85+90+60)/4
        assert result["stats"]["mode_cadence"] == 85    # häufigster Wert
        zone_optimal = next(z for z in result["zones"] if z["name"] == "Optimal")
        assert zone_optimal["count"] == 2  # 85, 85 liegen in 80-89
        zone_hoch = next(z for z in result["zones"] if z["name"] == "Hoch")
        assert zone_hoch["count"] == 1      # 90 liegt in 90-99
        zone_niedrig = next(z for z in result["zones"] if z["name"] == "Niedrig")
        assert zone_niedrig["count"] == 1  # 60 liegt in 60-69


class TestCalories:
    def test_kpis_combine_rides_and_workouts(self, db, monkeypatch):
        _patch_db(monkeypatch, db)
        _insert_activity(db, 1, "2026-07-01T08:00:00", calories=600.0, moving_time_s=3600)
        _insert_other_activity(db, 2, "2026-07-02T08:00:00", "strength_training", calories=300.0)
        db.commit()

        result = calories(year=2026)
        assert result["total_kcal"] == 600
        assert result["total_kcal_workouts"] == 300
        assert result["rides"] == 1
        assert result["workouts"] == 1
        assert result["kcal_per_hour"] == 600  # 600 kcal / 1h


class TestSpeedTrend:
    def test_stats_from_few_rides_no_rolling_yet(self, db, monkeypatch):
        _patch_db(monkeypatch, db)
        _insert_activity(db, 1, "2026-01-01T08:00:00", distance_m=20000.0, avg_speed_ms=5.0)
        _insert_activity(db, 2, "2026-06-01T08:00:00", distance_m=20000.0, avg_speed_ms=7.0)
        db.commit()

        result = speed_trend()
        assert result["stats"]["total_rides"] == 2
        assert result["stats"]["best_kmh"] == 25.2       # 7.0 * 3.6
        assert result["stats"]["best_ride_id"] == 2
        assert result["rolling"] == []                   # < ROLLING_WINDOW (20) Rides
        assert len(result["by_year"]) == 1
        assert result["by_year"][0]["rides"] == 2

    def test_no_rides_returns_empty_shape(self, db, monkeypatch):
        _patch_db(monkeypatch, db)
        result = speed_trend()
        assert result["rides"] == []
        assert result["stats"]["total_rides"] == 0


class TestWeekendWeekday:
    def test_groups_rides_by_weekend_vs_weekday(self, db, monkeypatch):
        _patch_db(monkeypatch, db)
        # 2026-01-05 = Montag (Werktag), 2026-01-10 = Samstag (Wochenende)
        assert date(2026, 1, 5).weekday() == 0
        assert date(2026, 1, 10).weekday() == 5
        _insert_activity(db, 1, "2026-01-05T08:00:00", distance_m=20000.0, avg_speed_ms=5.0)
        _insert_activity(db, 2, "2026-01-10T08:00:00", distance_m=40000.0, avg_speed_ms=5.0)
        db.commit()

        result = weekend_weekday(year=2026)
        assert result["weekday"]["rides"] == 1
        assert result["weekend"]["rides"] == 1
        assert result["weekday"]["avg_km"] == 20.0
        assert result["weekend"]["avg_km"] == 40.0
        monday_entry = next(w for w in result["by_weekday"] if w["weekday_idx"] == 0)
        assert monday_entry["rides"] == 1
