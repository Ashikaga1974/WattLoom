from datetime import date as Date

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from backend.database import db_connection

router = APIRouter(prefix="/purchases", tags=["purchases"])

# Aggregat-Subquery: quantity = Anzahl nicht-entsorgter Items, installed_count = davon verbaut.
# "quantity" zählt bewusst nicht die entsorgten Items mit (disposed_at gesetzt) – das entspricht
# der alten Semantik, bei der ein "verloren/verschenkt" per −-Button die Menge direkt verringerte.
_COUNTS_SUBQUERY = """
    SELECT pi.purchase_id,
           COUNT(CASE WHEN pi.disposed_at IS NULL THEN 1 END) AS total,
           COUNT(CASE WHEN pi.disposed_at IS NULL AND bc.id IS NOT NULL THEN 1 END) AS installed
    FROM purchase_items pi
    LEFT JOIN bike_components bc ON bc.purchase_item_id = pi.id
    GROUP BY pi.purchase_id
"""


class PurchaseCreate(BaseModel):
    name: str
    shop: str | None = None
    url: str | None = None
    price: float | None = None
    order_date: str | None = None
    delivery_date: str | None = None
    # Nur beim Anlegen: so viele purchase_items werden erzeugt. 0 erlaubt für den Fall, dass ein
    # aufrufender Endpoint (z.B. link-purchase/uninstall/return-to-stock) direkt danach selbst
    # genau ein Item für eine bestehende physische Komponente anlegt – sonst gäbe es 2 statt 1.
    quantity: int = Field(default=1, ge=0)
    notes: str | None = None
    component_type: str | None = None  # Basis-Typ (z.B. "Mantel", "Kette") für Einbauen-Formular
    storage_location_id: int | None = None


class PurchaseUpdate(BaseModel):
    name: str
    shop: str | None = None
    url: str | None = None
    price: float | None = None
    order_date: str | None = None
    delivery_date: str | None = None
    notes: str | None = None
    component_type: str | None = None
    storage_location_id: int | None = None
    # Kein quantity-Feld: die Stückzahl wird ausschließlich über /adjust (+/−) verändert,
    # nicht über das Bearbeiten-Formular der Bestellung.


class AdjustIn(BaseModel):
    delta: int  # +n = n neue Exemplare dazugekommen, -n = n aus dem Bestand entfernt (verschenkt/verloren)


def _purchase_by_id(conn, purchase_id: int) -> dict:
    row = conn.execute(
        f"""SELECT p.*, sl.name AS storage_location_name,
                   COALESCE(cnt.total, 0) AS quantity, COALESCE(cnt.installed, 0) AS installed_count
            FROM purchases p
            LEFT JOIN storage_locations sl ON sl.id = p.storage_location_id
            LEFT JOIN ({_COUNTS_SUBQUERY}) cnt ON cnt.purchase_id = p.id
            WHERE p.id = ?""",
        (purchase_id,),
    ).fetchone()
    returns = conn.execute(
        """SELECT pr.id, pi.purchase_id, pr.bike_id, pr.component_type, pr.km_ridden, pr.returned_at
           FROM purchase_returns pr
           JOIN purchase_items pi ON pi.id = pr.purchase_item_id
           WHERE pi.purchase_id = ?
           ORDER BY pr.returned_at DESC""",
        (purchase_id,),
    ).fetchall()
    return {**dict(row), "returns": [dict(r) for r in returns]}


@router.get("")
def list_purchases():
    with db_connection() as conn:
        rows = conn.execute(
            f"""SELECT p.*, sl.name AS storage_location_name,
                       COALESCE(cnt.total, 0) AS quantity, COALESCE(cnt.installed, 0) AS installed_count
                FROM purchases p
                LEFT JOIN storage_locations sl ON sl.id = p.storage_location_id
                LEFT JOIN ({_COUNTS_SUBQUERY}) cnt ON cnt.purchase_id = p.id
                ORDER BY (COALESCE(cnt.installed, 0) >= COALESCE(cnt.total, 0)),
                         p.delivery_date DESC, p.order_date DESC"""
        ).fetchall()
        returns = conn.execute(
            """SELECT pr.id, pi.purchase_id, pr.bike_id, pr.component_type, pr.km_ridden, pr.returned_at
               FROM purchase_returns pr
               JOIN purchase_items pi ON pi.id = pr.purchase_item_id
               ORDER BY pr.returned_at DESC"""
        ).fetchall()
        returns_by_purchase: dict[int, list[dict]] = {}
        for r in returns:
            returns_by_purchase.setdefault(r["purchase_id"], []).append(dict(r))
        return [
            {**dict(row), "returns": returns_by_purchase.get(row["id"], [])}
            for row in rows
        ]


