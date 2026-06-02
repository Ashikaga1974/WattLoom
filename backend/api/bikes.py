from fastapi import APIRouter, HTTPException
from backend.database import db_connection

router = APIRouter(prefix="/bikes", tags=["bikes"])


@router.get("")
def list_bikes():
    with db_connection() as conn:
        bikes = conn.execute("SELECT * FROM bikes ORDER BY retired, name").fetchall()
        result = []
        for bike in bikes:
            b = dict(bike)
            b["components"] = [
                dict(r) for r in conn.execute(
                    "SELECT * FROM bike_components WHERE bike_id = ? ORDER BY added_at",
                    (bike["id"],),
                ).fetchall()
            ]
            # Aktivitätsanzahl pro Bike
            b["ride_count"] = conn.execute(
                "SELECT COUNT(*) FROM activities WHERE bike_id = ?", (bike["id"],)
            ).fetchone()[0]
            result.append(b)
        return result


@router.get("/compare")
def compare_bikes():
    with db_connection() as conn:
        # Summary: Nur Bikes mit mindestens 1 Aktivität
        summary_rows = conn.execute("""
            SELECT
                b.id,
                b.name,
                COUNT(a.id)                          AS rides,
                SUM(a.distance_m) / 1000.0           AS total_km,
                SUM(a.elevation_gain_m)              AS total_elevation_m,
                SUM(a.moving_time_s) / 3600.0        AS total_hours,
                AVG(a.distance_m / 1000.0)           AS avg_dist_km,
                AVG(a.avg_speed_ms * 3.6)            AS avg_speed_kmh,
                AVG(a.elevation_gain_m)              AS avg_elevation_m
            FROM bikes b
            JOIN activities a ON a.bike_id = b.id
            GROUP BY b.id, b.name
            ORDER BY b.name
        """).fetchall()

        summary = []
        bike_ids = []
        for row in summary_rows:
            r = dict(row)
            # Auf eine Nachkommastelle runden
            r["total_km"]          = round(r["total_km"] or 0, 1)
            r["total_elevation_m"] = round(r["total_elevation_m"] or 0, 1)
            r["total_hours"]       = round(r["total_hours"] or 0, 1)
            r["avg_dist_km"]       = round(r["avg_dist_km"] or 0, 1)
            r["avg_speed_kmh"]     = round(r["avg_speed_kmh"] or 0, 1)
            r["avg_elevation_m"]   = round(r["avg_elevation_m"] or 0, 1)
            summary.append(r)
            bike_ids.append(r["id"])

        # Alle Jahre, in denen mindestens ein Ride existiert (für beteiligte Bikes)
        year_rows = conn.execute("""
            SELECT DISTINCT strftime('%Y', start_date_local) AS year
            FROM activities
            WHERE bike_id IN ({})
            ORDER BY year
        """.format(",".join("?" * len(bike_ids))), bike_ids).fetchall()

        years = [r["year"] for r in year_rows]

        # Pro Jahr + Bike: rides + avg_speed
        yearly_detail = conn.execute("""
            SELECT
                strftime('%Y', start_date_local) AS year,
                bike_id,
                COUNT(*)                          AS rides,
                AVG(avg_speed_ms * 3.6)           AS avg_speed_kmh
            FROM activities
            WHERE bike_id IN ({})
            GROUP BY year, bike_id
        """.format(",".join("?" * len(bike_ids))), bike_ids).fetchall()

        # In ein Dict überführen: {year: {bike_id: {...}}}
        yearly_map: dict = {}
        for row in yearly_detail:
            y = row["year"]
            bid = row["bike_id"]
            if y not in yearly_map:
                yearly_map[y] = {}
            yearly_map[y][bid] = {
                "rides": row["rides"],
                "avg_speed_kmh": round(row["avg_speed_kmh"] or 0, 1),
            }

        # Fehlende Bikes mit 0 / null auffüllen
        yearly = []
        for y in years:
            bikes_entry = {}
            for bid in bike_ids:
                bikes_entry[bid] = yearly_map.get(y, {}).get(bid, {"rides": 0, "avg_speed_kmh": None})
            yearly.append({"year": y, "bikes": bikes_entry})

        # Distances: alle Rides pro Bike (nur distance_m > 0)
        dist_rows = conn.execute("""
            SELECT bike_id, distance_m / 1000.0 AS dist_km
            FROM activities
            WHERE bike_id IN ({}) AND distance_m > 0
            ORDER BY bike_id, start_date_local
        """.format(",".join("?" * len(bike_ids))), bike_ids).fetchall()

        distances: dict = {bid: [] for bid in bike_ids}
        for row in dist_rows:
            distances[row["bike_id"]].append(round(row["dist_km"], 1))

        return {"summary": summary, "yearly": yearly, "distances": distances}


@router.get("/{bike_id}")
def get_bike(bike_id: str):
    with db_connection() as conn:
        bike = conn.execute("SELECT * FROM bikes WHERE id = ?", (bike_id,)).fetchone()
        if bike is None:
            raise HTTPException(status_code=404, detail="Bike not found")
        result = dict(bike)
        result["components"] = [
            dict(r) for r in conn.execute(
                "SELECT * FROM bike_components WHERE bike_id = ? ORDER BY added_at",
                (bike_id,),
            ).fetchall()
        ]
        result["ride_count"] = conn.execute(
            "SELECT COUNT(*) FROM activities WHERE bike_id = ?", (bike_id,)
        ).fetchone()[0]
        return result
