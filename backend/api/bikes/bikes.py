import uuid
from pathlib import Path

from fastapi import APIRouter, File, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

from backend.api.errors import api_error
from backend.database import db_connection
from backend.paths import BIKE_IMAGES_DIR

from ._shared import _current_bike_km, _avg_km_per_day, _chain_maintenance_km, _enrich_component

router = APIRouter(prefix="/bikes", tags=["bikes"])


@router.get("")
def list_bikes():
    with db_connection() as conn:
        bikes = conn.execute("SELECT * FROM bikes ORDER BY retired, name").fetchall()

        # Gesamt-km + Ride-Anzahl je Bike in einer Query
        stats_rows = conn.execute("""
            SELECT bike_id,
                   COALESCE(SUM(distance_m), 0) / 1000.0 AS total_km,
                   COUNT(*) AS ride_count
            FROM activities GROUP BY bike_id
        """).fetchall()
        bike_stats = {r["bike_id"]: (round(float(r["total_km"]), 1), r["ride_count"]) for r in stats_rows}

        # Ø-km/Tag (letzte 90 Tage) für alle Bikes auf einmal
        avg_rows = conn.execute("""
            SELECT bike_id, COALESCE(SUM(distance_m), 0) / 1000.0 AS km
            FROM activities
            WHERE DATE(start_date) >= DATE('now', '-90 days')
            GROUP BY bike_id
        """).fetchall()
        bike_avg = {r["bike_id"]: (round(float(r["km"]) / 90, 4) if r["km"] > 0 else None)
                    for r in avg_rows}

        # Alle aktiven Komponenten in einer Query, dann in Python gruppieren
        comp_rows = conn.execute(
            """SELECT bc.*, p.url AS purchase_url, p.name AS purchase_name
               FROM bike_components bc
               LEFT JOIN purchase_items pi ON pi.id = bc.purchase_item_id
               LEFT JOIN purchases p ON p.id = pi.purchase_id
               ORDER BY bc.bike_id, bc.retired_at IS NOT NULL, bc.added_at"""
        ).fetchall()
        comp_by_bike: dict[str, list] = {}
        for c in comp_rows:
            comp_by_bike.setdefault(c["bike_id"], []).append(dict(c))

        maintenance_threshold = _chain_maintenance_km(conn)
        result = []
        for bike in bikes:
            b = dict(bike)
            current_km, ride_count = bike_stats.get(bike["id"], (0.0, 0))
            b["current_km"] = current_km
            b["ride_count"] = ride_count
            avg = bike_avg.get(bike["id"])
            b["components"] = [
                _enrich_component(c, current_km, avg, maintenance_threshold)
                for c in comp_by_bike.get(bike["id"], [])
            ]
            result.append(b)
        return result


@router.get("/compare")
def compare_bikes():
    with db_connection() as conn:
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

        # Unterhaltskosten je Bike: jedes purchase_item, das je einem Bike zugeordnet war
        # (aktuell verbaut, gelöscht oder ins Lager zurückgelegt), zählt anteilig mit
        # price / ursprüngliche Item-Anzahl des Einkaufs – ein Einkauf von 4 Reifen auf 2 Bikes
        # verteilt zählt also je 1/4 des Preises pro Reifen, nicht den vollen Einkaufspreis je Bike.
        cost_rows = conn.execute("""
            WITH item_bike AS (
                SELECT bike_id, purchase_item_id FROM bike_components WHERE purchase_item_id IS NOT NULL
                UNION ALL
                SELECT bike_id, purchase_item_id FROM deleted_components WHERE purchase_item_id IS NOT NULL
                UNION ALL
                SELECT bike_id, purchase_item_id FROM purchase_returns WHERE purchase_item_id IS NOT NULL
            ),
            purchase_totals AS (
                SELECT purchase_id, COUNT(*) AS total_items
                FROM purchase_items
                GROUP BY purchase_id
            )
            SELECT ib.bike_id,
                   SUM(COALESCE(p.price, 0) * 1.0 / pt.total_items) AS total_cost
            FROM item_bike ib
            JOIN purchase_items pi ON pi.id = ib.purchase_item_id
            JOIN purchases p ON p.id = pi.purchase_id
            JOIN purchase_totals pt ON pt.purchase_id = p.id
            GROUP BY ib.bike_id
        """).fetchall()
        cost_by_bike = {r["bike_id"]: round(float(r["total_cost"] or 0), 2) for r in cost_rows}

        summary = []
        bike_ids = []
        for row in summary_rows:
            r = dict(row)
            r["total_km"]          = round(r["total_km"] or 0, 1)
            r["total_elevation_m"] = round(r["total_elevation_m"] or 0, 1)
            r["total_hours"]       = round(r["total_hours"] or 0, 1)
            r["avg_dist_km"]       = round(r["avg_dist_km"] or 0, 1)
            r["avg_speed_kmh"]     = round(r["avg_speed_kmh"] or 0, 1)
            r["avg_elevation_m"]   = round(r["avg_elevation_m"] or 0, 1)
            r["total_cost"]        = cost_by_bike.get(r["id"], 0.0)
            r["cost_per_100km"]    = round(r["total_cost"] / r["total_km"] * 100, 2) if r["total_km"] > 0 else None
            summary.append(r)
            bike_ids.append(r["id"])

        year_rows = conn.execute("""
            SELECT DISTINCT strftime('%Y', start_date_local) AS year
            FROM activities
            WHERE bike_id IN ({})
            ORDER BY year
        """.format(",".join("?" * len(bike_ids))), bike_ids).fetchall()
        years = [r["year"] for r in year_rows]

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

        yearly = []
        for y in years:
            bikes_entry = {}
            for bid in bike_ids:
                bikes_entry[bid] = yearly_map.get(y, {}).get(bid, {"rides": 0, "avg_speed_kmh": None})
            yearly.append({"year": y, "bikes": bikes_entry})

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


