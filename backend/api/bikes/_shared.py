from datetime import date as Date, timedelta


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
