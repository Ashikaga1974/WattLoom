from fastapi import APIRouter, Query
from backend.database import get_connection

router = APIRouter(prefix="/segments", tags=["segments"])


@router.get("")
def list_segment_efforts(
    name: str | None = None,
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
):
    filters = []
    params: list = []
    if name:
        filters.append("name LIKE ?")
        params.append(f"%{name}%")
    where = ("WHERE " + " AND ".join(filters)) if filters else ""

    conn = get_connection()
    rows = conn.execute(
        f"""
        SELECT se.*, a.start_date, a.name AS activity_name
        FROM segment_efforts se
        JOIN activities a ON se.activity_id = a.id
        {where}
        ORDER BY se.elapsed_time_s
        LIMIT ? OFFSET ?
        """,
        params + [limit, offset],
    ).fetchall()
    total = conn.execute(
        f"SELECT COUNT(*) FROM segment_efforts {where}", params
    ).fetchone()[0]
    conn.close()
    return {"total": total, "items": [dict(r) for r in rows]}


@router.get("/names")
def list_segment_names():
    """Alle bekannten Segment-Namen (für Autocomplete/Filter)."""
    conn = get_connection()
    rows = conn.execute(
        "SELECT DISTINCT name FROM segment_efforts WHERE name IS NOT NULL ORDER BY name"
    ).fetchall()
    conn.close()
    return [r["name"] for r in rows]
