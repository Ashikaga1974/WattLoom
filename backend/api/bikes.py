from fastapi import APIRouter, HTTPException
from backend.database import get_connection

router = APIRouter(prefix="/bikes", tags=["bikes"])


@router.get("")
def list_bikes():
    conn = get_connection()
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
    conn.close()
    return result


@router.get("/{bike_id}")
def get_bike(bike_id: str):
    conn = get_connection()
    bike = conn.execute("SELECT * FROM bikes WHERE id = ?", (bike_id,)).fetchone()
    if bike is None:
        conn.close()
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
    conn.close()
    return result
