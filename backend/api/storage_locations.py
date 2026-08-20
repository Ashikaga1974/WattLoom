from fastapi import APIRouter
from pydantic import BaseModel

from backend.api.errors import api_error
from backend.database import db_connection

router = APIRouter(prefix="/storage-locations", tags=["storage-locations"])


class StorageLocationIn(BaseModel):
    name: str


@router.get("")
def list_storage_locations():
    with db_connection() as conn:
        rows = conn.execute("SELECT id, name FROM storage_locations ORDER BY name").fetchall()
        return [dict(r) for r in rows]


@router.post("", status_code=201)
def add_storage_location(data: StorageLocationIn):
    name = data.name.strip()
    if not name:
        raise api_error(400, "name_required", "Name darf nicht leer sein")
    with db_connection() as conn:
        if conn.execute("SELECT id FROM storage_locations WHERE name = ?", (name,)).fetchone():
            raise api_error(409, "storage_location_exists", "Lagerplatz existiert bereits")
        cur = conn.execute("INSERT INTO storage_locations (name) VALUES (?)", (name,))
        conn.commit()
        return {"id": cur.lastrowid, "name": name}


@router.put("/{location_id}")
def rename_storage_location(location_id: int, data: StorageLocationIn):
    name = data.name.strip()
    if not name:
        raise api_error(400, "name_required", "Name darf nicht leer sein")
    with db_connection() as conn:
        if conn.execute(
            "SELECT id FROM storage_locations WHERE name = ? AND id != ?", (name, location_id)
        ).fetchone():
            raise api_error(409, "storage_location_exists", "Lagerplatz existiert bereits")
        affected = conn.execute(
            "UPDATE storage_locations SET name = ? WHERE id = ?", (name, location_id)
        ).rowcount
        if not affected:
            raise api_error(404, "storage_location_not_found", "Lagerplatz nicht gefunden")
        conn.commit()
        return {"id": location_id, "name": name}


@router.delete("/{location_id}", status_code=204)
def delete_storage_location(location_id: int):
    # ON DELETE SET NULL auf purchases.storage_location_id räumt Referenzen automatisch ab
    # (PRAGMA foreign_keys=ON in db_connection()) - Einkäufe bleiben erhalten, nur ohne Lagerplatz.
    with db_connection() as conn:
        affected = conn.execute("DELETE FROM storage_locations WHERE id = ?", (location_id,)).rowcount
        if not affected:
            raise api_error(404, "storage_location_not_found", "Lagerplatz nicht gefunden")
        conn.commit()
