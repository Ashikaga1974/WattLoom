"""
Tests für power_estimator.py:
- Physikalische Hilfsfunktionen (_air_density, _smooth, _parse_ts)
- Normalized-Power-Berechnung (_normalized_power)
- Haupt-Schätzfunktion estimate_power (mit In-Memory-DB)
"""
import math

import pytest

from backend.importer.power_estimator import (
    DEFAULT_ALT_M,
    _air_density,
    _normalized_power,
    _parse_ts,
    _smooth,
    estimate_power,
)


# ── Luftdichte ────────────────────────────────────────────────────────────────

class TestAirDensity:
    def test_sea_level_15c_approx_1225(self):
        # Standardatmosphäre: 1.225 kg/m³ bei 0 m / 15 °C
        rho = _air_density(0.0, 15.0)
        assert math.isclose(rho, 1.225, rel_tol=0.01)

    def test_higher_altitude_lower_density(self):
        assert _air_density(2000.0, 15.0) < _air_density(0.0, 15.0)

    def test_higher_temp_lower_density(self):
        assert _air_density(500.0, 30.0) < _air_density(500.0, 0.0)

    def test_positive_result(self):
        assert _air_density(1000.0, 20.0) > 0.0

    def test_default_altitude(self):
        # DEFAULT_ALT_M (200 m) sollte etwas unter Meereshöhe liegen
        rho_sea = _air_density(0.0, 15.0)
        rho_default = _air_density(DEFAULT_ALT_M, 15.0)
        assert rho_default < rho_sea


# ── Glättung ──────────────────────────────────────────────────────────────────

class TestSmooth:
    def test_single_value_unchanged(self):
        assert _smooth([5.0], window=3) == [5.0]

    def test_length_preserved(self):
        data = [1.0, 2.0, 3.0, 4.0, 5.0]
        assert len(_smooth(data, window=3)) == 5

    def test_constant_values_unchanged(self):
        smoothed = _smooth([3.0, 3.0, 3.0, 3.0, 3.0], window=3)
        assert all(math.isclose(v, 3.0, rel_tol=1e-9) for v in smoothed)

    def test_spike_reduced(self):
        # Ausreißer in der Mitte wird nach Glättung kleiner
        values = [0.0, 0.0, 100.0, 0.0, 0.0]
        smoothed = _smooth(values, window=3)
        assert max(smoothed) < 100.0

    def test_monotone_increase_preserved_in_trend(self):
        data = [1.0, 2.0, 3.0, 4.0, 5.0]
        smoothed = _smooth(data, window=3)
        # Trend bleibt aufsteigend
        assert smoothed[-1] > smoothed[0]


# ── Timestamp-Parsing ─────────────────────────────────────────────────────────

class TestParseTs:
    def test_none_returns_none(self):
        assert _parse_ts(None) is None

    def test_empty_string_returns_none(self):
        assert _parse_ts("") is None

    def test_z_suffix(self):
        ts = _parse_ts("2024-01-15T08:00:00Z")
        assert ts is not None and ts > 0

    def test_plus_utc_offset(self):
        ts1 = _parse_ts("2024-01-15T08:00:00Z")
        ts2 = _parse_ts("2024-01-15T08:00:00+00:00")
        assert math.isclose(ts1, ts2, rel_tol=1e-6)

    def test_invalid_string_returns_none(self):
        assert _parse_ts("kein-datum") is None

    def test_ordering(self):
        # Späterer Zeitstempel → größerer Unix-Wert
        ts_early = _parse_ts("2024-01-15T08:00:00Z")
        ts_late  = _parse_ts("2024-01-15T09:00:00Z")
        assert ts_late > ts_early


# ── Normalized Power ──────────────────────────────────────────────────────────

