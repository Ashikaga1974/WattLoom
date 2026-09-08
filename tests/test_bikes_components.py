"""
Tests für backend/api/bikes/components.py – die Lebenszyklus-Endpunkte für Bike-Komponenten
(Einbau, Ausbau, Verknüpfen, Lagerrückgabe, Löschen). Genau diese Bereiche haben laut CLAUDE.md-
Historie die teuersten Bugs verursacht (Doppelzählung von purchase_items, kaputte Rückgabe-Historie),
deshalb wird hier gezielt gegen echte DB-Zustände statt nur gegen die reinen Helper geprüft
(test_bike_chain_maintenance.py deckt bereits _enrich_component() ab).
"""
from contextlib import contextmanager

import pytest
from fastapi import HTTPException

import backend.api.bikes.components as components
from backend.api.bikes.components import (
    ComponentCreate,
    LinkPurchaseBody,
    ReturnToStockBody,
    UninstallBody,
    add_component,
    delete_component,
    link_component_purchase,
    return_component_to_stock,
    uninstall_component,
)

BIKE = "test_bike"


def _patch_db(monkeypatch, conn):
    @contextmanager
    def fake_db_connection():
        yield conn
    monkeypatch.setattr(components, "db_connection", fake_db_connection)


def _insert_purchase(db, name="Reifen 4er-Set", price=40.0, n_items=4):
    cur = db.execute("INSERT INTO purchases (name, price) VALUES (?, ?)", (name, price))
    purchase_id = cur.lastrowid
    item_ids = []
    for _ in range(n_items):
        item_ids.append(db.execute(
            "INSERT INTO purchase_items (purchase_id) VALUES (?)", (purchase_id,)
        ).lastrowid)
    db.commit()
    return purchase_id, item_ids


def _insert_component(db, **overrides):
    fields = {
        "bike_id": BIKE, "type": "chain", "km_threshold": 2000, "km_at_service": 0,
        "added_at": "2026-01-01", "retired_at": None, "uninstalled_km": None,
        "purchase_item_id": None,
    }
    fields.update(overrides)
    cur = db.execute(
        """INSERT INTO bike_components (bike_id, type, km_threshold, km_at_service, added_at,
           retired_at, uninstalled_km, purchase_item_id)
           VALUES (:bike_id, :type, :km_threshold, :km_at_service, :added_at, :retired_at,
           :uninstalled_km, :purchase_item_id)""",
        fields,
    )
    db.commit()
    return cur.lastrowid


