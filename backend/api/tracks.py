import math

from fastapi import APIRouter, HTTPException, Query
from backend.database import db_connection

router = APIRouter(prefix="/activities", tags=["tracks"])


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Entfernung zwischen zwei GPS-Punkten in Metern (Haversine)."""
    R = 6_371_000
    lat1_r, lat2_r = math.radians(lat1), math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1_r) * math.cos(lat2_r) * math.sin(dlon / 2) ** 2
    return R * 2 * math.asin(math.sqrt(a))


@router.get("/{activity_id}/track")
def get_track(
    activity_id: int,
    fields: str = Query(
        "lat,lon,altitude_m,distance_m,speed_ms,hr,power_w,cadence",
        description="Komma-getrennte Felder",
    ),
    simplify: int = Query(
        0,
        ge=0,
        le=100,
        description="Jeden n-ten Punkt zurückgeben (0 = alle)",
    ),
):
    """Gibt Track-Punkte zurück.
    Mit simplify=5 z.B. jeden 5. Punkt – reduziert Datenmenge für erste Kartenansicht."""
    allowed = {
        "timestamp", "lat", "lon", "altitude_m", "distance_m",
        "speed_ms", "hr", "power_w", "cadence", "temp_c",
    }
    requested = [f.strip() for f in fields.split(",")]
    invalid = set(requested) - allowed
    if invalid:
        raise HTTPException(status_code=400, detail=f"Unbekannte Felder: {invalid}")

    # Wenn distance_m angefordert: lat+lon für Fallback-Berechnung immer mitladen
    compute_distance = "distance_m" in requested
    extra_for_distance: set[str] = set()
    if compute_distance:
        if "lat" not in requested:
            extra_for_distance.add("lat")
        if "lon" not in requested:
            extra_for_distance.add("lon")

    query_cols = requested + sorted(extra_for_distance)
    col_sql = ", ".join(query_cols)

    # Für Vereinfachung: rowid modulo nutzen
    if simplify > 1:
        where_mod = f"AND (rowid % {simplify}) = 0"
    else:
        where_mod = ""

    with db_connection() as conn:
        row_check = conn.execute(
            "SELECT has_track FROM activities WHERE id = ?", (activity_id,)
        ).fetchone()
        if row_check is None:
            raise HTTPException(status_code=404, detail="Activity not found")
        if row_check["has_track"] == 0:
            return {"activity_id": activity_id, "points": []}

        rows = conn.execute(
            f"""
            SELECT {col_sql}
            FROM track_points
            WHERE activity_id = ? {where_mod}
            ORDER BY id
            """,
            (activity_id,),
        ).fetchall()

    points = [dict(r) for r in rows]

    # Kumulative Distanz aus GPS berechnen wenn distance_m komplett fehlt
    if compute_distance and points and all(p["distance_m"] is None for p in points):
        cum = 0.0
        prev_lat = prev_lon = None
        for p in points:
            lat, lon = p.get("lat"), p.get("lon")
            if lat is not None and lon is not None:
                if prev_lat is not None:
                    cum += _haversine_m(prev_lat, prev_lon, lat, lon)
                prev_lat, prev_lon = lat, lon
            p["distance_m"] = round(cum, 1)

    # Extra-Felder die nur intern gebraucht wurden wieder entfernen
    for col in extra_for_distance:
        for p in points:
            p.pop(col, None)

    return {"activity_id": activity_id, "count": len(points), "points": points}
