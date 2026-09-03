"""
Gemeinsame pytest-Fixtures für alle Backend-Tests.
Stellt eine In-Memory-SQLite-DB mit dem vollständigen Schema bereit.
"""
import sqlite3
import pytest

import backend.cache


@pytest.fixture(autouse=True)
def _clear_analytics_cache():
    """Der best_by_distance-/heatmap-Cache (backend/cache.py) ist ein Modul-globaler
    In-Prozess-Store – ohne Reset würde ein Test den gecachten Wert eines vorherigen
    Tests sehen, obwohl er gegen eine eigene, frische DB-Fixture läuft."""
    backend.cache.invalidate()
    yield
    backend.cache.invalidate()


# Schema spiegelt database.py wider (inkl. Migrations-Spalten)
_SCHEMA = """
CREATE TABLE activities (
    id                  INTEGER PRIMARY KEY,
    name                TEXT,
    activity_type       TEXT,
    sport_type          TEXT,
    start_date          TEXT,
    start_date_local    TEXT,
    timezone            TEXT,
    distance_m          REAL,
    moving_time_s       INTEGER,
    elapsed_time_s      INTEGER,
    elevation_gain_m    REAL,
    elevation_loss_m    REAL,
    avg_speed_ms        REAL,
    max_speed_ms        REAL,
    avg_hr              REAL,
    max_hr              INTEGER,
    avg_power_w         REAL,
    max_power_w         INTEGER,
    avg_cadence         REAL,
    avg_temp_c          REAL,
    calories            REAL,
    bike_id             TEXT,
    commute             INTEGER,
    trainer             INTEGER,
    manual              INTEGER,
    track_file          TEXT,
    has_track           INTEGER DEFAULT 0,
    imported_at         TEXT,
    smart_device        TEXT,
    est_avg_power_w     REAL,
    est_norm_power_w    REAL,
    weather_temp_c      REAL,
    weather_wind_ms     REAL,
    weather_wind_deg    INTEGER,
    weather_precip_mm   REAL
);

CREATE TABLE track_points (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    activity_id INTEGER NOT NULL REFERENCES activities(id),
    timestamp   TEXT,
    lat         REAL,
    lon         REAL,
    altitude_m  REAL,
    distance_m  REAL,
    speed_ms    REAL,
    hr          INTEGER,
    power_w     INTEGER,
    cadence     INTEGER,
    temp_c      REAL
);

CREATE TABLE laps (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    activity_id      INTEGER NOT NULL REFERENCES activities(id),
    lap_number       INTEGER,
    start_time       TEXT,
    total_time_s     REAL,
    distance_m       REAL,
    avg_speed_ms     REAL,
    max_speed_ms     REAL,
    avg_hr           REAL,
    max_hr           INTEGER,
    avg_power_w      REAL,
    max_power_w      INTEGER,
    avg_cadence      REAL,
    elevation_gain_m REAL
);

CREATE TABLE other_activities (
    id                        INTEGER PRIMARY KEY,
    name                      TEXT,
    sport_type                TEXT,
    start_date_local          TEXT,
    moving_time_s             INTEGER,
    elapsed_time_s            INTEGER,
    avg_hr                    REAL,
    max_hr                    INTEGER,
    min_hr                    INTEGER,
    avg_cadence               INTEGER,
    max_cadence               INTEGER,
    training_effect           REAL,
    anaerobic_training_effect REAL,
    calories                  REAL,
    imported_at               TEXT
);

CREATE TABLE media (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    activity_id INTEGER,
    filename    TEXT
);

CREATE TABLE bikes (
    id             TEXT PRIMARY KEY,
    name           TEXT,
    brand          TEXT,
    model          TEXT,
    description    TEXT,
    distance_m     REAL,
    retired        INTEGER DEFAULT 0,
    image_filename TEXT
);

CREATE TABLE config (
    key   TEXT PRIMARY KEY,
    value TEXT
);
"""


@pytest.fixture
def db():
    """In-Memory-SQLite mit vollständigem Schema; pro Test isoliert."""
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    conn.executescript(_SCHEMA)
    conn.execute("INSERT INTO bikes (id, name) VALUES ('test_bike', 'Testrad')")
    conn.commit()
    yield conn
    conn.close()