class TestAddComponent:
    def test_without_purchase_sets_km_at_service_from_activities_before_install_date(self, db, monkeypatch):
        _patch_db(monkeypatch, db)
        db.execute(
            "INSERT INTO activities (id, bike_id, start_date, distance_m) VALUES (1, ?, '2026-01-01', 50000)",
            (BIKE,),
        )
        db.commit()
        add_component(BIKE, ComponentCreate(type="chain", km_threshold=2000, installed_at="2026-02-01"))
        comp = db.execute("SELECT * FROM bike_components WHERE bike_id = ?", (BIKE,)).fetchone()
        assert comp["km_at_service"] == 50.0
        assert comp["purchase_item_id"] is None

    def test_bike_not_found_raises_404(self, db, monkeypatch):
        _patch_db(monkeypatch, db)
        with pytest.raises(HTTPException) as exc:
            add_component("unknown_bike", ComponentCreate(type="chain", km_threshold=2000))
        assert exc.value.status_code == 404
        assert exc.value.detail["code"] == "bike_not_found"

    def test_with_purchase_allocates_one_unclaimed_item(self, db, monkeypatch):
        _patch_db(monkeypatch, db)
        purchase_id, item_ids = _insert_purchase(db, n_items=4)
        add_component(BIKE, ComponentCreate(type="tire_front", km_threshold=5000, purchase_id=purchase_id))
        comp = db.execute("SELECT * FROM bike_components WHERE bike_id = ?", (BIKE,)).fetchone()
        assert comp["purchase_item_id"] in item_ids
        # Kein zusätzliches Item wurde angelegt – genau die 4 ursprünglichen existieren noch
        count = db.execute(
            "SELECT COUNT(*) AS c FROM purchase_items WHERE purchase_id = ?", (purchase_id,)
        ).fetchone()["c"]
        assert count == 4

    def test_with_purchase_insufficient_stock_raises_409(self, db, monkeypatch):
        _patch_db(monkeypatch, db)
        purchase_id, item_ids = _insert_purchase(db, n_items=1)
        _insert_component(db, purchase_item_id=item_ids[0])  # einziges Item bereits verbaut
        with pytest.raises(HTTPException) as exc:
            add_component(BIKE, ComponentCreate(type="tire_front", km_threshold=5000, purchase_id=purchase_id))
        assert exc.value.status_code == 409
        assert exc.value.detail["code"] == "insufficient_stock"

    def test_with_return_id_shifts_km_at_service_back_and_deletes_return(self, db, monkeypatch):
        _patch_db(monkeypatch, db)
        purchase_id, item_ids = _insert_purchase(db, n_items=1)
        db.execute(
            "INSERT INTO activities (id, bike_id, start_date, distance_m) VALUES (1, ?, '2026-01-01', 100000)",
            (BIKE,),
        )
        return_id = db.execute(
            """INSERT INTO purchase_returns (purchase_item_id, bike_id, component_type, km_ridden, returned_at)
               VALUES (?, ?, 'chain', 300, '2026-01-15')""",
            (item_ids[0], BIKE),
        ).lastrowid
        db.commit()

        add_component(BIKE, ComponentCreate(
            type="chain", km_threshold=2000, installed_at="2026-02-01",
            purchase_id=purchase_id, return_id=return_id,
        ))

        comp = db.execute("SELECT * FROM bike_components WHERE bike_id = ?", (BIKE,)).fetchone()
        # 100 km vor dem Einbaudatum gefahren, minus 300 km Vorbelastung aus der Rückgabe
        assert comp["km_at_service"] == 100.0 - 300.0
        assert comp["purchase_item_id"] == item_ids[0]
        assert db.execute("SELECT * FROM purchase_returns WHERE id = ?", (return_id,)).fetchone() is None

    def test_with_return_id_from_different_purchase_raises_409(self, db, monkeypatch):
        _patch_db(monkeypatch, db)
        purchase_a, items_a = _insert_purchase(db, n_items=1)
        purchase_b, _ = _insert_purchase(db, n_items=1)
        return_id = db.execute(
            """INSERT INTO purchase_returns (purchase_item_id, bike_id, component_type, km_ridden, returned_at)
               VALUES (?, ?, 'chain', 100, '2026-01-15')""",
            (items_a[0], BIKE),
        ).lastrowid
        db.commit()
        with pytest.raises(HTTPException) as exc:
            add_component(BIKE, ComponentCreate(
                type="chain", km_threshold=2000, purchase_id=purchase_b, return_id=return_id,
            ))
        assert exc.value.status_code == 409
        assert exc.value.detail["code"] == "return_record_mismatch"


