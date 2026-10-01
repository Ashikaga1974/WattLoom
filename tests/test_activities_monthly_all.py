"""Tests für backend/api/activities.py: monthly_all() und fill_missing_months()."""
from contextlib import contextmanager

import backend.api.activities as activities
from backend.api.activities import fill_missing_months, monthly_all


def _patch_db(monkeypatch, conn):
    @contextmanager
    def fake_db_connection():
        yield conn
    monkeypatch.setattr(activities, "db_connection", fake_db_connection)


def _row(year, month, km=100.0, count=3):
    return {"year": year, "month": month, "distance_km": km, "count": count}


def test_fills_gaps_with_zero_across_year_boundary():
    filled = fill_missing_months([_row(2025, 11), _row(2026, 2)])
    assert [(r["year"], r["month"]) for r in filled] == [(2025, 11), (2025, 12), (2026, 1), (2026, 2)]
    assert filled[1] == {"year": 2025, "month": 12, "distance_km": 0.0, "count": 0}


def test_nothing_appended_after_last_month():
    assert fill_missing_months([_row(2026, 9)]) == [_row(2026, 9)]


def test_empty_input():
    assert fill_missing_months([]) == []


def test_endpoint_skips_bogus_dates_before_2000(db, monkeypatch):
    _patch_db(monkeypatch, db)
    db.execute("INSERT INTO activities (id, activity_type, start_date, distance_m) VALUES (1, 'ride', '1990-12-01T08:00:00', 34000)")
    db.execute("INSERT INTO activities (id, activity_type, start_date, distance_m) VALUES (2, 'ride', '2026-01-10T08:00:00', 40000)")
    db.execute("INSERT INTO activities (id, activity_type, start_date, distance_m) VALUES (3, 'ride', '2026-03-10T08:00:00', 20000)")

    result = monthly_all()

    assert [(r["year"], r["month"], r["distance_km"]) for r in result] == [(2026, 1, 40.0), (2026, 2, 0.0), (2026, 3, 20.0)]
