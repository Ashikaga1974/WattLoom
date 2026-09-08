"""
Tests für backend/api/purchases.py – Einkaufs-Lager (purchase_items: 1 Zeile je physischem Teil).
Deckt insbesondere die Session-2026-07-02b/c-Bugs ab (quantity-Zähler lief auseinander,
quantity:0 beim Anlegen war der Fix gegen Doppelzählung), siehe CLAUDE.md.
"""
from contextlib import contextmanager

import pytest
from fastapi import HTTPException

import backend.api.purchases as purchases
from backend.api.purchases import (
    AdjustIn,
    PurchaseCreate,
    _purchase_by_id,
    add_purchase,
    adjust_quantity,
    delete_purchase,
    list_purchases,
)

BIKE = "test_bike"


def _patch_db(monkeypatch, conn):
    @contextmanager
    def fake_db_connection():
        yield conn
    monkeypatch.setattr(purchases, "db_connection", fake_db_connection)


class TestAddPurchase:
    def test_quantity_creates_matching_number_of_items(self, db, monkeypatch):
        _patch_db(monkeypatch, db)
        result = add_purchase(PurchaseCreate(name="Kette Shimano", quantity=3))
        assert result["quantity"] == 3
        assert result["installed_count"] == 0
        count = db.execute(
            "SELECT COUNT(*) AS c FROM purchase_items WHERE purchase_id = ?", (result["id"],)
        ).fetchone()["c"]
        assert count == 3

    def test_quantity_zero_allowed_creates_no_items(self, db, monkeypatch):
        """Regressionstest: quantity=0 ist der Fix gegen den Doppelzählungs-Bug, wenn ein
        Folge-Aufruf (link-purchase/uninstall/return-to-stock) selbst genau ein Item anlegt."""
        _patch_db(monkeypatch, db)
        result = add_purchase(PurchaseCreate(name="Altbestand-Nachtrag", quantity=0))
        assert result["quantity"] == 0
        count = db.execute(
            "SELECT COUNT(*) AS c FROM purchase_items WHERE purchase_id = ?", (result["id"],)
        ).fetchone()["c"]
        assert count == 0


class TestQuantityDerivation:
    def test_installed_count_reflects_bike_components_reference(self, db, monkeypatch):
        _patch_db(monkeypatch, db)
        created = add_purchase(PurchaseCreate(name="Reifen", quantity=4))
        items = db.execute(
            "SELECT id FROM purchase_items WHERE purchase_id = ? ORDER BY id", (created["id"],)
        ).fetchall()
        db.execute(
            "INSERT INTO bike_components (bike_id, type, purchase_item_id) VALUES (?, 'tire_front', ?)",
            (BIKE, items[0]["id"]),
        )
        db.execute(
            "UPDATE purchase_items SET disposed_at = '2026-01-01' WHERE id = ?", (items[1]["id"],)
        )
        db.commit()

        row = _purchase_by_id(db, created["id"])
        # 4 Items, 1 entsorgt -> quantity zaehlt nur die 3 nicht-entsorgten; davon 1 verbaut
        assert row["quantity"] == 3
        assert row["installed_count"] == 1

    def test_list_purchases_matches_single_lookup(self, db, monkeypatch):
        _patch_db(monkeypatch, db)
        created = add_purchase(PurchaseCreate(name="Bremsbeläge", quantity=2))
        listed = list_purchases()
        assert len(listed) == 1
        assert listed[0]["quantity"] == 2
        assert listed[0]["id"] == created["id"]


