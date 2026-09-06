"""
Tests für moving_time_from_track_points() (backend/utils.py).

Berechnet die Moving Time nachträglich aus track_points, weil FIT/TCX-Geräte
ihren eigenen Timer-Wert (total_timer_time / Lap-Summe) melden, der Standzeiten
nicht zuverlässig herausrechnet – anders als Strava, das die Moving Time selbst
aus dem Track berechnet (siehe fit_single.py/tcx_single.py).
"""
from backend.utils import moving_time_from_track_points


def _insert_activity(db, activity_id=1):
    db.execute(
        "INSERT INTO activities (id, start_date) VALUES (?, '2024-01-15T08:00:00')",
        (activity_id,),
    )
    db.commit()


class TestMovingTimeFromTrackPoints:
    def test_continuous_motion_counts_full_duration(self, db):
        # ~74 m pro Sekunde bei 0.001° Lon-Schritt/48° Breite → weit über der Schwelle (1 m/s)
        _insert_activity(db)
        db.executemany(
            "INSERT INTO track_points (activity_id, timestamp, lat, lon) VALUES (1, ?, ?, ?)",
            [
                ("2024-01-15T08:00:00", 48.0, 11.000),
                ("2024-01-15T08:00:01", 48.0, 11.001),
                ("2024-01-15T08:00:02", 48.0, 11.002),
                ("2024-01-15T08:00:03", 48.0, 11.003),
            ],
        )
        db.commit()

        result = moving_time_from_track_points(db, activity_id=1)
        assert result == 3

    def test_standstill_pause_excluded(self, db):
        # 2 Sekunden Bewegung, dann 60 Sekunden auf der Stelle (Ampel/Pause), dann weiter
        _insert_activity(db)
        db.executemany(
            "INSERT INTO track_points (activity_id, timestamp, lat, lon) VALUES (1, ?, ?, ?)",
            [
                ("2024-01-15T08:00:00", 48.0, 11.000),
                ("2024-01-15T08:00:01", 48.0, 11.001),
                ("2024-01-15T08:00:02", 48.0, 11.002),
                ("2024-01-15T08:01:02", 48.0, 11.002),  # 60s Stillstand, selbe Position
                ("2024-01-15T08:01:03", 48.0, 11.003),
            ],
        )
        db.commit()

        result = moving_time_from_track_points(db, activity_id=1)
        # Elapsed wären 63s, die 60s Stillstand dürfen nicht mitgezählt werden
        assert result == 3

    def test_too_few_points_returns_none(self, db):
        _insert_activity(db)
        db.execute(
            "INSERT INTO track_points (activity_id, timestamp, lat, lon) VALUES (1, '2024-01-15T08:00:00', 48.0, 11.0)"
        )
        db.commit()

        assert moving_time_from_track_points(db, activity_id=1) is None

    def test_no_track_points_returns_none(self, db):
        _insert_activity(db)
        assert moving_time_from_track_points(db, activity_id=1) is None

    def test_gps_gap_does_not_crash(self, db):
        _insert_activity(db)
        db.executemany(
            "INSERT INTO track_points (activity_id, timestamp, lat, lon) VALUES (1, ?, ?, ?)",
            [
                ("2024-01-15T08:00:00", 48.0, 11.000),
                ("2024-01-15T08:00:01", None, None),   # GPS-Lücke
                ("2024-01-15T08:00:02", 48.0, 11.002),
            ],
        )
        db.commit()

        # Darf nicht crashen; das Segment über die Lücke hinweg wird verworfen,
        # kein einziges gültiges Segment übrig → None statt einer falschen Zahl.
        result = moving_time_from_track_points(db, activity_id=1)
        assert result is None

    def test_invalid_timestamp_skipped(self, db):
        _insert_activity(db)
        db.executemany(
            "INSERT INTO track_points (activity_id, timestamp, lat, lon) VALUES (1, ?, ?, ?)",
            [
                ("2024-01-15T08:00:00", 48.0, 11.000),
                ("not-a-timestamp", 48.0, 11.001),
                ("2024-01-15T08:00:02", 48.0, 11.002),
            ],
        )
        db.commit()

        # Darf nicht crashen; ungültiger Zeitstempel wird übersprungen
        moving_time_from_track_points(db, activity_id=1)
