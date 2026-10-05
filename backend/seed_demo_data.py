"""
Generator für realistische Demo-Daten in WattLoom.
Erzeugt einen vollständigen Jahresdatensatz (Aktivitäten, GPS-Tracks, Fahrräder,
Verschleiß-Komponenten, Segmente, Workouts, Wetter und Lagerbestände),
damit das gesamte Dashboard sofort mit Leben gefüllt ist.
"""

from __future__ import annotations

import argparse
import json
import math
import random
import sqlite3
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

# Sicherstellen, dass das Projekt-Root im Python-Pfad liegt
ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from backend.database import init_db
from backend.paths import DB_PATH, _is_untouched_db

# Basis-Koordinaten für Routen im Raum Eifel / Rursee / Aachen
BASE_LAT = 50.6850
BASE_LON = 6.2200

DEMO_TAG = "WattLoom Demo"


def _generate_synthetic_track(
    activity_id: int,
    start_dt: datetime,
    distance_m: float,
    moving_time_s: int,
    elevation_gain_m: float,
    avg_hr: float,
    avg_cadence: float,
    avg_power_w: float,
    avg_temp_c: float,
    route_seed: int = 1,
) -> list[tuple]:
    """Generiert realistische Stützpunkte (ca. 250 Punkte) entlang einer Schleife."""
    points = []
    num_points = 260
    dt_step = moving_time_s / num_points
    dist_step = distance_m / num_points

    # Route als geschlossene/halb-geschlossene Ellipse mit topografischen Wellen
    angle_offset = (route_seed * 47) % 360
    radius_lat = 0.055 + (route_seed % 3) * 0.015
    radius_lon = 0.075 + (route_seed % 4) * 0.018

    curr_dist = 0.0
    curr_time = start_dt

    for i in range(num_points):
        fraction = i / (num_points - 1)
        angle = 2 * math.pi * fraction + math.radians(angle_offset)

        # Koordinaten auf einer welligen Schleife
        lat = BASE_LAT + radius_lat * math.sin(angle) + 0.008 * math.sin(3 * angle)
        lon = BASE_LON + radius_lon * math.cos(angle) + 0.006 * math.cos(2 * angle)

        # Höhenprofil mit Anstiegen und Abfahrten
        ele_wave = math.sin(2.5 * math.pi * fraction) + 0.5 * math.cos(5 * math.pi * fraction)
        alt = 220.0 + (elevation_gain_m * 0.6) * (ele_wave + 1.0) / 2.0

        # Steigung aus Höhendifferenz
        grade = 0.0
        if i > 0:
            prev_alt = points[-1][4]
            grade = round(((alt - prev_alt) / max(dist_step, 1.0)) * 100.0, 1)
            grade = max(min(grade, 12.0), -12.0)

        # Geschwindigkeits- und Watt-Modulation je nach Steigung
        speed_mod = 1.0 - (grade / 20.0)
        speed_mod = max(min(speed_mod, 1.8), 0.45)
        speed_ms = round((distance_m / moving_time_s) * speed_mod, 2)

        # Leistung: bergauf mehr, bergab weniger
        power_w = int(max(avg_power_w * (1.0 + grade * 0.07), 40))
        if grade < -3.0:
            power_w = int(max(power_w * 0.35, 0))

        # Herzfrequenz folgt der Belastung
        hr = int(min(max(avg_hr + grade * 2.2, 105), 185))

        # Kadenz: bergauf tendenziell etwas niedriger
        cadence = int(min(max(avg_cadence - grade * 0.8, 65), 105))

        curr_dist += dist_step
        curr_time += timedelta(seconds=dt_step)

        points.append((
            activity_id,
            curr_time.strftime("%Y-%m-%dT%H:%M:%SZ"),
            round(lat, 6),
            round(lon, 6),
            round(alt, 1),
            round(curr_dist, 1),
            speed_ms,
            hr,
            power_w,
            cadence,
            round(avg_temp_c, 1),
            grade,
        ))

    return points