@router.get("/deleted-components")
def list_deleted_components():
    with db_connection() as conn:
        rows = conn.execute("""
            SELECT dc.*, p.name AS purchase_name, p.shop, p.url, p.price
            FROM deleted_components dc
            LEFT JOIN purchase_items pi ON pi.id = dc.purchase_item_id
            LEFT JOIN purchases p ON p.id = pi.purchase_id
            ORDER BY dc.deleted_at DESC, dc.id DESC
        """).fetchall()
        return [dict(r) for r in rows]


@router.get("/{bike_id}/image")
def get_bike_image(bike_id: str):
    with db_connection() as conn:
        row = conn.execute("SELECT image_filename FROM bikes WHERE id = ?", (bike_id,)).fetchone()
        if not row or not row["image_filename"]:
            raise api_error(404, "no_image", "No image")
    path = BIKE_IMAGES_DIR / row["image_filename"]
    if not path.exists():
        raise api_error(404, "image_file_missing", "Image file missing")
    return FileResponse(str(path))


@router.post("/{bike_id}/image")
async def upload_bike_image(bike_id: str, file: UploadFile = File(...)):
    with db_connection() as conn:
        bike = conn.execute("SELECT id, image_filename FROM bikes WHERE id = ?", (bike_id,)).fetchone()
        if bike is None:
            raise api_error(404, "bike_not_found", "Bike not found")

    suffix = Path(file.filename or "").suffix.lower() or ".jpg"
    filename = f"{uuid.uuid4()}{suffix}"
    BIKE_IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    (BIKE_IMAGES_DIR / filename).write_bytes(await file.read())

    # Altes Bild löschen
    if bike["image_filename"]:
        old = BIKE_IMAGES_DIR / bike["image_filename"]
        if old.exists():
            old.unlink(missing_ok=True)

    with db_connection() as conn:
        conn.execute("UPDATE bikes SET image_filename = ? WHERE id = ?", (filename, bike_id))
        conn.commit()
    return {"ok": True, "filename": filename}


@router.put("/{bike_id}/toggle-retired")
def toggle_retired(bike_id: str):
    with db_connection() as conn:
        row = conn.execute("SELECT retired FROM bikes WHERE id = ?", (bike_id,)).fetchone()
        if row is None:
            raise api_error(404, "bike_not_found", "Bike not found")
        new_val = 0 if row["retired"] else 1
        conn.execute("UPDATE bikes SET retired = ? WHERE id = ?", (new_val, bike_id))
        conn.commit()
        return {"ok": True, "retired": new_val}


@router.get("/{bike_id}")
def get_bike(bike_id: str):
    with db_connection() as conn:
        bike = conn.execute("SELECT * FROM bikes WHERE id = ?", (bike_id,)).fetchone()
        if bike is None:
            raise api_error(404, "bike_not_found", "Bike not found")
        result = dict(bike)
        current_km = _current_bike_km(conn, bike_id)
        result["current_km"] = current_km
        components = conn.execute(
            """SELECT bc.*, p.url AS purchase_url, p.name AS purchase_name
               FROM bike_components bc
               LEFT JOIN purchase_items pi ON pi.id = bc.purchase_item_id
               LEFT JOIN purchases p ON p.id = pi.purchase_id
               WHERE bc.bike_id = ?
               ORDER BY bc.retired_at IS NOT NULL, bc.added_at""",
            (bike_id,),
        ).fetchall()
        avg = _avg_km_per_day(conn, bike_id)
        maintenance_threshold = _chain_maintenance_km(conn)
        result["components"] = [
            _enrich_component(dict(c), current_km, avg, maintenance_threshold) for c in components
        ]
        result["ride_count"] = conn.execute(
            "SELECT COUNT(*) FROM activities WHERE bike_id = ?", (bike_id,)
        ).fetchone()[0]
        return result


class BikeUpdate(BaseModel):
    name: str


@router.put("/{bike_id}")
def update_bike(bike_id: str, body: BikeUpdate):
    with db_connection() as conn:
        rows = conn.execute(
            "UPDATE bikes SET name = ? WHERE id = ?", (body.name.strip(), bike_id)
        ).rowcount
        if rows == 0:
            raise api_error(404, "bike_not_found", "Bike not found")
        conn.commit()
        return {"ok": True}
