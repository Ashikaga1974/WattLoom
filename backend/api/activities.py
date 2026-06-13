import math
from pathlib import Path

from fastapi import APIRouter, Query, HTTPException
from backend.database import db_connection

MEDIA_DIR = Path(__file__).parent.parent.parent / "data" / "media"


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371
    lat1_r, lat2_r = math.radians(lat1), math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1_r) * math.cos(lat2_r) * math.sin(dlon / 2) ** 2
    return R * 2 * math.asin(math.sqrt(a))

router = APIRouter(prefix="/activities", tags=["activities"])


SORTABLE = {
    "start_date", "distance_m", "moving_time_s", "elevation_gain_m",
    "avg_speed_ms", "avg_hr", "avg_power_w", "calories",
}


@router.get("")
def list_activities(
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    year: int | None = None,
    bike_id: str | None = None,
    has_track: bool | None = None,
    sort_by: str = Query("start_date", description="Sortierfeld"),
    sort_dir: str = Query("desc", pattern="^(asc|desc)$"),
):
    if sort_by not in SORTABLE:
        sort_by = "start_date"

    filters = []
    params: list = []

    if year is not None:
        filters.append("strftime('%Y', start_date) = ?")
        params.append(str(year))
    if bike_id is not None:
        filters.append("bike_id = ?")
        params.append(bike_id)
    if has_track is not None:
        filters.append("has_track = ?")
        params.append(1 if has_track else 0)

    # NULL-Werte beim Sortieren nach hinten schieben
    null_last = f"{sort_by} IS NULL, {sort_by} {sort_dir.upper()}"
    where = ("WHERE " + " AND ".join(filters)) if filters else ""

    with db_connection() as conn:
        rows = conn.execute(
            f"""
            SELECT id, name, activity_type, start_date, distance_m, moving_time_s,
                   elevation_gain_m, avg_speed_ms, avg_hr, avg_power_w, avg_cadence,
                   calories, bike_id, has_track, manual, smart_device
            FROM activities
            {where}
            ORDER BY {null_last}
            LIMIT ? OFFSET ?
            """,
            params + [limit, offset],
        ).fetchall()

        total = conn.execute(f"SELECT COUNT(*) FROM activities {where}", params).fetchone()[0]

    return {"total": total, "limit": limit, "offset": offset, "items": [dict(r) for r in rows]}


@router.get("/stats")
def overall_stats(year: int | None = None):
    """Gesamtstatistiken über alle (oder jahresgefilterten) Rides."""
    filters = []
    params: list = []
    if year is not None:
        filters.append("strftime('%Y', start_date) = ?")
        params.append(str(year))
    where = ("WHERE " + " AND ".join(filters)) if filters else ""

    with db_connection() as conn:
        row = conn.execute(
            f"""
            SELECT
                COUNT(*)                        AS total_rides,
                SUM(distance_m) / 1000.0        AS total_km,
                SUM(moving_time_s)              AS total_moving_s,
                SUM(elevation_gain_m)           AS total_elevation_m,
                AVG(distance_m) / 1000.0        AS avg_km,
                MAX(distance_m) / 1000.0        AS max_km,
                AVG(avg_speed_ms) * 3.6         AS avg_speed_kmh,
                AVG(avg_hr)                     AS avg_hr,
                AVG(avg_power_w)                AS avg_power_w,
                SUM(calories)                   AS total_calories
            FROM activities
            {where}
            """,
            params,
        ).fetchone()

        years = conn.execute(
            "SELECT DISTINCT strftime('%Y', start_date) AS y FROM activities WHERE strftime('%Y', start_date) >= '2000' ORDER BY y DESC"
        ).fetchall()

    return {**dict(row), "available_years": [r["y"] for r in years]}


@router.get("/weekly")
def weekly_stats(weeks: int = Query(8, ge=1, le=52)):
    """Aggregierte Wochendaten der letzten N Wochen."""
    with db_connection() as conn:
        rows = conn.execute(
            """
            SELECT
                CAST((julianday('now') - julianday(start_date)) / 7 AS INTEGER) AS weeks_ago,
                COUNT(*)                        AS count,
                SUM(distance_m) / 1000.0        AS distance_km,
                SUM(moving_time_s)              AS moving_s,
                COALESCE(SUM(elevation_gain_m), 0) AS elevation_m
            FROM activities
            WHERE start_date >= date('now', ? || ' days')
            GROUP BY weeks_ago
            ORDER BY weeks_ago ASC
            """,
            (f"-{weeks * 7}",),
        ).fetchall()

    by_week: dict[int, dict] = {r["weeks_ago"]: dict(r) for r in rows}
    result = []
    for w in range(weeks - 1, -1, -1):
        result.append(by_week.get(w, {"weeks_ago": w, "count": 0, "distance_km": 0.0, "moving_s": 0, "elevation_m": 0.0}))
    return result


