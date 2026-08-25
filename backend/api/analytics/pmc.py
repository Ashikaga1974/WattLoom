from fastapi import APIRouter
from backend.database import db_connection
from backend.api.zones import get_hr_correction_settings, correction_pct_for_date, corrected_hr
from ._shared import _effective_hr_max, _threshold_hr_pct, _ctl_atl_k

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/pmc")
def performance_management_chart():
    """
    Performance Management Chart: CTL/ATL/TSB auf Basis von hrTSS.
    hrTSS = (moving_time_s / 3600) × (avg_hr / threshold_hr)² × 100
    threshold_hr = 0.85 × global_max_hr (Schwellen-HR ≈ 85 % HRmax)
    Fallback ohne HR-Daten: duration_h × 50 (moderate Intensität).
    other_activities (Workout, Weight Training) fließen ebenfalls mit hrTSS ein.
    """
    from collections import defaultdict
    from datetime import date as Date, timedelta

    with db_connection() as conn:
        global_max_hr = _effective_hr_max(conn)
        threshold_hr = _threshold_hr_pct(conn) * global_max_hr
        K_CTL, K_ATL = _ctl_atl_k(conn)
        hr_correction = get_hr_correction_settings(conn)

        rows = conn.execute("""
            SELECT
                strftime('%Y-%m-%d', start_date_local) AS date,
                moving_time_s,
                elapsed_time_s,
                avg_hr
            FROM activities
            WHERE strftime('%Y', start_date_local) >= '2000'
            ORDER BY start_date_local
        """).fetchall()

        # other_activities ebenfalls laden (Workout, Weight Training)
        other_rows = conn.execute("""
            SELECT
                strftime('%Y-%m-%d', start_date_local) AS date,
                moving_time_s,
                elapsed_time_s,
                avg_hr,
                sport_type
            FROM other_activities
            WHERE strftime('%Y', start_date_local) >= '2000'
            ORDER BY start_date_local
        """).fetchall()

    # Hilfsfunktion: hrTSS aus Duration und HR berechnen (optional mit Betablocker-Korrektur,
    # siehe backend/api/zones.py: get_hr_correction_settings())
    def calc_tss(duration_s, elapsed_s, hr, date) -> float:
        dur = duration_s or elapsed_s or 0
        if dur <= 0:
            return 0.0
        if hr and hr > 0:
            correction_pct = correction_pct_for_date(hr_correction, date)
            if_hr = corrected_hr(hr, global_max_hr, correction_pct) / threshold_hr
            return (dur / 3600.0) * (if_hr ** 2) * 100.0
        return (dur / 3600.0) * 50.0

    daily_tss: dict[str, float] = defaultdict(float)
    daily_rides: dict[str, int] = defaultdict(int)
    for r in rows:
        daily_tss[r["date"]] += calc_tss(r["moving_time_s"], r["elapsed_time_s"], r["avg_hr"], r["date"])
        daily_rides[r["date"]] += 1

    # TSS aus other_activities addieren + pro Tag merken für das other-Feld
    daily_other: dict[str, list[dict]] = defaultdict(list)
    for r in other_rows:
        daily_tss[r["date"]] += calc_tss(r["moving_time_s"], r["elapsed_time_s"], r["avg_hr"], r["date"])
        daily_other[r["date"]].append({
            "sport_type": r["sport_type"],
            "moving_time_s": r["moving_time_s"] or 0,
        })

    if not daily_tss:
        return {
            "days": [],
            "peak_ctl": None,
            "current": None,
            "max_hr": global_max_hr,
            "threshold_hr": round(threshold_hr, 1),
            "hr_correction_applied": hr_correction["enabled"],
        }

    start = Date.fromisoformat(sorted(daily_tss.keys())[0])
    today = Date.today()

    ctl = atl = 0.0
    peak_ctl = 0.0
    peak_ctl_date: str | None = None
    result: list[dict] = []

    cursor = start
    while cursor <= today:
        d = cursor.isoformat()
        tss = daily_tss.get(d, 0.0)
        ctl = ctl + K_CTL * (tss - ctl)
        atl = atl + K_ATL * (tss - atl)
        tsb = ctl - atl

        if ctl > peak_ctl:
            peak_ctl = ctl
            peak_ctl_date = d

        result.append({
            "date": d,
            "tss": round(tss, 1),
            "ctl": round(ctl, 1),
            "atl": round(atl, 1),
            "tsb": round(tsb, 1),
            "rides": daily_rides.get(d, 0),
            "other": daily_other.get(d, []),
        })
        cursor += timedelta(days=1)

    return {
        "days": result,
        "peak_ctl": {"value": round(peak_ctl, 1), "date": peak_ctl_date},
        "current": result[-1] if result else None,
        "max_hr": global_max_hr,
        "threshold_hr": round(threshold_hr, 1),
        "hr_correction_applied": hr_correction["enabled"],
    }


