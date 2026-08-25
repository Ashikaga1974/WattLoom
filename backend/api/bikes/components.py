from datetime import date as Date

from fastapi import APIRouter
from pydantic import BaseModel

from backend.api.errors import api_error
from backend.database import db_connection

from ._shared import _current_bike_km

router = APIRouter(prefix="/bikes", tags=["bikes"])


class ComponentCreate(BaseModel):
    type: str
    km_threshold: float
    installed_at: str | None = None   # ISO-Datum YYYY-MM-DD; fehlt → heute
    purchase_id: int | None = None    # Lager-Einkauf, aus dem die Komponente entnommen wird
    return_id: int | None = None      # purchase_returns-Eintrag, dessen Laufleistung übernommen wird


@router.post("/{bike_id}/components")
def add_component(bike_id: str, body: ComponentCreate):
    with db_connection() as conn:
        bike = conn.execute("SELECT id FROM bikes WHERE id = ?", (bike_id,)).fetchone()
        if bike is None:
            raise api_error(404, "bike_not_found", "Bike not found")
        added_at = body.installed_at or Date.today().isoformat()
        # Km-Stand des Bikes AN DEM Einbaudatum berechnen (nicht aktuell),
        # damit km_since_service die seit dem Einbau gefahrenen km korrekt widerspiegelt.
        row = conn.execute(
            "SELECT COALESCE(SUM(distance_m), 0) / 1000.0 AS km FROM activities WHERE bike_id = ? AND DATE(start_date) < ?",
            (bike_id, added_at),
        ).fetchone()
        km_at_service = round(float(row["km"]) if row else 0.0, 1)

        # body.purchase_id bezeichnet den Einkauf (die Bestellung); welches konkrete Exemplar
        # (purchase_item) davon verbaut wird, wird hier aufgelöst – anonym (irgendein passendes
        # auf Lager) oder gezielt über return_id (Vorbelastung eines bestimmten Rückläufers).
        purchase_item_id = None
        if body.purchase_id is not None:
            if body.return_id is not None:
                # Vorbelastung übernehmen: gelaufene km aus einem früheren Einsatz auf den
                # Referenzpunkt aufschlagen, damit km_since_service sie mitzählt. Der
                # Rückgabe-Eintrag wird gelöscht statt nur markiert – seine km leben ab jetzt in
                # km_at_service der neuen Komponente weiter; beim nächsten Ausbau entsteht bei
                # Bedarf ein neuer Rückgabe-Eintrag mit der dann kompletten Laufleistung. Das
                # Item selbst (seine physische Identität) bleibt dabei erhalten.
                ret = conn.execute(
                    "SELECT purchase_item_id, km_ridden FROM purchase_returns WHERE id = ?",
                    (body.return_id,),
                ).fetchone()
                if ret is None:
                    raise api_error(404, "return_record_not_found", "Return record not found")
                item = conn.execute(
                    "SELECT id, purchase_id FROM purchase_items WHERE id = ?",
                    (ret["purchase_item_id"],),
                ).fetchone()
                if item is None or item["purchase_id"] != body.purchase_id:
                    raise api_error(409, "return_record_mismatch", "Return record does not match purchase")
                purchase_item_id = item["id"]
                km_at_service = round(km_at_service - (ret["km_ridden"] or 0.0), 1)
                conn.execute("DELETE FROM purchase_returns WHERE id = ?", (body.return_id,))
            else:
                # Frisches Exemplar: ein noch unverbautes Item dieses Einkaufs ohne offene
                # Rückgabe wählen (offene Rückgaben nur gezielt über return_id verbaubar,
                # sonst ginge ihre Laufleistungs-Historie verwaist zurück).
                item = conn.execute(
                    """SELECT pi.id FROM purchase_items pi
                       WHERE pi.purchase_id = ? AND pi.disposed_at IS NULL
                         AND NOT EXISTS (SELECT 1 FROM bike_components bc WHERE bc.purchase_item_id = pi.id)
                         AND NOT EXISTS (SELECT 1 FROM purchase_returns pr WHERE pr.purchase_item_id = pi.id)
                       ORDER BY pi.id LIMIT 1""",
                    (body.purchase_id,),
                ).fetchone()
                if item is None:
                    raise api_error(409, "insufficient_stock", "Kein Lagerbestand für diesen Einkauf verfügbar")
                purchase_item_id = item["id"]

        conn.execute(
            """INSERT INTO bike_components
               (bike_id, type, km_threshold, km_at_service, added_at, purchase_item_id)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (bike_id, body.type,
             body.km_threshold, km_at_service, added_at, purchase_item_id),
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
            raise api_error(404, "component_not_found", "Component not found")
        conn.commit()
        return {"ok": True, "km_at_service": current_km}


class MaintainBody(BaseModel):
    maintained_at: str | None = None  # ISO-Datum YYYY-MM-DD; fehlt → heute


@router.put("/{bike_id}/components/{comp_id}/maintain")
def maintain_component(bike_id: str, comp_id: int, body: MaintainBody = MaintainBody()):
    """Vermerkt eine durchgeführte Kettenpflege (Reinigen/Ölen) – setzt last_maintained_at/
    last_maintained_km, unabhängig vom Verschleiß-Tracking (km_at_service bleibt unberührt).
    Bei einem nachgetragenen (rückwirkenden) Datum wird der Bike-km-Stand AN DEM Datum
    verwendet (analog zu installed_at bei add_component), nicht der aktuelle."""
    with db_connection() as conn:
        maintained_at = body.maintained_at or Date.today().isoformat()
        if body.maintained_at:
            row = conn.execute(
                "SELECT COALESCE(SUM(distance_m), 0) / 1000.0 AS km FROM activities WHERE bike_id = ? AND DATE(start_date) < ?",
                (bike_id, maintained_at),
            ).fetchone()
            km_at = round(float(row["km"]) if row else 0.0, 1)
        else:
            km_at = _current_bike_km(conn, bike_id)
        rows = conn.execute(
            "UPDATE bike_components SET last_maintained_at = ?, last_maintained_km = ? WHERE id = ? AND bike_id = ?",
            (maintained_at, km_at, comp_id, bike_id),
        ).rowcount
        if rows == 0:
            raise api_error(404, "component_not_found", "Component not found")
        conn.commit()
        return {"ok": True, "last_maintained_at": maintained_at, "last_maintained_km": km_at}


@router.put("/{bike_id}/components/{comp_id}")
def update_component(bike_id: str, comp_id: int, body: ComponentCreate):
    """Aktualisiert eine Komponente. Wenn installed_at geändert wird, wird km_at_service neu berechnet."""
    with db_connection() as conn:
        existing = conn.execute(
            "SELECT * FROM bike_components WHERE id = ? AND bike_id = ?", (comp_id, bike_id)
        ).fetchone()
        if existing is None:
            raise api_error(404, "component_not_found", "Component not found")
        added_at = body.installed_at or existing["added_at"] or Date.today().isoformat()
        row = conn.execute(
            "SELECT COALESCE(SUM(distance_m), 0) / 1000.0 AS km FROM activities WHERE bike_id = ? AND DATE(start_date) < ?",
            (bike_id, added_at),
        ).fetchone()
        km_at_service = round(float(row["km"]) if row else 0.0, 1)
        conn.execute(
            """UPDATE bike_components
               SET type=?, km_threshold=?, km_at_service=?, added_at=?
               WHERE id=? AND bike_id=?""",
            (body.type,
             body.km_threshold, km_at_service, added_at, comp_id, bike_id),
        )
        conn.commit()
        return {"ok": True}


class UninstallBody(BaseModel):
    km_ridden: float  # gelaufene km zum Zeitpunkt des Ausbaus
    purchase_id: int | None = None  # nachträglicher Lagerbezug für Altbestand ohne purchase_id


@router.put("/{bike_id}/components/{comp_id}/uninstall")
def uninstall_component(bike_id: str, comp_id: int, body: UninstallBody):
    """Baut eine Komponente aus. Bei Lagerrückgabe: Laufleistung in purchase_returns vermerken
    und die Komponente aus der Liste entfernen (kein Verschleiß-Tracking auf dem Bike mehr nötig,
    sobald sie wieder anonymer Lagerbestand ist). Ohne Lagerbezug bleibt sie als Verlauf stehen."""
    with db_connection() as conn:
        comp = conn.execute(
            "SELECT type, purchase_item_id, retired_at, uninstalled_km FROM bike_components WHERE id = ? AND bike_id = ?",
            (comp_id, bike_id),
        ).fetchone()
        if comp is None:
            raise api_error(404, "component_not_found", "Component not found")
        if comp["uninstalled_km"] is not None:
            raise api_error(409, "component_already_returned", "Component already returned to stock")
        # retired_at beibehalten wenn bereits gesetzt (Inaktiv-Button), sonst heute setzen
        retired_at = comp["retired_at"] or Date.today().isoformat()
        km_ridden = round(body.km_ridden, 1)
        # Bestehender Lagerbezug hat Vorrang; fehlt er, kann er hier nachträglich gesetzt werden
        # (Übergangs-Komponenten aus der Zeit vor dem Einkaufs-Lager) – dafür wird ein neues Item
        # unter dem gewählten Einkauf angelegt, das diese physische Komponente ab jetzt repräsentiert.
        item_id = comp["purchase_item_id"]
        if item_id is None and body.purchase_id is not None:
            item_id = conn.execute(
                "INSERT INTO purchase_items (purchase_id) VALUES (?)", (body.purchase_id,)
            ).lastrowid
        if item_id is not None:
            conn.execute(
                """INSERT INTO purchase_returns (purchase_item_id, bike_id, component_type, km_ridden, returned_at)
                   VALUES (?, ?, ?, ?, ?)""",
                (item_id, bike_id, comp["type"], km_ridden, retired_at),
            )
            # Löschen der Zeile reicht – das Item gilt automatisch wieder als "auf Lager",
            # sobald keine bike_components-Zeile mehr darauf verweist.
            conn.execute("DELETE FROM bike_components WHERE id = ?", (comp_id,))
        else:
            conn.execute(
                "UPDATE bike_components SET retired_at = ?, uninstalled_km = ? WHERE id = ?",
                (retired_at, km_ridden, comp_id),
            )
        conn.commit()
        return {"ok": True}


class LinkPurchaseBody(BaseModel):
    purchase_id: int


@router.put("/{bike_id}/components/{comp_id}/link-purchase")
def link_component_purchase(bike_id: str, comp_id: int, body: LinkPurchaseBody):
    """Verknüpft eine noch verbaute Komponente (aktiv oder inaktiv, aber noch nicht ausgebaut)
    nachträglich mit einem Einkauf – für Altbestand, der vor dem Lager-Feature eingebaut wurde
    oder beim Einbau ohne Lagerbezug erfasst wurde. Die Komponente bleibt verbaut, es wird nur
    ein neues purchase_item unter dem gewählten Einkauf angelegt und referenziert."""
    with db_connection() as conn:
        comp = conn.execute(
            "SELECT purchase_item_id, uninstalled_km FROM bike_components WHERE id = ? AND bike_id = ?",
            (comp_id, bike_id),
        ).fetchone()
        if comp is None:
            raise api_error(404, "component_not_found", "Component not found")
        if comp["purchase_item_id"] is not None:
            raise api_error(409, "component_already_linked", "Component already linked to a purchase")
        if comp["uninstalled_km"] is not None:
            raise api_error(409, "component_already_uninstalled", "Component already uninstalled – use return-to-stock instead")
        item_id = conn.execute(
            "INSERT INTO purchase_items (purchase_id) VALUES (?)", (body.purchase_id,)
        ).lastrowid
        conn.execute(
            "UPDATE bike_components SET purchase_item_id = ? WHERE id = ?", (item_id, comp_id)
        )
        conn.commit()
        return {"ok": True}


class ReturnToStockBody(BaseModel):
    purchase_id: int


@router.put("/{bike_id}/components/{comp_id}/return-to-stock")
def return_component_to_stock(bike_id: str, comp_id: int, body: ReturnToStockBody):
    """Ordnet eine bereits ausgebaute Komponente nachträglich einem Einkauf zu, vermerkt ihre
    Laufleistung in purchase_returns und entfernt sie aus der Bike-Liste
    (Übergangsfall: Komponente wurde ausgebaut, bevor das Einkaufs-Lager existierte)."""
    with db_connection() as conn:
        comp = conn.execute(
            "SELECT type, purchase_item_id, retired_at, uninstalled_km FROM bike_components WHERE id = ? AND bike_id = ?",
            (comp_id, bike_id),
        ).fetchone()
        if comp is None:
            raise api_error(404, "component_not_found", "Component not found")
        if comp["retired_at"] is None:
            raise api_error(409, "component_still_active", "Component is still active")
        if comp["purchase_item_id"] is not None:
            raise api_error(409, "component_already_linked", "Component already linked to a purchase")
        item_id = conn.execute(
            "INSERT INTO purchase_items (purchase_id) VALUES (?)", (body.purchase_id,)
        ).lastrowid
        conn.execute(
            """INSERT INTO purchase_returns (purchase_item_id, bike_id, component_type, km_ridden, returned_at)
               VALUES (?, ?, ?, ?, ?)""",
            (item_id, bike_id, comp["type"], comp["uninstalled_km"], comp["retired_at"]),
        )
        conn.execute("DELETE FROM bike_components WHERE id = ?", (comp_id,))
        conn.commit()
        return {"ok": True}


@router.delete("/{bike_id}/components/{comp_id}")
def delete_component(bike_id: str, comp_id: int):
    """Löscht eine Komponente unwiderruflich. Snapshot geht nach deleted_components (Historie),
    ein verknüpftes purchase_item wird entsorgt statt wieder auf Lager freigegeben – die
    Komponente ist physisch weg, nicht zurückgelegt."""
    with db_connection() as conn:
        comp = conn.execute(
            "SELECT * FROM bike_components WHERE id = ? AND bike_id = ?", (comp_id, bike_id)
        ).fetchone()
        if comp is None:
            raise api_error(404, "component_not_found", "Component not found")
        current_km = _current_bike_km(conn, bike_id)
        km_since_service = round(max(0.0, current_km - float(comp["km_at_service"] or 0)), 1)
        deleted_at = Date.today().isoformat()
        conn.execute(
            """INSERT INTO deleted_components
               (bike_id, type, km_threshold, km_at_service, km_since_service, added_at,
                retired_at, uninstalled_km, purchase_item_id, deleted_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (bike_id, comp["type"], comp["km_threshold"], comp["km_at_service"], km_since_service,
             comp["added_at"], comp["retired_at"], comp["uninstalled_km"], comp["purchase_item_id"],
             deleted_at),
        )
        if comp["purchase_item_id"] is not None:
            conn.execute(
                "UPDATE purchase_items SET disposed_at = ? WHERE id = ?",
                (deleted_at, comp["purchase_item_id"]),
            )
        conn.execute("DELETE FROM bike_components WHERE id = ?", (comp_id,))
        conn.commit()
        return {"ok": True}