class TestAdjustQuantity:
    def test_positive_delta_adds_items(self, db, monkeypatch):
        _patch_db(monkeypatch, db)
        created = add_purchase(PurchaseCreate(name="Schläuche", quantity=2))
        result = adjust_quantity(created["id"], AdjustIn(delta=3))
        assert result["quantity"] == 5

    def test_negative_delta_disposes_only_uninstalled_items(self, db, monkeypatch):
        _patch_db(monkeypatch, db)
        created = add_purchase(PurchaseCreate(name="Schläuche", quantity=3))
        items = db.execute(
            "SELECT id FROM purchase_items WHERE purchase_id = ? ORDER BY id", (created["id"],)
        ).fetchall()
        db.execute(
            "INSERT INTO bike_components (bike_id, type, purchase_item_id) VALUES (?, 'tube_front', ?)",
            (BIKE, items[0]["id"]),
        )
        db.commit()

        result = adjust_quantity(created["id"], AdjustIn(delta=-2))
        assert result["quantity"] == 1  # 3 - 2 entsorgt = 1 übrig (das verbaute zählt nicht als "auf Lager")
        installed_item = db.execute(
            "SELECT disposed_at FROM purchase_items WHERE id = ?", (items[0]["id"],)
        ).fetchone()
        assert installed_item["disposed_at"] is None  # das verbaute Item wurde nicht angetastet

    def test_negative_delta_insufficient_stock_raises_409_and_disposes_nothing(self, db, monkeypatch):
        _patch_db(monkeypatch, db)
        created = add_purchase(PurchaseCreate(name="Schläuche", quantity=1))
        with pytest.raises(HTTPException) as exc:
            adjust_quantity(created["id"], AdjustIn(delta=-2))
        assert exc.value.status_code == 409
        assert exc.value.detail["code"] == "insufficient_stock"
        # Nichts wurde entsorgt, obwohl die Prüfung fehlgeschlagen ist
        count = db.execute(
            "SELECT COUNT(*) AS c FROM purchase_items WHERE purchase_id = ? AND disposed_at IS NULL",
            (created["id"],),
        ).fetchone()["c"]
        assert count == 1

    def test_purchase_not_found_raises_404(self, db, monkeypatch):
        _patch_db(monkeypatch, db)
        with pytest.raises(HTTPException) as exc:
            adjust_quantity(9999, AdjustIn(delta=1))
        assert exc.value.status_code == 404


class TestDeletePurchase:
    def test_blocked_when_component_installed(self, db, monkeypatch):
        _patch_db(monkeypatch, db)
        created = add_purchase(PurchaseCreate(name="Kassette", quantity=1))
        item = db.execute(
            "SELECT id FROM purchase_items WHERE purchase_id = ?", (created["id"],)
        ).fetchone()
        db.execute(
            "INSERT INTO bike_components (bike_id, type, purchase_item_id) VALUES (?, 'cassette', ?)",
            (BIKE, item["id"]),
        )
        db.commit()
        with pytest.raises(HTTPException) as exc:
            delete_purchase(created["id"])
        assert exc.value.status_code == 409
        assert exc.value.detail["code"] == "purchase_has_installed_components"

    def test_blocked_when_open_return_exists(self, db, monkeypatch):
        _patch_db(monkeypatch, db)
        created = add_purchase(PurchaseCreate(name="Kette", quantity=1))
        item = db.execute(
            "SELECT id FROM purchase_items WHERE purchase_id = ?", (created["id"],)
        ).fetchone()
        db.execute(
            """INSERT INTO purchase_returns (purchase_item_id, bike_id, component_type, km_ridden, returned_at)
               VALUES (?, ?, 'chain', 500, '2026-01-01')""",
            (item["id"], BIKE),
        )
        db.commit()
        with pytest.raises(HTTPException) as exc:
            delete_purchase(created["id"])
        assert exc.value.status_code == 409
        assert exc.value.detail["code"] == "purchase_has_open_returns"

    def test_succeeds_and_clears_deleted_components_reference(self, db, monkeypatch):
        """Regressionstest: ohne das NULL-Setzen von deleted_components.purchase_item_id brach
        DELETE FROM purchase_items zuvor mit FOREIGN KEY constraint failed ab (siehe Kommentar
        in purchases.py: delete_purchase)."""
        _patch_db(monkeypatch, db)
        created = add_purchase(PurchaseCreate(name="Alte Reifen", quantity=1))
        item = db.execute(
            "SELECT id FROM purchase_items WHERE purchase_id = ?", (created["id"],)
        ).fetchone()
        db.execute(
            """INSERT INTO deleted_components (bike_id, type, purchase_item_id, deleted_at)
               VALUES (?, 'tire_front', ?, '2026-01-01')""",
            (BIKE, item["id"]),
        )
        db.commit()

        delete_purchase(created["id"])  # darf nicht raisen

        assert db.execute("SELECT * FROM purchases WHERE id = ?", (created["id"],)).fetchone() is None
        assert db.execute("SELECT * FROM purchase_items WHERE purchase_id = ?", (created["id"],)).fetchall() == []
        snap = db.execute("SELECT purchase_item_id FROM deleted_components WHERE bike_id = ?", (BIKE,)).fetchone()
        assert snap["purchase_item_id"] is None

    def test_not_found_raises_404(self, db, monkeypatch):
        _patch_db(monkeypatch, db)
        with pytest.raises(HTTPException) as exc:
            delete_purchase(9999)
        assert exc.value.status_code == 404
