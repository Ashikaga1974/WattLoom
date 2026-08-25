from datetime import datetime
from fastapi import APIRouter, Query
from backend.database import db_connection
from backend.api.zones import (
    HR_ZONES, _assign_hr_zone, MAX_DELTA_SECONDS,
    get_hr_correction_settings, correction_pct_for_date,
)
from ._shared import _effective_hr_max

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/zone-distribution")
def zone_distribution(year: int = Query(None)):
    """
    Aggregiert die HF-Zonen-Zeit (Zonen-Logik wie backend/api/zones.py) monatlich über
    alle Aktivitäten mit Track-Daten, um polarisiertes Training (viel Grundlage,
    wenig "Grauzone") sichtbar zu machen. easy = Zone 1+2, moderate = Zone 3 (Grauzone),
    hard = Zone 4+5.
    """
    year_filter = "AND strftime('%Y', a.start_date_local) >= '2000'"
    params: list = []
    if year:
        year_filter += " AND strftime('%Y', a.start_date_local) = ?"
        params.append(str(year))

    with db_connection() as conn:
        hr_max = _effective_hr_max(conn)
        correction = get_hr_correction_settings(conn)

        rows = conn.execute(f"""
            SELECT a.id AS activity_id,
                   strftime('%Y-%m', a.start_date_local) AS month,
                   substr(a.start_date_local, 1, 10) AS activity_date,
                   tp.timestamp AS timestamp,
                   tp.hr AS hr
            FROM activities a
            JOIN track_points tp ON tp.activity_id = a.id
            WHERE a.has_track = 1 AND tp.hr IS NOT NULL
              {year_filter}
            ORDER BY a.id, tp.id
        """, params).fetchall()

    # Zeitdeltas pro Aktivität akkumulieren (wie zones.py: GPS-Lücken >10s gecappt),
    # dann nach Monat der jeweiligen Aktivität gruppieren.
    monthly: dict[str, dict[int, float]] = {}
    prev_activity_id = None
    prev_ts = None
    correction_pct = 0.0

    for row in rows:
        if row["activity_id"] != prev_activity_id:
            prev_activity_id = row["activity_id"]
            prev_ts = None
            correction_pct = correction_pct_for_date(correction, row["activity_date"])

        try:
            ts = datetime.fromisoformat(row["timestamp"]) if row["timestamp"] else None
        except (ValueError, TypeError):
            ts = None

        delta = 0.0
        if ts is not None and prev_ts is not None:
            raw_delta = (ts - prev_ts).total_seconds()
            if 0 < raw_delta <= MAX_DELTA_SECONDS:
                delta = raw_delta
        prev_ts = ts

        if delta <= 0 or row["hr"] is None or row["hr"] <= 0:
            continue

        zone = _assign_hr_zone(row["hr"], hr_max, correction_pct)
        month = row["month"]
        monthly.setdefault(month, {z["zone"]: 0.0 for z in HR_ZONES})
        monthly[month][zone] += delta

    by_month = []
    totals: dict[int, float] = {z["zone"]: 0.0 for z in HR_ZONES}
    for month in sorted(monthly.keys()):
        secs = monthly[month]
        entry = {"month": month, "total_seconds": round(sum(secs.values()))}
        for z in HR_ZONES:
            entry[f"zone{z['zone']}_seconds"] = round(secs.get(z["zone"], 0.0))
            totals[z["zone"]] += secs.get(z["zone"], 0.0)
        by_month.append(entry)

    grand_total = sum(totals.values())

    def pct(secs: float) -> float:
        return round(secs / grand_total * 100, 1) if grand_total > 0 else 0.0

    zones_summary = [
        {
            "zone":    z["zone"],
            "code":    z["code"],
            "color":   z["color"],
            "seconds": round(totals[z["zone"]]),
            "pct":     pct(totals[z["zone"]]),
        }
        for z in HR_ZONES
    ]

    easy_secs = totals[1] + totals[2]
    moderate_secs = totals[3]
    hard_secs = totals[4] + totals[5]

    return {
        "by_month":     by_month,
        "zones":        zones_summary,
        "easy_pct":     pct(easy_secs),
        "moderate_pct": pct(moderate_secs),
        "hard_pct":     pct(hard_secs),
        "total_seconds": round(grand_total),
        "hr_correction_applied": correction["enabled"],
    }
