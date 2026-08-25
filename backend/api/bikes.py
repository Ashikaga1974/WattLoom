import uuid
from datetime import date as Date, timedelta
from pathlib import Path

from fastapi import APIRouter, File, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

from backend.api.errors import api_error
from backend.database import db_connection
from backend.paths import BIKE_IMAGES_DIR

router = APIRouter(prefix="/bikes", tags=["bikes"])


def _current_bike_km(conn, bike_id: str) -> float:
    """Gesamt-km eines Bikes aus allen Aktivitäten."""
    row = conn.execute(
        "SELECT COALESCE(SUM(distance_m), 0) / 1000.0 AS km FROM activities WHERE bike_id = ?",
        (bike_id,),
    ).fetchone()
    return round(float(row["km"]) if row else 0.0, 1)


def _chain_maintenance_km(conn) -> float:
    row = conn.execute("SELECT value FROM config WHERE key = 'chain_maintenance_km'").fetchone()
    return float(row["value"]) if row else 300.0


def _enrich_component(comp: dict, current_km: float, avg_km_per_day: float | None,
                       maintenance_threshold: float | None = None) -> dict:
    """Berechnet km_since_service, pct_used und geschätztes Wartungsdatum (Verschleiß/Austausch)
    sowie – nur für Ketten – km_since_maintenance/maintenance_pct_used (Reinigen/Ölen), ein
    zweiter, unabhängiger Referenzpunkt (last_maintained_km statt km_at_service)."""
    km_at = float(comp.get("km_at_service") or 0)
    threshold = comp.get("km_threshold")
    km_since = round(max(0.0, current_km - km_at), 1)
    pct = round(min(km_since / threshold * 100, 200), 1) if threshold and threshold > 0 else None
    estimated_date = None
    if threshold and threshold > 0 and avg_km_per_day and avg_km_per_day > 0:
        remaining_km = max(0.0, threshold - km_since)
        days = remaining_km / avg_km_per_day
        estimated_date = (Date.today() + timedelta(days=days)).isoformat()

    km_since_maintenance = None
    maintenance_pct_used = None
    if comp.get("type") == "chain" and maintenance_threshold and maintenance_threshold > 0:
        last_km = comp.get("last_maintained_km")
        ref_km = float(last_km) if last_km is not None else km_at
        km_since_maintenance = round(max(0.0, current_km - ref_km), 1)
        maintenance_pct_used = round(min(km_since_maintenance / maintenance_threshold * 100, 200), 1)

    return {
        **comp,
        "km_since_service": km_since,
        "pct_used": pct,
        "estimated_service_date": estimated_date,
        "km_since_maintenance": km_since_maintenance,
        "maintenance_pct_used": maintenance_pct_used,
    }


class ComponentCreate(BaseModel):
    type: str
    km_threshold: float
    installed_at: str | None = None   # ISO-Datum YYYY-MM-DD; fehlt → heute
    purchase_id: int | None = None    # Lager-Einkauf, aus dem die Komponente entnommen wird
    return_id: int | None = None      # purchase_returns-Eintrag, dessen Laufleistung übernommen wird


def _avg_km_per_day(conn, bike_id: str, days: int = 90) -> float | None:
    """Durchschnittliche Tages-km des Bikes über die letzten `days` Tage."""
    row = conn.execute(
        """SELECT COALESCE(SUM(distance_m), 0) / 1000.0 AS km
           FROM activities
           WHERE bike_id = ? AND DATE(start_date) >= DATE('now', ?)""",
        (bike_id, f"-{days} days"),
    ).fetchone()
    km = float(row["km"]) if row else 0.0
    return round(km / days, 4) if km > 0 else None