class TestUninstallComponent:
    def test_with_stock_link_creates_return_and_removes_component(self, db, monkeypatch):
        _patch_db(monkeypatch, db)
        purchase_id, item_ids = _insert_purchase(db, n_items=1)
        comp_id = _insert_component(db, purchase_item_id=item_ids[0])

        uninstall_component(BIKE, comp_id, UninstallBody(km_ridden=1234.5))

        assert db.execute("SELECT * FROM bike_components WHERE id = ?", (comp_id,)).fetchone() is None
        ret = db.execute("SELECT * FROM purchase_returns WHERE purchase_item_id = ?", (item_ids[0],)).fetchone()
        assert ret["km_ridden"] == 1234.5
        assert ret["bike_id"] == BIKE
        # Item selbst ist nicht entsorgt – gilt automatisch wieder als "auf Lager"
        assert db.execute("SELECT disposed_at FROM purchase_items WHERE id = ?", (item_ids[0],)).fetchone()["disposed_at"] is None

    def test_without_stock_link_marks_retired_and_keeps_row(self, db, monkeypatch):
        _patch_db(monkeypatch, db)
        comp_id = _insert_component(db)
        uninstall_component(BIKE, comp_id, UninstallBody(km_ridden=500.0))
        comp = db.execute("SELECT * FROM bike_components WHERE id = ?", (comp_id,)).fetchone()
        assert comp is not None
        assert comp["uninstalled_km"] == 500.0
        assert comp["retired_at"] is not None

    def test_already_returned_raises_409(self, db, monkeypatch):
        _patch_db(monkeypatch, db)
        comp_id = _insert_component(db, retired_at="2026-01-01", uninstalled_km=500.0)
        with pytest.raises(HTTPException) as exc:
            uninstall_component(BIKE, comp_id, UninstallBody(km_ridden=600.0))
        assert exc.value.status_code == 409
        assert exc.value.detail["code"] == "component_already_returned"

    def test_nachtraeglicher_lagerbezug_creates_exactly_one_new_item(self, db, monkeypatch):
        """Regressionstest für den Session-2026-07-02c-Bug: beim nachträglichen Lagerbezug beim
        Ausbau darf NICHT zusätzlich zu diesem einen Item ein zweites entstehen (das führte
        historisch zu künstlich verdoppelten Einkäufen)."""
        _patch_db(monkeypatch, db)
        purchase_id, _ = _insert_purchase(db, n_items=0)
        comp_id = _insert_component(db)  # kein Lagerbezug

        uninstall_component(BIKE, comp_id, UninstallBody(km_ridden=700.0, purchase_id=purchase_id))

        items = db.execute("SELECT * FROM purchase_items WHERE purchase_id = ?", (purchase_id,)).fetchall()
        assert len(items) == 1
        ret = db.execute("SELECT * FROM purchase_returns WHERE purchase_item_id = ?", (items[0]["id"],)).fetchone()
        assert ret["km_ridden"] == 700.0

    def test_component_not_found_raises_404(self, db, monkeypatch):
        _patch_db(monkeypatch, db)
        with pytest.raises(HTTPException) as exc:
            uninstall_component(BIKE, 9999, UninstallBody(km_ridden=1.0))
        assert exc.value.status_code == 404


class TestLinkComponentPurchase:
    def test_success_sets_purchase_item_id(self, db, monkeypatch):
        _patch_db(monkeypatch, db)
        purchase_id, _ = _insert_purchase(db, n_items=0)
        comp_id = _insert_component(db)
        link_component_purchase(BIKE, comp_id, LinkPurchaseBody(purchase_id=purchase_id))
        comp = db.execute("SELECT * FROM bike_components WHERE id = ?", (comp_id,)).fetchone()
        assert comp["purchase_item_id"] is not None
        item = db.execute("SELECT * FROM purchase_items WHERE id = ?", (comp["purchase_item_id"],)).fetchone()
        assert item["purchase_id"] == purchase_id

    def test_already_linked_raises_409(self, db, monkeypatch):
        _patch_db(monkeypatch, db)
        purchase_id, item_ids = _insert_purchase(db, n_items=1)
        comp_id = _insert_component(db, purchase_item_id=item_ids[0])
        with pytest.raises(HTTPException) as exc:
            link_component_purchase(BIKE, comp_id, LinkPurchaseBody(purchase_id=purchase_id))
        assert exc.value.status_code == 409
        assert exc.value.detail["code"] == "component_already_linked"

    def test_already_uninstalled_raises_409(self, db, monkeypatch):
        _patch_db(monkeypatch, db)
        purchase_id, _ = _insert_purchase(db, n_items=0)
        comp_id = _insert_component(db, retired_at="2026-01-01", uninstalled_km=500.0)
        with pytest.raises(HTTPException) as exc:
            link_component_purchase(BIKE, comp_id, LinkPurchaseBody(purchase_id=purchase_id))
        assert exc.value.status_code == 409
        assert exc.value.detail["code"] == "component_already_uninstalled"


