"""
Selbst definierte Streckenabschnitte ("Segmente") – siehe CLAUDE.md-Absprache:
Nutzer markiert ein Teilstück einer bestehenden Fahrt, alle Aktivitäten mit Track werden
danach automatisch darauf geprüft (backend/segment_matching.py).
"""
import json
import threading

from fastapi import APIRouter
from pydantic import BaseModel

from backend.api.errors import api_error
from backend.database import db_connection
from backend.segment_matching import match_segment_against_all

router = APIRouter(prefix="/segments", tags=["segments"])


class SegmentCreate(BaseModel):
    name: str
    activity_id: int
    start_distance_m: float
    end_distance_m: float


def _build_segment_points(conn, activity_id: int, start_distance_m: float, end_distance_m: float) -> list[dict]:
    """Lädt die Track-Punkte der Quell-Aktivität im gewählten Distanzbereich und macht die
    Distanz relativ zum Segmentstart (0 = Start). Gibt eine leere Liste zurück, wenn der
    Bereich zu wenige Punkte enthält."""
    rows = conn.execute(
        """SELECT distance_m, lat, lon
           FROM track_points
           WHERE activity_id = ? AND distance_m BETWEEN ? AND ?
                 AND lat IS NOT NULL AND lon IS NOT NULL
           ORDER BY distance_m""",
        (activity_id, start_distance_m, end_distance_m),
    ).fetchall()
    if len(rows) < 2:
        return []
    base = rows[0]["distance_m"]
    return [{"dist_m": r["distance_m"] - base, "lat": r["lat"], "lon": r["lon"]} for r in rows]


def _rematch_in_background(segment_id: int) -> None:
    """Rückwirkendes Matching gegen alle bestehenden Aktivitäten – läuft im Hintergrund,
    da der Bounding-Box-Scan über alle Track-Punkte ein paar Sekunden dauern kann."""
    def _job() -> None:
        with db_connection() as conn:
            segment = conn.execute("SELECT * FROM custom_segments WHERE id = ?", (segment_id,)).fetchone()
            if segment is None:
                return
            match_segment_against_all(conn, dict(segment))

    threading.Thread(target=_job, daemon=True).start()


@router.get("")
def list_segments():
    """Alle Segmente mit Trefferzahl + Bestzeit, neueste zuerst."""
    with db_connection() as conn:
        rows = conn.execute("""
            SELECT
                s.id, s.name, s.distance_m, s.created_at,
                COUNT(e.id) AS effort_count,
                MIN(e.time_s) AS best_time_s
            FROM custom_segments s
            LEFT JOIN custom_segment_efforts e ON e.segment_id = s.id
            GROUP BY s.id
            ORDER BY s.created_at DESC
        """).fetchall()
        return [dict(r) for r in rows]


@router.post("")
def create_segment(payload: SegmentCreate):
    if payload.end_distance_m <= payload.start_distance_m:
        raise api_error(400, "invalid_segment_range", "end_distance_m muss größer als start_distance_m sein")

    with db_connection() as conn:
        activity = conn.execute(
            "SELECT id, has_track FROM activities WHERE id = ?", (payload.activity_id,)
        ).fetchone()
        if activity is None:
            raise api_error(404, "activity_not_found", "Activity not found")
        if not activity["has_track"]:
            raise api_error(400, "activity_has_no_track", "Aktivität hat keinen Track")

        points = _build_segment_points(conn, payload.activity_id, payload.start_distance_m, payload.end_distance_m)
        if not points:
            raise api_error(400, "segment_too_short", "Zu wenige Track-Punkte im gewählten Bereich")

        distance_m = points[-1]["dist_m"]
        with conn:
            cursor = conn.execute(
                """INSERT INTO custom_segments (name, source_activity_id, distance_m, points)
                   VALUES (?, ?, ?, ?)""",
                (payload.name, payload.activity_id, distance_m, json.dumps(points)),
            )
            segment_id = cursor.lastrowid

    _rematch_in_background(segment_id)
    return {"id": segment_id, "name": payload.name, "distance_m": distance_m}


@router.get("/{segment_id}")
def get_segment(segment_id: int):
    with db_connection() as conn:
        segment = conn.execute("SELECT * FROM custom_segments WHERE id = ?", (segment_id,)).fetchone()
        if segment is None:
            raise api_error(404, "segment_not_found", "Segment not found")
        result = dict(segment)
        result["points"] = json.loads(result["points"])
        return result


@router.delete("/{segment_id}")
def delete_segment(segment_id: int):
    with db_connection() as conn:
        row = conn.execute("SELECT id FROM custom_segments WHERE id = ?", (segment_id,)).fetchone()
        if row is None:
            raise api_error(404, "segment_not_found", "Segment not found")
        with conn:
            conn.execute("DELETE FROM custom_segment_efforts WHERE segment_id = ?", (segment_id,))
            conn.execute("DELETE FROM custom_segments WHERE id = ?", (segment_id,))
    return {"ok": True, "deleted_id": segment_id}


@router.get("/{segment_id}/efforts")
def list_efforts(segment_id: int):
    with db_connection() as conn:
        segment = conn.execute("SELECT id FROM custom_segments WHERE id = ?", (segment_id,)).fetchone()
        if segment is None:
            raise api_error(404, "segment_not_found", "Segment not found")
        rows = conn.execute("""
            SELECT
                e.id, e.activity_id, e.time_s, e.avg_speed_kmh, e.avg_hr,
                e.avg_power_w, e.norm_power_w, e.match_pct, e.created_at,
                a.name AS activity_name, a.start_date_local AS activity_date
            FROM custom_segment_efforts e
            JOIN activities a ON a.id = e.activity_id
            WHERE e.segment_id = ?
            ORDER BY e.time_s ASC
        """, (segment_id,)).fetchall()
        return [dict(r) for r in rows]