@router.get("/fitness-fingerprint")
def fitness_fingerprint():
    """
    Fitness-Fingerprint: Gesamtscore 0–100 aus vier Komponenten.

    Komponenten und Gewichtung:
    - CTL (35 Pkt): Trainingslast (42-Tage-EMA aus hrTSS)
    - Aerobe Effizienz (25 Pkt): Perzentile von avg_speed/avg_hr in persönlicher History
    - Form/TSB (20 Pkt): Frische vs. Müdigkeit (CTL − ATL)
    - Kontinuität (20 Pkt): aktive Wochen in den letzten 8 Wochen

    Zusätzlich: monatliche Score-History (gesamte erfasste Zeit) und Trend (up/neutral/down).
    """
    from collections import defaultdict
    from datetime import date as Date, timedelta

    with db_connection() as conn:
        global_max_hr = _effective_hr_max(conn)
        threshold_hr = _threshold_hr_pct(conn) * global_max_hr
        K_CTL, K_ATL = _ctl_atl_k(conn)
        hr_correction = get_hr_correction_settings(conn)

        act_rows = conn.execute("""
            SELECT strftime('%Y-%m-%d', start_date_local) AS date,
                   moving_time_s, elapsed_time_s, avg_hr
            FROM activities
            WHERE strftime('%Y', start_date_local) >= '2000'
            ORDER BY start_date_local
        """).fetchall()

        other_rows = conn.execute("""
            SELECT strftime('%Y-%m-%d', start_date_local) AS date,
                   moving_time_s, elapsed_time_s, avg_hr
            FROM other_activities
            WHERE strftime('%Y', start_date_local) >= '2000'
            ORDER BY start_date_local
        """).fetchall()

        # Aerobe Effizienz: Monats-Mittelwerte aus Rides mit HR-Daten (mind. 2 Rides)
        eff_rows = conn.execute("""
            SELECT strftime('%Y-%m', start_date_local) AS month,
                   AVG(avg_speed_ms * 3.6) AS avg_speed_kmh,
                   AVG(avg_hr)              AS avg_hr
            FROM activities
            WHERE avg_speed_ms IS NOT NULL AND avg_hr IS NOT NULL
              AND avg_speed_ms > 3 AND avg_hr > 0
              AND strftime('%Y', start_date_local) >= '2000'
            GROUP BY month
            HAVING COUNT(*) >= 2
            ORDER BY month
        """).fetchall()

        ride_date_rows = conn.execute("""
            SELECT DISTINCT strftime('%Y-%m-%d', start_date_local) AS date
            FROM activities
            WHERE strftime('%Y', start_date_local) >= '2000'
        """).fetchall()

    if not act_rows and not eff_rows:
        return {
            "score": 0, "level": "Einsteiger",
            "components": {}, "history": [],
            "trend": "neutral",
            "insight_parts": ["no_data"],
            "hr_correction_applied": hr_correction["enabled"],
        }

    ride_dates: set[str] = {r["date"] for r in ride_date_rows}

    # Effizienz-Wert pro Monat: (speed km/h) / (HR bpm) × 100
    eff_by_month: dict[str, float] = {
        r["month"]: float(r["avg_speed_kmh"]) / float(r["avg_hr"]) * 100.0
        for r in eff_rows
        if r["avg_hr"] and r["avg_hr"] > 0
    }
    all_effs: list[float] = sorted(eff_by_month.values())

    # TSS-Berechnung identisch zum PMC-Endpunkt (inkl. optionaler Betablocker-Korrektur)
    def calc_tss(dur_s, elapsed_s, hr, date) -> float:
        dur = dur_s or elapsed_s or 0
        if dur <= 0:
            return 0.0
        if hr and hr > 0:
            correction_pct = correction_pct_for_date(hr_correction, date)
            if_hr = corrected_hr(hr, global_max_hr, correction_pct) / threshold_hr
            return (dur / 3600.0) * (if_hr ** 2) * 100.0
        return (dur / 3600.0) * 50.0

    daily_tss: dict[str, float] = defaultdict(float)
    for r in act_rows:
        daily_tss[r["date"]] += calc_tss(r["moving_time_s"], r["elapsed_time_s"], r["avg_hr"], r["date"])
    for r in other_rows:
        daily_tss[r["date"]] += calc_tss(r["moving_time_s"], r["elapsed_time_s"], r["avg_hr"], r["date"])

    # --- Scoring-Funktionen ---

    def ctl_score_fn(ctl: float) -> float:
        """CTL 0 → 0 Pkt, CTL ≥ 80 → 35 Pkt (linear, Deckel bei 35)."""
        return round(min(35.0, ctl * 35.0 / 80.0), 1)

    def eff_score_fn(eff: float | None) -> float:
        """Perzentile der Monats-Effizienz in der persönlichen Gesamthistorie → 0-25 Pkt."""
        if not all_effs or eff is None:
            return 0.0
        pct = sum(1 for e in all_effs if e <= eff) / len(all_effs)
        return round(pct * 25.0, 1)

    def form_score_fn(tsb: float) -> float:
        """TSB → 0-20 Pkt. Optimum: TSB 5-20 (Wettkampffrische)."""
        if 5.0 <= tsb <= 20.0:          return 20.0
        if 20.0 < tsb <= 30.0:          return 16.0
        if 0.0 <= tsb < 5.0:            return 14.0
        if tsb > 30.0:                   return 10.0
        if -10.0 <= tsb < 0.0:          return 9.0
        if -20.0 <= tsb < -10.0:        return 4.0
        return 0.0

    def consistency_score_fn(ref_date: Date) -> tuple[float, int]:
        """Aktive Wochen (≥ 1 Ride) in den 8 Wochen vor ref_date → (Punkte, Anzahl Wochen)."""
        active = 0
        for w in range(8):
            week_end = ref_date - timedelta(days=w * 7)
            week_start = week_end - timedelta(days=6)
            for day_offset in range(7):
                if (week_start + timedelta(days=day_offset)).isoformat() in ride_dates:
                    active += 1
                    break
        return round(active * 20.0 / 8.0, 1), active

    # --- PMC-Simulation (EMA über alle Tage) ---
    start_d = Date.fromisoformat(sorted(daily_tss.keys())[0]) if daily_tss else Date.today()
    today = Date.today()

    ctl = atl = 0.0
    monthly_snapshots: dict[str, dict] = {}
    cursor = start_d
    while cursor <= today:
        d = cursor.isoformat()
        tss = daily_tss.get(d, 0.0)
        ctl = ctl + K_CTL * (tss - ctl)
        atl = atl + K_ATL * (tss - atl)
        # Letzter Wert des Monats überschreibt vorherige → am Ende jedes Monats gespeichert
        monthly_snapshots[cursor.strftime('%Y-%m')] = {
            "ctl": ctl, "tsb": ctl - atl, "date": cursor
        }
        cursor += timedelta(days=1)

    current_ctl = ctl
    current_tsb = ctl - atl

    # Effizienz: Mittelwert der letzten 3 Monate (rollierend, auch für History-Punkte nutzbar)
    avail = sorted(eff_by_month.keys())

    def rolling_eff(as_of_month: str) -> float | None:
        """Ø Effizienz der letzten (bis zu) 3 verfügbaren Monate bis einschließlich as_of_month."""
        eligible = [m for m in avail if m <= as_of_month][-3:]
        return sum(eff_by_month[m] for m in eligible) / len(eligible) if eligible else None

    recent_eff: float | None = rolling_eff(avail[-1]) if avail else None
    eff_percentile: int | None = (
        round(sum(1 for e in all_effs if e <= recent_eff) / len(all_effs) * 100)
        if (all_effs and recent_eff is not None) else None
    )

    # --- Aktueller Score ---
    s_ctl  = ctl_score_fn(current_ctl)
    s_eff  = eff_score_fn(recent_eff)
    s_form = form_score_fn(current_tsb)
    s_cons, weeks_active = consistency_score_fn(today)
    total_score = round(s_ctl + s_eff + s_form + s_cons)

    def score_level(s: int) -> str:
        if s >= 90: return "Elite"
        if s >= 75: return "Amateur"
        if s >= 60: return "Fortgeschritten"
        if s >= 45: return "Enthusiast"
        if s >= 30: return "Aktiv"
        return "Einsteiger"

    # --- Insight: Codes statt fertigem Satz – Frontend übersetzt und fügt zusammen
    # (siehe backend/importer/sport_codes.py für dieselbe Begründung: Backend kennt bei
    # dieser lokalen Single-User-App kein zuverlässiges Sprachsignal pro Request).
    parts: list[str] = []
    if current_ctl >= 60:
        parts.append("ctl_very_high")
    elif current_ctl >= 35:
        parts.append("ctl_solid")
    else:
        parts.append("ctl_developing")

    if eff_percentile is not None:
        if eff_percentile >= 75:
            parts.append("efficiency_above_avg")
        elif eff_percentile >= 40:
            parts.append("efficiency_normal")
        else:
            parts.append("efficiency_below_avg")

    if current_tsb >= 5:
        parts.append("form_good_freshness")
    elif current_tsb >= -10:
        parts.append("form_normal_fatigue")
    else:
        parts.append("form_low")

    if weeks_active >= 7:
        parts.append("consistency_very_regular")
    elif weeks_active <= 3:
        parts.append("consistency_improvable")

    # --- Monatliche Score-History (gesamte erfasste Zeit) ---
    history: list[dict] = []
    for m in sorted(monthly_snapshots.keys()):
        snap = monthly_snapshots[m]
        s = round(
            ctl_score_fn(snap["ctl"])
            + eff_score_fn(rolling_eff(m))
            + form_score_fn(snap["tsb"])
            + consistency_score_fn(snap["date"])[0]
        )
        history.append({"month": m, "score": s, "level": score_level(s)})

    # Trend: Ø letzte 3 Monate vs. 3 Monate davor
    trend = "neutral"
    if len(history) >= 6:
        r3 = sum(h["score"] for h in history[-3:]) / 3
        p3 = sum(h["score"] for h in history[-6:-3]) / 3
        if r3 > p3 + 2:   trend = "up"
        elif r3 < p3 - 2: trend = "down"

    return {
        "score": total_score,
        "level": score_level(total_score),
        "components": {
            "ctl": {
                "score": s_ctl, "max": 35,
                "value": round(current_ctl, 1),
                "label": "Trainingslast (CTL)",
            },
            "efficiency": {
                "score": s_eff, "max": 25,
                "value": round(recent_eff, 2) if recent_eff is not None else None,
                "percentile": eff_percentile,
                "label": "Aerobe Effizienz",
            },
            "form": {
                "score": s_form, "max": 20,
                "value": round(current_tsb, 1),
                "label": "Form (TSB)",
            },
            "consistency": {
                "score": s_cons, "max": 20,
                "value": weeks_active,
                "label": "Kontinuität",
            },
        },
        "trend": trend,
        "insight_parts": parts,
        "history": history,
        "hr_correction_applied": hr_correction["enabled"],
    }
