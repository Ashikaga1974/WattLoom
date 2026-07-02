from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.database import db_connection

router = APIRouter(prefix="/purchases", tags=["purchases"])


class PurchaseIn(BaseModel):
    name: str
    shop: str | None = None
    url: str | None = None
    price: float | None = None
    order_date: str | None = None
    delivery_date: str | None = None
    quantity: int = 1
    notes: str | None = None
    component_type: str | None = None  # Basis-Typ (z.B. "Mantel", "Kette") für Einbauen-Formular


class AdjustIn(BaseModel):
    delta: int  # +1 = neues Exemplar dazugekommen, -1 = Exemplar aus dem Bestand entfernt


@router.get("")
def list_purchases():
    with db_connection() as conn:
        rows = conn.execute(
            """SELECT p.*, COALESCE(ic.c, 0) AS installed_count
               FROM purchases p
               LEFT JOIN (
                   SELECT purchase_id, COUNT(*) AS c FROM bike_components
                   WHERE purchase_id IS NOT NULL GROUP BY purchase_id
               ) ic ON ic.purchase_id = p.id
               ORDER BY (COALESCE(ic.c, 0) >= p.quantity), p.delivery_date DESC, p.order_date DESC"""
        ).fetchall()
        returns = conn.execute(
            """SELECT id, purchase_id, bike_id, component_type, km_ridden, returned_at, reinstalled_at
               FROM purchase_returns ORDER BY returned_at DESC"""
        ).fetchall()
        returns_by_purchase: dict[int, list[dict]] = {}
        for r in returns:
            returns_by_purchase.setdefault(r["purchase_id"], []).append(dict(r))
        return [
            {**dict(row), "returns": returns_by_purchase.get(row["id"], [])}
            for row in rows
        ]


@router.post("", status_code=201)
def add_purchase(data: PurchaseIn):
    with db_connection() as conn:
        cur = conn.execute(
            """INSERT INTO purchases (name, shop, url, price, order_date, delivery_date, quantity, notes, component_type)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (data.name, data.shop, data.url, data.price,
             data.order_date, data.delivery_date, data.quantity, data.notes, data.component_type),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM purchases WHERE id = ?", (cur.lastrowid,)).fetchone()
        return dict(row)


@router.put("/{purchase_id}")
def update_purchase(purchase_id: int, data: PurchaseIn):
    with db_connection() as conn:
        affected = conn.execute(
            """UPDATE purchases SET name=?, shop=?, url=?, price=?, order_date=?, delivery_date=?,
               quantity=?, notes=?, component_type=? WHERE id=?""",
            (data.name, data.shop, data.url, data.price,
             data.order_date, data.delivery_date, data.quantity, data.notes, data.component_type, purchase_id),
        ).rowcount
        if not affected:
            raise HTTPException(status_code=404, detail="Purchase not found")
        conn.commit()
        row = conn.execute("SELECT * FROM purchases WHERE id = ?", (purchase_id,)).fetchone()
        return dict(row)


@router.put("/{purchase_id}/adjust")
def adjust_quantity(purchase_id: int, body: AdjustIn):
    """Passt die gekaufte Menge an (delta=+1 → neues Exemplar dazugekommen, delta=-1 → eines
    aus dem Bestand entfernt, z.B. verschenkt/verloren). Untergrenze ist die Zahl tatsächlich
    verbauter Komponenten (purchase_id gesetzt) – man kann nichts entfernen, was gerade aktiv
    auf einem Bike montiert ist."""
    with db_connection() as conn:
        row = conn.execute(
            "SELECT quantity FROM purchases WHERE id = ?", (purchase_id,)
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Purchase not found")
        installed = conn.execute(
            "SELECT COUNT(*) AS c FROM bike_components WHERE purchase_id = ?", (purchase_id,)
        ).fetchone()["c"]
        new_val = max(installed, row["quantity"] + body.delta)
        conn.execute("UPDATE purchases SET quantity = ? WHERE id = ?", (new_val, purchase_id))
        conn.commit()
        return {"ok": True, "quantity": new_val}


@router.delete("/{purchase_id}", status_code=204)
def delete_purchase(purchase_id: int):
    with db_connection() as conn:
        affected = conn.execute("DELETE FROM purchases WHERE id = ?", (purchase_id,)).rowcount
        if not affected:
            raise HTTPException(status_code=404, detail="Purchase not found")
        conn.commit()