@router.get("/monthly-all")
def monthly_all():
    """Monatliche km über den gesamten Zeitraum, chronologisch sortiert."""
    with db_connection() as conn:
        rows = conn.execute(
            """
            SELECT
                CAST(strftime('%Y', start_date) AS INTEGER) AS year,
                CAST(strftime('%m', start_date) AS INTEGER) AS month,
                SUM(distance_m) / 1000.0 AS distance_km,
                COUNT(*) AS count
            FROM activities
            GROUP BY year, month
            ORDER BY year, month
            """
        ).fetchall()
    return [dict(r) for r in rows]


@router.get("/monthly")
def monthly_stats(year: int = Query(..., description="Jahr")):
    """Monatliche Aggregation für ein bestimmtes Jahr (12 Monate, fehlende = 0)."""
    with db_connection() as conn:
        rows = conn.execute(
            """
            SELECT
                CAST(strftime('%m', start_date) AS INTEGER) AS month,
                COUNT(*)                        AS count,
                SUM(distance_m) / 1000.0        AS distance_km,
                SUM(moving_time_s)              AS moving_s,
                COALESCE(SUM(elevation_gain_m), 0) AS elevation_m
            FROM activities
            WHERE strftime('%Y', start_date) = ?
            GROUP BY month
            ORDER BY month
            """,
            (str(year),),
        ).fetchall()

    by_month: dict[int, dict] = {r["month"]: dict(r) for r in rows}
    return [
        by_month.get(m, {"month": m, "count": 0, "distance_km": 0.0, "moving_s": 0, "elevation_m": 0.0})
        for m in range(1, 13)
    ]


@router.get("/other")
def list_other_activities(year: int = Query(None)):
    """Alle other_activities (Workout, Weight Training), optional nach Jahr gefiltert."""
    params = []
    where = "WHERE strftime('%Y', start_date_local) >= '2000'"
    if year:
        where += " AND strftime('%Y', start_date_local) = ?"
        params.append(str(year))
    with db_connection() as conn:
        rows = conn.execute(f"""
            SELECT
                id,
                name,
                strftime('%Y-%m-%d', start_date_local) AS date,
                sport_type,
                moving_time_s,
                calories,
                avg_hr,
                max_hr
            FROM other_activities
            {where}
            ORDER BY start_date_local
        """, params).fetchall()
    return [dict(r) for r in rows]


