"""
Tests für fit_single.py.

Getestet werden die DB-Helfer die ohne echte FIT-Bytes auskommen:
- _check_duplicate: Duplikat-Erkennung für activities-Tabelle
- _fill_distance_if_missing: kumulative Haversine-Distanz aus lat/lon
"""
import pytest

from backend.importer.fit_single import _check_duplicate, _fill_distance_if_missing


# ── _check_duplicate ──────────────────────────────────────────────────────────

class TestCheckDuplicate:
    def test_passes_for_new_activity(self, db):
        # Noch kein Eintrag mit dieser ID → kein Fehler
        _check_duplicate(db, activity_id=-1_234_567_890, start_date="2024-01-15T08:00:00")

    def test_raises_for_existing_activity(self, db):
        db.execute(
            "INSERT INTO activities (id, start_date) VALUES (-1234567890, '2024-01-15T08:00:00')"
        )
        db.commit()
        with pytest.raises(ValueError, match="bereits importiert"):
            _check_duplicate(db, activity_id=-1_234_567_890, start_date="2024-01-15T08:00:00")

    def test_different_ids_both_pass(self, db):
        db.execute(
            "INSERT INTO activities (id, start_date) VALUES (-100, '2024-01-15T08:00:00')"
        )
        db.commit()
        # Andere ID → kein Fehler
        _check_duplicate(db, activity_id=-200, start_date="2024-01-15T09:00:00")


# ── _fill_distance_if_missing ─────────────────────────────────────────────────

class TestFillDistanceIfMissing:
    def _insert_activity(self, db):
        db.execute(
            "INSERT INTO activities (id, start_date) VALUES (1, '2024-01-15T08:00:00')"
        )
        db.commit()

    def test_fills_cumulative_distance(self, db):
        self._insert_activity(db)
        # 3 Punkte entlang Längengrad (je ~74 m bei 48° Breite, 0.001° Lon-Schritt)
        db.executemany(
            "INSERT INTO track_points (activity_id, timestamp, lat, lon, distance_m, speed_ms)"
            " VALUES (1, ?, ?, ?, NULL, 5.0)",
            [
                ("2024-01-15T08:00:00", 48.0, 11.000),
                ("2024-01-15T08:00:01", 48.0, 11.001),
                ("2024-01-15T08:00:02", 48.0, 11.002),
            ],
        )
        db.commit()

        _fill_distance_if_missing(db, activity_id=1)

        rows = db.execute(
            "SELECT distance_m FROM track_points WHERE activity_id=1 ORDER BY id"
        ).fetchall()
        assert rows[0]["distance_m"] == 0.0       # erster Punkt: noch keine Strecke
        assert rows[1]["distance_m"] > 0.0
        assert rows[2]["distance_m"] > rows[1]["distance_m"]

    def test_skips_when_distance_already_set(self, db):
        self._insert_activity(db)
        db.executemany(
            "INSERT INTO track_points (activity_id, timestamp, lat, lon, distance_m, speed_ms)"
            " VALUES (1, ?, ?, ?, ?, 5.0)",
            [
                ("2024-01-15T08:00:00", 48.0, 11.000, 0.0),
                ("2024-01-15T08:00:01", 48.0, 11.001, 999.0),  # bereits befüllt
            ],
        )
        db.commit()

        _fill_distance_if_missing(db, activity_id=1)

        row = db.execute(
            "SELECT distance_m FROM track_points WHERE activity_id=1 ORDER BY id LIMIT 1 OFFSET 1"
        ).fetchone()
        # Wert soll unverändert bleiben
        assert row["distance_m"] == 999.0

    def test_first_point_is_zero(self, db):
        self._insert_activity(db)
        db.execute(
            "INSERT INTO track_points (activity_id, timestamp, lat, lon, distance_m, speed_ms)"
            " VALUES (1, '2024-01-15T08:00:00', 48.0, 11.0, NULL, 5.0)"
        )
        db.commit()

        _fill_distance_if_missing(db, activity_id=1)

        row = db.execute(
            "SELECT distance_m FROM track_points WHERE activity_id=1"
        ).fetchone()
        assert row["distance_m"] == 0.0

    def test_points_with_null_coords_handled(self, db):
        # Punkte ohne lat/lon sollen keine Exception auslösen
        self._insert_activity(db)
        db.executemany(
            "INSERT INTO track_points (activity_id, timestamp, lat, lon, distance_m, speed_ms)"
            " VALUES (1, ?, ?, ?, NULL, 5.0)",
            [
                ("2024-01-15T08:00:00", 48.0,  11.0),
                ("2024-01-15T08:00:01", None,  None),   # GPS-Lücke
                ("2024-01-15T08:00:02", 48.0,  11.001),
            ],
        )
        db.commit()

        # Darf nicht crashen
        _fill_distance_if_missing(db, activity_id=1)
