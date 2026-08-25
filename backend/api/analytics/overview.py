from fastapi import APIRouter, Query
from backend.database import db_connection
from backend.utils import MS_TO_KMH
from ._shared import RIDE_TYPES

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/time-heatmap")
def time_heatmap(year: int = Query(None), tz_offset: int = Query(None, ge=-14, le=14)):
    """
    Trainingsminuten + Anzahl pro Wochentag (0=Mo … 6=So) und Stunde (0–23),
    getrennt nach Radtouren (activities) und Workouts (other_activities).
    tz_offset: Stunden-Versatz gegenüber UTC (z.B. 2 für CEST).
    Fehlt der Parameter, wird tz_offset aus der config-Tabelle gelesen.
    """
    with db_connection() as conn:
        # Offset bestimmen: Query-Parameter hat Vorrang, sonst aus config
        if tz_offset is None:
            row = conn.execute("SELECT value FROM config WHERE key = 'tz_offset'").fetchone()
            tz_offset = int(row["value"]) if row else 0

        # SQLite-Modifier für den Stundenversatz
        offset_modifier = f"'{tz_offset:+d} hours'" if tz_offset != 0 else "'+0 hours'"

        def fetch(table: str) -> dict[tuple[int, int], tuple[int, float]]:
            year_filter = ""
            params: list = []
            if year:
                year_filter = "AND strftime('%Y', datetime(start_date_local, " + offset_modifier + ")) = ?"
                params.append(str(year))

            rows = conn.execute(
                f"""
                SELECT
                    (CAST(strftime('%w', datetime(start_date_local, {offset_modifier})) AS INTEGER) + 6) % 7 AS weekday,
                    CAST(strftime('%H', datetime(start_date_local, {offset_modifier})) AS INTEGER) AS hour,
                    COUNT(*) AS count,
                    COALESCE(SUM(moving_time_s), 0) AS total_s
                FROM {table}
                WHERE strftime('%Y', start_date_local) >= '2000'
                {year_filter}
                GROUP BY weekday, hour
                """,
                params,
            ).fetchall()
            return {(r["weekday"], r["hour"]): (r["count"], r["total_s"]) for r in rows}

        rides = fetch("activities")
        workouts = fetch("other_activities")

        cells = []
        for wd in range(7):
            for h in range(24):
                ride_count, ride_s = rides.get((wd, h), (0, 0))
                workout_count, workout_s = workouts.get((wd, h), (0, 0))
                if ride_count or workout_count:
                    cells.append({
                        "weekday": wd, "hour": h,
                        "ride_count": ride_count, "ride_minutes": round(ride_s / 60),
                        "workout_count": workout_count, "workout_minutes": round(workout_s / 60),
                    })

        return {"cells": cells}


@router.get("/speed-hr")
def speed_hr():
    """Alle Aktivitäten mit Geschwindigkeit + HR für Scatter-Plot."""
    with db_connection() as conn:
        rows = conn.execute(
            """
            SELECT
                CAST(strftime('%Y', start_date) AS INTEGER) AS year,
                strftime('%Y-%m', start_date)               AS month,
                ROUND(avg_speed_ms * 3.6, 1)               AS speed_kmh,
                ROUND(avg_hr, 0)                            AS hr,
                ROUND(distance_m / 1000.0, 1)              AS dist_km
            FROM activities
            WHERE avg_speed_ms IS NOT NULL AND avg_hr IS NOT NULL
              AND avg_speed_ms > 3 AND avg_hr > 0
              AND strftime('%Y', start_date) >= '2000'
            ORDER BY start_date
            """,
        ).fetchall()
        return {
            "points": [
                {"year": r["year"], "month": r["month"], "speed_kmh": r["speed_kmh"], "hr": r["hr"], "dist_km": r["dist_km"]}
                for r in rows
            ]
        }


@router.get("/year-progress")
def year_progress():
    """Kumulierte km pro Jahr, als sparse [doy, cumKm]-Liste."""
    from collections import defaultdict
    with db_connection() as conn:
        rows = conn.execute(
            """
            SELECT
                CAST(strftime('%Y', start_date_local) AS INTEGER) AS year,
                CAST(strftime('%j', start_date_local) AS INTEGER) AS doy,
                SUM(distance_m) / 1000.0 AS km
            FROM activities
            WHERE distance_m > 0
            GROUP BY year, doy
            ORDER BY year, doy
            """
        ).fetchall()

    yearly: dict[int, list] = defaultdict(list)
    for r in rows:
        yearly[int(r["year"])].append((int(r["doy"]), float(r["km"])))

    result = {}
    for year, pts in yearly.items():
        if year < 2000:
            continue
        cum = 0.0
        cumpts: list[list] = []
        for doy, km in sorted(pts):
            cum += km
            cumpts.append([doy, round(cum, 1)])
        result[str(year)] = cumpts

    return {"years": result}