@router.get("/other/{workout_id}")
def get_other_activity(workout_id: int):
    """Detail einer Workout-Einheit inkl. Verlauf des gleichen Sport-Typs."""
    with db_connection() as conn:
        row = conn.execute(
            "SELECT * FROM other_activities WHERE id = ?", (workout_id,)
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Workout not found")
        history = conn.execute("""
            SELECT id, start_date_local, moving_time_s, calories, avg_hr, max_hr
            FROM other_activities
            WHERE sport_type = ?
            AND strftime('%Y', start_date_local) >= '2000'
            ORDER BY start_date_local ASC
        """, (row["sport_type"],)).fetchall()
    avg_time = None
    avg_kcal = None
    if history:
        times = [h["moving_time_s"] for h in history if h["moving_time_s"]]
        kcals = [h["calories"] for h in history if h["calories"]]
        avg_time = sum(times) / len(times) if times else None
        avg_kcal = sum(kcals) / len(kcals) if kcals else None
    return {
        **dict(row),
        "history": [dict(h) for h in history],
        "avg_moving_time_s": avg_time,
        "avg_calories": avg_kcal,
        "history_count": len(history),
    }


@router.get("/{activity_id}")
def get_activity(activity_id: int):
    with db_connection() as conn:
        row = conn.execute(
            "SELECT * FROM activities WHERE id = ?", (activity_id,)
        ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Activity not found")
    return dict(row)


@router.get("/{activity_id}/laps")
def get_laps(activity_id: int):
    with db_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM laps WHERE activity_id = ? ORDER BY lap_number",
            (activity_id,),
        ).fetchall()
    return [dict(r) for r in rows]


@router.get("/{activity_id}/media")
def get_activity_media(activity_id: int):
    with db_connection() as conn:
        rows = conn.execute(
            "SELECT filename FROM media WHERE activity_id = ? ORDER BY id",
            (activity_id,),
        ).fetchall()
    return {"files": [r["filename"] for r in rows]}


@router.get("/{activity_id}/similar")
def get_similar_activities(
    activity_id: int,
    max_distance_diff_pct: float = Query(20, ge=0, le=100),
    start_radius_km: float = Query(2, ge=0.1, le=50),
    limit: int = Query(10, ge=1, le=50),
):
    """Findet Aktivitäten mit ähnlichem Startpunkt (±start_radius_km) und ähnlicher Distanz (±max_distance_diff_pct)."""
    with db_connection() as conn:
        ref = conn.execute(
            "SELECT id, distance_m FROM activities WHERE id = ? AND has_track = 1",
            (activity_id,),
        ).fetchone()
        if ref is None:
            raise HTTPException(status_code=404, detail="Activity not found or has no track")

        ref_start = conn.execute(
            "SELECT lat, lon FROM track_points WHERE activity_id = ? AND lat IS NOT NULL AND lon IS NOT NULL ORDER BY id LIMIT 1",
            (activity_id,),
        ).fetchone()
        if ref_start is None:
            raise HTTPException(status_code=404, detail="Reference activity has no GPS track points")

        ref_lat = ref_start["lat"]
        ref_lon = ref_start["lon"]
        ref_dist = ref["distance_m"]
        min_dist = ref_dist * (1 - max_distance_diff_pct / 100)
        max_dist = ref_dist * (1 + max_distance_diff_pct / 100)

        candidates = conn.execute(
            """
            SELECT id, name, start_date, distance_m, moving_time_s,
                   avg_speed_ms, avg_hr, elevation_gain_m
            FROM activities
            WHERE id != ? AND has_track = 1 AND distance_m BETWEEN ? AND ?
            ORDER BY start_date DESC
            """,
            (activity_id, min_dist, max_dist),
        ).fetchall()

        if not candidates:
            return {"reference_id": activity_id, "similar": []}

        # Ersten Track-Punkt jeder Kandidaten-Aktivität in einer Query holen
        cand_ids = [c["id"] for c in candidates]
        placeholders = ",".join("?" * len(cand_ids))
        start_pts = conn.execute(
            f"""
            SELECT tp.activity_id, tp.lat, tp.lon
            FROM track_points tp
            WHERE tp.id IN (
                SELECT MIN(id) FROM track_points
                WHERE activity_id IN ({placeholders})
                GROUP BY activity_id
            )
            """,
            cand_ids,
        ).fetchall()

    start_map = {
        r["activity_id"]: (r["lat"], r["lon"])
        for r in start_pts
        if r["lat"] is not None and r["lon"] is not None
    }

    result = []
    for c in candidates:
        pt = start_map.get(c["id"])
        if pt is None:
            continue
        dist_km = _haversine_km(ref_lat, ref_lon, pt[0], pt[1])
        if dist_km <= start_radius_km:
            result.append({**dict(c), "start_distance_km": round(dist_km, 2)})

    result.sort(key=lambda x: x["start_distance_km"])
    return {"reference_id": activity_id, "similar": result[:limit]}


@router.patch("/{activity_id}/power")
def update_activity_power(activity_id: int, body: dict):
    """Setzt avg_power_w für manuell importierte Aktivitäten (manual=1)."""
    with db_connection() as conn:
        row = conn.execute(
            "SELECT id, manual FROM activities WHERE id = ?", (activity_id,)
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Activity not found")
        if not row["manual"]:
            raise HTTPException(status_code=400, detail="Nur bei manuell importierten Aktivitäten erlaubt")

        power = body.get("avg_power_w")
        if power is not None:
            power = float(power)

        conn.execute("UPDATE activities SET avg_power_w = ? WHERE id = ?", (power, activity_id))
        conn.commit()
    return {"ok": True, "activity_id": activity_id, "avg_power_w": power}


@router.delete("/{activity_id}")
def delete_activity(activity_id: int):
    with db_connection() as conn:
        row = conn.execute("SELECT id FROM activities WHERE id = ?", (activity_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Activity not found")

        # Mediendateinamen merken, aber erst nach erfolgreichem DB-Commit löschen
        media_rows = conn.execute(
            "SELECT filename FROM media WHERE activity_id = ?", (activity_id,)
        ).fetchall()
        media_files = [MEDIA_DIR / m["filename"] for m in media_rows]

        # Alle verknüpften Datensätze und die Aktivität löschen
        conn.execute("DELETE FROM track_points WHERE activity_id = ?", (activity_id,))
        conn.execute("DELETE FROM media WHERE activity_id = ?", (activity_id,))
        conn.execute("DELETE FROM laps WHERE activity_id = ?", (activity_id,))
        conn.execute("DELETE FROM activities WHERE id = ?", (activity_id,))
        conn.commit()

    # Erst nach erfolgreichem Commit Dateien vom Filesystem entfernen
    for path in media_files:
        if path.exists():
            path.unlink()
    return {"ok": True, "deleted_id": activity_id}
