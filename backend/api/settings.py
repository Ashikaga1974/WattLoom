from fastapi import APIRouter
from pydantic import BaseModel
from backend.database import get_connection

router = APIRouter(prefix="/settings", tags=["settings"])


class SettingsUpdate(BaseModel):
    weight_kg: float | None = None
    birth_year: int | None = None
    ftp_manual: int | None = None
    tz_offset: int | None = None


def _load_settings(conn):
    rows = conn.execute("SELECT key, value FROM config").fetchall()
    data = {r["key"]: r["value"] for r in rows}
    return {
        "weight_kg":  float(data["weight_kg"])  if "weight_kg"  in data else None,
        "birth_year": int(data["birth_year"])    if "birth_year" in data else None,
        "ftp_manual": int(data["ftp_manual"])    if "ftp_manual" in data else None,
        "tz_offset":  int(data["tz_offset"])     if "tz_offset"  in data else None,
    }


@router.get("")
def get_settings():
    conn = get_connection()
    result = _load_settings(conn)
    conn.close()
    return result


@router.post("")
def update_settings(body: SettingsUpdate):
    conn = get_connection()
    fields = {
        "weight_kg":  str(body.weight_kg)  if body.weight_kg  is not None else None,
        "birth_year": str(body.birth_year) if body.birth_year is not None else None,
        "ftp_manual": str(body.ftp_manual) if body.ftp_manual is not None else None,
        "tz_offset":  str(body.tz_offset)  if body.tz_offset  is not None else None,
    }
    for key, val in fields.items():
        if val is not None:
            conn.execute(
                "INSERT INTO config(key, value) VALUES(?, ?) "
                "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                (key, val),
            )
        elif key in body.model_fields_set:
            # Explizit null gesendet → Wert aus DB entfernen (z.B. tz_offset → Auto)
            conn.execute("DELETE FROM config WHERE key = ?", (key,))
    conn.commit()
    result = _load_settings(conn)
    conn.close()
    return result
