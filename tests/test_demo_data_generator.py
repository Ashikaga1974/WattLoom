"""
Tests für den Demo-Daten-Generator (backend/seed_demo_data.py).
Prüft, dass die generierten Demodaten vollständig sind und alle Kern-Analytics-Endpunkte
fehlerfrei darauf operieren können.
"""
import sqlite3
import pytest
from contextlib import contextmanager

import backend.database
import backend.paths
import backend.cache
from backend.seed_demo_data import seed_demo_data
from backend.api.activities import overall_stats
from backend.api.analytics.overview import weekly_volume
from backend.api.analytics.period_comparison import period_comparison
from backend.api.analytics.pmc import performance_management_chart, fitness_fingerprint
from backend.api.bikes.bikes import list_bikes
from backend.api.heatmap import get_heatmap


@pytest.fixture
def demo_db():
    """Erzeugt eine In-Memory-SQLite-DB mit vollständigem Demo-Datensatz."""
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    stats = seed_demo_data(conn, months=14)
    yield conn, stats
    conn.close()


def test_seed_demo_data_structure(demo_db):
    conn, stats = demo_db
    assert stats["activities"] >= 50
    assert stats["track_points"] >= 2000
    assert stats["bikes"] == 2
    assert stats["components"] >= 8
    assert stats["workouts"] >= 5

    # Prüfen, dass Bikes und Config vorhanden sind
    bikes = conn.execute("SELECT id, name FROM bikes ORDER BY id").fetchall()
    assert len(bikes) == 2
    assert bikes[0]["id"] == "demo_canyon_aeroad"

    config_rows = dict(conn.execute("SELECT key, value FROM config").fetchall())
    assert config_rows.get("onboarding_completed") == "1"
    assert config_rows.get("weight_kg") == "76.5"


def test_demo_data_analytics_endpoints(demo_db, monkeypatch):
    conn, _ = demo_db

    @contextmanager
    def fake_db():
        yield conn

    monkeypatch.setattr(backend.database, "db_connection", fake_db)
    monkeypatch.setattr("backend.api.activities.db_connection", fake_db)
    monkeypatch.setattr("backend.api.analytics.pmc.db_connection", fake_db)
    monkeypatch.setattr("backend.api.analytics.period_comparison.db_connection", fake_db)
    monkeypatch.setattr("backend.api.analytics.overview.db_connection", fake_db)
    monkeypatch.setattr("backend.api.bikes.bikes.db_connection", fake_db)
    monkeypatch.setattr("backend.api.heatmap.db_connection", fake_db)

    # 1. Gesamt-Statistiken
    stats = overall_stats(year=None)
    assert stats["total_rides"] >= 50
    assert stats["total_km"] > 2000.0

    # 2. Performance Management Chart (PMC)
    pmc = performance_management_chart()
    assert len(pmc["days"]) >= 365
    assert "ctl" in pmc["days"][-1]

    # 3. Fitness Fingerprint
    ff = fitness_fingerprint()
    assert 0 <= ff["score"] <= 100
    assert ff["trend"] in ("up", "down", "neutral")

    # 4. "Was hat sich verändert?" (Period Comparison)
    comp = period_comparison(days=30, baseline="previous")
    assert comp["current"]["rides"] >= 5
    assert comp["previous"]["rides"] >= 5
    assert len(comp["insights"]) > 0

    # 5. Bike-Management
    bike_list = list_bikes()
    assert len(bike_list) == 2
    canyon = next(b for b in bike_list if b["id"] == "demo_canyon_aeroad")
    assert len(canyon.get("components", [])) >= 4

    # 6. Heatmap (Cache vorher invalidieren und year=None explizit übergeben)
    backend.cache.invalidate()
    heatmap = get_heatmap(simplify=5, year=None)
    assert len(heatmap["points"]) > 100
