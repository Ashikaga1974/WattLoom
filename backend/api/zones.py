from datetime import datetime
from fastapi import APIRouter, HTTPException
from backend.database import get_connection

router = APIRouter(prefix="/activities", tags=["zones"])

# HR-Zonen: 5 Zonen basierend auf % HRmax
HR_ZONES = [
    {"zone": 1, "label": "Regeneration", "color": "#60a5fa", "min_pct": 0.00, "max_pct": 0.60},
    {"zone": 2, "label": "Grundlage",    "color": "#4ade80", "min_pct": 0.60, "max_pct": 0.70},
    {"zone": 3, "label": "Tempo",        "color": "#facc15", "min_pct": 0.70, "max_pct": 0.80},
    {"zone": 4, "label": "Schwelle",     "color": "#fb923c", "min_pct": 0.80, "max_pct": 0.90},
    {"zone": 5, "label": "VO2max",       "color": "#ef4444", "min_pct": 0.90, "max_pct": 1.00},
]

# Power-Zonen: 7 Zonen nach Coggan, basierend auf % FTP
POWER_ZONES = [
    {"zone": 1, "label": "Active Recovery", "color": "#60a5fa", "min_pct": 0.00, "max_pct": 0.55},
    {"zone": 2, "label": "Endurance",       "color": "#4ade80", "min_pct": 0.55, "max_pct": 0.75},
    {"zone": 3, "label": "Tempo",           "color": "#a3e635", "min_pct": 0.75, "max_pct": 0.90},
    {"zone": 4, "label": "Schwelle",        "color": "#facc15", "min_pct": 0.90, "max_pct": 1.05},
    {"zone": 5, "label": "VO2max",          "color": "#fb923c", "min_pct": 1.05, "max_pct": 1.20},
    {"zone": 6, "label": "Anaerob",         "color": "#f87171", "min_pct": 1.20, "max_pct": 1.50},
    {"zone": 7, "label": "Neuromuskulär",   "color": "#c084fc", "min_pct": 1.50, "max_pct": None},
]

MAX_DELTA_SECONDS = 10


def _assign_hr_zone(hr: int, hr_max: int) -> int:
    """Weist einem HR-Wert eine Zone (1–5) zu."""
    ratio = hr / hr_max
    for z in reversed(HR_ZONES):
        if ratio >= z["min_pct"]:
            return z["zone"]
    return 1


def _assign_power_zone(power_w: int, ftp: int) -> int:
    """Weist einem Power-Wert eine Zone (1–7) zu."""
    ratio = power_w / ftp
    for z in reversed(POWER_ZONES):
        if ratio >= z["min_pct"]:
            return z["zone"]
    return 1


def _build_hr_zone_list(seconds_per_zone: dict, hr_max: int, total_seconds: float) -> list:
    """Erstellt die vollständige HR-Zonen-Liste mit absoluten BPM-Grenzen."""
    result = []
    for z in HR_ZONES:
        zone_id = z["zone"]
        secs = seconds_per_zone.get(zone_id, 0.0)
        min_bpm = round(z["min_pct"] * hr_max) if z["min_pct"] > 0 else 0
        # Letzte Zone: max_bpm = hr_max (kein Deckel darüber)
        max_bpm = round(z["max_pct"] * hr_max) if z["max_pct"] < 1.0 else hr_max
        pct = round(secs / total_seconds * 100, 1) if total_seconds > 0 else 0.0
        result.append({
            "zone":    zone_id,
            "label":   z["label"],
            "color":   z["color"],
            "min_bpm": min_bpm,
            "max_bpm": max_bpm,
            "seconds": round(secs),
            "pct":     pct,
        })
    return result


