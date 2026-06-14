import uuid
from datetime import date as Date
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

from backend.database import db_connection

router = APIRouter(prefix="/bikes", tags=["bikes"])

BIKE_IMAGES_DIR = Path(__file__).parent.parent.parent / "data" / "bike_images"


def _current_bike_km(conn, bike_id: str) -> float:
    """Gesamt-km eines Bikes aus allen Aktivitäten."""
    row = conn.execute(
        "SELECT COALESCE(SUM(distance_m), 0) / 1000.0 AS km FROM activities WHERE bike_id = ?",
        (bike_id,),
    ).fetchone()
    return round(float(row["km"]) if row else 0.0, 1)


def _enrich_component(comp: dict, current_km: float) -> dict:
    """Berechnet km_since_service und pct_used für eine Komponente."""
    km_at = float(comp.get("km_at_service") or 0)
    threshold = comp.get("km_threshold")
    km_since = round(max(0.0, current_km - km_at), 1)
    pct = round(min(km_since / threshold * 100, 200), 1) if threshold and threshold > 0 else None
    return {**comp, "km_since_service": km_since, "pct_used": pct}


class ComponentCreate(BaseModel):
    type: str
    km_threshold: float
    brand: str | None = None
    model: str | None = None
    description: str | None = None
    installed_at: str | None = None   # ISO-Datum YYYY-MM-DD; fehlt → heute


@router.get("")
def list_bikes():
    with db_connection() as conn:
        bikes = conn.execute("SELECT * FROM bikes ORDER BY retired, name").fetchall()

        km_rows = conn.execute("""
            SELECT bike_id, COALESCE(SUM(distance_m), 0) / 1000.0 AS total_km
            FROM activities GROUP BY bike_id
        """).fetchall()
        bike_km = {r["bike_id"]: round(float(r["total_km"]), 1) for r in km_rows}

        result = []
        for bike in bikes:
            b = dict(bike)
            current_km = bike_km.get(bike["id"], 0.0)
            b["current_km"] = current_km

            components = conn.execute(
                "SELECT * FROM bike_components WHERE bike_id = ? AND retired_at IS NULL ORDER BY added_at",
                (bike["id"],),
            ).fetchall()
            b["components"] = [_enrich_component(dict(c), current_km) for c in components]

            b["ride_count"] = conn.execute(
                "SELECT COUNT(*) FROM activities WHERE bike_id = ?", (bike["id"],)
            ).fetchone()[0]
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


@router.get("/{bike_id}/image")
def get_bike_image(bike_id: str):
    with db_connection() as conn:
        row = conn.execute("SELECT image_filename FROM bikes WHERE id = ?", (bike_id,)).fetchone()
        if not row or not row["image_filename"]:
            raise HTTPException(status_code=404, detail="No image")
    path = BIKE_IMAGES_DIR / row["image_filename"]
    if not path.exists():
        raise HTTPException(status_code=404, detail="Image file missing")
    return FileResponse(str(path))


@router.post("/{bike_id}/image")
async def upload_bike_image(bike_id: str, file: UploadFile = File(...)):
    with db_connection() as conn:
        bike = conn.execute("SELECT id, image_filename FROM bikes WHERE id = ?", (bike_id,)).fetchone()
        if bike is None:
            raise HTTPException(status_code=404, detail="Bike not found")

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
            raise HTTPException(status_code=404, detail="Bike not found")
        new_val = 0 if row["retired"] else 1
        conn.execute("UPDATE bikes SET retired = ? WHERE id = ?", (new_val, bike_id))
        conn.commit()
        return {"ok": True, "retired": new_val}


@router.get("/{bike_id}")
def get_bike(bike_id: str):
    with db_connection() as conn:
        bike = conn.execute("SELECT * FROM bikes WHERE id = ?", (bike_id,)).fetchone()
        if bike is None:
            raise HTTPException(status_code=404, detail="Bike not found")
        result = dict(bike)
        current_km = _current_bike_km(conn, bike_id)
        result["current_km"] = current_km
        components = conn.execute(
            "SELECT * FROM bike_components WHERE bike_id = ? AND retired_at IS NULL ORDER BY added_at",
            (bike_id,),
        ).fetchall()
        result["components"] = [_enrich_component(dict(c), current_km) for c in components]
        result["ride_count"] = conn.execute(
            "SELECT COUNT(*) FROM activities WHERE bike_id = ?", (bike_id,)
        ).fetchone()[0]
        return result


@router.post("/{bike_id}/components")
def add_component(bike_id: str, body: ComponentCreate):
    with db_connection() as conn:
        bike = conn.execute("SELECT id FROM bikes WHERE id = ?", (bike_id,)).fetchone()
        if bike is None:
            raise HTTPException(status_code=404, detail="Bike not found")
        current_km = _current_bike_km(conn, bike_id)
        added_at = body.installed_at or Date.today().isoformat()
        conn.execute(
            """INSERT INTO bike_components
               (bike_id, type, brand, model, description, km_threshold, km_at_service, added_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (bike_id, body.type, body.brand, body.model, body.description,
             body.km_threshold, current_km, added_at),
        )
        conn.commit()
        return {"ok": True}


@router.put("/{bike_id}/components/{comp_id}/reset")
def reset_component(bike_id: str, comp_id: int):
    """Markiert eine Komponente als gewartet – setzt km_at_service auf aktuellen Bike-km-Stand."""
    with db_connection() as conn:
        current_km = _current_bike_km(conn, bike_id)
        rows = conn.execute(
            "UPDATE bike_components SET km_at_service = ? WHERE id = ? AND bike_id = ?",
            (current_km, comp_id, bike_id),
        ).rowcount
        if rows == 0:
            raise HTTPException(status_code=404, detail="Component not found")
        conn.commit()
        return {"ok": True, "km_at_service": current_km}


@router.delete("/{bike_id}/components/{comp_id}")
def delete_component(bike_id: str, comp_id: int):
    with db_connection() as conn:
        rows = conn.execute(
            "DELETE FROM bike_components WHERE id = ? AND bike_id = ?",
            (comp_id, bike_id),
        ).rowcount
        if rows == 0:
            raise HTTPException(status_code=404, detail="Component not found")
        conn.commit()
        return {"ok": True}
