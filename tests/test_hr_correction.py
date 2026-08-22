"""
Tests für die Betablocker/Bisoprolol-HF-Korrektur in backend/api/zones.py.
Betrifft HR-Zonen, PMC (hrTSS) und Fitness-Fingerprint, siehe get_hr_correction_settings().
"""
from backend.api.zones import (
    get_hr_correction_settings,
    correction_pct_for_date,
    corrected_hr,
    _assign_hr_zone,
)


def _set_config(conn, key, value):
    conn.execute(
        "INSERT INTO config(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (key, value),
    )
    conn.commit()


class TestGetHrCorrectionSettings:
    def test_disabled_by_default(self, db):
        correction = get_hr_correction_settings(db)
        assert correction["enabled"] is False

    def test_default_pct_is_8_percent_when_unset(self, db):
        _set_config(db, "hr_correction_enabled", "1")
        correction = get_hr_correction_settings(db)
        assert correction["pct"] == 0.08

    def test_custom_pct_read_as_fraction(self, db):
        _set_config(db, "hr_correction_enabled", "1")
        _set_config(db, "hr_correction_pct", "12")
        correction = get_hr_correction_settings(db)
        assert correction["pct"] == 0.12

    def test_since_date_read(self, db):
        _set_config(db, "hr_correction_enabled", "1")
        _set_config(db, "hr_correction_since", "2025-01-01")
        correction = get_hr_correction_settings(db)
        assert correction["since"] == "2025-01-01"

    def test_since_none_when_unset(self, db):
        correction = get_hr_correction_settings(db)
        assert correction["since"] is None


class TestCorrectionPctForDate:
    def test_disabled_returns_zero_regardless_of_date(self):
        correction = {"enabled": False, "pct": 0.08, "since": None}
        assert correction_pct_for_date(correction, "2026-05-01") == 0.0

    def test_enabled_no_since_applies_to_any_date(self):
        correction = {"enabled": True, "pct": 0.08, "since": None}
        assert correction_pct_for_date(correction, "2020-01-01") == 0.08

    def test_enabled_with_since_before_start_returns_zero(self):
        correction = {"enabled": True, "pct": 0.08, "since": "2025-01-01"}
        assert correction_pct_for_date(correction, "2024-12-31") == 0.0

    def test_enabled_with_since_on_or_after_start_applies(self):
        correction = {"enabled": True, "pct": 0.08, "since": "2025-01-01"}
        assert correction_pct_for_date(correction, "2025-01-01") == 0.08
        assert correction_pct_for_date(correction, "2025-06-01") == 0.08

    def test_enabled_with_since_missing_date_returns_zero(self):
        # Kein Datum bekannt (z.B. fehlender start_date_local) -> sicherer Default: keine Korrektur
        correction = {"enabled": True, "pct": 0.08, "since": "2025-01-01"}
        assert correction_pct_for_date(correction, None) == 0.0


class TestCorrectedHr:
    def test_zero_pct_returns_raw_hr(self):
        assert corrected_hr(140, 180, 0.0) == 140

    def test_positive_pct_shifts_hr_up_by_pct_of_max(self):
        # 8 % von 180 = 14.4 -> 140 + 14.4 = 154.4
        assert corrected_hr(140, 180, 0.08) == 140 + 0.08 * 180


class TestAssignHrZoneWithCorrection:
    def test_uncorrected_zone_assignment_unchanged(self):
        # 100/185 = 54 % -> Zone 1 (Regeneration, < 60 %)
        assert _assign_hr_zone(100, 185) == 1

    def test_correction_can_push_into_higher_zone(self):
        # 100/185 = 54 % + 8 Prozentpunkte = 62 % -> Zone 2 (Grundlage, 60-70 %)
        assert _assign_hr_zone(100, 185, correction_pct=0.08) == 2

    def test_correction_does_not_affect_already_max_zone(self):
        # 180/185 = 97 % -> bereits Zone 5, Korrektur ändert daran nichts
        assert _assign_hr_zone(180, 185) == 5
        assert _assign_hr_zone(180, 185, correction_pct=0.08) == 5
