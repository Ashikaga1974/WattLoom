"""
Tests für backend/segment_matching.py – Kandidatensuche, Marken-Abgleich, Zeit-/Speed-
Berechnung für selbst definierte Segmente (custom_segments/custom_segment_efforts, Schema
in tests/conftest.py).
"""
import json

import pytest

from backend.segment_matching import match_segment_against_all, match_segment_in_activity

_LAT0 = 50.0
_LON = 6.0
_DEG_PER_M = 1 / 111_320.0  # grobe Näherung: 1° Breite ≈ 111.32 km


def _lat_at(dist_m: float) -> float:
    return _LAT0 + dist_m * _DEG_PER_M


def _insert_ride(conn, activity_id, name="Ride"):
    conn.execute(
        "INSERT INTO activities (id, name, activity_type, start_date_local, has_track) "
        "VALUES (?, ?, 'ride', '2026-05-01T08:00:00', 1)",
        (activity_id, name),
    )


def _insert_track(conn, activity_id, *, start_dist_m=0.0, length_m=1000.0, step_m=50.0,
                   seconds_per_step=10.0, start_ts="2026-05-01T08:00:00", hr=140, lat_offset_m=0.0):
    """Legt einen geraden Track entlang der Breitengrad-Achse an – deckt [start_dist_m,
    start_dist_m+length_m] ab. lat_offset_m verschiebt die ganze Linie seitlich (simuliert
    eine andere Strecke, die nicht am Segment vorbeikommt)."""
    from datetime import datetime, timedelta
    n = int(length_m / step_m) + 1
    t0 = datetime.fromisoformat(start_ts)
    rows = []
    for i in range(n):
        d = start_dist_m + i * step_m
        ts = (t0 + timedelta(seconds=i * seconds_per_step)).isoformat()
        lat = _lat_at(d) + lat_offset_m * _DEG_PER_M
        rows.append((activity_id, ts, lat, _LON, 200.0, d, 5.0, hr))
    conn.executemany(
        """INSERT INTO track_points (activity_id, timestamp, lat, lon, altitude_m, distance_m, speed_ms, hr)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        rows,
    )


def _make_segment_points(length_m=1000.0, step_m=50.0) -> list[dict]:
    n = int(length_m / step_m) + 1
    return [{"dist_m": i * step_m, "lat": _lat_at(i * step_m), "lon": _LON} for i in range(n)]


class TestMatchSegmentInActivity:
    def test_exact_match_returns_result(self, db):
        _insert_ride(db, 1, "Quelle")
        _insert_track(db, 1, length_m=1000.0)
        seg_points = _make_segment_points(length_m=1000.0)

        result = match_segment_in_activity(db, seg_points, 1000.0, 1)

        assert result is not None
        assert result["time_s"] > 0
        assert result["avg_speed_kmh"] > 0
        assert result["match_pct"] >= 85.0

    def test_time_matches_expected_pace(self, db):
        # 50m alle 10s -> 5 m/s -> 1000m in 200s
        _insert_ride(db, 1, "Quelle")
        _insert_track(db, 1, length_m=1000.0, step_m=50.0, seconds_per_step=10.0)
        seg_points = _make_segment_points(length_m=1000.0, step_m=50.0)

        result = match_segment_in_activity(db, seg_points, 1000.0, 1)

        assert result is not None
        assert abs(result["time_s"] - 200) <= 5

    def test_different_route_does_not_match(self, db):
        _insert_ride(db, 2, "Andere Strecke")
        # 500m seitlich versetzt -> weit außerhalb von START_RADIUS_M (50m)
        _insert_track(db, 2, length_m=1000.0, lat_offset_m=500.0)
        seg_points = _make_segment_points(length_m=1000.0)

        result = match_segment_in_activity(db, seg_points, 1000.0, 2)

        assert result is None

    def test_incomplete_coverage_does_not_match(self, db):
        # Fahrt endet nach 400m eines 1000m-Segments -> kein vollständiger Durchgang
        _insert_ride(db, 3, "Abgebrochen")
        _insert_track(db, 3, length_m=400.0)
        seg_points = _make_segment_points(length_m=1000.0)

        result = match_segment_in_activity(db, seg_points, 1000.0, 3)

        assert result is None

    def test_no_track_points_returns_none(self, db):
        _insert_ride(db, 4, "Ohne Track")
        seg_points = _make_segment_points(length_m=1000.0)

        result = match_segment_in_activity(db, seg_points, 1000.0, 4)

        assert result is None

    def test_faster_ride_has_lower_time(self, db):
        _insert_ride(db, 5, "Schnell")
        _insert_track(db, 5, length_m=1000.0, step_m=50.0, seconds_per_step=5.0)  # 10 m/s
        _insert_ride(db, 6, "Langsam")
        _insert_track(db, 6, length_m=1000.0, step_m=50.0, seconds_per_step=20.0)  # 2.5 m/s
        seg_points = _make_segment_points(length_m=1000.0, step_m=50.0)

        fast = match_segment_in_activity(db, seg_points, 1000.0, 5)
        slow = match_segment_in_activity(db, seg_points, 1000.0, 6)

        assert fast is not None and slow is not None
        assert fast["time_s"] < slow["time_s"]

    def test_wait_before_segment_start_is_not_counted(self, db):
        # Regression (Segment „Nach Apweiler"): Track beginnt 40m vor dem Segment-Start,
        # nach 30m stehen 300s Wartezeit (Ampel/Kreuzung) im Track. Früher begann die
        # Messung am ersten Punkt im 50m-Radius -> Wartezeit zählte zur Segmentzeit.
        _insert_ride(db, 8, "Ampel vor Start")
        rows = []
        from datetime import datetime, timedelta
        t0 = datetime.fromisoformat("2026-05-01T08:00:00")
        t = 0.0
        for i in range(0, 105):
            d = -40.0 + i * 10.0  # 10m-Schritte, 2 s je Schritt = 5 m/s
            if d == -10.0:
                t += 300.0  # Stillstand vor dem Segment-Start
            rows.append((8, (t0 + timedelta(seconds=t)).isoformat(), _lat_at(d), _LON, 200.0, d + 40.0, 5.0, 140))
            t += 2.0
        db.executemany(
            """INSERT INTO track_points (activity_id, timestamp, lat, lon, altitude_m, distance_m, speed_ms, hr)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            rows,
        )
        seg_points = _make_segment_points(length_m=1000.0, step_m=10.0)

        result = match_segment_in_activity(db, seg_points, 1000.0, 8)

        assert result is not None
        # 1000m bei 5 m/s -> 200s, ohne die 300s Wartezeit
        assert abs(result["time_s"] - 200) <= 5
        assert result["match_pct"] == pytest.approx(100.0)

    def test_standstill_at_segment_start_is_not_counted(self, db):
        # Stillstand exakt am Segment-Start (mehrere Punkte mit gleicher Distanz)
        _insert_ride(db, 9, "Stillstand am Start")
        from datetime import datetime, timedelta
        t0 = datetime.fromisoformat("2026-05-01T08:00:00")
        rows = [(9, (t0 + timedelta(seconds=s)).isoformat(), _lat_at(0.0), _LON, 200.0, 0.0, 0.0, 140)
                for s in range(0, 120, 10)]
        for i in range(1, 101):
            d = i * 10.0
            rows.append((9, (t0 + timedelta(seconds=110 + i * 2)).isoformat(), _lat_at(d), _LON, 200.0, d, 5.0, 140))
        db.executemany(
            """INSERT INTO track_points (activity_id, timestamp, lat, lon, altitude_m, distance_m, speed_ms, hr)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            rows,
        )
        seg_points = _make_segment_points(length_m=1000.0, step_m=10.0)

        result = match_segment_in_activity(db, seg_points, 1000.0, 9)

        assert result is not None
        assert abs(result["time_s"] - 200) <= 5

    def test_auto_pause_gap_at_segment_start_is_not_counted(self, db):
        # Auto-Pause: im Stand werden keine Punkte aufgezeichnet -> nur eine Zeitlücke
        # zwischen Startpunkt und nächstem Punkt, kein Stillstand als Punktfolge
        _insert_ride(db, 11, "Auto-Pause am Start")
        from datetime import datetime, timedelta
        t0 = datetime.fromisoformat("2026-05-01T08:00:00")
        rows, t = [], 0.0
        for i in range(0, 101):
            d = i * 10.0
            if i == 1:
                t += 300.0
            rows.append((11, (t0 + timedelta(seconds=t)).isoformat(), _lat_at(d), _LON, 200.0, d, 5.0, 140))
            t += 2.0
        db.executemany(
            """INSERT INTO track_points (activity_id, timestamp, lat, lon, altitude_m, distance_m, speed_ms, hr)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            rows,
        )
        seg_points = _make_segment_points(length_m=1000.0, step_m=10.0)

        result = match_segment_in_activity(db, seg_points, 1000.0, 11)

        assert result is not None
        assert abs(result["time_s"] - 200) <= 5

    def test_wait_just_before_segment_end_is_not_counted(self, db):
        # Ampel 20m vor dem Segment-Ende: 180s Stillstand darf nicht zur Segmentzeit zählen
        _insert_ride(db, 10, "Ampel vor Ende")
        from datetime import datetime, timedelta
        t0 = datetime.fromisoformat("2026-05-01T08:00:00")
        rows, t = [], 0.0
        for i in range(0, 111):
            d = i * 10.0  # 10m-Schritte, 2 s je Schritt = 5 m/s
            if d == 990.0:
                t += 180.0
            rows.append((10, (t0 + timedelta(seconds=t)).isoformat(), _lat_at(d), _LON, 200.0, d, 5.0, 140))
            t += 2.0
        db.executemany(
            """INSERT INTO track_points (activity_id, timestamp, lat, lon, altitude_m, distance_m, speed_ms, hr)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            rows,
        )
        seg_points = _make_segment_points(length_m=1000.0, step_m=10.0)

        result = match_segment_in_activity(db, seg_points, 1000.0, 10)

        assert result is not None
        assert abs(result["time_s"] - 200) <= 5
        assert result["avg_speed_kmh"] == pytest.approx(18.0, abs=0.5)

    def test_avg_hr_computed_from_track(self, db):
        _insert_ride(db, 7, "Mit HF")
        _insert_track(db, 7, length_m=1000.0, hr=150)
        seg_points = _make_segment_points(length_m=1000.0)

        result = match_segment_in_activity(db, seg_points, 1000.0, 7)

        assert result is not None
        assert result["avg_hr"] == pytest.approx(150, abs=1)


class TestMatchSegmentAgainstAll:
    def test_stores_efforts_for_matching_activities(self, db):
        _insert_ride(db, 1, "Quelle")
        _insert_track(db, 1, length_m=1000.0)
        _insert_ride(db, 2, "Treffer")
        _insert_track(db, 2, length_m=1000.0, seconds_per_step=8.0)
        _insert_ride(db, 3, "Andere Strecke")
        _insert_track(db, 3, length_m=1000.0, lat_offset_m=500.0)

        seg_points = _make_segment_points(length_m=1000.0)
        db.execute(
            "INSERT INTO custom_segments (id, name, source_activity_id, distance_m, points) VALUES (?, ?, ?, ?, ?)",
            (1, "Test-Segment", 1, 1000.0, json.dumps(seg_points)),
        )
        db.commit()
        segment = dict(db.execute("SELECT * FROM custom_segments WHERE id = 1").fetchone())

        stored = match_segment_against_all(db, segment, activity_ids=[1, 2, 3])

        assert stored == 2  # Aktivität 3 (andere Strecke) matcht nicht
        rows = db.execute("SELECT activity_id FROM custom_segment_efforts WHERE segment_id = 1").fetchall()
        matched_ids = {r["activity_id"] for r in rows}
        assert matched_ids == {1, 2}

    def test_upsert_replaces_existing_effort(self, db):
        _insert_ride(db, 1, "Quelle")
        _insert_track(db, 1, length_m=1000.0, seconds_per_step=10.0)
        seg_points = _make_segment_points(length_m=1000.0)
        db.execute(
            "INSERT INTO custom_segments (id, name, source_activity_id, distance_m, points) VALUES (?, ?, ?, ?, ?)",
            (1, "Test-Segment", 1, 1000.0, json.dumps(seg_points)),
        )
        db.commit()
        segment = dict(db.execute("SELECT * FROM custom_segments WHERE id = 1").fetchone())

        match_segment_against_all(db, segment, activity_ids=[1])
        first_time = db.execute(
            "SELECT time_s FROM custom_segment_efforts WHERE segment_id=1 AND activity_id=1"
        ).fetchone()["time_s"]

        # Track neu schreiben mit anderer Pace -> erneutes Matching soll den Effort ersetzen, nicht duplizieren
        db.execute("DELETE FROM track_points WHERE activity_id = 1")
        _insert_track(db, 1, length_m=1000.0, seconds_per_step=20.0)
        match_segment_against_all(db, segment, activity_ids=[1])

        rows = db.execute(
            "SELECT time_s FROM custom_segment_efforts WHERE segment_id=1 AND activity_id=1"
        ).fetchall()
        assert len(rows) == 1
        assert rows[0]["time_s"] != first_time