@router.get("/temp-correlation")
def temp_correlation():
    """Temperatur vs. Speed und HR – Quelle: Open-Meteo weather_temp_c je Aktivität."""
    with db_connection() as conn:
        rows = conn.execute("""
            SELECT
                ROUND(a.weather_temp_c, 1)                          AS temp_c,
                ROUND(a.avg_speed_ms * 3.6, 1)                      AS speed_kmh,
                ROUND(a.avg_hr, 0)                                   AS hr,
                CAST(strftime('%Y', a.start_date_local) AS INTEGER)  AS year,
                ROUND(a.distance_m / 1000.0, 1)                     AS dist_km
            FROM activities a
            WHERE a.weather_temp_c IS NOT NULL
              AND a.avg_speed_ms IS NOT NULL AND a.avg_speed_ms > 3
              AND a.avg_hr IS NOT NULL
              AND strftime('%Y', a.start_date_local) >= '2000'
            ORDER BY a.start_date_local
        """).fetchall()
        return {
            "points": [
                {"temp_c": r["temp_c"], "speed_kmh": r["speed_kmh"],
                 "hr": r["hr"], "year": r["year"], "dist_km": r["dist_km"]}
                for r in rows
            ]
        }


@router.get("/wind-impact")
def wind_impact():
    """Windstärke vs. Speed und HR – Quelle: Open-Meteo weather_wind_ms je Aktivität."""
    with db_connection() as conn:
        rows = conn.execute("""
            SELECT
                ROUND(a.weather_wind_ms, 2)                         AS wind_ms,
                ROUND(a.avg_speed_ms * 3.6, 1)                      AS speed_kmh,
                ROUND(a.avg_hr, 0)                                   AS hr,
                ROUND(a.distance_m / 1000.0, 1)                     AS dist_km
            FROM activities a
            WHERE a.weather_wind_ms IS NOT NULL
              AND a.avg_speed_ms IS NOT NULL AND a.avg_speed_ms > 3
              AND a.avg_hr IS NOT NULL
            ORDER BY a.start_date_local
        """).fetchall()
        return {
            "points": [
                {"wind_ms": r["wind_ms"], "speed_kmh": r["speed_kmh"],
                 "hr": r["hr"], "dist_km": r["dist_km"]}
                for r in rows
            ]
        }


@router.get("/weekly-volume")
def weekly_volume(weeks: int = Query(52)):
    """
    Trainingsminuten je Woche, aufgeschlüsselt nach Aktivitätstyp.
    Wochenbeginn = Montag; aktuelle Woche = weeks_ago=0.
    """
    from datetime import date as Date, timedelta

    with db_connection() as conn:
        today = Date.today()
        # Montag der aktuellen Woche
        monday = today - timedelta(days=today.weekday())
        result = []

        for i in range(weeks - 1, -1, -1):
            week_start = monday - timedelta(weeks=i)
            week_end = week_start + timedelta(days=6)
            ws = week_start.isoformat()
            we = week_end.isoformat()

            ride_s = conn.execute("""
                SELECT COALESCE(SUM(moving_time_s), 0)
                FROM activities
                WHERE date(start_date_local) BETWEEN ? AND ?
            """, (ws, we)).fetchone()[0]

            other = conn.execute("""
                SELECT sport_type, COALESCE(SUM(moving_time_s), 0) AS total_s
                FROM other_activities
                WHERE date(start_date_local) BETWEEN ? AND ?
                GROUP BY sport_type
            """, (ws, we)).fetchall()

            # sport_type ist seit der i18n-Migration ein kanonischer Code (sport_codes.py)
            weight_s  = sum(r["total_s"] for r in other if r["sport_type"] == "strength_training")
            workout_s = sum(r["total_s"] for r in other if r["sport_type"] != "strength_training")
            result.append({
                "week_start": ws,
                "weeks_ago": i,
                "ride_minutes": round(ride_s / 60),
                "workout_minutes": round(workout_s / 60),
                "weight_training_minutes": round(weight_s / 60),
            })

        return result


