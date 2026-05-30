from fastapi import APIRouter, Query
from backend.database import get_connection

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/time-heatmap")
def time_heatmap(year: int = Query(None), tz_offset: int = Query(None)):
    """
    Anzahl Aktivitäten pro Wochentag (0=Mo … 6=So) und Stunde (0–23).
    tz_offset: Stunden-Versatz gegenüber UTC (z.B. 2 für CEST).
    Fehlt der Parameter, wird tz_offset aus der config-Tabelle gelesen.
    """
    conn = get_connection()

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
    conn.close()

    return {"cells": [{"weekday": r["weekday"], "hour": r["hour"], "count": r["count"]} for r in rows]}


@router.get("/speed-hr")
def speed_hr():
    """Alle Aktivitäten mit Geschwindigkeit + HR für Scatter-Plot."""
    conn = get_connection()
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
    conn.close()
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
    conn = get_connection()
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
    conn.close()

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
    """Temperatur vs. Speed und HR – aggregiert aus track_points.temp_c."""
    conn = get_connection()
    rows = conn.execute("""
        SELECT
            ROUND(AVG(tp.temp_c), 1)                        AS temp_c,
            ROUND(a.avg_speed_ms * 3.6, 1)                  AS speed_kmh,
            ROUND(a.avg_hr, 0)                              AS hr,
            CAST(strftime('%Y', a.start_date_local) AS INTEGER) AS year,
            ROUND(a.distance_m / 1000.0, 1)                 AS dist_km
        FROM activities a
        JOIN track_points tp ON tp.activity_id = a.id
        WHERE tp.temp_c IS NOT NULL
          AND a.avg_speed_ms IS NOT NULL AND a.avg_speed_ms > 3
          AND a.avg_hr IS NOT NULL
        GROUP BY a.id
        HAVING COUNT(tp.temp_c) >= 10
        ORDER BY a.start_date_local
    """).fetchall()
    conn.close()
    return {
        "points": [
            {"temp_c": r["temp_c"], "speed_kmh": r["speed_kmh"],
             "hr": r["hr"], "year": r["year"], "dist_km": r["dist_km"]}
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

    conn = get_connection()

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

    conn.close()

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

    conn = get_connection()

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

    conn.close()

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

    conn = get_connection()
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

        other_map = {r["sport_type"]: r["total_s"] for r in other}
        result.append({
            "week_start": ws,
            "weeks_ago": i,
            "ride_minutes": round(ride_s / 60),
            "workout_minutes": round(other_map.get("Workout", 0) / 60),
            "weight_training_minutes": round(other_map.get("Weight Training", 0) / 60),
        })

    conn.close()
    return result


@router.get("/wrapped")
def get_wrapped(year: int = None, tz_offset: int = Query(None)):
    from datetime import datetime, timedelta

    RIDE_TYPES = ('Ride', 'VirtualRide', 'EBikeRide')
    placeholders = ','.join('?' * len(RIDE_TYPES))

    conn = get_connection()

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
        conn.close()
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

    conn.close()

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

    conn = get_connection()
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

    conn.close()

    return {
        "durations_s": DURATIONS,
        "labels": ["1 min", "5 min", "10 min", "20 min", "60 min"],
        "best_hr": [round(best[d], 1) for d in DURATIONS],
    }
