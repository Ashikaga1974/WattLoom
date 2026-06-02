from fastapi import APIRouter, Query
from backend.database import db_connection

router = APIRouter(prefix="/tracks", tags=["heatmap"])


@router.get("/heatmap")
def get_heatmap(
    simplify: int = Query(
        20,
        ge=1,
        le=100,
        description="Jeden n-ten Punkt zurückgeben; Standard 20 (~83k Punkte)",
    ),
    year: int = Query(None, description="Optional: nur Aktivitäten dieses Jahres"),
):
    """
    Gibt vereinfachte [lat, lon]-Paare aller Aktivitäten zurück – für Leaflet.heat.
    Mit simplify=20 ca. 80k Punkte; für groben Überblick reicht simplify=50.
    """
    year_join = ""
    year_where = ""
    params: list = [simplify]

    if year:
        year_join = "JOIN activities a ON tp.activity_id = a.id"
        year_where = "AND strftime('%Y', a.start_date) = ?"
        params.append(str(year))

    with db_connection() as conn:
        rows = conn.execute(
            f"""
            SELECT tp.lat, tp.lon
            FROM track_points tp
            {year_join}
            WHERE (tp.rowid % ?) = 0
              AND tp.lat IS NOT NULL
              AND tp.lon IS NOT NULL
              {year_where}
            """,
            params,
        ).fetchall()
        return {"count": len(rows), "points": [[r["lat"], r["lon"]] for r in rows]}
