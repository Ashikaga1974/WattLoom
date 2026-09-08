"""
Tests für backend/api/bikes/bikes.py: compare_bikes() – anteilige Unterhaltskosten je Bike aus
purchase_items (Session 2026-07-11, siehe CLAUDE.md). Ein Einkauf, dessen Items sich über
mehrere Bikes verteilen (aktuell verbaut über bike_components, gelöscht über deleted_components,
oder ins Lager zurückgelegt über purchase_returns), muss den Preis pro Bike nur anteilig zählen.
"""
from contextlib import contextmanager

import backend.api.bikes.bikes as bikes_module
from backend.api.bikes.bikes import compare_bikes

BIKE_A = "test_bike"
BIKE_B = "bike_b"


def _patch_db(monkeypatch, conn):
    @contextmanager
    def fake_db_connection():
        yield conn
    monkeypatch.setattr(bikes_module, "db_connection", fake_db_connection)


def _add_activity(db, activity_id, bike_id, distance_m=10000, speed_ms=5.0):
    db.execute(
        """INSERT INTO activities (id, bike_id, start_date, start_date_local, distance_m, avg_speed_ms)
           VALUES (?, ?, '2026-01-01', '2026-01-01', ?, ?)""",
        (activity_id, bike_id, distance_m, speed_ms),
    )


class TestCompareBikesCostSharing:
    def test_purchase_split_across_two_bikes_counts_only_its_share(self, db, monkeypatch):
        _patch_db(monkeypatch, db)
        db.execute("INSERT INTO bikes (id, name) VALUES (?, 'Bike B')", (BIKE_B,))
        _add_activity(db, 1, BIKE_A)
        _add_activity(db, 2, BIKE_B)

        cur = db.execute("INSERT INTO purchases (name, price) VALUES ('4er-Set Reifen', 40.0)")
        purchase_id = cur.lastrowid
        item_ids = [
            db.execute("INSERT INTO purchase_items (purchase_id) VALUES (?)", (purchase_id,)).lastrowid
            for _ in range(4)
        ]
        # 2 Items auf Bike A aktuell verbaut
        db.execute(
            "INSERT INTO bike_components (bike_id, type, purchase_item_id) VALUES (?, 'tire_front', ?)",
            (BIKE_A, item_ids[0]),
        )
        db.execute(
            "INSERT INTO bike_components (bike_id, type, purchase_item_id) VALUES (?, 'tire_rear', ?)",
            (BIKE_A, item_ids[1]),
        )
        # 2 Items auf Bike B ins Lager zurückgelegt (purchase_returns)
        db.execute(
            """INSERT INTO purchase_returns (purchase_item_id, bike_id, component_type, km_ridden, returned_at)
               VALUES (?, ?, 'tire_front', 100, '2026-01-01')""",
            (item_ids[2], BIKE_B),
        )
        db.execute(
            """INSERT INTO purchase_returns (purchase_item_id, bike_id, component_type, km_ridden, returned_at)
               VALUES (?, ?, 'tire_rear', 100, '2026-01-01')""",
            (item_ids[3], BIKE_B),
        )
        db.commit()

        result = compare_bikes()
        by_id = {row["id"]: row for row in result["summary"]}
        # 40 / 4 Items = 10 pro Item, je 2 Items pro Bike -> 20 pro Bike
        assert by_id[BIKE_A]["total_cost"] == 20.0
        assert by_id[BIKE_B]["total_cost"] == 20.0

    def test_deleted_component_still_counts_toward_its_bike(self, db, monkeypatch):
        _patch_db(monkeypatch, db)
        _add_activity(db, 1, BIKE_A)
        cur = db.execute("INSERT INTO purchases (name, price) VALUES ('Kette', 20.0)")
        purchase_id = cur.lastrowid
        item_id = db.execute(
            "INSERT INTO purchase_items (purchase_id) VALUES (?)", (purchase_id,)
        ).lastrowid
        db.execute(
            """INSERT INTO deleted_components (bike_id, type, purchase_item_id, deleted_at)
               VALUES (?, 'chain', ?, '2026-01-01')""",
            (BIKE_A, item_id),
        )
        db.commit()

        result = compare_bikes()
        by_id = {row["id"]: row for row in result["summary"]}
        assert by_id[BIKE_A]["total_cost"] == 20.0

    def test_bike_without_purchases_has_zero_cost(self, db, monkeypatch):
        _patch_db(monkeypatch, db)
        _add_activity(db, 1, BIKE_A)
        db.commit()
        result = compare_bikes()
        by_id = {row["id"]: row for row in result["summary"]}
        assert by_id[BIKE_A]["total_cost"] == 0.0
        assert by_id[BIKE_A]["cost_per_100km"] == 0.0