@router.get("")
def list_bikes():
    with db_connection() as conn:
        bikes = conn.execute("SELECT * FROM bikes ORDER BY retired, name").fetchall()

        # Gesamt-km + Ride-Anzahl je Bike in einer Query
        stats_rows = conn.execute("""
            SELECT bike_id,
                   COALESCE(SUM(distance_m), 0) / 1000.0 AS total_km,
                   COUNT(*) AS ride_count
            FROM activities GROUP BY bike_id
        """).fetchall()
        bike_stats = {r["bike_id"]: (round(float(r["total_km"]), 1), r["ride_count"]) for r in stats_rows}

        # Ø-km/Tag (letzte 90 Tage) für alle Bikes auf einmal
        avg_rows = conn.execute("""
            SELECT bike_id, COALESCE(SUM(distance_m), 0) / 1000.0 AS km
            FROM activities
            WHERE DATE(start_date) >= DATE('now', '-90 days')
            GROUP BY bike_id
        """).fetchall()
        bike_avg = {r["bike_id"]: (round(float(r["km"]) / 90, 4) if r["km"] > 0 else None)
                    for r in avg_rows}

        # Alle aktiven Komponenten in einer Query, dann in Python gruppieren
        comp_rows = conn.execute(
            """SELECT bc.*, p.url AS purchase_url, p.name AS purchase_name
               FROM bike_components bc
               LEFT JOIN purchase_items pi ON pi.id = bc.purchase_item_id
               LEFT JOIN purchases p ON p.id = pi.purchase_id
               ORDER BY bc.bike_id, bc.retired_at IS NOT NULL, bc.added_at"""
        ).fetchall()
        comp_by_bike: dict[str, list] = {}
        for c in comp_rows:
            comp_by_bike.setdefault(c["bike_id"], []).append(dict(c))

        maintenance_threshold = _chain_maintenance_km(conn)
        result = []
        for bike in bikes:
            b = dict(bike)
            current_km, ride_count = bike_stats.get(bike["id"], (0.0, 0))
            b["current_km"] = current_km
            b["ride_count"] = ride_count
            avg = bike_avg.get(bike["id"])
            b["components"] = [
                _enrich_component(c, current_km, avg, maintenance_threshold)
                for c in comp_by_bike.get(bike["id"], [])
            ]
            result.append(b)
        return result


