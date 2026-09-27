"""
Tests für die Erholungszeit-Schätzung in backend/api/analytics/_shared.py.
Grobe Heuristik (KEINE HRV-Messung) aus hrTSS + Intensity Factor, siehe
estimate_recovery_hours()/calc_recovery_hours().
"""
from backend.api.analytics._shared import calc_recovery_hours, estimate_recovery_hours


def _set_config(conn, key, value):
    conn.execute(
        "INSERT INTO config(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (key, value),
    )
    conn.commit()


class TestCalcRecoveryHours:
    def test_no_load_returns_none(self):
        assert calc_recovery_hours(0.0, 0.0) is None
        assert calc_recovery_hours(-5.0, 0.5) is None
        assert calc_recovery_hours(50.0, 0.0) is None

    def test_higher_intensity_means_longer_recovery_at_same_tss(self):
        # gleiches hrTSS, aber unterschiedliches IF (kurz-hart vs. lang-locker)
        low_if = calc_recovery_hours(hr_tss=120.0, if_hr=0.7)
        high_if = calc_recovery_hours(hr_tss=120.0, if_hr=1.1)
        assert high_if > low_if

    def test_capped_at_72_hours(self):
        hours = calc_recovery_hours(hr_tss=1000.0, if_hr=1.5, base_h=6.0, exponent=2.0)
        assert hours == 72.0

    def test_rounded_to_half_hours(self):
        hours = calc_recovery_hours(hr_tss=100.0, if_hr=1.0, base_h=6.3, exponent=1.0)
        assert (hours * 2) % 1 == 0


class TestEstimateRecoveryHours:
    def test_none_without_hr_or_duration(self, db):
        assert estimate_recovery_hours(db, None, 150, "2026-01-01") is None
        assert estimate_recovery_hours(db, 3600, None, "2026-01-01") is None
        assert estimate_recovery_hours(db, 0, 150, "2026-01-01") is None

    def test_returns_value_with_valid_inputs(self, db):
        hours = estimate_recovery_hours(db, 3600 * 2, 150, "2026-01-01")
        assert hours is not None
        assert 0 < hours <= 72

    def test_respects_custom_base_and_exponent(self, db):
        default_hours = estimate_recovery_hours(db, 3600 * 2, 160, "2026-01-01")
        _set_config(db, "recovery_base_h", "12.0")
        boosted_hours = estimate_recovery_hours(db, 3600 * 2, 160, "2026-01-01")
        assert boosted_hours > default_hours

    def test_betablocker_correction_increases_recovery(self, db):
        _set_config(db, "hr_correction_enabled", "1")
        _set_config(db, "hr_correction_pct", "8")
        with_correction = estimate_recovery_hours(db, 3600 * 2, 150, "2026-01-01")
        _set_config(db, "hr_correction_enabled", "0")
        without_correction = estimate_recovery_hours(db, 3600 * 2, 150, "2026-01-01")
        assert with_correction > without_correction