@router.get("/wrapped")
def get_wrapped(year: int = None, tz_offset: int = Query(None, ge=-14, le=14)):
    from datetime import datetime, timedelta

    # RIDE_TYPES: siehe _shared.py
    placeholders = ','.join('?' * len(RIDE_TYPES))

    with db_connection() as conn:
        years_rows = conn.execute(
            f"""
            SELECT DISTINCT CAST(strftime('%Y', start_date_local) AS INTEGER) AS y
            FROM activities
            WHERE activity_type IN ({placeholders})
              AND strftime('%Y', start_date_local) >= '2000'
            ORDER BY y
            """,
            RIDE_TYPES,
        ).fetchall()
        available_years = [r["y"] for r in years_rows]

        if not available_years:
            return {"year": None, "available_years": [], "totals": {}}

        if year is None:
            year = available_years[-1]

        # Timezone-Offset: Query-Parameter hat Vorrang, sonst aus config, sonst 0
        if tz_offset is None:
            tz_row = conn.execute("SELECT value FROM config WHERE key = 'tz_offset'").fetchone()
            tz_offset = int(tz_row["value"]) if tz_row else 0
        tz_mod = f"'{tz_offset:+d} hours'" if tz_offset != 0 else "'+0 hours'"

        def fetch_year_totals(y):
            return conn.execute(
                f"""
                SELECT
                    COUNT(*) AS rides,
                    SUM(distance_m) / 1000.0 AS distance_km,
                    SUM(moving_time_s) / 3600.0 AS moving_hours,
                    SUM(elevation_gain_m or 0) AS elevation_m,
                    SUM(calories or 0) AS calories
                FROM activities
                WHERE activity_type IN ({placeholders})
                  AND CAST(strftime('%Y', start_date_local) AS INTEGER) = ?
                """,
                (*RIDE_TYPES, y),
            ).fetchone()

        cur_totals = fetch_year_totals(year)
        totals = {
            "rides": cur_totals["rides"] or 0,
            "distance_km": round(cur_totals["distance_km"] or 0, 1),
            "moving_hours": round(cur_totals["moving_hours"] or 0, 1),
            "elevation_m": round(cur_totals["elevation_m"] or 0, 1),
            "calories": round(cur_totals["calories"] or 0, 1),
        }

        prev = fetch_year_totals(year - 1) if (year - 1) in available_years else None
        if prev and prev["rides"]:
            def pct(a, b):
                return round((a - b) / b * 100, 1) if b else None
            vs_prev_year = {
                "rides_pct": pct(totals["rides"], prev["rides"]),
                "distance_pct": pct(totals["distance_km"], round((prev["distance_km"] or 0), 1)),
            }
        else:
            vs_prev_year = None

        best_ride_row = conn.execute(
            f"""
            SELECT id, name, start_date_local, distance_m, moving_time_s
            FROM activities
            WHERE activity_type IN ({placeholders})
              AND CAST(strftime('%Y', start_date_local) AS INTEGER) = ?
            ORDER BY distance_m DESC LIMIT 1
            """,
            (*RIDE_TYPES, year),
        ).fetchone()
        best_ride = {
            "id": best_ride_row["id"],
            "name": best_ride_row["name"],
            "date": best_ride_row["start_date_local"],
            "distance_km": round((best_ride_row["distance_m"] or 0) / 1000, 1),
            "moving_time_s": best_ride_row["moving_time_s"],
        } if best_ride_row else None

        elev_row = conn.execute(
            f"""
            SELECT id, name, start_date_local, elevation_gain_m, distance_m
            FROM activities
            WHERE activity_type IN ({placeholders})
              AND CAST(strftime('%Y', start_date_local) AS INTEGER) = ?
              AND elevation_gain_m IS NOT NULL
            ORDER BY elevation_gain_m DESC LIMIT 1
            """,
            (*RIDE_TYPES, year),
        ).fetchone()
        most_elevation_ride = {
            "id": elev_row["id"],
            "name": elev_row["name"],
            "date": elev_row["start_date_local"],
            "elevation_m": round(elev_row["elevation_gain_m"] or 0, 1),
            "distance_km": round((elev_row["distance_m"] or 0) / 1000, 1),
        } if elev_row else None

        fast_row = conn.execute(
            f"""
            SELECT id, name, start_date_local, avg_speed_ms, distance_m
            FROM activities
            WHERE activity_type IN ({placeholders})
              AND CAST(strftime('%Y', start_date_local) AS INTEGER) = ?
              AND avg_speed_ms IS NOT NULL AND distance_m >= 10000
            ORDER BY avg_speed_ms DESC LIMIT 1
            """,
            (*RIDE_TYPES, year),
        ).fetchone()
        fastest_ride = {
            "id": fast_row["id"],
            "name": fast_row["name"],
            "date": fast_row["start_date_local"],
            "avg_speed_kmh": round((fast_row["avg_speed_ms"] or 0) * MS_TO_KMH, 1),
            "distance_km": round((fast_row["distance_m"] or 0) / 1000, 1),
        } if fast_row else None

        month_row = conn.execute(
            f"""
            SELECT
                CAST(strftime('%m', start_date_local) AS INTEGER) AS month,
                SUM(distance_m) / 1000.0 AS distance_km,
                COUNT(*) AS rides
            FROM activities
            WHERE activity_type IN ({placeholders})
              AND CAST(strftime('%Y', start_date_local) AS INTEGER) = ?
            GROUP BY month
            ORDER BY distance_km DESC LIMIT 1
            """,
            (*RIDE_TYPES, year),
        ).fetchone()
        best_month = {
            "month": month_row["month"],
            "distance_km": round(month_row["distance_km"] or 0, 1),
            "rides": month_row["rides"],
        } if month_row else None

        # Montag der Woche via SQLite: 'weekday 1' springt auf den nächsten Dienstag,
        # dann '-7 days' oder einfacher: 'weekday 0' springt auf Sonntag, dann '-6 days' = Montag
        week_row = conn.execute(
            f"""
            SELECT
                date(start_date_local, 'weekday 0', '-6 days') AS week_start,
                SUM(distance_m) / 1000.0 AS distance_km,
                COUNT(*) AS rides
            FROM activities
            WHERE activity_type IN ({placeholders})
              AND CAST(strftime('%Y', start_date_local) AS INTEGER) = ?
            GROUP BY week_start
            ORDER BY distance_km DESC LIMIT 1
            """,
            (*RIDE_TYPES, year),
        ).fetchone()
        best_week = {
            "week_start": week_row["week_start"],
            "distance_km": round(week_row["distance_km"] or 0, 1),
            "rides": week_row["rides"],
        } if week_row else None

        day_rows = conn.execute(
            f"""
            SELECT DISTINCT date(start_date_local) AS d
            FROM activities
            WHERE activity_type IN ({placeholders})
              AND CAST(strftime('%Y', start_date_local) AS INTEGER) = ?
            ORDER BY d
            """,
            (*RIDE_TYPES, year),
        ).fetchall()
        ride_days = [r["d"] for r in day_rows]

        longest_streak = {"days": 0, "from": None, "to": None}
        if ride_days:
            best_len = 1
            best_start = ride_days[0]
            best_end = ride_days[0]
            cur_len = 1
            cur_start = ride_days[0]

            for i in range(1, len(ride_days)):
                prev_d = datetime.fromisoformat(ride_days[i - 1])
                this_d = datetime.fromisoformat(ride_days[i])
                if (this_d - prev_d).days == 1:
                    cur_len += 1
                else:
                    if cur_len > best_len:
                        best_len = cur_len
                        best_start = cur_start
                        best_end = ride_days[i - 1]
                    cur_len = 1
                    cur_start = ride_days[i]

            if cur_len > best_len:
                best_len = cur_len
                best_start = cur_start
                best_end = ride_days[-1]

            longest_streak = {"days": best_len, "from": best_start, "to": best_end}

        # SQLite %w: 0=Sonntag → (w+6)%7 ergibt 0=Montag; Timezone-Offset anwenden
        wd_rows = conn.execute(
            f"""
            SELECT
                (CAST(strftime('%w', datetime(start_date_local, {tz_mod})) AS INTEGER) + 6) % 7 AS wd,
                COUNT(*) AS cnt
            FROM activities
            WHERE activity_type IN ({placeholders})
              AND CAST(strftime('%Y', datetime(start_date_local, {tz_mod})) AS INTEGER) = ?
            GROUP BY wd
            """,
            (*RIDE_TYPES, year),
        ).fetchall()
        rides_by_weekday = [0] * 7
        for r in wd_rows:
            rides_by_weekday[r["wd"]] = r["cnt"]

        hr_rows = conn.execute(
            f"""
            SELECT
                CAST(strftime('%H', datetime(start_date_local, {tz_mod})) AS INTEGER) AS hr,
                COUNT(*) AS cnt
            FROM activities
            WHERE activity_type IN ({placeholders})
              AND CAST(strftime('%Y', datetime(start_date_local, {tz_mod})) AS INTEGER) = ?
            GROUP BY hr
            """,
            (*RIDE_TYPES, year),
        ).fetchall()
        rides_by_hour = [0] * 24
        for r in hr_rows:
            rides_by_hour[r["hr"]] = r["cnt"]

        bike_row = conn.execute(
            f"""
            SELECT
                a.bike_id,
                b.name,
                COUNT(*) AS rides,
                SUM(a.distance_m) / 1000.0 AS distance_km
            FROM activities a
            LEFT JOIN bikes b ON b.id = a.bike_id
            WHERE a.activity_type IN ({placeholders})
              AND CAST(strftime('%Y', a.start_date_local) AS INTEGER) = ?
              AND a.bike_id IS NOT NULL
            GROUP BY a.bike_id
            ORDER BY rides DESC LIMIT 1
            """,
            (*RIDE_TYPES, year),
        ).fetchone()
        favorite_bike = {
            "id": bike_row["bike_id"],
            "name": bike_row["name"],
            "rides": bike_row["rides"],
            "distance_km": round(bike_row["distance_km"] or 0, 1),
        } if bike_row else None

        monthly_rows = conn.execute(
            f"""
            SELECT
                CAST(strftime('%m', start_date_local) AS INTEGER) AS m,
                SUM(distance_m) / 1000.0 AS km
            FROM activities
            WHERE activity_type IN ({placeholders})
              AND CAST(strftime('%Y', start_date_local) AS INTEGER) = ?
            GROUP BY m
            """,
            (*RIDE_TYPES, year),
        ).fetchall()
        monthly_km = [0.0] * 12
        for r in monthly_rows:
            monthly_km[r["m"] - 1] = round(r["km"] or 0, 1)

        return {
            "year": year,
            "available_years": available_years,
            "totals": totals,
            "vs_prev_year": vs_prev_year,
            "best_ride": best_ride,
            "most_elevation_ride": most_elevation_ride,
            "fastest_ride": fastest_ride,
            "best_month": best_month,
            "best_week": best_week,
            "longest_streak": longest_streak,
            "rides_by_weekday": rides_by_weekday,
            "rides_by_hour": rides_by_hour,
            "favorite_bike": favorite_bike,
            "monthly_km": monthly_km,
        }


