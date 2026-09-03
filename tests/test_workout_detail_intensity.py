"""
Test für backend/api/activities.py: get_other_activity() muss die Intensitäts-Berechnung
gegen die echte physiologische HFmax (_effective_hr_max, evtl. Betablocker-korrigiert)
stellen – nicht gegen den Spitzenwert der Session selbst. Sonst wirkt eine gleichmäßige,
lockere Einheit (Ø-HF nah am eigenen Peak) im Frontend-Gauge fälschlich wie "Zone 5 maximal".
"""
from contextlib import contextmanager

import backend.api.activities as activities
from backend.api.activities import get_other_activity


def _patch_db(monkeypatch, conn):
    @contextmanager
    def fake_db_connection():
        yield conn
    monkeypatch.setattr(activities, "db_connection", fake_db_connection)


class TestWorkoutDetailHrMax:
    def test_hr_max_is_physiological_not_session_peak(self, db, monkeypatch):
        _patch_db(monkeypatch, db)
        # Echte HFmax aus einer Radtour: 185 bpm – deutlich über dem Peak dieses Workouts (118 bpm)
        db.execute(
            "INSERT INTO activities (id, name, activity_type, start_date_local, max_hr) "
            "VALUES (1, 'Ride', 'ride', '2026-01-01T08:00:00', 185)"
        )
        db.execute(
            "INSERT INTO other_activities (id, name, sport_type, start_date_local, avg_hr, max_hr) "
            "VALUES (2, 'Rudern', 'rowing', '2026-09-03T15:29:15', 106, 118)"
        )
        db.commit()

        result = get_other_activity(2)

        assert result["hr_max"] == 185
        assert result["hr_correction_applied"] is False
        assert result["avg_hr_corrected"] == 106

    def test_hr_max_falls_back_to_config_without_activities(self, db, monkeypatch):
        _patch_db(monkeypatch, db)
        db.execute(
            "INSERT INTO other_activities (id, name, sport_type, start_date_local, avg_hr, max_hr) "
            "VALUES (2, 'Rudern', 'rowing', '2026-09-03T15:29:15', 106, 118)"
        )
        db.commit()

        result = get_other_activity(2)

        assert result["hr_max"] == 185.0  # Config-Default aus _hr_max_fallback()

    def test_beta_blocker_correction_applied_to_avg_hr(self, db, monkeypatch):
        _patch_db(monkeypatch, db)
        db.execute(
            "INSERT INTO activities (id, name, activity_type, start_date_local, max_hr) "
            "VALUES (1, 'Ride', 'ride', '2026-01-01T08:00:00', 185)"
        )
        db.execute(
            "INSERT INTO other_activities (id, name, sport_type, start_date_local, avg_hr, max_hr) "
            "VALUES (2, 'Rudern', 'rowing', '2026-09-03T15:29:15', 106, 118)"
        )
        db.executemany(
            "INSERT INTO config (key, value) VALUES (?, ?)",
            [("hr_correction_enabled", "1"), ("hr_correction_pct", "8")],
        )
        db.commit()

        result = get_other_activity(2)

        assert result["hr_correction_applied"] is True
        assert result["avg_hr_corrected"] == 106 + 0.08 * 185
