"""
SQLite-Schema für MyBiking.
Alle Tabellen werden hier angelegt; keine Migrations-Library – simples CREATE IF NOT EXISTS.
"""

import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Generator

DB_PATH = Path(__file__).parent.parent / "data" / "mybiking.db"


@contextmanager
def db_connection() -> Generator[sqlite3.Connection, None, None]:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    try:
        yield conn
    finally:
        conn.close()


def init_db() -> None:
    with db_connection() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS activities (
                id                  INTEGER PRIMARY KEY,  -- Strava Activity-ID
                name                TEXT,
                activity_type       TEXT,
                sport_type          TEXT,
                start_date          TEXT,                 -- ISO8601
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
                commute             INTEGER,              -- 0/1
                trainer             INTEGER,
                manual              INTEGER,
                track_file          TEXT,                 -- relativer Pfad in ZIP
                has_track           INTEGER DEFAULT 0,
                imported_at         TEXT,                 -- ISO8601
                smart_device        TEXT                  -- "Amazfit", "Cyplus", "Unbekannt"
            );

            CREATE TABLE IF NOT EXISTS track_points (
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
            CREATE INDEX IF NOT EXISTS idx_tp_activity ON track_points(activity_id);

            CREATE TABLE IF NOT EXISTS laps (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                activity_id     INTEGER NOT NULL REFERENCES activities(id),
                lap_number      INTEGER,
                start_time      TEXT,
                total_time_s    REAL,
                distance_m      REAL,
                avg_speed_ms    REAL,
                max_speed_ms    REAL,
                avg_hr          REAL,
                max_hr          INTEGER,
                avg_power_w     REAL,
                max_power_w     INTEGER,
                avg_cadence     REAL,
                elevation_gain_m REAL
            );
            CREATE INDEX IF NOT EXISTS idx_laps_activity ON laps(activity_id);

            CREATE TABLE IF NOT EXISTS segment_efforts (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                activity_id     INTEGER NOT NULL REFERENCES activities(id),
                name            TEXT,
                start_time      TEXT,
                elapsed_time_s  REAL,
                distance_m      REAL,
                avg_speed_ms    REAL,
                max_speed_ms    REAL,
                avg_hr          REAL,
                max_hr          INTEGER,
                avg_power_w     REAL,
                max_power_w     INTEGER,
                avg_cadence     REAL,
                total_ascent_m  REAL,
                rank            INTEGER,
                pr_rank         INTEGER
            );
            CREATE INDEX IF NOT EXISTS idx_seg_activity ON segment_efforts(activity_id);

            CREATE TABLE IF NOT EXISTS bikes (
                id              TEXT PRIMARY KEY,         -- Strava Gear-ID (z.B. "b12345")
                name            TEXT,
                brand           TEXT,
                model           TEXT,
                description     TEXT,
                distance_m      REAL,
                retired         INTEGER DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS bike_components (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                bike_id         TEXT REFERENCES bikes(id),
                type            TEXT,
                brand           TEXT,
                model           TEXT,
                description     TEXT,
                distance_m      REAL,
                added_at        TEXT,
                retired_at      TEXT
            );

            CREATE TABLE IF NOT EXISTS routes (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                name        TEXT,
                description TEXT,
                distance_m  REAL,
                source_file TEXT
            );

            CREATE TABLE IF NOT EXISTS route_points (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                route_id    INTEGER NOT NULL REFERENCES routes(id),
                seq         INTEGER,
                lat         REAL,
                lon         REAL,
                altitude_m  REAL
            );
            CREATE INDEX IF NOT EXISTS idx_rp_route ON route_points(route_id);

            CREATE TABLE IF NOT EXISTS media (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                activity_id INTEGER REFERENCES activities(id),
                filename    TEXT,
                taken_at    TEXT,
                lat         REAL,
                lon         REAL
            );

            CREATE TABLE IF NOT EXISTS other_activities (
                id              INTEGER PRIMARY KEY,  -- Strava Activity-ID
                name            TEXT,
                sport_type      TEXT,
                start_date_local TEXT,               -- ISO8601
                moving_time_s   INTEGER,
                elapsed_time_s  INTEGER,
                avg_hr          REAL,
                max_hr          INTEGER,
                calories        REAL,
                imported_at     TEXT
            );

            CREATE TABLE IF NOT EXISTS config (
                key   TEXT PRIMARY KEY,
                value TEXT
            );
        """)
        # Default-Bike sicherstellen – wird nach jedem Reset neu angelegt
        conn.execute(
            "INSERT OR IGNORE INTO bikes (id, name, brand, retired) VALUES (?, ?, ?, 0)",
            ("giant_propel", "Giant Propel", "Giant"),
        )
        conn.commit()

        # Migrations: activities-Spalten einmalig einlesen
        cols = [r[1] for r in conn.execute("PRAGMA table_info(activities)").fetchall()]

        # Migration: Leistungsschätzung
        for col, typ in [("est_avg_power_w", "REAL"), ("est_norm_power_w", "REAL")]:
            if col not in cols:
                conn.execute(f"ALTER TABLE activities ADD COLUMN {col} {typ}")

        # Migration: smart_device-Spalte hinzufügen falls nicht vorhanden
        if "smart_device" not in cols:
            conn.execute("ALTER TABLE activities ADD COLUMN smart_device TEXT")
            conn.execute("""
                UPDATE activities SET smart_device = CASE
                    WHEN manual = 1                          THEN 'Amazfit'
                    WHEN track_file LIKE '%.fit.gz'          THEN 'Amazfit'
                    WHEN track_file LIKE '%.tcx.gz'          THEN 'Cyplus'
                    ELSE 'Unbekannt'
                END
            """)

        # Migration: Wetter-Spalten hinzufügen
        for col, typ in [
            ("weather_temp_c", "REAL"),
            ("weather_wind_ms", "REAL"),
            ("weather_wind_deg", "INTEGER"),
            ("weather_precip_mm", "REAL"),
        ]:
            if col not in cols:
                conn.execute(f"ALTER TABLE activities ADD COLUMN {col} {typ}")

        # Migration: bike_components Verschleiß-Tracking
        comp_cols = [r[1] for r in conn.execute("PRAGMA table_info(bike_components)").fetchall()]
        if "km_threshold" not in comp_cols:
            conn.execute("ALTER TABLE bike_components ADD COLUMN km_threshold REAL")
        if "km_at_service" not in comp_cols:
            conn.execute("ALTER TABLE bike_components ADD COLUMN km_at_service REAL DEFAULT 0")
        if "price" not in comp_cols:
            conn.execute("ALTER TABLE bike_components ADD COLUMN price REAL")
        if "purchase_url" not in comp_cols:
            conn.execute("ALTER TABLE bike_components ADD COLUMN purchase_url TEXT")

        # Migration: Bike-Bild
        bike_cols = [r[1] for r in conn.execute("PRAGMA table_info(bikes)").fetchall()]
        if "image_filename" not in bike_cols:
            conn.execute("ALTER TABLE bikes ADD COLUMN image_filename TEXT")

    print(f"DB initialisiert: {DB_PATH}")


if __name__ == "__main__":
    init_db()