class TestReturnComponentToStock:
    def test_success_creates_return_and_removes_component(self, db, monkeypatch):
        _patch_db(monkeypatch, db)
        purchase_id, _ = _insert_purchase(db, n_items=0)
        comp_id = _insert_component(db, retired_at="2026-01-01", uninstalled_km=800.0)

        return_component_to_stock(BIKE, comp_id, ReturnToStockBody(purchase_id=purchase_id))

        assert db.execute("SELECT * FROM bike_components WHERE id = ?", (comp_id,)).fetchone() is None
        ret = db.execute(
            """SELECT pr.* FROM purchase_returns pr JOIN purchase_items pi ON pi.id = pr.purchase_item_id
               WHERE pi.purchase_id = ?""",
            (purchase_id,),
        ).fetchone()
        assert ret["km_ridden"] == 800.0

    def test_still_active_raises_409(self, db, monkeypatch):
        _patch_db(monkeypatch, db)
        purchase_id, _ = _insert_purchase(db, n_items=0)
        comp_id = _insert_component(db)  # retired_at ist None
        with pytest.raises(HTTPException) as exc:
            return_component_to_stock(BIKE, comp_id, ReturnToStockBody(purchase_id=purchase_id))
        assert exc.value.status_code == 409
        assert exc.value.detail["code"] == "component_still_active"

    def test_already_linked_raises_409(self, db, monkeypatch):
        _patch_db(monkeypatch, db)
        purchase_id, item_ids = _insert_purchase(db, n_items=1)
        comp_id = _insert_component(db, retired_at="2026-01-01", uninstalled_km=100.0, purchase_item_id=item_ids[0])
        with pytest.raises(HTTPException) as exc:
            return_component_to_stock(BIKE, comp_id, ReturnToStockBody(purchase_id=purchase_id))
        assert exc.value.status_code == 409
        assert exc.value.detail["code"] == "component_already_linked"


class TestDeleteComponent:
    def test_success_snapshots_and_disposes_linked_item(self, db, monkeypatch):
        _patch_db(monkeypatch, db)
        purchase_id, item_ids = _insert_purchase(db, n_items=1)
        db.execute(
            "INSERT INTO activities (id, bike_id, start_date, distance_m) VALUES (1, ?, '2026-01-01', 300000)",
            (BIKE,),
        )
        db.commit()
        comp_id = _insert_component(db, km_at_service=100.0, purchase_item_id=item_ids[0])

        delete_component(BIKE, comp_id)

        assert db.execute("SELECT * FROM bike_components WHERE id = ?", (comp_id,)).fetchone() is None
        snap = db.execute("SELECT * FROM deleted_components WHERE bike_id = ?", (BIKE,)).fetchone()
        assert snap["km_since_service"] == 200.0  # 300 km Gesamt - 100 km bei Einbau
        assert snap["purchase_item_id"] == item_ids[0]
        item = db.execute("SELECT disposed_at FROM purchase_items WHERE id = ?", (item_ids[0],)).fetchone()
        assert item["disposed_at"] is not None

    def test_without_purchase_link_leaves_no_item_to_dispose(self, db, monkeypatch):
        _patch_db(monkeypatch, db)
        comp_id = _insert_component(db)
        delete_component(BIKE, comp_id)
        snap = db.execute("SELECT * FROM deleted_components WHERE bike_id = ?", (BIKE,)).fetchone()
        assert snap["purchase_item_id"] is None

    def test_not_found_raises_404(self, db, monkeypatch):
        _patch_db(monkeypatch, db)
        with pytest.raises(HTTPException) as exc:
            delete_component(BIKE, 9999)
        assert exc.value.status_code == 404
