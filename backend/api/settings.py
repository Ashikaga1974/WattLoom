from fastapi import APIRouter
from pydantic import BaseModel
from backend.database import db_connection

router = APIRouter(prefix="/settings", tags=["settings"])

# Standardwerte für App-Konfigurationsparameter
_CONFIG_DEFAULTS = {
    "bezier_tension":      0.2,
    "sparkline_weeks":     8,
    "speed_color_buckets": 20,
    "track_simplify_m":    5,
}


class SettingsUpdate(BaseModel):
    weight_kg:           float | None = None
    birth_year:          int   | None = None
    tz_offset:           int   | None = None
    bezier_tension:      float | None = None
    sparkline_weeks:     int   | None = None
    speed_color_buckets: int   | None = None
    track_simplify_m:    int   | None = None


def _load_settings(conn):
    rows = conn.execute("SELECT key, value FROM config").fetchall()
    data = {r["key"]: r["value"] for r in rows}
    return {
        "weight_kg":           float(data["weight_kg"])           if "weight_kg"           in data else None,
        "birth_year":          int(data["birth_year"])             if "birth_year"          in data else None,
        "tz_offset":           int(data["tz_offset"])              if "tz_offset"           in data else None,
        "bezier_tension":      float(data["bezier_tension"])       if "bezier_tension"      in data else _CONFIG_DEFAULTS["bezier_tension"],
        "sparkline_weeks":     int(data["sparkline_weeks"])        if "sparkline_weeks"     in data else _CONFIG_DEFAULTS["sparkline_weeks"],
        "speed_color_buckets": int(data["speed_color_buckets"])    if "speed_color_buckets" in data else _CONFIG_DEFAULTS["speed_color_buckets"],
        "track_simplify_m":    int(data["track_simplify_m"])       if "track_simplify_m"    in data else _CONFIG_DEFAULTS["track_simplify_m"],
    }


@router.get("")
def get_settings():
    with db_connection() as conn:
        return _load_settings(conn)


@router.post("")
def update_settings(body: SettingsUpdate):
    with db_connection() as conn:
        fields = {
            "weight_kg":           str(body.weight_kg)           if body.weight_kg           is not None else None,
            "birth_year":          str(body.birth_year)          if body.birth_year          is not None else None,
            "tz_offset":           str(body.tz_offset)           if body.tz_offset           is not None else None,
            "bezier_tension":      str(body.bezier_tension)      if body.bezier_tension      is not None else None,
            "sparkline_weeks":     str(body.sparkline_weeks)     if body.sparkline_weeks     is not None else None,
            "speed_color_buckets": str(body.speed_color_buckets) if body.speed_color_buckets is not None else None,
            "track_simplify_m":    str(body.track_simplify_m)    if body.track_simplify_m    is not None else None,
        }
        for key, val in fields.items():
            if val is not None:
                conn.execute(
                    "INSERT INTO config(key, value) VALUES(?, ?) "
                    "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                    (key, val),
                )
            elif key in body.model_fields_set:
                # Explizit null → auf Default zurücksetzen (Eintrag löschen)
                conn.execute("DELETE FROM config WHERE key = ?", (key,))
        conn.commit()
        return _load_settings(conn)