@router.get("/compare")
def compare_bikes():
    with db_connection() as conn:
        summary_rows = conn.execute("""
            SELECT
                b.id,
                b.name,
                COUNT(a.id)                          AS rides,
                SUM(a.distance_m) / 1000.0           AS total_km,
                SUM(a.elevation_gain_m)              AS total_elevation_m,
                SUM(a.moving_time_s) / 3600.0        AS total_hours,
                AVG(a.distance_m / 1000.0)           AS avg_dist_km,
                AVG(a.avg_speed_ms * 3.6)            AS avg_speed_kmh,
                AVG(a.elevation_gain_m)              AS avg_elevation_m
            FROM bikes b
            JOIN activities a ON a.bike_id = b.id
            GROUP BY b.id, b.name
            ORDER BY b.name
        """).fetchall()

        # Unterhaltskosten je Bike: jedes purchase_item, das je einem Bike zugeordnet war
        # (aktuell verbaut, gelöscht oder ins Lager zurückgelegt), zählt anteilig mit
        # price / ursprüngliche Item-Anzahl des Einkaufs – ein Einkauf von 4 Reifen auf 2 Bikes
        # verteilt zählt also je 1/4 des Preises pro Reifen, nicht den vollen Einkaufspreis je Bike.
        cost_rows = conn.execute("""
            WITH item_bike AS (
                SELECT bike_id, purchase_item_id FROM bike_components WHERE purchase_item_id IS NOT NULL
                UNION ALL
                SELECT bike_id, purchase_item_id FROM deleted_components WHERE purchase_item_id IS NOT NULL
                UNION ALL
                SELECT bike_id, purchase_item_id FROM purchase_returns WHERE purchase_item_id IS NOT NULL
            ),
            purchase_totals AS (
                SELECT purchase_id, COUNT(*) AS total_items
                FROM purchase_items
                GROUP BY purchase_id
            )
            SELECT ib.bike_id,
                   SUM(COALESCE(p.price, 0) * 1.0 / pt.total_items) AS total_cost
            FROM item_bike ib
            JOIN purchase_items pi ON pi.id = ib.purchase_item_id
            JOIN purchases p ON p.id = pi.purchase_id
            JOIN purchase_totals pt ON pt.purchase_id = p.id
            GROUP BY ib.bike_id
        """).fetchall()
        cost_by_bike = {r["bike_id"]: round(float(r["total_cost"] or 0), 2) for r in cost_rows}

        summary = []
        bike_ids = []
        for row in summary_rows:
            r = dict(row)
            r["total_km"]          = round(r["total_km"] or 0, 1)
            r["total_elevation_m"] = round(r["total_elevation_m"] or 0, 1)
            r["total_hours"]       = round(r["total_hours"] or 0, 1)
            r["avg_dist_km"]       = round(r["avg_dist_km"] or 0, 1)
            r["avg_speed_kmh"]     = round(r["avg_speed_kmh"] or 0, 1)
            r["avg_elevation_m"]   = round(r["avg_elevation_m"] or 0, 1)
            r["total_cost"]        = cost_by_bike.get(r["id"], 0.0)
            r["cost_per_100km"]    = round(r["total_cost"] / r["total_km"] * 100, 2) if r["total_km"] > 0 else None
            summary.append(r)
            bike_ids.append(r["id"])

        year_rows = conn.execute("""
            SELECT DISTINCT strftime('%Y', start_date_local) AS year
            FROM activities
            WHERE bike_id IN ({})
            ORDER BY year
        """.format(",".join("?" * len(bike_ids))), bike_ids).fetchall()
        years = [r["year"] for r in year_rows]

        yearly_detail = conn.execute("""
            SELECT
                strftime('%Y', start_date_local) AS year,
                bike_id,
                COUNT(*)                          AS rides,
                AVG(avg_speed_ms * 3.6)           AS avg_speed_kmh
            FROM activities
            WHERE bike_id IN ({})
            GROUP BY year, bike_id
        """.format(",".join("?" * len(bike_ids))), bike_ids).fetchall()

        yearly_map: dict = {}
        for row in yearly_detail:
            y = row["year"]
            bid = row["bike_id"]
            if y not in yearly_map:
                yearly_map[y] = {}
            yearly_map[y][bid] = {
                "rides": row["rides"],
                "avg_speed_kmh": round(row["avg_speed_kmh"] or 0, 1),
            }

        yearly = []
        for y in years:
            bikes_entry = {}
            for bid in bike_ids:
                bikes_entry[bid] = yearly_map.get(y, {}).get(bid, {"rides": 0, "avg_speed_kmh": None})
            yearly.append({"year": y, "bikes": bikes_entry})

        dist_rows = conn.execute("""
            SELECT bike_id, distance_m / 1000.0 AS dist_km
            FROM activities
            WHERE bike_id IN ({}) AND distance_m > 0
            ORDER BY bike_id, start_date_local
        """.format(",".join("?" * len(bike_ids))), bike_ids).fetchall()

        distances: dict = {bid: [] for bid in bike_ids}
        for row in dist_rows:
            distances[row["bike_id"]].append(round(row["dist_km"], 1))

        return {"summary": summary, "yearly": yearly, "distances": distances}


@router.get("/deleted-components")
def list_deleted_components():
    with db_connection() as conn:
        rows = conn.execute("""
            SELECT dc.*, p.name AS purchase_name, p.shop, p.url, p.price
            FROM deleted_components dc
            LEFT JOIN purchase_items pi ON pi.id = dc.purchase_item_id
            LEFT JOIN purchases p ON p.id = pi.purchase_id
            ORDER BY dc.deleted_at DESC, dc.id DESC
        """).fetchall()
        return [dict(r) for r in rows]