DURATIONS = [60, 300, 600, 1200, 3600]  # 1min, 5min, 10min, 20min, 60min


@router.get("/hr-curve")
def hr_curve(year: int = Query(None, description="Optional: nur dieses Jahr")):
    """
    Beste Durchschnitts-HR für definierte Zeitfenster (als Sekunden-Punkte).
    Nutzt alle Aktivitäten mit HR-Track-Daten; mit year-Filter nur die des Jahres.
    """
    year_filter = ""
    params: list = []
    if year:
        year_filter = """
            JOIN activities a ON tp.activity_id = a.id
            WHERE strftime('%Y', a.start_date) = ?
              AND tp.hr IS NOT NULL AND tp.hr > 0
        """
        params.append(str(year))
    else:
        year_filter = "WHERE tp.hr IS NOT NULL AND tp.hr > 0"

    with db_connection() as conn:
        activity_ids = conn.execute(
            f"""
            SELECT DISTINCT tp.activity_id
            FROM track_points tp
            {year_filter}
            """,
            params,
        ).fetchall()

        best: dict[int, float] = {d: 0.0 for d in DURATIONS}

        for row in activity_ids:
            aid = row["activity_id"]
            hr_vals = conn.execute(
                "SELECT hr FROM track_points WHERE activity_id = ? AND hr IS NOT NULL AND hr > 0 ORDER BY id",
                (aid,),
            ).fetchall()
            vals = [r["hr"] for r in hr_vals]
            n = len(vals)

            for dur in DURATIONS:
                if n < dur:
                    continue
                # Sliding-Window-Summe
                window_sum = sum(vals[:dur])
                best_sum = window_sum
                for i in range(dur, n):
                    window_sum += vals[i] - vals[i - dur]
                    if window_sum > best_sum:
                        best_sum = window_sum
                avg = best_sum / dur
                if avg > best[dur]:
                    best[dur] = avg

        return {
            "durations_s": DURATIONS,
            "labels": ["1 min", "5 min", "10 min", "20 min", "60 min"],
            "best_hr": [round(best[d], 1) for d in DURATIONS],
        }