def seed_demo_data(conn: sqlite3.Connection, months: int = 14) -> dict[str, int]:
    """Befüllt die übergebene SQLite-Verbindung mit einem vollständigen Demo-Datensatz."""
    init_db(conn)

    # 1. Konfiguration & Benutzereinstellungen
    configs = {
        "language": "de",
        "weight_kg": "76.5",
        "birth_year": "1988",
        "hr_max": "188",
        "default_bike_id": "demo_canyon_aeroad",
        "yearly_km_goal": "6000.0",
        "weekly_hours_goal": "5.0",
        "onboarding_completed": "1",
        "crr": "0.004",
        "cda": "0.32",
        "bike_kg": "7.8",
        "chain_maintenance_km": "300.0",
        "wear_warning_pct": "90.0",
        "recovery_base_h": "6.0",
        "recovery_if_exponent": "2.0",
    }
    for k, v in configs.items():
        conn.execute("INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)", (k, v))

    # 2. Lagerorte
    conn.execute("INSERT OR IGNORE INTO storage_locations (id, name) VALUES (1, 'Werkstatt-Regal')")
    conn.execute("INSERT OR IGNORE INTO storage_locations (id, name) VALUES (2, 'Ersatzteilkiste Schrank')")

    # 3. Fahrräder
    bikes = [
        ("demo_canyon_aeroad", "Canyon Aeroad CF SLX", "Canyon", "Aeroad CF SLX 8 Di2", "Aero-Rennrad für schnelle Straßenrunden", 4280000.0, 0),
        ("demo_rose_backroad", "Rose Backroad AL", "Rose", "Backroad AL GRX 1x11", "Allwetter- & Schotterrad für Herbst und Winter", 1720000.0, 0),
    ]
    for b in bikes:
        conn.execute(
            """INSERT OR REPLACE INTO bikes (id, name, brand, model, description, distance_m, retired)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            b,
        )

    # 4. Einkäufe & physische Lager-Items
    # Einkauf 1: Ketten (2 Stück bestellt, 1 verbaut auf Canyon, 1 auf Lager)
    conn.execute("""
        INSERT OR REPLACE INTO purchases (id, name, shop, url, price, order_date, delivery_date, notes, component_type, storage_location_id)
        VALUES (101, 'KMC X11-EL Kette 11-fach Gold', 'Bike-Components', 'https://www.bike-components.de', 39.95, '2026-03-01', '2026-03-03', 'Vorrat für Saison 2026', 'chain', 1)
    """)
    conn.execute("INSERT OR IGNORE INTO purchase_items (id, purchase_id) VALUES (201, 101)")
    conn.execute("INSERT OR IGNORE INTO purchase_items (id, purchase_id) VALUES (202, 101)")

    # Einkauf 2: Rennradreifen (2 Stück bestellt, beide verbaut)
    conn.execute("""
        INSERT OR REPLACE INTO purchases (id, name, shop, url, price, order_date, delivery_date, notes, component_type, storage_location_id)
        VALUES (102, 'Continental Grand Prix 5000 S TR 28mm', 'Bike24', 'https://www.bike24.de', 58.50, '2026-02-10', '2026-02-13', 'Tubeless-Setup', 'tire', 1)
    """)
    conn.execute("INSERT OR IGNORE INTO purchase_items (id, purchase_id) VALUES (203, 102)")
    conn.execute("INSERT OR IGNORE INTO purchase_items (id, purchase_id) VALUES (204, 102)")

    # Einkauf 3: Kettenpflege & Schmiermittel
    conn.execute("""
        INSERT OR REPLACE INTO purchases (id, name, shop, url, price, order_date, delivery_date, notes, component_type, storage_location_id)
        VALUES (103, 'Muc-Off C3 Ceramic Kettenöl Dry 120ml', 'Rose Bikes', 'https://www.rosebikes.de', 12.90, '2026-04-12', '2026-04-15', 'Im Werkstattschrank', 'other', 2)
    """)
    conn.execute("INSERT OR IGNORE INTO purchase_items (id, purchase_id) VALUES (205, 103)")

    # 5. Fahrrad-Komponenten (Verschleiß-Status)
    # Canyon Aeroad
    components = [
        ("demo_canyon_aeroad", "chain", "KMC X11-EL Gold", 3000.0, 2800.0, "2026-03-10", 201),
        ("demo_canyon_aeroad", "cassette", "Shimano Ultegra R8000 11-30", 8000.0, 0.0, "2025-05-01", None),
        ("demo_canyon_aeroad", "tire_front", "Continental GP 5000 S TR 28mm", 4500.0, 1800.0, "2026-02-20", 203),
        ("demo_canyon_aeroad", "tire_rear", "Continental GP 5000 S TR 28mm", 3500.0, 1200.0, "2026-02-20", 204),
        ("demo_canyon_aeroad", "brake_pads", "SwissStop Disc 34 RS", 3000.0, 2500.0, "2026-04-01", None),
        # Rose Backroad (Kette und Hinterreifen stark beansprucht -> Warnung)
        ("demo_rose_backroad", "chain", "Shimano HG-701 GRX", 2500.0, 0.0, "2025-09-01", None),
        ("demo_rose_backroad", "tire_front", "Schwalbe G-One Bite 40mm", 4000.0, 0.0, "2025-09-01", None),
        ("demo_rose_backroad", "tire_rear", "Schwalbe G-One Bite 40mm", 3000.0, 0.0, "2025-09-01", None),
    ]
    for comp in components:
        conn.execute(
            """INSERT INTO bike_components (bike_id, type, model, km_threshold, km_at_service, added_at, purchase_item_id)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            comp,
        )

    # 6. Aktivitäten über die letzten 12 Monate generieren
    now = datetime.now()
    ride_templates = [
        {"name": "Feierabendrunde Rurtal", "dist_km": 34.5, "speed_kmh": 30.2, "ele_m": 180, "hr": 142, "watts": 210, "bike": "demo_canyon_aeroad", "sport": "ride"},
        {"name": "Eifel Panorama & Höhenmeter", "dist_km": 76.0, "speed_kmh": 26.5, "ele_m": 1120, "hr": 154, "watts": 235, "bike": "demo_canyon_aeroad", "sport": "ride"},
        {"name": "Grundlagenrunde Flachland", "dist_km": 54.0, "speed_kmh": 29.1, "ele_m": 240, "hr": 136, "watts": 195, "bike": "demo_canyon_aeroad", "sport": "ride"},
        {"name": "Intervalle am Mergelland", "dist_km": 42.0, "speed_kmh": 31.8, "ele_m": 390, "hr": 159, "watts": 255, "bike": "demo_canyon_aeroad", "sport": "ride"},
        {"name": "Sonntags-Ausfahrt Rursee", "dist_km": 92.5, "speed_kmh": 27.4, "ele_m": 1340, "hr": 149, "watts": 225, "bike": "demo_canyon_aeroad", "sport": "ride"},
        {"name": "Gravelrunde Vennbahn & Wald", "dist_km": 46.0, "speed_kmh": 23.8, "ele_m": 580, "hr": 145, "watts": 205, "bike": "demo_rose_backroad", "sport": "gravel_ride"},
        {"name": "Regenerations-Spin am Abend", "dist_km": 26.0, "speed_kmh": 25.0, "ele_m": 110, "hr": 122, "watts": 150, "bike": "demo_canyon_aeroad", "sport": "ride"},
        {"name": "Herbst-Gravel Schotter & Pfade", "dist_km": 51.0, "speed_kmh": 24.2, "ele_m": 690, "hr": 148, "watts": 212, "bike": "demo_rose_backroad", "sport": "gravel_ride"},
    ]

    activity_count = 0
    track_count = 0
    act_id_base = 900000

    # Jahreszeitlicher Ablauf (Tag für Tag zurückrechnen)
    days_back = months * 30
    rng = random.Random(42)

    all_activity_records = []
    trackpoint_records = []
    lap_records = []

    # Wir verteilen ca. 80-100 Fahrten über die Historie
    current_day_offset = 2
    route_index = 0

    while current_day_offset < days_back:
        ride_date = now - timedelta(days=current_day_offset)
        month = ride_date.month

        # Im Sommer öfter fahren; in den letzten 35 Tagen besonders dicht für "Was hat sich verändert?"
        is_winter = month in (12, 1, 2)
        is_summer = month in (5, 6, 7, 8)

        if current_day_offset < 35:
            step_days = rng.randint(2, 3)
        elif is_winter:
            step_days = rng.randint(4, 7)
        else:
            step_days = rng.randint(2, 4)

        tmpl = rng.choice(ride_templates)
        if is_winter and tmpl["bike"] == "demo_canyon_aeroad" and rng.random() < 0.6:
            # Im Winter eher das Gravelbike
            tmpl = ride_templates[5]

        # Wetter anpassen
        if is_winter:
            temp_c = round(rng.uniform(2.0, 7.5), 1)
            dist_km = tmpl["dist_km"] * rng.uniform(0.75, 0.95)
        elif is_summer:
            temp_c = round(rng.uniform(19.0, 28.5), 1)
            dist_km = tmpl["dist_km"] * rng.uniform(0.95, 1.25)
        else:
            temp_c = round(rng.uniform(11.0, 18.5), 1)
            dist_km = tmpl["dist_km"] * rng.uniform(0.85, 1.10)

        dist_m = round(dist_km * 1000.0, 1)
        speed_kmh = tmpl["speed_kmh"] * rng.uniform(0.96, 1.04)
        speed_ms = speed_kmh / 3.6
        moving_time_s = int(dist_m / speed_ms)
        elapsed_time_s = moving_time_s + rng.randint(180, 800)

        watts = int(tmpl["watts"] * rng.uniform(0.95, 1.05))
        norm_watts = int(watts * 1.07)
        hr_avg = int(tmpl["hr"] * rng.uniform(0.96, 1.04))
        hr_max = int(hr_avg + rng.randint(22, 34))

        act_id = act_id_base + activity_count
        start_iso = ride_date.strftime("%Y-%m-%dT10:15:00Z")

        # Für die letzten 10 Fahrten sowie jede 5. historische Fahrt generieren wir echte GPS-Tracks
        has_track = 1 if (activity_count < 10 or activity_count % 4 == 0) else 0

        act_record = (
            act_id,
            tmpl["name"],
            "ride",
            tmpl["sport"],
            start_iso,
            start_iso,
            "Europe/Berlin",
            dist_m,
            moving_time_s,
            elapsed_time_s,
            float(tmpl["ele_m"]),
            float(tmpl["ele_m"]),
            round(speed_ms, 2),
            round(speed_ms * 1.7, 2),
            float(hr_avg),
            hr_max,
            float(watts),
            int(watts * 2.8),
            88.0,
            temp_c,
            round(moving_time_s * (watts / 250.0) * 0.9, 0),
            tmpl["bike"],
            0,
            0,
            0,
            f"demo_track_{act_id}.fit" if has_track else None,
            has_track,
            start_iso,
            DEMO_TAG,
            float(watts),
            float(norm_watts),
            temp_c,
            round(rng.uniform(2.5, 6.5), 1),
            rng.randint(40, 280),
            0.0,
        )
        all_activity_records.append(act_record)

        if has_track:
            pts = _generate_synthetic_track(
                activity_id=act_id,
                start_dt=ride_date,
                distance_m=dist_m,
                moving_time_s=moving_time_s,
                elevation_gain_m=float(tmpl["ele_m"]),
                avg_hr=float(hr_avg),
                avg_cadence=88.0,
                avg_power_w=float(watts),
                avg_temp_c=temp_c,
                route_seed=route_index,
            )
            trackpoint_records.extend(pts)
            route_index += 1

            # Laps für diese Tour vormerken
            lap_count = max(int(dist_km // 10), 1)
            lap_time = moving_time_s / lap_count
            lap_dist = dist_m / lap_count
            for lap_num in range(1, lap_count + 1):
                lap_records.append((
                    act_id,
                    lap_num,
                    start_iso,
                    lap_time,
                    lap_dist,
                    speed_ms,
                    speed_ms * 1.5,
                    hr_avg,
                    hr_max,
                    watts,
                    int(watts * 2.2),
                    88.0,
                    105,
                    tmpl["ele_m"] / lap_count,
                ))

        activity_count += 1
        current_day_offset += step_days

    # 1. Aktivitäten in DB schreiben (FK-Ziele zuerst)
    conn.executemany(
        """INSERT OR REPLACE INTO activities (
            id, name, activity_type, sport_type, start_date, start_date_local, timezone,
            distance_m, moving_time_s, elapsed_time_s, elevation_gain_m, elevation_loss_m,
            avg_speed_ms, max_speed_ms, avg_hr, max_hr, avg_power_w, max_power_w,
            avg_cadence, avg_temp_c, calories, bike_id, commute, trainer, manual,
            track_file, has_track, imported_at, smart_device, est_avg_power_w,
            est_norm_power_w, weather_temp_c, weather_wind_ms, weather_wind_deg, weather_precip_mm
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        all_activity_records,
    )

    # 2. Trackpoints in DB schreiben
    conn.executemany(
        """INSERT INTO track_points (
            activity_id, timestamp, lat, lon, altitude_m, distance_m, speed_ms, hr, power_w, cadence, temp_c, grade_pct
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        trackpoint_records,
    )

    # 3. Laps in DB schreiben
    conn.executemany(
        """INSERT OR IGNORE INTO laps
           (activity_id, lap_number, start_time, total_time_s, distance_m, avg_speed_ms, max_speed_ms, avg_hr, max_hr, avg_power_w, max_power_w, avg_cadence, max_cadence, elevation_gain_m)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        lap_records,
    )

    # 7. Eigene Strecken-Abschnitte (Custom Segments) & Segment Efforts
    # Segment 1: Steigung Rollesbroich (1.4 km)
    conn.execute("""
        INSERT OR IGNORE INTO custom_segments (id, name, source_activity_id, distance_m, points, created_at)
        VALUES (1, 'Rollesbroich Panorama Climb', 900000, 1420.0, '[]', datetime('now'))
    """)
    # Segment 2: Rursee Sprint (850 m)
    conn.execute("""
        INSERT OR IGNORE INTO custom_segments (id, name, source_activity_id, distance_m, points, created_at)
        VALUES (2, 'Rursee Ufer Sprint', 900000, 850.0, '[]', datetime('now'))
    """)

    # 3-5 Treffer für die Segmente aus den Aktivitäten
    for i in range(min(5, activity_count)):
        aid = act_id_base + i
        conn.execute("""
            INSERT OR IGNORE INTO custom_segment_efforts
            (segment_id, activity_id, time_s, avg_speed_kmh, avg_hr, avg_power_w, norm_power_w, match_pct, created_at)
            VALUES (1, ?, ?, ?, ?, ?, ?, 98.5, datetime('now'))
        """, (aid, 210.0 + i * 8.0, 24.3 - i * 0.8, 168 - i * 2, 280 - i * 10, 295 - i * 10))

        conn.execute("""
            INSERT OR IGNORE INTO custom_segment_efforts
            (segment_id, activity_id, time_s, avg_speed_kmh, avg_hr, avg_power_w, norm_power_w, match_pct, created_at)
            VALUES (2, ?, ?, ?, ?, ?, ?, 99.0, datetime('now'))
        """, (aid, 78.0 + i * 3.5, 39.2 - i * 1.1, 172 - i * 2, 340 - i * 15, 355 - i * 15))

    # 8. PR Events (Persönliche Rekorde für Dashboard-Widget)
    pr_distances = [(5.0, 540.0, 33.3), (10.0, 1140.0, 31.6), (20.0, 2420.0, 29.8), (50.0, 6300.0, 28.6)]
    for dist_km, time_s, speed_kmh in pr_distances:
        conn.execute("""
            INSERT OR IGNORE INTO pr_events (distance_km, best_time_s, best_speed_kmh, activity_id, activity_name, previous_time_s, created_at)
            VALUES (?, ?, ?, 900000, 'Intervalle am Mergelland', ?, datetime('now'))
        """, (dist_km, time_s, speed_kmh, time_s + 45.0))

    # 9. Workouts & Krafttraining (other_activities)
    workout_dates = [now - timedelta(days=d) for d in range(10, days_back, 24)]
    for idx, wdate in enumerate(workout_dates):
        wid = 800000 + idx
        w_iso = wdate.strftime("%Y-%m-%dT18:00:00")
        conn.execute("""
            INSERT OR REPLACE INTO other_activities (
                id, name, sport_type, start_date_local, moving_time_s, elapsed_time_s,
                avg_hr, max_hr, min_hr, avg_cadence, max_cadence, training_effect,
                anaerobic_training_effect, calories, imported_at
            ) VALUES (?, 'Core & Stabi für Radsportler', 'strength_training', ?, 2700, 2850, 124.0, 152, 78, 0, 0, 2.4, 0.4, 310.0, ?)
        """, (wid, w_iso, w_iso))

    conn.commit()

    return {
        "activities": len(all_activity_records),
        "track_points": len(trackpoint_records),
        "bikes": len(bikes),
        "components": len(components),
        "workouts": len(workout_dates),
    }


def main():
    parser = argparse.ArgumentParser(description="WattLoom Demo Data Generator")
    parser.add_argument("--output", "-o", type=Path, default=None, help="Zielpfad für die generierte SQLite-Datenbank")
    parser.add_argument("--months", "-m", type=int, default=14, help="Anzahl der Monate in die Vergangenheit (Default: 14)")
    parser.add_argument("--force", "-f", action="store_true", help="Überschreibt auch nicht-leere Datenbanken")
    args = parser.parse_args()

    # resolve(): _is_untouched_db() baut eine file-URI, die nur absolute Pfade erlaubt
    target_db = (args.output or DB_PATH).resolve()
    target_db.parent.mkdir(parents=True, exist_ok=True)

    if target_db.exists() and not args.force:
        if not _is_untouched_db(target_db):
            print(f"WARNUNG: Die Zieldatenbank '{target_db}' enthält bereits Nutzerdaten!")
            print("Verwende --force, um diese mit Demodaten zu überschreiben, oder wähle einen anderen Pfad mit --output.")
            sys.exit(1)

    print(f"Erzeuge Demo-Daten in '{target_db}' ({args.months} Monate Historie)...")
    conn = sqlite3.connect(target_db)
    conn.row_factory = sqlite3.Row
    try:
        stats = seed_demo_data(conn, months=args.months)
        print("Erfolgreich abgeschlossen!")
        print(f"  - Aktivitäten:   {stats['activities']}")
        print(f"  - Trackpunkte:   {stats['track_points']}")
        print(f"  - Fahrräder:     {stats['bikes']}")
        print(f"  - Komponenten:   {stats['components']}")
        print(f"  - Workouts:      {stats['workouts']}")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