@router.post("", status_code=201)
def add_purchase(data: PurchaseCreate):
    with db_connection() as conn:
        cur = conn.execute(
            """INSERT INTO purchases (name, shop, url, price, order_date, delivery_date, notes, component_type, storage_location_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (data.name, data.shop, data.url, data.price,
             data.order_date, data.delivery_date, data.notes, data.component_type, data.storage_location_id),
        )
        purchase_id = cur.lastrowid
        conn.executemany(
            "INSERT INTO purchase_items (purchase_id) VALUES (?)",
            [(purchase_id,)] * data.quantity,
        )
        conn.commit()
        return _purchase_by_id(conn, purchase_id)


@router.put("/{purchase_id}")
def update_purchase(purchase_id: int, data: PurchaseUpdate):
    with db_connection() as conn:
        affected = conn.execute(
            """UPDATE purchases SET name=?, shop=?, url=?, price=?, order_date=?, delivery_date=?,
               notes=?, component_type=?, storage_location_id=? WHERE id=?""",
            (data.name, data.shop, data.url, data.price,
             data.order_date, data.delivery_date, data.notes, data.component_type,
             data.storage_location_id, purchase_id),
        ).rowcount
        if not affected:
            raise HTTPException(status_code=404, detail="Purchase not found")
        conn.commit()
        return _purchase_by_id(conn, purchase_id)


@router.put("/{purchase_id}/adjust")
def adjust_quantity(purchase_id: int, body: AdjustIn):
    """Passt die Stückzahl an: delta>0 legt neue (auf Lager befindliche) Items an, delta<0 markiert
    entsprechend viele noch nicht verbaute Items als entsorgt (verschenkt/verloren). Es können nie
    mehr Items entsorgt werden, als aktuell tatsächlich auf Lager sind."""
    with db_connection() as conn:
        exists = conn.execute("SELECT id FROM purchases WHERE id = ?", (purchase_id,)).fetchone()
        if exists is None:
            raise HTTPException(status_code=404, detail="Purchase not found")

        if body.delta > 0:
            conn.executemany(
                "INSERT INTO purchase_items (purchase_id) VALUES (?)",
                [(purchase_id,)] * body.delta,
            )
        elif body.delta < 0:
            n = -body.delta
            available = conn.execute(
                """SELECT pi.id FROM purchase_items pi
                   WHERE pi.purchase_id = ? AND pi.disposed_at IS NULL
                     AND NOT EXISTS (SELECT 1 FROM bike_components bc WHERE bc.purchase_item_id = pi.id)
                   ORDER BY pi.id LIMIT ?""",
                (purchase_id, n),
            ).fetchall()
            if len(available) < n:
                raise HTTPException(status_code=409, detail="Nicht genug Lagerbestand zum Entfernen vorhanden")
            today = Date.today().isoformat()
            conn.executemany(
                "UPDATE purchase_items SET disposed_at = ? WHERE id = ?",
                [(today, row["id"]) for row in available],
            )

        conn.commit()
        counts = conn.execute(
            "SELECT COUNT(CASE WHEN disposed_at IS NULL THEN 1 END) AS c FROM purchase_items WHERE purchase_id = ?",
            (purchase_id,),
        ).fetchone()
        return {"ok": True, "quantity": counts["c"]}


@router.delete("/{purchase_id}", status_code=204)
def delete_purchase(purchase_id: int):
    with db_connection() as conn:
        row = conn.execute("SELECT id FROM purchases WHERE id = ?", (purchase_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Purchase not found")
        installed = conn.execute(
            """SELECT COUNT(*) AS c FROM purchase_items pi
               JOIN bike_components bc ON bc.purchase_item_id = pi.id
               WHERE pi.purchase_id = ?""",
            (purchase_id,),
        ).fetchone()["c"]
        if installed:
            raise HTTPException(status_code=409, detail="Einkauf enthält noch verbaute Komponenten")
        open_returns = conn.execute(
            """SELECT COUNT(*) AS c FROM purchase_returns pr
               JOIN purchase_items pi ON pi.id = pr.purchase_item_id
               WHERE pi.purchase_id = ?""",
            (purchase_id,),
        ).fetchone()["c"]
        if open_returns:
            raise HTTPException(status_code=409, detail="Einkauf hat noch offene Rückgabe-Historie")
        # deleted_components.purchase_item_id verweist bei unwiderruflich gelöschten Komponenten
        # weiterhin auf das Item (siehe DELETE .../components/{id}) - anders als bike_components/
        # purchase_returns oben ist das aber reine, abgeschlossene Historie (nicht reaktivierbar),
        # die den Einkauf nicht blockieren soll. Ohne dieses NULL-Setzen brach das folgende
        # DELETE FROM purchase_items mit FOREIGN KEY constraint failed ab.
        conn.execute(
            """UPDATE deleted_components SET purchase_item_id = NULL
               WHERE purchase_item_id IN (SELECT id FROM purchase_items WHERE purchase_id = ?)""",
            (purchase_id,),
        )
        conn.execute("DELETE FROM purchase_items WHERE purchase_id = ?", (purchase_id,))
        conn.execute("DELETE FROM purchases WHERE id = ?", (purchase_id,))
        conn.commit()