@router.get("/cadence")
def cadence_analysis(year: int = Query(None)):
    """
    Cadence-Analyse: Statistiken, Verteilung, Monats-Aggregat, Zonen und Effizienz-Buckets.
    cadence = 0 oder NULL wird überall ignoriert (echte Pausen, kein Signal).
    """
    with db_connection() as conn:
        # Jahresfilter: JOIN auf activities + strftime-Filter
        year_join  = ""
        year_where = "WHERE tp.cadence IS NOT NULL AND tp.cadence > 0"
        params_stats: list = []

        if year:
            year_join  = "JOIN activities a ON a.id = tp.activity_id"
            year_where = (
                "WHERE tp.cadence IS NOT NULL AND tp.cadence > 0"
                " AND strftime('%Y', a.start_date_local) = ?"
            )
            params_stats = [str(year)]

        # --- Globale Statistiken ---
        stats_row = conn.execute(
            f"""
            SELECT
                COUNT(DISTINCT tp.activity_id)  AS rides_with_cadence,
                COUNT(*)                        AS total_points,
                ROUND(AVG(CAST(tp.cadence AS REAL)), 1) AS avg_cadence,
                MAX(tp.cadence)                 AS max_cadence
            FROM track_points tp
            {year_join}
            {year_where}
            """,
            params_stats,
        ).fetchone()

        # --- Verteilung: cadence 40–130 ---
        dist_rows = conn.execute(
            f"""
            SELECT tp.cadence AS cadence, COUNT(*) AS count
            FROM track_points tp
            {year_join}
            {year_where}
              AND tp.cadence BETWEEN 40 AND 130
            GROUP BY tp.cadence
            ORDER BY tp.cadence
            """,
            params_stats,
        ).fetchall()

        distribution = [{"cadence": r["cadence"], "count": r["count"]} for r in dist_rows]

        # mode_cadence: Wert mit MAX count in der Verteilung
        mode_cadence = max(distribution, key=lambda d: d["count"])["cadence"] if distribution else None

        # --- Monatliche Aggregation ---
        monthly_params: list = []
        monthly_year_join  = "JOIN activities a ON a.id = tp.activity_id"
        monthly_year_where = "WHERE tp.cadence IS NOT NULL AND tp.cadence > 0"

        if year:
            monthly_year_where += " AND strftime('%Y', a.start_date_local) = ?"
            monthly_params = [str(year)]

        monthly_rows = conn.execute(
            f"""
            SELECT
                strftime('%Y-%m', a.start_date_local) AS month,
                ROUND(AVG(CAST(tp.cadence AS REAL)), 1) AS avg_cadence,
                COUNT(DISTINCT tp.activity_id) AS rides
            FROM track_points tp
            {monthly_year_join}
            {monthly_year_where}
            GROUP BY month
            ORDER BY month
            """,
            monthly_params,
        ).fetchall()

        monthly = [
            {"month": r["month"], "avg_cadence": r["avg_cadence"], "rides": r["rides"]}
            for r in monthly_rows
        ]

        # --- Cadence-Zonen ---
        ZONES = [
            {"name": "Schleppen", "min":   0, "max":  59},
            {"name": "Niedrig",   "min":  60, "max":  69},
            {"name": "Moderat",   "min":  70, "max":  79},
            {"name": "Optimal",   "min":  80, "max":  89},
            {"name": "Hoch",      "min":  90, "max":  99},
            {"name": "Sprint",    "min": 100, "max": 999},
        ]

        zones_result = []
        for z in ZONES:
            row = conn.execute(
                f"""
                SELECT COUNT(*) AS count
                FROM track_points tp
                {year_join}
                {year_where}
                  AND tp.cadence BETWEEN ? AND ?
                """,
                params_stats + [z["min"] if z["min"] > 0 else 1, z["max"]],
            ).fetchone()
            zones_result.append({
                "name":  z["name"],
                "min":   z["min"],
                "max":   z["max"],
                "count": row["count"] if row else 0,
            })

        # --- Effizienz-Buckets: cadence in 5er-Gruppen ---
        eff_rows = conn.execute(
            f"""
            SELECT
                (tp.cadence / 5) * 5 + 2 AS cadence_mid,
                ROUND(AVG(tp.speed_ms) * 3.6, 2) AS avg_speed_kmh,
                ROUND(AVG(CAST(tp.hr AS REAL)), 1) AS avg_hr,
                COUNT(*) AS count
            FROM track_points tp
            {year_join}
            {year_where}
              AND tp.hr IS NOT NULL AND tp.hr > 0
              AND tp.speed_ms IS NOT NULL AND tp.speed_ms > 0
            GROUP BY cadence_mid
            HAVING COUNT(*) >= 100
            ORDER BY cadence_mid
            """,
            params_stats,
        ).fetchall()

        efficiency = [
            {
                "cadence_mid":   r["cadence_mid"],
                "avg_speed_kmh": r["avg_speed_kmh"],
                "avg_hr":        r["avg_hr"],
                "count":         r["count"],
            }
            for r in eff_rows
        ]

        return {
            "stats": {
                "rides_with_cadence": stats_row["rides_with_cadence"] if stats_row else 0,
                "total_points":       stats_row["total_points"]       if stats_row else 0,
                "avg_cadence":        stats_row["avg_cadence"]        if stats_row else None,
                "max_cadence":        stats_row["max_cadence"]        if stats_row else None,
                "mode_cadence":       mode_cadence,
            },
            "distribution": distribution,
            "monthly":      monthly,
            "zones":        zones_result,
            "efficiency":   efficiency,
        }


