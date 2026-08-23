"""
SQLite-Schema für WattLoom.
Alle Tabellen werden hier angelegt; keine Migrations-Library – simples CREATE IF NOT EXISTS.
"""

import sqlite3
from contextlib import contextmanager
from typing import Generator

from backend.paths import DB_PATH, ensure_data_dirs

ensure_data_dirs()


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

            -- UI-Übersetzungen (ersetzt die vormals ins Frontend gebündelten
            -- locales/{lang}/<ns>.json) – key ist ein dot-path wie i18next ihn nutzt
            -- (z.B. "zones.zoneLabel.recovery"), value der übersetzte String.
            CREATE TABLE IF NOT EXISTS translations (
                lang  TEXT NOT NULL,
                ns    TEXT NOT NULL,
                key   TEXT NOT NULL,
                value TEXT NOT NULL,
                PRIMARY KEY (lang, ns, key)
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
        # purchase_url wird nicht mehr gespeichert, sondern live über purchase_item_id ->
        # purchase_items.purchase_id -> purchases.url abgeleitet (war 1:1-Kopie ohne echten
        # Divergenz-Anwendungsfall, siehe Session 2026-07-02d).
        if "purchase_url" in comp_cols:
            conn.execute("ALTER TABLE bike_components DROP COLUMN purchase_url")
        # brand/price werden auf Komponenten-Ebene nicht mehr benötigt (Sascha, Session
        # 2026-07-02d) – keine Ableitung über den Einkauf, da brand≠purchases.shop
        # (Hersteller vs. Händler) und price teils schon vom Einkaufspreis abwich.
        if "brand" in comp_cols:
            conn.execute("ALTER TABLE bike_components DROP COLUMN brand")
        if "price" in comp_cols:
            conn.execute("ALTER TABLE bike_components DROP COLUMN price")
        if "uninstalled_km" not in comp_cols:
            conn.execute("ALTER TABLE bike_components ADD COLUMN uninstalled_km REAL")

        # Migration: Bike-Bild
        bike_cols = [r[1] for r in conn.execute("PRAGMA table_info(bikes)").fetchall()]
        if "image_filename" not in bike_cols:
            conn.execute("ALTER TABLE bikes ADD COLUMN image_filename TEXT")

        # Migration: Einkaufs-Lager (Bestell-Kopfzeilen)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS purchases (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                name          TEXT NOT NULL,
                shop          TEXT,
                url           TEXT,
                price         REAL,
                order_date    TEXT,
                delivery_date TEXT,
                notes         TEXT
            )
        """)
        pur_cols = [r[1] for r in conn.execute("PRAGMA table_info(purchases)").fetchall()]
        if "component_type" not in pur_cols:
            conn.execute("ALTER TABLE purchases ADD COLUMN component_type TEXT")
        if "used_quantity" in pur_cols:
            conn.execute("ALTER TABLE purchases DROP COLUMN used_quantity")

        # Migration: konfigurierbare Lagerplätze (frei verwaltbare Liste statt Freitext/Hardcoding)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS storage_locations (
                id   INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE
            )
        """)
        if "storage_location_id" not in pur_cols:
            conn.execute(
                "ALTER TABLE purchases ADD COLUMN storage_location_id "
                "INTEGER REFERENCES storage_locations(id) ON DELETE SET NULL"
            )
        loc_count = conn.execute("SELECT COUNT(*) FROM storage_locations").fetchone()[0]
        if loc_count == 0:
            conn.executemany(
                "INSERT INTO storage_locations (name) VALUES (?)",
                [
                    ("Kleine Kiste (obere Schublade Durchgang)",),
                    ("Kleine Kiste (untere Schublade Durchgang)",),
                    ("Grosse Kiste (Schlafzimmer)",),
                    ("Rad-Flasche",),
                ],
            )

        # Migration: Laufleistungs-Historie zurückgelegter Komponenten
        # (bike_components-Zeile wird beim Zurücklegen gelöscht, die Laufleistung bleibt hier erhalten)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS purchase_returns (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                bike_id         TEXT,
                component_type  TEXT,
                km_ridden       REAL,
                returned_at     TEXT
            )
        """)
        pr_cols = [r[1] for r in conn.execute("PRAGMA table_info(purchase_returns)").fetchall()]

        # Migration: Einkaufs-Lager von "1 Zeile + quantity-Zähler" auf "1 Zeile je physischem
        # Teil" umgestellt (purchase_items). Grund: ein Einkauf von z.B. 4 Reifen wurde bisher als
        # eine purchases-Zeile mit quantity=4 abgebildet – verbaut/verfügbar musste über
        # Zähler-Arithmetik (+/−-Buttons, COUNT(bike_components)) rekonstruiert werden, was schon
        # einmal (used_quantity) aus dem Ruder lief. Jetzt bildet jede purchase_items-Zeile genau
        # ein gekauftes Exemplar ab: verbaut = von bike_components referenziert, entsorgt =
        # disposed_at gesetzt, sonst auf Lager – nichts mehr gezählt, was auseinanderlaufen kann.
        conn.execute("""
            CREATE TABLE IF NOT EXISTS purchase_items (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                purchase_id  INTEGER NOT NULL REFERENCES purchases(id),
                disposed_at  TEXT
            )
        """)
        if "purchase_item_id" not in comp_cols:
            conn.execute(
                "ALTER TABLE bike_components ADD COLUMN purchase_item_id INTEGER REFERENCES purchase_items(id)"
            )
        if "purchase_item_id" not in pr_cols:
            conn.execute(
                "ALTER TABLE purchase_returns ADD COLUMN purchase_item_id INTEGER REFERENCES purchase_items(id)"
            )

        if "quantity" in pur_cols:
            # Einmalige Datenübernahme, solange die alte quantity-Spalte noch existiert.
            # 1) Verbaute Komponenten: je ein "verbautes" Item anlegen und verknüpfen.
            for c in conn.execute(
                "SELECT id, purchase_id FROM bike_components WHERE purchase_id IS NOT NULL"
            ).fetchall():
                item_id = conn.execute(
                    "INSERT INTO purchase_items (purchase_id) VALUES (?)", (c["purchase_id"],)
                ).lastrowid
                conn.execute(
                    "UPDATE bike_components SET purchase_item_id = ? WHERE id = ?", (item_id, c["id"])
                )
            # 2) Offene Rückgaben: je ein "auf Lager zurückgelegtes" Item anlegen und verknüpfen.
            for r in conn.execute("SELECT id, purchase_id FROM purchase_returns").fetchall():
                item_id = conn.execute(
                    "INSERT INTO purchase_items (purchase_id) VALUES (?)", (r["purchase_id"],)
                ).lastrowid
                conn.execute(
                    "UPDATE purchase_returns SET purchase_item_id = ? WHERE id = ?", (item_id, r["id"])
                )
            # 3) Restliche freie Stückzahl je Einkauf auffüllen (quantity − bereits angelegte Items).
            for p in conn.execute("SELECT id, quantity FROM purchases").fetchall():
                existing = conn.execute(
                    "SELECT COUNT(*) AS c FROM purchase_items WHERE purchase_id = ?", (p["id"],)
                ).fetchone()["c"]
                for _ in range(max(0, p["quantity"] - existing)):
                    conn.execute("INSERT INTO purchase_items (purchase_id) VALUES (?)", (p["id"],))
            conn.execute("ALTER TABLE purchases DROP COLUMN quantity")
            conn.execute("ALTER TABLE bike_components DROP COLUMN purchase_id")
            conn.execute("ALTER TABLE purchase_returns DROP COLUMN purchase_id")
            if "reinstalled_at" in pr_cols:
                conn.execute("ALTER TABLE purchase_returns DROP COLUMN reinstalled_at")

        # Migration: Löschungs-Historie für Bike-Komponenten (Session 2026-07-02d) – Snapshot
        # der bike_components-Zeile zum Löschzeitpunkt, damit gelöschte Komponenten weiterhin
        # einsehbar bleiben. purchase_item_id bleibt referenziert (nicht kopiert), analog zu
        # purchase_url/brand/price-Entfernung: Details zu Preis/Shop/Link kommen bei Bedarf über
        # den Einkauf.
        conn.execute("""
            CREATE TABLE IF NOT EXISTS deleted_components (
                id                INTEGER PRIMARY KEY AUTOINCREMENT,
                bike_id           TEXT,
                type              TEXT,
                km_threshold      REAL,
                km_at_service     REAL,
                km_since_service  REAL,
                added_at          TEXT,
                retired_at        TEXT,
                uninstalled_km    REAL,
                purchase_item_id  INTEGER REFERENCES purchase_items(id),
                deleted_at        TEXT
            )
        """)

        # PR-Erkennung (Best-by-Distance-Snapshot vor/nach Import) – jede Zeile ist ein
        # erkannter neuer Rekord, der auf dem Dashboard erscheint, bis er verworfen wird.
        conn.execute("""
            CREATE TABLE IF NOT EXISTS pr_events (
                id                INTEGER PRIMARY KEY AUTOINCREMENT,
                distance_km       REAL NOT NULL,
                best_time_s       REAL NOT NULL,
                best_speed_kmh    REAL,
                activity_id       INTEGER NOT NULL,
                activity_name     TEXT,
                activity_date     TEXT,
                previous_time_s   REAL NOT NULL,
                created_at        TEXT NOT NULL DEFAULT (datetime('now'))
            )
        """)
        pr_cols = [r[1] for r in conn.execute("PRAGMA table_info(pr_events)").fetchall()]
        if "activity_date" not in pr_cols:
            conn.execute("ALTER TABLE pr_events ADD COLUMN activity_date TEXT")
            conn.execute("""
                UPDATE pr_events
                SET activity_date = (SELECT start_date_local FROM activities WHERE activities.id = pr_events.activity_id)
                WHERE activity_date IS NULL
            """)

        # Migration: deutsche Klartext-Sport-/Komponenten-Werte → stabile, sprachneutrale Codes
        # (Grundlage für die Mehrsprachigkeit, DE/EN). Vorher schrieben die Importer German
        # Labels direkt in activities.activity_type/sport_type und other_activities.sport_type;
        # bike_components.type/purchases.component_type kamen als deutsche Freitext-Werte aus
        # einer nur im Frontend hartcodierten Liste. Einmaliger, über eine config-Markierung
        # abgesicherter Lauf – analog zum bereits genutzten Backup-Muster in POST /import/reset.
        if conn.execute(
            "SELECT 1 FROM config WHERE key = 'migrated_i18n_sport_codes'"
        ).fetchone() is None:
            import shutil
            from datetime import datetime as _dt

            # lookup_sport_code() statt to_sport_code(): ein nicht erkannter Alt-Wert soll roh
            # sichtbar stehen bleiben (siehe Kommentar zu den Component-Type-Maps unten) statt
            # aktiv und destruktiv auf den Auffang-Code "training" umgeschrieben zu werden –
            # sonst würde z.B. eine Radtour mit ungewöhnlichem Alt-Wert dauerhaft fälschlich als
            # Workout einsortiert, ohne dass das je auffällt.
            from backend.importer.sport_codes import lookup_sport_code

            if DB_PATH.exists():
                backup_dir = DB_PATH.parent / "backups"
                backup_dir.mkdir(exist_ok=True)
                shutil.copy2(
                    DB_PATH, backup_dir / f"mybiking_pre-i18n-migration_{_dt.now():%Y%m%d_%H%M%S}.db"
                )

            for old_val in [r[0] for r in conn.execute(
                "SELECT DISTINCT activity_type FROM activities WHERE activity_type IS NOT NULL"
            ).fetchall()]:
                new_val = lookup_sport_code(old_val)
                if new_val and new_val != old_val:
                    conn.execute(
                        "UPDATE activities SET activity_type = ?, sport_type = ? WHERE activity_type = ?",
                        (new_val, new_val, old_val),
                    )

            for old_val in [r[0] for r in conn.execute(
                "SELECT DISTINCT sport_type FROM other_activities WHERE sport_type IS NOT NULL"
            ).fetchall()]:
                new_val = lookup_sport_code(old_val)
                if new_val and new_val != old_val:
                    conn.execute(
                        "UPDATE other_activities SET sport_type = ? WHERE sport_type = ?",
                        (new_val, old_val),
                    )

            # bike_components.type ist eine andere (gesidete) Vokabular-Form als
            # purchases.component_type (Basistyp ohne vorne/hinten) – zwei Maps.
            _COMPONENT_TYPE_MAP = {
                "Kette": "chain", "Kassette": "cassette", "Kabel": "cable",
                "Schaltwerk": "derailleur", "Bremsbeläge": "brake_pads", "Sonstiges": "other",
                "Mantel vorne": "tire_front", "Mantel hinten": "tire_rear",
                "Schlauch vorne": "tube_front", "Schlauch hinten": "tube_rear",
            }
            _PURCHASE_COMPONENT_TYPE_MAP = {
                **_COMPONENT_TYPE_MAP, "Mantel": "tire", "Schlauch": "tube",
            }
            for old_val, new_val in _COMPONENT_TYPE_MAP.items():
                conn.execute(
                    "UPDATE bike_components SET type = ? WHERE type = ?", (new_val, old_val)
                )
                conn.execute(
                    "UPDATE deleted_components SET type = ? WHERE type = ?", (new_val, old_val)
                )
            for old_val, new_val in _PURCHASE_COMPONENT_TYPE_MAP.items():
                conn.execute(
                    "UPDATE purchases SET component_type = ? WHERE component_type = ?",
                    (new_val, old_val),
                )
            # Nicht erkannte Alt-Werte bleiben absichtlich unverändert (roh sichtbar statt
            # destruktiv geraten) – siehe CLAUDE.md.

            conn.execute(
                "INSERT INTO config(key, value) VALUES('migrated_i18n_sport_codes', '1')"
            )

        # Migration: translations.value als valides JSON statt Python-str() speichern.
        # POST /translations/import (backend/api/translations.py) schrieb Listen-Werte (z.B.
        # weekdaysShort) bisher über str(value) als Python-Repr "['Mo', 'Di', ...]" statt als
        # JSON-Array – i18next liefert bei t(key, {returnObjects:true}) dann diesen rohen String
        # zurück statt eines Arrays, was im Frontend crasht. Einmaliger Lauf: parst betroffene
        # Alt-Werte per ast.literal_eval zurück in echte Python-Objekte und schreibt sie neu als
        # json.dumps() – normale String-Werte werden dabei ebenfalls JSON-kodiert (in
        # Anführungszeichen), damit die Leseseite immer einheitlich json.loads() nutzen kann.
        if conn.execute(
            "SELECT 1 FROM config WHERE key = 'migrated_translations_json_encoding'"
        ).fetchone() is None:
            import ast
            import json as _json

            for lang, ns, key, value in conn.execute(
                "SELECT lang, ns, key, value FROM translations"
            ).fetchall():
                try:
                    _json.loads(value)
                    continue  # bereits valides JSON
                except (ValueError, TypeError):
                    pass
                if value.startswith("[") and value.endswith("]"):
                    try:
                        obj = ast.literal_eval(value)
                    except (ValueError, SyntaxError):
                        obj = value
                else:
                    obj = value
                conn.execute(
                    "UPDATE translations SET value = ? WHERE lang = ? AND ns = ? AND key = ?",
                    (_json.dumps(obj), lang, ns, key),
                )

            conn.execute(
                "INSERT INTO config(key, value) VALUES('migrated_translations_json_encoding', '1')"
            )

        # db_connection() committet beim Schließen nicht automatisch – ohne diesen commit() würde
        # eine hier noch offene, von INSERT/UPDATE implizit gestartete Transaktion (z.B. die
        # purchase_items-Datenübernahme oben) beim conn.close() stillschweigend zurückgerollt,
        # obwohl die dazwischenliegenden ALTER TABLE-Statements erfolgreich gelaufen sind.
        conn.commit()

    print(f"DB initialisiert: {DB_PATH}")


if __name__ == "__main__":
    init_db()
