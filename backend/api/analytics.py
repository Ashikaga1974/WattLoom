from fastapi import APIRouter, Query
from backend.database import db_connection

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/time-heatmap")
def time_heatmap(year: int = Query(None), tz_offset: int = Query(None)):
    """
    Anzahl Aktivitäten pro Wochentag (0=Mo … 6=So) und Stunde (0–23).
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

        year_filter = ""
        params: list = []
        if year:
            year_filter = "WHERE strftime('%Y', datetime(start_date_local, " + offset_modifier + ")) = ?"
            params.append(str(year))

        rows = conn.execute(
            f"""
            SELECT
                (CAST(strftime('%w', datetime(start_date_local, {offset_modifier})) AS INTEGER) + 6) % 7 AS weekday,
                CAST(strftime('%H', datetime(start_date_local, {offset_modifier})) AS INTEGER) AS hour,
                COUNT(*) AS count
            FROM activities
            {year_filter}
            GROUP BY weekday, hour
            ORDER BY weekday, hour
            """,
            params,
        ).fetchall()

        return {"cells": [{"weekday": r["weekday"], "hour": r["hour"], "count": r["count"]} for r in rows]}


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


@router.get("/ftp")
def ftp_analysis():
    """
    FTP-Schätzung aus avg_power mit HR-Korrektur.
    Methode: avg_power × THRESHOLD_HR_RATIO / (avg_hr / global_max_hr)
    Extrapoliert die lineare Power/HR-Beziehung bis zur Schwellen-HR (~90 % HRmax).
    Fallback ohne HR-Daten: avg_power × FALLBACK_FACTOR.
    """
    # Schwellen-HR ≈ 90 % von HRmax; Fallback-Korrekturfaktor ohne HR
    THRESHOLD_HR_RATIO = 0.90 * 1.20   # +20 % Korrekturfaktor auf Schwellenwert
    FALLBACK_FACTOR    = 1.15  * 1.20
    # Nur Rides mit avg_hr > MIN_HR_RATIO × global_max_hr berücksichtigen
    # (sehr lockere Fahrten liefern unzuverlässige Extrapolationen)
    MIN_HR_RATIO       = 0.65

    with db_connection() as conn:
        # Globale Max-HR als robustere Basis (per-Ride-Max kann durch Sprint-Peaks verzerrt sein)
        max_hr_row = conn.execute("SELECT MAX(max_hr) AS v FROM activities WHERE max_hr > 0").fetchone()
        global_max_hr = max_hr_row["v"] if max_hr_row and max_hr_row["v"] else None

        def hr_expr(power_col: str = "avg_power_w") -> str:
            """SQL-Ausdruck für HR-korrigierte FTP-Schätzung."""
            if global_max_hr:
                return f"""
                    CASE
                        WHEN avg_hr > 0 AND avg_hr >= {MIN_HR_RATIO * global_max_hr:.1f}
                        THEN {power_col} * {THRESHOLD_HR_RATIO} / (avg_hr * 1.0 / {global_max_hr})
                        ELSE {power_col} * {FALLBACK_FACTOR}
                    END"""
            return f"{power_col} * {FALLBACK_FACTOR}"

        # Quartalsweise bester Schätzwert für 45–75-min-Fahrten
        trend = conn.execute(f"""
            SELECT
                strftime('%Y', start_date_local) AS year,
                ((CAST(strftime('%m', start_date_local) AS INTEGER) - 1) / 3 + 1) AS q,
                MAX({hr_expr()}) AS best_w
            FROM activities
            WHERE avg_power_w > 0 AND moving_time_s BETWEEN 2700 AND 4500
            GROUP BY year, q
            ORDER BY year, q
        """).fetchall()

        # Power-Profil: bester raw avg_power je Dauerkategorie (gemessene Werte, keine Schätzung)
        profile = conn.execute("""
            SELECT
                CASE
                    WHEN moving_time_s <  900  THEN 1
                    WHEN moving_time_s < 1800  THEN 2
                    WHEN moving_time_s < 3600  THEN 3
                    WHEN moving_time_s < 5400  THEN 4
                    WHEN moving_time_s < 10800 THEN 5
                    ELSE 6
                END AS bucket,
                MAX(avg_power_w) AS best_w,
                COUNT(*) AS cnt
            FROM activities
            WHERE avg_power_w > 0
            GROUP BY bucket
            ORDER BY bucket
        """).fetchall()

        # Aktuell (90 Tage): bester HR-korrigierter Schätzwert
        cur = conn.execute(f"""
            SELECT MAX({hr_expr()}) AS best_w
            FROM activities
            WHERE avg_power_w > 0 AND moving_time_s BETWEEN 2700 AND 4500
              AND start_date_local >= date('now', '-90 days')
        """).fetchone()

        # Bester HR-korrigierter Schätzwert aller Zeiten + Datum der Quell-Aktivität
        best = conn.execute(f"""
            SELECT {hr_expr()} AS est_w,
                   strftime('%Y-%m-%d', start_date_local) AS date
            FROM activities
            WHERE avg_power_w > 0 AND moving_time_s BETWEEN 2700 AND 4500
            ORDER BY est_w DESC
            LIMIT 1
        """).fetchone()

        LABELS = ['< 15 min', '15–30 min', '30–60 min', '60–90 min', '90–180 min', '> 180 min']
        return {
            "trend": [
                {"label": f"{r['year']}-Q{r['q']}", "best_w": round(r["best_w"], 1)}
                for r in trend if r["best_w"] is not None
            ],
            "profile": [
                {"label": LABELS[r["bucket"] - 1], "best_w": round(r["best_w"], 1), "count": r["cnt"]}
                for r in profile
            ],
            "current_ftp": round(cur["best_w"], 1) if cur and cur["best_w"] else None,
            "best_ever":   {"w": round(best["est_w"], 1), "date": best["date"]}
                           if best and best["est_w"] else None,
            "method": "hr_corrected" if global_max_hr else "fallback",
        }

@router.get("/pmc")
def performance_management_chart():
    """
    Performance Management Chart: CTL/ATL/TSB auf Basis von hrTSS.
    hrTSS = (moving_time_s / 3600) × (avg_hr / threshold_hr)² × 100
    threshold_hr = 0.85 × global_max_hr (Schwellen-HR ≈ 85 % HRmax)
    Fallback ohne HR-Daten: duration_h × 50 (moderate Intensität).
    other_activities (Workout, Weight Training) fließen ebenfalls mit hrTSS ein.
    """
    from collections import defaultdict
    from datetime import date as Date, timedelta

    with db_connection() as conn:
        max_hr_row = conn.execute(
            "SELECT MAX(max_hr) AS v FROM activities WHERE max_hr > 0"
        ).fetchone()
        global_max_hr = float(max_hr_row["v"]) if max_hr_row and max_hr_row["v"] else 185.0
        threshold_hr = 0.85 * global_max_hr

        rows = conn.execute("""
            SELECT
                strftime('%Y-%m-%d', start_date_local) AS date,
                moving_time_s,
                elapsed_time_s,
                avg_hr
            FROM activities
            WHERE strftime('%Y', start_date_local) >= '2000'
            ORDER BY start_date_local
        """).fetchall()

        # other_activities ebenfalls laden (Workout, Weight Training)
        other_rows = conn.execute("""
            SELECT
                strftime('%Y-%m-%d', start_date_local) AS date,
                moving_time_s,
                elapsed_time_s,
                avg_hr,
                sport_type
            FROM other_activities
            WHERE strftime('%Y', start_date_local) >= '2000'
            ORDER BY start_date_local
        """).fetchall()

    # Hilfsfunktion: hrTSS aus Duration und HR berechnen
    def calc_tss(duration_s, elapsed_s, hr) -> float:
        dur = duration_s or elapsed_s or 0
        if dur <= 0:
            return 0.0
        if hr and hr > 0:
            if_hr = hr / threshold_hr
            return (dur / 3600.0) * (if_hr ** 2) * 100.0
        return (dur / 3600.0) * 50.0

    daily_tss: dict[str, float] = defaultdict(float)
    for r in rows:
        daily_tss[r["date"]] += calc_tss(r["moving_time_s"], r["elapsed_time_s"], r["avg_hr"])

    # TSS aus other_activities addieren + pro Tag merken für das other-Feld
    daily_other: dict[str, list[dict]] = defaultdict(list)
    for r in other_rows:
        daily_tss[r["date"]] += calc_tss(r["moving_time_s"], r["elapsed_time_s"], r["avg_hr"])
        daily_other[r["date"]].append({
            "sport_type": r["sport_type"],
            "moving_time_s": r["moving_time_s"] or 0,
        })

    if not daily_tss:
        return {
            "days": [],
            "peak_ctl": None,
            "current": None,
            "max_hr": global_max_hr,
            "threshold_hr": round(threshold_hr, 1),
        }

    start = Date.fromisoformat(sorted(daily_tss.keys())[0])
    today = Date.today()

    # EMA-Faktoren: k = 2 / (N + 1)
    K_CTL = 2.0 / 43.0
    K_ATL = 2.0 / 8.0

    ctl = atl = 0.0
    peak_ctl = 0.0
    peak_ctl_date: str | None = None
    result: list[dict] = []

    cursor = start
    while cursor <= today:
        d = cursor.isoformat()
        tss = daily_tss.get(d, 0.0)
        ctl = ctl + K_CTL * (tss - ctl)
        atl = atl + K_ATL * (tss - atl)
        tsb = ctl - atl

        if ctl > peak_ctl:
            peak_ctl = ctl
            peak_ctl_date = d

        result.append({
            "date": d,
            "tss": round(tss, 1),
            "ctl": round(ctl, 1),
            "atl": round(atl, 1),
            "tsb": round(tsb, 1),
            "other": daily_other.get(d, []),
        })
        cursor += timedelta(days=1)

    return {
        "days": result,
        "peak_ctl": {"value": round(peak_ctl, 1), "date": peak_ctl_date},
        "current": result[-1] if result else None,
        "max_hr": global_max_hr,
        "threshold_hr": round(threshold_hr, 1),
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

            # Kraft-ähnliche Typen aus Strava und FIT-Import zusammenfassen
            _KRAFT = {"Weight Training", "Krafttraining", "Strength Training", "Fitness"}
            weight_s  = sum(r["total_s"] for r in other if r["sport_type"] in _KRAFT)
            workout_s = sum(r["total_s"] for r in other if r["sport_type"] not in _KRAFT)
            result.append({
                "week_start": ws,
                "weeks_ago": i,
                "ride_minutes": round(ride_s / 60),
                "workout_minutes": round(workout_s / 60),
                "weight_training_minutes": round(weight_s / 60),
            })

        return result


@router.get("/wrapped")
def get_wrapped(year: int = None, tz_offset: int = Query(None)):
    from datetime import datetime, timedelta

    RIDE_TYPES = ('Ride', 'VirtualRide', 'EBikeRide')
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
            "avg_speed_kmh": round((fast_row["avg_speed_ms"] or 0) * 3.6, 1),
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


@router.get("/best-by-distance")
def best_by_distance():
    """
    Für jedes Distanz-Bucket die schnellste Fahrt (höchste avg_speed_ms)
    innerhalb ±20 % Toleranz um den Zielwert.
    """
    BUCKETS_KM   = [1, 5, 10, 20, 30, 40, 50, 60]
    TOLERANCE    = 0.20
    RIDE_TYPES   = ('Ride', 'VirtualRide', 'EBikeRide')
    ph           = ','.join('?' * len(RIDE_TYPES))

    with db_connection() as conn:
        results = []

        for d_km in BUCKETS_KM:
            d_m  = d_km * 1000
            low  = d_m * (1 - TOLERANCE)
            high = d_m * (1 + TOLERANCE)

            row = conn.execute(f"""
                SELECT id, name, start_date_local AS date,
                       distance_m, moving_time_s, avg_speed_ms
                FROM activities
                WHERE activity_type IN ({ph})
                  AND distance_m BETWEEN ? AND ?
                  AND avg_speed_ms IS NOT NULL
                  AND moving_time_s > 0
                ORDER BY avg_speed_ms DESC
                LIMIT 1
            """, (*RIDE_TYPES, low, high)).fetchone()

            if row:
                results.append({
                    'distance_km':        d_km,
                    'best_speed_kmh':     round(row['avg_speed_ms'] * 3.6, 1),
                    'best_time_s':        row['moving_time_s'],
                    'activity_id':        row['id'],
                    'activity_name':      row['name'],
                    'date':               row['date'],
                    'actual_distance_km': round(row['distance_m'] / 1000, 1),
                })
            else:
                results.append({
                    'distance_km':        d_km,
                    'best_speed_kmh':     None,
                    'best_time_s':        None,
                    'activity_id':        None,
                    'activity_name':      None,
                    'date':               None,
                    'actual_distance_km': None,
                })

        return {'buckets': results}


@router.get("/route-clusters")
def route_clusters(min_rides: int = Query(3)):
    """
    Greedy-Clustering aller Rides nach Startpunkt (2 km Radius) + Distanz (±10 %)
    + Wegpunkte bei 25 %/50 %/75 % der Strecke (je ≤ 3 km Abstand).
    Gibt Cluster mit ≥ min_rides zurück, sortiert nach Ride-Anzahl.
    """
    import math

    RIDE_TYPES       = ('Ride', 'VirtualRide', 'EBikeRide')
    START_RADIUS_KM  = 2.0
    DIST_TOLERANCE   = 0.10  # ±10 % Distanztoleranz
    WP_RADIUS_KM     = 3.0   # Wegpunkt-Radius für 25 %/50 %/75 %-Checks

    def haversine(lat1, lon1, lat2, lon2):
        R = 6371.0
        dlat = math.radians(lat2 - lat1)
        dlon = math.radians(lon2 - lon1)
        a = (math.sin(dlat / 2) ** 2
             + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2))
             * math.sin(dlon / 2) ** 2)
        return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    ph = ','.join('?' * len(RIDE_TYPES))

    with db_connection() as conn:
        rows = conn.execute(f"""
            SELECT
                a.id, a.name,
                a.start_date_local AS date,
                a.distance_m, a.moving_time_s,
                a.avg_speed_ms, a.avg_hr, a.elevation_gain_m,
                tp.lat, tp.lon
            FROM activities a
            JOIN (
                SELECT tp2.activity_id, tp2.lat, tp2.lon
                FROM track_points tp2
                INNER JOIN (
                    SELECT activity_id, MIN(id) AS min_id
                    FROM track_points
                    WHERE lat IS NOT NULL AND lon IS NOT NULL
                    GROUP BY activity_id
                ) first ON tp2.activity_id = first.activity_id AND tp2.id = first.min_id
            ) tp ON tp.activity_id = a.id
            WHERE a.activity_type IN ({ph})
              AND a.distance_m > 0
              AND a.moving_time_s > 0
            ORDER BY a.start_date_local
        """, RIDE_TYPES).fetchall()

        # Track-Punkte bei 25 %, 50 % und 75 % der Streckendistanz je Aktivität.
        # ROW_NUMBER() OVER erfordert SQLite ≥ 3.25 (2018).
        wp_rows = conn.execute("""
            WITH fractions(frac) AS (
                VALUES (0.25) UNION ALL VALUES (0.5) UNION ALL VALUES (0.75)
            ),
            targets AS (
                SELECT tp.activity_id, f.frac,
                       MAX(tp.distance_m) * f.frac AS target
                FROM track_points tp
                CROSS JOIN fractions f
                WHERE tp.distance_m IS NOT NULL AND tp.distance_m > 0
                GROUP BY tp.activity_id, f.frac
            ),
            ranked AS (
                SELECT
                    tp.activity_id, t.frac, tp.lat, tp.lon,
                    ROW_NUMBER() OVER (
                        PARTITION BY tp.activity_id, t.frac
                        ORDER BY ABS(tp.distance_m - t.target)
                    ) AS rn
                FROM track_points tp
                JOIN targets t ON tp.activity_id = t.activity_id
                WHERE tp.lat IS NOT NULL AND tp.lon IS NOT NULL
                  AND tp.distance_m IS NOT NULL
            )
            SELECT activity_id, frac, lat, lon
            FROM ranked WHERE rn = 1
        """).fetchall()

    wp_map: dict = {}
    for r in wp_rows:
        wp_map.setdefault(r['activity_id'], {})[r['frac']] = (r['lat'], r['lon'])

    activities = [dict(r) for r in rows]
    for a in activities:
        wps = wp_map.get(a['id'], {})
        a['wp25'] = wps.get(0.25)
        a['wp50'] = wps.get(0.5)
        a['wp75'] = wps.get(0.75)

    clustered: set[int] = set()
    clusters = []

    for i, seed in enumerate(activities):
        if i in clustered:
            continue

        members = [i]
        clustered.add(i)
        d_ref = seed['distance_m']

        for j, cand in enumerate(activities):
            if j in clustered:
                continue
            # Distanztoleranz ±15 %
            if not (d_ref * (1 - DIST_TOLERANCE) <= cand['distance_m'] <= d_ref * (1 + DIST_TOLERANCE)):
                continue
            # Startpunkt-Radius 2 km
            if haversine(seed['lat'], seed['lon'], cand['lat'], cand['lon']) > START_RADIUS_KM:
                continue
            # Wegpunkt-Check: 25 %/50 %/75 % der Strecke müssen innerhalb WP_RADIUS_KM liegen.
            # for…else: else-Block nur wenn kein break ausgelöst wurde (alle Checks bestanden).
            for wp_key in ('wp25', 'wp50', 'wp75'):
                s_wp = seed[wp_key]
                c_wp = cand[wp_key]
                if s_wp is not None and c_wp is not None:
                    if haversine(s_wp[0], s_wp[1], c_wp[0], c_wp[1]) > WP_RADIUS_KM:
                        break
            else:
                members.append(j)
                clustered.add(j)

        if len(members) < min_rides:
            continue

        member_acts = sorted([activities[m] for m in members], key=lambda x: x['date'])

        times     = [a['moving_time_s'] for a in member_acts if a['moving_time_s']]
        best      = min(member_acts, key=lambda x: x['moving_time_s'])
        last      = member_acts[-1]
        avg_dist  = sum(a['distance_m'] for a in member_acts) / len(member_acts)
        avg_time  = sum(times) / len(times) if times else 0
        sp_vals   = [a['avg_speed_ms'] for a in member_acts if a['avg_speed_ms']]
        avg_speed = sum(sp_vals) / len(sp_vals) if sp_vals else None
        hr_vals   = [a['avg_hr'] for a in member_acts if a['avg_hr']]
        avg_hr    = sum(hr_vals) / len(hr_vals) if hr_vals else None

        # Repräsentativer Ride: nächster am Schwerpunkt der Startpunkte
        center_lat = sum(a['lat'] for a in member_acts) / len(member_acts)
        center_lon = sum(a['lon'] for a in member_acts) / len(member_acts)
        rep = min(member_acts, key=lambda a: haversine(a['lat'], a['lon'], center_lat, center_lon))

        # Zeittrend (s/Ride) aus linearer Regression über alle Rides
        n = len(member_acts)
        if n >= 3:
            xs     = list(range(n))
            ys     = [a['moving_time_s'] for a in member_acts]
            x_mean = sum(xs) / n
            y_mean = sum(ys) / n
            num    = sum((xs[k] - x_mean) * (ys[k] - y_mean) for k in range(n))
            den    = sum((xs[k] - x_mean) ** 2 for k in range(n))
            trend_slope = num / den if den != 0 else 0.0
        else:
            trend_slope = 0.0

        clusters.append({
            'ride_count':       len(member_acts),
            'avg_distance_m':   round(avg_dist),
            'best_time_s':      best['moving_time_s'],
            'best_time_id':     best['id'],
            'best_time_date':   best['date'],
            'avg_time_s':       round(avg_time),
            'last_ridden':      last['date'],
            'avg_speed_ms':     round(avg_speed, 2) if avg_speed else None,
            'avg_hr':           round(avg_hr, 1) if avg_hr else None,
            'representative_id': rep['id'],
            'center_lat':       round(center_lat, 5),
            'center_lon':       round(center_lon, 5),
            'trend_slope':      round(trend_slope, 1),
            'rides': [
                {
                    'id':           a['id'],
                    'name':         a['name'],
                    'date':         a['date'],
                    'moving_time_s': a['moving_time_s'],
                    'distance_m':   a['distance_m'],
                    'avg_speed_ms': a['avg_speed_ms'],
                    'avg_hr':       a['avg_hr'],
                }
                for a in member_acts
            ],
        })

    clusters.sort(key=lambda c: c['ride_count'], reverse=True)
    return {'clusters': clusters}


@router.get("/fatigue-index")
def fatigue_index(year: int = Query(None)):
    """
    Ermüdungsindex je Ride: Vergleich der Durchschnittsgeschwindigkeit erster vs. zweiter Hälfte.
    fatigue_pct = (spd_h2 - spd_h1) / spd_h1 * 100
    Negativ = Ermüdung (langsamer in H2), Positiv = Steigerung (schneller in H2).
    Nur Rides mit ≥ 60 Track-Punkten, speed_ms > 0, distance_m IS NOT NULL.
    """
    RIDE_TYPES = ('Ride', 'VirtualRide', 'EBikeRide')

    # Jahresfilter optional
    year_filter = ""
    params: list = []
    if year:
        year_filter = "AND strftime('%Y', a.start_date_local) = ?"
        params.append(str(year))

    ph = ','.join('?' * len(RIDE_TYPES))

    with db_connection() as conn:
        # Window-Function: max(distance_m) je Aktivität, dann Halbzeit-Split per AVG-CASE
        rows = conn.execute(
            f"""
            WITH ranked AS (
                SELECT
                    tp.activity_id,
                    tp.distance_m,
                    tp.speed_ms,
                    MAX(tp.distance_m) OVER (PARTITION BY tp.activity_id) AS max_dist,
                    a.start_date_local,
                    a.name,
                    a.id AS act_id
                FROM track_points tp
                JOIN activities a ON a.id = tp.activity_id
                WHERE tp.speed_ms > 0
                  AND tp.distance_m IS NOT NULL
                  AND a.activity_type IN ({ph})
                  {year_filter}
            ),
            halves AS (
                SELECT
                    activity_id,
                    MAX(act_id)           AS activity_id_val,
                    MAX(start_date_local) AS date,
                    MAX(name)             AS name,
                    AVG(CASE WHEN distance_m <= max_dist / 2.0 THEN speed_ms END) AS spd_h1,
                    AVG(CASE WHEN distance_m >  max_dist / 2.0 THEN speed_ms END) AS spd_h2,
                    MAX(max_dist) / 1000.0 AS dist_km,
                    COUNT(*) AS pts
                FROM ranked
                GROUP BY activity_id
                HAVING pts >= 60
            )
            SELECT
                activity_id_val  AS activity_id,
                name,
                date,
                ROUND(dist_km, 1) AS dist_km,
                spd_h1,
                spd_h2,
                (spd_h2 - spd_h1) / spd_h1 * 100 AS fatigue_pct
            FROM halves
            WHERE spd_h1 IS NOT NULL AND spd_h2 IS NOT NULL
            ORDER BY date DESC
            """,
            (*RIDE_TYPES, *params),
        ).fetchall()

    if not rows:
        return {
            "stats": {
                "rides_analyzed": 0,
                "avg_fatigue_pct": None,
                "steigerung_count": 0,
                "ermuedung_count": 0,
            },
            "best_steigerung": None,
            "worst_ermuedung": None,
            "distribution": [],
            "monthly": [],
            "rides": [],
            "by_distance": [],
        }

    # --- Rides-Liste aufbauen ---
    rides = []
    for r in rows:
        rides.append({
            "activity_id":   r["activity_id"],
            "activity_name": r["name"],
            "date":          r["date"],
            "dist_km":       round(r["dist_km"], 1),
            "fatigue_pct":   round(r["fatigue_pct"], 1),
            "spd_h1_kmh":    round(r["spd_h1"] * 3.6, 1),
            "spd_h2_kmh":    round(r["spd_h2"] * 3.6, 1),
        })

    fatigue_vals = [r["fatigue_pct"] for r in rows]
    # Positiv = Steigerung (H2 schneller), Negativ = Ermüdung (H2 langsamer)
    pos_rows  = [r for r in rows if r["fatigue_pct"] > 0]
    neg_rows  = [r for r in rows if r["fatigue_pct"] < 0]
    steigerung_count = len(pos_rows)
    ermuedung_count  = len(neg_rows)
    avg_fatigue = sum(fatigue_vals) / len(fatigue_vals)

    # --- Extremwerte ---
    # Beste Steigerung: positivster Wert (größte Beschleunigung in H2)
    best_pos_row = max(pos_rows, key=lambda r: r["fatigue_pct"]) if pos_rows else None
    # Größte Ermüdung: negativster Wert (stärkster Einbruch in H2)
    worst_row    = min(rows, key=lambda r: r["fatigue_pct"])

    def ride_detail(r):
        return {
            "fatigue_pct":   round(r["fatigue_pct"], 1),
            "activity_id":   r["activity_id"],
            "activity_name": r["name"],
            "date":          r["date"][:10] if r["date"] else None,
            "dist_km":       round(r["dist_km"], 1),
            "spd_h1_kmh":    round(r["spd_h1"] * 3.6, 1),
            "spd_h2_kmh":    round(r["spd_h2"] * 3.6, 1),
        }

    # --- Verteilung: 5%-Buckets von −50 bis +30 (Ermüdungen negativ, Steigerungen positiv) ---
    from collections import defaultdict
    bucket_counts: dict[int, int] = defaultdict(int)
    for v in fatigue_vals:
        # Untere Grenze des 5%-Buckets: floor(v/5)*5, geclamped auf [-50, 30]
        b = int(v // 5) * 5
        b = max(-50, min(30, b))
        bucket_counts[b] += 1

    distribution = [
        {"bucket": b, "count": c}
        for b, c in sorted(bucket_counts.items())
    ]

    # --- Monatliche Aggregation ---
    from collections import OrderedDict
    monthly_map: dict[str, list[float]] = defaultdict(list)
    for r in rows:
        month = r["date"][:7] if r["date"] else None
        if month:
            monthly_map[month].append(r["fatigue_pct"])

    monthly = []
    for month in sorted(monthly_map.keys()):
        vals = monthly_map[month]
        neg = sum(1 for v in vals if v < 0)
        monthly.append({
            "month":           month,
            "avg_fatigue_pct": round(sum(vals) / len(vals), 1),
            "rides":           len(vals),
            "neg_split_pct":   round(neg / len(vals) * 100, 1),
        })

    # --- by_distance: fixe 4 Kategorien ---
    dist_buckets = [
        ("< 20 km",  0,    20),
        ("20–40 km", 20,   40),
        ("40–60 km", 40,   60),
        ("> 60 km",  60, 9999),
    ]
    by_distance = []
    for label, lo, hi in dist_buckets:
        bucket_vals = [r["fatigue_pct"] for r in rows if lo <= r["dist_km"] < hi]
        if bucket_vals:
            by_distance.append({
                "label":           label,
                "avg_fatigue_pct": round(sum(bucket_vals) / len(bucket_vals), 1),
                "rides":           len(bucket_vals),
            })
        else:
            by_distance.append({"label": label, "avg_fatigue_pct": None, "rides": 0})

    return {
        "stats": {
            "rides_analyzed":  len(rows),
            "avg_fatigue_pct": round(avg_fatigue, 1),
            "steigerung_count": steigerung_count,
            "ermuedung_count":  ermuedung_count,
        },
        "best_steigerung": ride_detail(best_pos_row) if best_pos_row else None,
        "worst_ermuedung": ride_detail(worst_row),
        "distribution":    distribution,
        "monthly":         monthly,
        "rides":           rides,
        "by_distance":     by_distance,
    }


@router.get("/fatigue-index-track")
def fatigue_index_track(activity_ids: str = Query(...)):
    """
    Ermüdungsindex für einen bestimmten Strecken-Cluster.
    activity_ids: kommaseparierte Liste von Activity-IDs (aus route-clusters).
    Rides werden chronologisch sortiert (ASC) für Trendanalyse.
    """
    try:
        ids = [int(x.strip()) for x in activity_ids.split(',') if x.strip()]
    except ValueError:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Ungültige Activity-IDs")

    empty = {
        "stats": {"rides_analyzed": 0, "avg_fatigue_pct": None, "steigerung_count": 0, "ermuedung_count": 0},
        "best_steigerung": None, "worst_ermuedung": None,
        "distribution": [], "rides": [],
    }
    if not ids:
        return empty

    ph = ','.join('?' * len(ids))

    with db_connection() as conn:
        rows = conn.execute(f"""
            WITH ranked AS (
                SELECT
                    tp.activity_id,
                    tp.distance_m,
                    tp.speed_ms,
                    MAX(tp.distance_m) OVER (PARTITION BY tp.activity_id) AS max_dist,
                    a.start_date_local,
                    a.name,
                    a.id AS act_id
                FROM track_points tp
                JOIN activities a ON a.id = tp.activity_id
                WHERE tp.speed_ms > 0
                  AND tp.distance_m IS NOT NULL
                  AND tp.activity_id IN ({ph})
            ),
            halves AS (
                SELECT
                    activity_id,
                    MAX(act_id)           AS activity_id_val,
                    MAX(start_date_local) AS date,
                    MAX(name)             AS name,
                    AVG(CASE WHEN distance_m <= max_dist / 2.0 THEN speed_ms END) AS spd_h1,
                    AVG(CASE WHEN distance_m >  max_dist / 2.0 THEN speed_ms END) AS spd_h2,
                    MAX(max_dist) / 1000.0 AS dist_km,
                    COUNT(*) AS pts
                FROM ranked
                GROUP BY activity_id
                HAVING pts >= 60
            )
            SELECT
                activity_id_val AS activity_id,
                name,
                date,
                ROUND(dist_km, 1) AS dist_km,
                spd_h1,
                spd_h2,
                (spd_h2 - spd_h1) / spd_h1 * 100 AS fatigue_pct
            FROM halves
            WHERE spd_h1 IS NOT NULL AND spd_h2 IS NOT NULL
            ORDER BY date ASC
        """, ids).fetchall()

    if not rows:
        return empty

    rides = [
        {
            "activity_id":   r["activity_id"],
            "activity_name": r["name"],
            "date":          r["date"],
            "dist_km":       round(r["dist_km"], 1),
            "fatigue_pct":   round(r["fatigue_pct"], 1),
            "spd_h1_kmh":    round(r["spd_h1"] * 3.6, 1),
            "spd_h2_kmh":    round(r["spd_h2"] * 3.6, 1),
        }
        for r in rows
    ]

    fatigue_vals = [r["fatigue_pct"] for r in rows]
    # Positiv = Steigerung, Negativ = Ermüdung
    pos_rows         = [r for r in rows if r["fatigue_pct"] > 0]
    neg_rows         = [r for r in rows if r["fatigue_pct"] < 0]
    steigerung_count = len(pos_rows)
    ermuedung_count  = len(neg_rows)
    avg_fatigue      = sum(fatigue_vals) / len(fatigue_vals)

    # Beste Steigerung: positivster Wert
    best_pos_row = max(pos_rows, key=lambda r: r["fatigue_pct"]) if pos_rows else None
    # Größte Ermüdung: negativster Wert
    worst_row    = min(rows, key=lambda r: r["fatigue_pct"])

    def ride_detail(r):
        return {
            "fatigue_pct":   round(r["fatigue_pct"], 1),
            "activity_id":   r["activity_id"],
            "activity_name": r["name"],
            "date":          r["date"][:10] if r["date"] else None,
            "dist_km":       round(r["dist_km"], 1),
            "spd_h1_kmh":    round(r["spd_h1"] * 3.6, 1),
            "spd_h2_kmh":    round(r["spd_h2"] * 3.6, 1),
        }

    from collections import defaultdict
    bucket_counts: dict[int, int] = defaultdict(int)
    for v in fatigue_vals:
        # Geclamped auf [-50, 30]: Ermüdungen negativ, Steigerungen positiv
        b = max(-50, min(30, int(v // 5) * 5))
        bucket_counts[b] += 1

    distribution = [{"bucket": b, "count": c} for b, c in sorted(bucket_counts.items())]

    return {
        "stats": {
            "rides_analyzed":  len(rows),
            "avg_fatigue_pct": round(avg_fatigue, 1),
            "steigerung_count": steigerung_count,
            "ermuedung_count":  ermuedung_count,
        },
        "best_steigerung": ride_detail(best_pos_row) if best_pos_row else None,
        "worst_ermuedung": ride_detail(worst_row),
        "distribution":    distribution,
        "rides":           rides,
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