class TestNormalizedPower:
    def test_too_few_points_returns_none(self):
        # Weniger als NP_WINDOW_S (30) Punkte → None
        result = _normalized_power(list(range(10)), [200.0] * 10, window_s=30)
        assert result is None

    def test_constant_power_np_equals_avg(self):
        # Konstante Leistung: NP muss gleich Durchschnitt sein
        powers = [200.0] * 100
        result = _normalized_power(list(range(100)), powers, window_s=30)
        assert result is not None
        assert math.isclose(result, 200.0, rel_tol=0.01)

    def test_variable_power_np_exceeds_avg(self):
        # Wechselnde Leistung: NP > Durchschnitt (wegen ^4-Mittel)
        # Ø = 200 W, aber NP > 200 W
        powers = [100.0] * 50 + [300.0] * 50
        result = _normalized_power(list(range(100)), powers, window_s=30)
        avg = sum(powers) / len(powers)
        assert result is not None
        assert result > avg

    def test_zero_power_returns_zero(self):
        # Kein Treten → NP = 0
        result = _normalized_power(list(range(100)), [0.0] * 100, window_s=30)
        assert result is not None
        assert math.isclose(result, 0.0, abs_tol=1e-6)

    def test_no_timestamps_fallback(self):
        # Ohne gültige Timestamps: Index-basiertes Fallback muss trotzdem Wert liefern
        result = _normalized_power([None] * 100, [150.0] * 100, window_s=30)
        assert result is not None


# ── estimate_power (Integration mit In-Memory-DB) ─────────────────────────────

class TestEstimatePower:
    def _insert_activity(self, db, activity_id: int):
        db.execute(
            "INSERT INTO activities (id, start_date) VALUES (?, '2024-01-15T08:00:00')",
            (activity_id,),
        )
        db.commit()

    def _insert_flat_track(self, db, activity_id: int, n_points: int = 50,
                           speed_ms: float = 8.33, alt: float | None = 200.0):
        """Flache Strecke entlang Längengrad; alt=None simuliert fehlendes Höhenprofil."""
        pts = [
            (
                activity_id,
                f"2024-01-15T08:{i // 60:02d}:{i % 60:02d}",
                48.0,
                11.0 + i * 0.0001,
                alt,
                None,
                speed_ms,
                None, None, None, None,
            )
            for i in range(n_points)
        ]
        db.executemany(
            """INSERT INTO track_points
               (activity_id, timestamp, lat, lon, altitude_m, distance_m, speed_ms,
                hr, power_w, cadence, temp_c)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            pts,
        )
        db.commit()

    def test_no_track_returns_none(self, db):
        self._insert_activity(db, 1)
        avg_w, norm_w = estimate_power(db, activity_id=1, weight_kg=75.0)
        assert avg_w is None and norm_w is None

    def test_flat_track_returns_positive_values(self, db):
        self._insert_activity(db, 1)
        self._insert_flat_track(db, 1)
        avg_w, norm_w = estimate_power(db, activity_id=1, weight_kg=75.0)
        assert avg_w is not None and avg_w > 0
        assert norm_w is not None and norm_w > 0

    def test_no_altitude_uses_fallback(self, db):
        # altitude_m = NULL → DEFAULT_ALT_M-Fallback; Schätzung trotzdem möglich
        self._insert_activity(db, 1)
        self._insert_flat_track(db, 1, alt=None)
        avg_w, norm_w = estimate_power(db, activity_id=1, weight_kg=75.0)
        assert avg_w is not None

    def test_heavier_rider_produces_more_power(self, db):
        # Schwererer Fahrer → höhere Leistung bei gleicher Geschwindigkeit
        self._insert_activity(db, 1)
        self._insert_flat_track(db, 1)
        avg_light, _ = estimate_power(db, activity_id=1, weight_kg=60.0)

        self._insert_activity(db, 2)
        self._insert_flat_track(db, 2)
        avg_heavy, _ = estimate_power(db, activity_id=2, weight_kg=90.0)

        assert avg_heavy > avg_light

    def test_uses_weather_temp_from_db(self, db):
        # Kältere Luft → höhere Luftdichte → etwas mehr Aerowiderstand
        self._insert_activity(db, 1)
        db.execute("UPDATE activities SET weather_temp_c = -10.0 WHERE id = 1")
        db.commit()
        self._insert_flat_track(db, 1)
        avg_cold, _ = estimate_power(db, activity_id=1, weight_kg=75.0)

        self._insert_activity(db, 2)
        db.execute("UPDATE activities SET weather_temp_c = 35.0 WHERE id = 2")
        db.commit()
        self._insert_flat_track(db, 2)
        avg_hot, _ = estimate_power(db, activity_id=2, weight_kg=75.0)

        assert avg_cold > avg_hot

    def test_too_few_points_returns_none(self, db):
        # < MIN_POINTS (20) → None
        self._insert_activity(db, 1)
        self._insert_flat_track(db, 1, n_points=5)
        avg_w, norm_w = estimate_power(db, activity_id=1, weight_kg=75.0)
        assert avg_w is None and norm_w is None
