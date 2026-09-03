"""
Tests für tcx_single.py: import_single_tcx().

Arbeitet mit minimalem TCX-XML als Bytes – kein echter Garmin-Export nötig.
"""
import pytest

from backend.importer.tcx_single import import_single_tcx


_TCX_NS = "http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"


def _make_tcx(sport: str, start: str = "2024-01-15T08:00:00Z",
              calories: float = 500.0, avg_hr: int = 145, max_hr: int = 172,
              duration_s: float = 3600.0, distance_m: float = 20_000.0) -> bytes:
    """Minimales TCX-Dokument für Tests."""
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase xmlns="{_TCX_NS}">
  <Activities>
    <Activity Sport="{sport}">
      <Id>{start}</Id>
      <Lap StartTime="{start}">
        <TotalTimeSeconds>{duration_s}</TotalTimeSeconds>
        <DistanceMeters>{distance_m}</DistanceMeters>
        <Calories>{calories}</Calories>
        <AverageHeartRateBpm><Value>{avg_hr}</Value></AverageHeartRateBpm>
        <MaximumHeartRateBpm><Value>{max_hr}</Value></MaximumHeartRateBpm>
      </Lap>
    </Activity>
  </Activities>
</TrainingCenterDatabase>""".encode()


# ── Sport-Routing ─────────────────────────────────────────────────────────────

class TestSportRouting:
    def test_running_to_other_activities(self, db):
        result = import_single_tcx(db, _make_tcx("Running"))
        assert result["is_ride"] is False
        row = db.execute(
            "SELECT sport_type FROM other_activities WHERE id = ?", (result["activity_id"],)
        ).fetchone()
        assert row is not None
        assert row["sport_type"] == "running"

    def test_biking_to_activities(self, db):
        result = import_single_tcx(db, _make_tcx("Biking"), bike_id="test_bike")
        assert result["is_ride"] is True
        row = db.execute(
            "SELECT bike_id FROM activities WHERE id = ?", (result["activity_id"],)
        ).fetchone()
        assert row is not None
        assert row["bike_id"] == "test_bike"

    def test_cycling_also_treated_as_ride(self, db):
        result = import_single_tcx(db, _make_tcx("Cycling"), bike_id="test_bike")
        assert result["is_ride"] is True

    def test_biking_without_bike_id_becomes_workout(self, db):
        result = import_single_tcx(db, _make_tcx("Biking"))
        assert result["is_ride"] is False
        row = db.execute(
            "SELECT sport_type FROM other_activities WHERE id = ?", (result["activity_id"],)
        ).fetchone()
        assert row is not None
        assert row["sport_type"] == "ride"

    def test_other_sport_becomes_training(self, db):
        result = import_single_tcx(db, _make_tcx("Other"))
        row = db.execute(
            "SELECT sport_type FROM other_activities WHERE id = ?", (result["activity_id"],)
        ).fetchone()
        assert row["sport_type"] == "training"

    def test_fitness_to_fitness(self, db):
        result = import_single_tcx(db, _make_tcx("Fitness"))
        row = db.execute(
            "SELECT sport_type FROM other_activities WHERE id = ?", (result["activity_id"],)
        ).fetchone()
        assert row["sport_type"] == "strength_training"


# ── Gespeicherte Felder ───────────────────────────────────────────────────────

class TestStoredFields:
    def test_calories_stored_for_workout(self, db):
        result = import_single_tcx(db, _make_tcx("Running", calories=420.0))
        row = db.execute(
            "SELECT calories FROM other_activities WHERE id = ?", (result["activity_id"],)
        ).fetchone()
        assert row["calories"] == 420.0

    def test_avg_hr_stored_for_workout(self, db):
        result = import_single_tcx(db, _make_tcx("Running", avg_hr=138))
        row = db.execute(
            "SELECT avg_hr FROM other_activities WHERE id = ?", (result["activity_id"],)
        ).fetchone()
        assert row["avg_hr"] == 138

    def test_max_hr_stored_for_workout(self, db):
        result = import_single_tcx(db, _make_tcx("Running", max_hr=181))
        row = db.execute(
            "SELECT max_hr FROM other_activities WHERE id = ?", (result["activity_id"],)
        ).fetchone()
        assert row["max_hr"] == 181

    def test_activity_id_is_negative(self, db):
        result = import_single_tcx(db, _make_tcx("Running"))
        assert result["activity_id"] < 0

    def test_name_contains_sport(self, db):
        result = import_single_tcx(db, _make_tcx("Running"))
        assert "Laufen" in result["name"]

    def test_distance_stored_for_ride(self, db):
        result = import_single_tcx(db, _make_tcx("Biking", distance_m=35_000.0), bike_id="test_bike")
        row = db.execute(
            "SELECT distance_m FROM activities WHERE id = ?", (result["activity_id"],)
        ).fetchone()
        assert row["distance_m"] == 35_000.0

    def test_moving_time_stored_for_workout(self, db):
        result = import_single_tcx(db, _make_tcx("Running", duration_s=1800.0))
        row = db.execute(
            "SELECT moving_time_s FROM other_activities WHERE id = ?", (result["activity_id"],)
        ).fetchone()
        assert row["moving_time_s"] == 1800


# ── Duplikat-Erkennung ────────────────────────────────────────────────────────

class TestDuplicateDetection:
    def test_duplicate_workout_raises(self, db):
        start = "2024-02-10T10:00:00Z"
        import_single_tcx(db, _make_tcx("Running", start))
        with pytest.raises(ValueError, match="bereits importiert"):
            import_single_tcx(db, _make_tcx("Running", start))

    def test_duplicate_ride_raises(self, db):
        start = "2024-02-10T10:00:00Z"
        import_single_tcx(db, _make_tcx("Biking", start), bike_id="test_bike")
        with pytest.raises(ValueError, match="bereits importiert"):
            import_single_tcx(db, _make_tcx("Biking", start), bike_id="test_bike")

    def test_different_timestamps_both_imported(self, db):
        import_single_tcx(db, _make_tcx("Running", "2024-02-10T10:00:00Z"))
        # Anderer Timestamp → kein Fehler
        import_single_tcx(db, _make_tcx("Running", "2024-02-10T11:00:00Z"))
        count = db.execute("SELECT COUNT(*) FROM other_activities").fetchone()[0]
        assert count == 2


# ── Fehlerbehandlung ──────────────────────────────────────────────────────────

class TestErrorHandling:
    def test_missing_activity_element_raises(self, db):
        invalid = b"""<?xml version="1.0"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">
</TrainingCenterDatabase>"""
        with pytest.raises(ValueError, match="Activity"):
            import_single_tcx(db, invalid)

    def test_leading_whitespace_accepted(self, db):
        # Garmin-TCX kann führende Whitespace-Zeichen haben
        tcx = b"  \n" + _make_tcx("Running")
        result = import_single_tcx(db, tcx)
        assert result["is_ride"] is False