@router.get("/calories")
def calories(year: int = Query(None)):
    """Kalorien-Auswertung: KPIs, Monatsverlauf, Jahresvergleich – Radtouren + Workouts."""
    with db_connection() as conn:
        ride_filter = "WHERE calories IS NOT NULL AND calories > 0"
        oa_filter   = "WHERE calories IS NOT NULL AND calories > 0"
        params: list = []
        if year:
            ride_filter += " AND strftime('%Y', start_date_local) = ?"
            oa_filter   += " AND strftime('%Y', start_date_local) = ?"
            params.append(str(year))

        # Radtouren-KPIs
        ride_row = conn.execute(
            f"""
            SELECT
                ROUND(SUM(calories))                                           AS total_kcal,
                COUNT(*)                                                       AS rides,
                ROUND(AVG(calories))                                           AS avg_kcal,
                ROUND(SUM(calories) / NULLIF(SUM(moving_time_s), 0) * 3600)   AS kcal_per_hour
            FROM activities
            {ride_filter}
            """,
            params,
        ).fetchone()

        # Workout-KPIs (other_activities)
        oa_row = conn.execute(
            f"""
            SELECT
                ROUND(SUM(calories)) AS total_kcal,
                COUNT(*)             AS workouts,
                ROUND(AVG(calories)) AS avg_kcal
            FROM other_activities
            {oa_filter}
            """,
            params,
        ).fetchone()

        # Monatsverlauf: beide Quellen per UNION zusammengeführt
        monthly_rows = conn.execute(
            f"""
            SELECT
                month,
                ROUND(SUM(CASE WHEN src = 'rides'    THEN calories ELSE 0 END)) AS kcal,
                ROUND(SUM(CASE WHEN src = 'workouts' THEN calories ELSE 0 END)) AS kcal_workouts,
                COUNT(CASE WHEN src = 'rides'    THEN 1 END)                    AS rides,
                COUNT(CASE WHEN src = 'workouts' THEN 1 END)                    AS workouts,
                ROUND(AVG(CASE WHEN src = 'rides' THEN calories END))           AS avg_kcal
            FROM (
                SELECT strftime('%Y-%m', start_date_local) AS month,
                       calories, 'rides' AS src
                FROM activities {ride_filter}
                UNION ALL
                SELECT strftime('%Y-%m', start_date_local) AS month,
                       calories, 'workouts' AS src
                FROM other_activities {oa_filter}
            )
            GROUP BY month
            ORDER BY month
            """,
            params + params,
        ).fetchall()

        # Jahresvergleich: ebenfalls beide Quellen
        yearly_rows = conn.execute(
            """
            SELECT
                year,
                ROUND(SUM(CASE WHEN src = 'rides'    THEN calories ELSE 0 END)) AS kcal,
                ROUND(SUM(CASE WHEN src = 'workouts' THEN calories ELSE 0 END)) AS kcal_workouts,
                COUNT(CASE WHEN src = 'rides'    THEN 1 END)                    AS rides,
                COUNT(CASE WHEN src = 'workouts' THEN 1 END)                    AS workouts,
                ROUND(AVG(CASE WHEN src = 'rides' THEN calories END))           AS avg_kcal
            FROM (
                SELECT strftime('%Y', start_date_local) AS year,
                       calories, 'rides' AS src
                FROM activities
                WHERE calories IS NOT NULL AND calories > 0
                  AND strftime('%Y', start_date_local) >= '2022'
                UNION ALL
                SELECT strftime('%Y', start_date_local) AS year,
                       calories, 'workouts' AS src
                FROM other_activities
                WHERE calories IS NOT NULL AND calories > 0
                  AND strftime('%Y', start_date_local) >= '2022'
            )
            GROUP BY year
            ORDER BY year
            """,
        ).fetchall()

        return {
            "total_kcal":          ride_row["total_kcal"] or 0,
            "total_kcal_workouts": oa_row["total_kcal"] or 0,
            "rides":               ride_row["rides"] or 0,
            "workouts":            oa_row["workouts"] or 0,
            "avg_kcal":            ride_row["avg_kcal"] or 0,
            "avg_kcal_workouts":   oa_row["avg_kcal"],
            "kcal_per_hour":       ride_row["kcal_per_hour"],
            "monthly": [
                {
                    "month": r["month"], "kcal": r["kcal"] or 0,
                    "kcal_workouts": r["kcal_workouts"] or 0,
                    "rides": r["rides"], "workouts": r["workouts"],
                    "avg_kcal": r["avg_kcal"] or 0,
                }
                for r in monthly_rows
            ],
            "yearly": [
                {
                    "year": r["year"], "kcal": r["kcal"] or 0,
                    "kcal_workouts": r["kcal_workouts"] or 0,
                    "rides": r["rides"], "workouts": r["workouts"],
                    "avg_kcal": r["avg_kcal"] or 0,
                }
                for r in yearly_rows
            ],
        }


