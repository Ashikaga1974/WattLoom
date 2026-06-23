from fastapi import APIRouter
from pydantic import create_model
from backend.database import db_connection

router = APIRouter(prefix="/settings", tags=["settings"])

# Feldname → (Zieltyp, Default). Default=None bedeutet: kein Wert bis Nutzer einträgt.
_FIELDS: dict[str, tuple[type, object]] = {
    "weight_kg":           (float, None),
    "birth_year":          (int,   None),
    "tz_offset":           (int,   None),
    "hr_max":              (int,   185),
    "bezier_tension":      (float, 0.2),
    "sparkline_weeks":     (int,   8),
    "speed_color_buckets": (int,   20),
    "track_simplify_m":    (int,   5),
}


# Pydantic-Modell aus _FIELDS abgeleitet – Typen nur einmal definiert
SettingsUpdate = create_model(
    "SettingsUpdate",
    **{k: (t | None, None) for k, (t, _) in _FIELDS.items()},
)


def _load_settings(conn) -> dict:
    rows = conn.execute("SELECT key, value FROM config").fetchall()
    data = {r["key"]: r["value"] for r in rows}
    return {
        key: typ(data[key]) if key in data else default
        for key, (typ, default) in _FIELDS.items()
    }


@router.get("")
def get_settings():
    with db_connection() as conn:
        return _load_settings(conn)


@router.post("")
def update_settings(body: SettingsUpdate):
    with db_connection() as conn:
        for key in _FIELDS:
            val = getattr(body, key, None)
            if val is not None:
                conn.execute(
                    "INSERT INTO config(key, value) VALUES(?, ?) "
                    "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                    (key, str(val)),
                )
            elif key in body.model_fields_set:
                # Explizit null → auf Default zurücksetzen (Eintrag löschen)
                conn.execute("DELETE FROM config WHERE key = ?", (key,))
        conn.commit()
        return _load_settings(conn)