def _build_power_zone_list(seconds_per_zone: dict, ftp: int, total_seconds: float) -> list:
    """Erstellt die vollständige Power-Zonen-Liste mit absoluten Watt-Grenzen."""
    result = []
    for z in POWER_ZONES:
        zone_id = z["zone"]
        secs = seconds_per_zone.get(zone_id, 0.0)
        min_w = round(z["min_pct"] * ftp) if z["min_pct"] > 0 else 0
        # Letzte Zone hat kein oberes Limit
        max_w = round(z["max_pct"] * ftp) if z["max_pct"] is not None else None
        pct = round(secs / total_seconds * 100, 1) if total_seconds > 0 else 0.0
        result.append({
            "zone":  zone_id,
            "label": z["label"],
            "color": z["color"],
            "min_w": min_w,
            "max_w": max_w,
            "seconds": round(secs),
            "pct":     pct,
        })
    return result


@router.get("/{activity_id}/zones")
def get_zones(activity_id: int):
    """
    Berechnet HR- und Power-Zonen für eine Aktivität aus den Track-Punkten.
    Zeitdelta zwischen aufeinanderfolgenden Punkten wird auf max. 10 s gecappt
    (GPS-Pausen werden so ausgeschlossen).
    """
    conn = get_connection()
    try:
        # 1. HRmax aus allen Aktivitäten
        row = conn.execute(
            "SELECT MAX(max_hr) AS v FROM activities WHERE max_hr > 0"
        ).fetchone()
        hr_max = int(row["v"]) if row and row["v"] else None

        # 2. Manueller FTP aus config-Tabelle
        row = conn.execute(
            "SELECT value FROM config WHERE key = 'ftp_manual'"
        ).fetchone()
        ftp = int(row["value"]) if row and row["value"] else None

        # 3. Track-Punkte dieser Aktivität
        rows = conn.execute(
            """
            SELECT timestamp, hr, power_w
            FROM track_points
            WHERE activity_id = ?
            ORDER BY id
            """,
            (activity_id,),
        ).fetchall()
    finally:
        conn.close()

    if not rows:
        raise HTTPException(status_code=404, detail="Keine Track-Punkte für diese Aktivität")

    # 4. Zeitdeltas berechnen und Zonen akkumulieren
    hr_seconds: dict[int, float] = {z["zone"]: 0.0 for z in HR_ZONES}
    pw_seconds: dict[int, float] = {z["zone"]: 0.0 for z in POWER_ZONES}
    has_hr = False
    has_power = False

    prev_ts = None
    for row in rows:
        ts_str = row["timestamp"]
        hr = row["hr"]
        power_w = row["power_w"]

        # Timestamp parsen
        try:
            ts = datetime.fromisoformat(ts_str) if ts_str else None
        except (ValueError, TypeError):
            ts = None

        # Delta zum Vorgänger
        delta = 0.0
        if ts is not None and prev_ts is not None:
            raw_delta = (ts - prev_ts).total_seconds()
            # Nur positive Deltas, auf 10 s gecappt
            if 0 < raw_delta <= MAX_DELTA_SECONDS:
                delta = raw_delta
        prev_ts = ts

        if delta <= 0:
            continue

        # HR-Zone
        if hr is not None and hr_max is not None and hr > 0:
            zone = _assign_hr_zone(hr, hr_max)
            hr_seconds[zone] += delta
            has_hr = True

        # Power-Zone
        if power_w is not None and ftp is not None and power_w > 0:
            zone = _assign_power_zone(power_w, ftp)
            pw_seconds[zone] += delta
            has_power = True

    # 5. Antwort zusammenbauen
    hr_total = sum(hr_seconds.values())
    pw_total = sum(pw_seconds.values())

    return {
        "hr_zones":   _build_hr_zone_list(hr_seconds, hr_max, hr_total) if has_hr else [],
        "power_zones": _build_power_zone_list(pw_seconds, ftp, pw_total) if has_power else [],
        "hr_max":     hr_max,
        "ftp":        ftp,
        "has_hr":     has_hr,
        "has_power":  has_power,
    }