@router.get("/speed-trend")
def speed_trend():
    """
    Entwicklung der Durchschnittsgeschwindigkeit über alle Radtouren.
    Liefert: Rides-Liste (Scatter), Rolling-Average (20 Rides), Jahres-Aggregate, Monats-Heatmap.
    Nur Rides ≥ 5 km mit gültigem avg_speed_ms.
    """
    # RIDE_TYPES: siehe _shared.py
    MIN_DIST_M = 5000
    ROLLING_WINDOW = 20

    ph = ','.join('?' * len(RIDE_TYPES))

    with db_connection() as conn:
        rows = conn.execute(
            f"""
            SELECT
                id,
                name,
                start_date_local                                  AS date,
                ROUND(avg_speed_ms * 3.6, 1)                     AS speed_kmh,
                ROUND(distance_m / 1000.0, 1)                    AS dist_km,
                COALESCE(ROUND(elevation_gain_m), 0)             AS elevation_m,
                bike_id,
                CAST(strftime('%Y', start_date_local) AS INTEGER) AS year
            FROM activities
            WHERE avg_speed_ms IS NOT NULL
              AND avg_speed_ms > 0
              AND distance_m >= ?
              AND activity_type IN ({ph})
              AND strftime('%Y', start_date_local) >= '2000'
            ORDER BY start_date_local ASC
            """,
            (MIN_DIST_M, *RIDE_TYPES),
        ).fetchall()

    if not rows:
        return {
            "rides": [], "rolling": [], "by_year": [],
            "monthly_heatmap": [],
            "stats": {"total_rides": 0, "overall_avg_kmh": None, "best_kmh": None,
                      "best_ride_id": None, "best_ride_name": None, "best_ride_date": None,
                      "first_date": None, "last_date": None},
        }

    rides = [dict(r) for r in rows]

    # Rolling Average über ROLLING_WINDOW Rides
    rolling = []
    for i in range(ROLLING_WINDOW - 1, len(rides)):
        window = rides[i - ROLLING_WINDOW + 1 : i + 1]
        avg_spd = sum(r["speed_kmh"] for r in window) / ROLLING_WINDOW
        rolling.append({
            "date":        rides[i]["date"],
            "rolling_kmh": round(avg_spd, 2),
        })

    # Jahres-Aggregate: avg, best, median, rides, delta zum Vorjahr
    from collections import defaultdict
    year_map: dict[int, list[float]] = defaultdict(list)
    for r in rides:
        year_map[r["year"]].append(r["speed_kmh"])

    by_year = []
    prev_avg = None
    for year in sorted(year_map.keys()):
        vals   = year_map[year]
        avg    = sum(vals) / len(vals)
        best   = max(vals)
        sv     = sorted(vals)
        n      = len(sv)
        median = sv[n // 2] if n % 2 else (sv[n // 2 - 1] + sv[n // 2]) / 2
        delta  = round(avg - prev_avg, 2) if prev_avg is not None else None
        by_year.append({
            "year":       year,
            "avg_kmh":    round(avg, 2),
            "best_kmh":   round(best, 1),
            "median_kmh": round(median, 1),
            "rides":      n,
            "delta_kmh":  delta,
        })
        prev_avg = avg

    # Monatliche Heatmap: Ø-Speed je Kalendermonat
    month_map: dict[str, list[float]] = defaultdict(list)
    for r in rides:
        month_map[r["date"][:7]].append(r["speed_kmh"])

    monthly_heatmap = [
        {"month": month, "avg_kmh": round(sum(v) / len(v), 2), "rides": len(v)}
        for month, v in sorted(month_map.items())
    ]

    all_speeds = [r["speed_kmh"] for r in rides]
    overall_avg = sum(all_speeds) / len(all_speeds)
    fastest = max(rides, key=lambda r: r["speed_kmh"])

    return {
        "rides":           rides,
        "rolling":         rolling,
        "by_year":         by_year,
        "monthly_heatmap": monthly_heatmap,
        "stats": {
            "total_rides":     len(rides),
            "overall_avg_kmh": round(overall_avg, 2),
            "best_kmh":        round(max(all_speeds), 1),
            "best_ride_id":    fastest["id"],
            "best_ride_name":  fastest["name"],
            "best_ride_date":  fastest["date"],
            "first_date":      rides[0]["date"],
            "last_date":       rides[-1]["date"],
        },
    }


@router.get("/weekend-weekday")
def weekend_weekday(year: int = Query(None)):
    """
    Vergleich Werktag (Mo–Fr) vs. Wochenende (Sa–So).
    Liefert Ø-Kennzahlen, Rides-pro-Wochentag-Verteilung und Monatsverlauf.
    """
    year_filter = "AND strftime('%Y', start_date_local) >= '2000'"
    params: list = []
    if year:
        year_filter += " AND strftime('%Y', start_date_local) = ?"
        params.append(str(year))

    with db_connection() as conn:
        # Hauptvergleich: Werktag vs. Wochenende
        # SQLite: strftime('%w') → 0=So, 1=Mo … 6=Sa
        # Wochenende = 0 (So) oder 6 (Sa)
        summary = conn.execute(f"""
            SELECT
                CASE WHEN strftime('%w', start_date_local) IN ('0','6')
                     THEN 'weekend' ELSE 'weekday' END AS group_type,
                COUNT(*)                               AS rides,
                AVG(distance_m / 1000.0)               AS avg_km,
                AVG(avg_speed_ms * 3.6)                AS avg_kmh,
                AVG(elevation_gain_m)                  AS avg_elevation_m,
                AVG(avg_hr)                            AS avg_hr,
                SUM(distance_m / 1000.0)               AS total_km,
                AVG(moving_time_s / 60.0)              AS avg_duration_min,
                AVG(calories)                          AS avg_calories
            FROM activities
            WHERE distance_m > 0
              AND avg_speed_ms IS NOT NULL
              {year_filter}
            GROUP BY group_type
        """, params).fetchall()

        # Rides pro Wochentag (0=Mo … 6=So, umgerechnet aus SQLite-Format)
        by_weekday = conn.execute(f"""
            SELECT
                CASE strftime('%w', start_date_local)
                    WHEN '1' THEN 0 WHEN '2' THEN 1 WHEN '3' THEN 2
                    WHEN '4' THEN 3 WHEN '5' THEN 4 WHEN '6' THEN 5
                    WHEN '0' THEN 6 END AS weekday_idx,
                COUNT(*)               AS rides,
                AVG(distance_m / 1000.0) AS avg_km,
                AVG(avg_speed_ms * 3.6)  AS avg_kmh
            FROM activities
            WHERE distance_m > 0 {year_filter}
            GROUP BY weekday_idx
            ORDER BY weekday_idx
        """, params).fetchall()

        # Monatsverlauf: km Werktag vs. Wochenende
        monthly = conn.execute(f"""
            SELECT
                strftime('%Y-%m', start_date_local) AS month,
                SUM(CASE WHEN strftime('%w', start_date_local) IN ('0','6')
                         THEN distance_m / 1000.0 ELSE 0 END) AS weekend_km,
                SUM(CASE WHEN strftime('%w', start_date_local) NOT IN ('0','6')
                         THEN distance_m / 1000.0 ELSE 0 END) AS weekday_km,
                COUNT(CASE WHEN strftime('%w', start_date_local) IN ('0','6') THEN 1 END) AS weekend_rides,
                COUNT(CASE WHEN strftime('%w', start_date_local) NOT IN ('0','6') THEN 1 END) AS weekday_rides
            FROM activities
            WHERE distance_m > 0 {year_filter}
            GROUP BY month
            ORDER BY month
        """, params).fetchall()

    def rnd(v, n=1):
        return round(v, n) if v is not None else None

    summary_map = {}
    for r in summary:
        g = r["group_type"]
        summary_map[g] = {
            "rides":            r["rides"],
            "avg_km":           rnd(r["avg_km"]),
            "avg_kmh":          rnd(r["avg_kmh"]),
            "avg_elevation_m":  rnd(r["avg_elevation_m"], 0),
            "avg_hr":           rnd(r["avg_hr"], 0),
            "total_km":         rnd(r["total_km"], 0),
            "avg_duration_min": rnd(r["avg_duration_min"], 0),
            "avg_calories":     rnd(r["avg_calories"], 0),
        }

    return {
        "weekday": summary_map.get("weekday", {}),
        "weekend": summary_map.get("weekend", {}),
        "by_weekday": [
            {
                "weekday_idx": r["weekday_idx"],
                "rides":       r["rides"],
                "avg_km":      rnd(r["avg_km"]),
                "avg_kmh":     rnd(r["avg_kmh"]),
            }
            for r in by_weekday
        ],
        "monthly": [
            {
                "month":         r["month"],
                "weekend_km":    rnd(r["weekend_km"]),
                "weekday_km":    rnd(r["weekday_km"]),
                "weekend_rides": r["weekend_rides"],
                "weekday_rides": r["weekday_rides"],
            }
            for r in monthly
        ],
    }
