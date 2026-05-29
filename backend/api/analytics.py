from fastapi import APIRouter, Query
from backend.database import get_connection

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/time-heatmap")
def time_heatmap(year: int = Query(None)):
    """
    Anzahl Aktivitäten pro Wochentag (0=Mo … 6=So) und Stunde (0–23),
    basierend auf start_date_local.
    """
    year_filter = ""
    params: list = []
    if year:
        year_filter = "WHERE strftime('%Y', start_date_local) = ?"
        params.append(str(year))

    conn = get_connection()
    rows = conn.execute(
        f"""
        SELECT
            (CAST(strftime('%w', start_date_local) AS INTEGER) + 6) % 7 AS weekday,
            CAST(strftime('%H', start_date_local) AS INTEGER) AS hour,
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
            {"year": r["year"], "speed_kmh": r["speed_kmh"], "hr": r["hr"], "dist_km": r["dist_km"]}
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