@router.get("/{bike_id}/image")
def get_bike_image(bike_id: str):
    with db_connection() as conn:
        row = conn.execute("SELECT image_filename FROM bikes WHERE id = ?", (bike_id,)).fetchone()
        if not row or not row["image_filename"]:
            raise api_error(404, "no_image", "No image")
    path = BIKE_IMAGES_DIR / row["image_filename"]
    if not path.exists():
        raise api_error(404, "image_file_missing", "Image file missing")
    return FileResponse(str(path))


@router.post("/{bike_id}/image")
async def upload_bike_image(bike_id: str, file: UploadFile = File(...)):
    with db_connection() as conn:
        bike = conn.execute("SELECT id, image_filename FROM bikes WHERE id = ?", (bike_id,)).fetchone()
        if bike is None:
            raise api_error(404, "bike_not_found", "Bike not found")

    suffix = Path(file.filename or "").suffix.lower() or ".jpg"
    filename = f"{uuid.uuid4()}{suffix}"
    BIKE_IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    (BIKE_IMAGES_DIR / filename).write_bytes(await file.read())

    # Altes Bild löschen
    if bike["image_filename"]:
        old = BIKE_IMAGES_DIR / bike["image_filename"]
        if old.exists():
            old.unlink(missing_ok=True)

    with db_connection() as conn:
        conn.execute("UPDATE bikes SET image_filename = ? WHERE id = ?", (filename, bike_id))
        conn.commit()
    return {"ok": True, "filename": filename}


@router.put("/{bike_id}/toggle-retired")
def toggle_retired(bike_id: str):
    with db_connection() as conn:
        row = conn.execute("SELECT retired FROM bikes WHERE id = ?", (bike_id,)).fetchone()
        if row is None:
            raise api_error(404, "bike_not_found", "Bike not found")
        new_val = 0 if row["retired"] else 1
        conn.execute("UPDATE bikes SET retired = ? WHERE id = ?", (new_val, bike_id))
        conn.commit()
        return {"ok": True, "retired": new_val}


@router.get("/{bike_id}")
def get_bike(bike_id: str):
    with db_connection() as conn:
        bike = conn.execute("SELECT * FROM bikes WHERE id = ?", (bike_id,)).fetchone()
        if bike is None:
            raise api_error(404, "bike_not_found", "Bike not found")
        result = dict(bike)
        current_km = _current_bike_km(conn, bike_id)
        result["current_km"] = current_km
        components = conn.execute(
            """SELECT bc.*, p.url AS purchase_url, p.name AS purchase_name
               FROM bike_components bc
               LEFT JOIN purchase_items pi ON pi.id = bc.purchase_item_id
               LEFT JOIN purchases p ON p.id = pi.purchase_id
               WHERE bc.bike_id = ?
               ORDER BY bc.retired_at IS NOT NULL, bc.added_at""",
            (bike_id,),
        ).fetchall()
        avg = _avg_km_per_day(conn, bike_id)
        maintenance_threshold = _chain_maintenance_km(conn)
        result["components"] = [
            _enrich_component(dict(c), current_km, avg, maintenance_threshold) for c in components
        ]
        result["ride_count"] = conn.execute(
            "SELECT COUNT(*) FROM activities WHERE bike_id = ?", (bike_id,)
        ).fetchone()[0]
        return result


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


class BikeUpdate(BaseModel):
    name: str


@router.put("/{bike_id}")
def update_bike(bike_id: str, body: BikeUpdate):
    with db_connection() as conn:
        rows = conn.execute(
            "UPDATE bikes SET name = ? WHERE id = ?", (body.name.strip(), bike_id)
        ).rowcount
        if rows == 0:
            raise api_error(404, "bike_not_found", "Bike not found")
        conn.commit()
        return {"ok": True}


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
