"""
/analytics/period-comparison: beantwortet "Was hat sich verändert?" – vergleicht die letzten N Tage
mit einem Vergleichsfenster (gleiche Tage im Vorjahr oder die N Tage davor) und leitet daraus
regelbasierte Aussagen ab. Die Regeln liegen bewusst im Backend (als Codes, Übersetzung im
Frontend), damit sie per pytest testbar sind.
"""
from datetime import date as Date, timedelta
from typing import Literal

from fastapi import APIRouter, Query

from backend.database import db_connection
from ._shared import RIDE_TYPES
from .best_by_distance import _best_by_distance_map
from .pmc import performance_management_chart

router = APIRouter(prefix="/analytics", tags=["analytics"])

BEST_EFFORT_DISTANCES_KM = (10, 20, 30, 50)

# Unterhalb dieser Mengen schwanken die Durchschnitte zu stark für eine Aussage
MIN_RIDES = 5
MIN_HR_RIDES = 5

VOLUME_CHANGE_PCT = 10.0
SPEED_CHANGE_KMH = 0.5
SIMILAR_HR_BPM = 3.0
EFFICIENCY_CHANGE_PCT = 3.0
BEST_EFFORT_CHANGE_PCT = 1.0
CTL_CHANGE = 3.0
ACTIVE_WEEKS_CHANGE = 2


def comparison_windows(today: Date, days: int, baseline: str) -> tuple[tuple[Date, Date], tuple[Date, Date]]:
    """
    Berechnet aktuelles Fenster und Vergleichsfenster, jeweils als (Start, Ende) inklusive.
    @param today Letzter Tag des aktuellen Fensters
    @param days Fensterlänge in Tagen
    @param baseline "last_year" = dieselben Tage ein Jahr früher, "previous" = die N Tage davor
    @return ((current_start, current_end), (baseline_start, baseline_end))
    """
    current = (today - timedelta(days=days - 1), today)
    shift = timedelta(days=365) if baseline == "last_year" else timedelta(days=days)
    return current, (current[0] - shift, current[1] - shift)


def _window_rides(conn, start: Date, end: Date) -> list:
    ph = ",".join("?" * len(RIDE_TYPES))
    # start_date (UTC) wie bei den übrigen Rolling-Window-Abfragen, siehe CLAUDE.md
    return conn.execute(f"""
        SELECT id, start_date, distance_m, moving_time_s, elevation_gain_m, avg_hr
        FROM activities
        WHERE activity_type IN ({ph})
          AND distance_m > 0 AND moving_time_s > 0
          AND start_date >= ? AND start_date < ?
    """, [*RIDE_TYPES, start.isoformat(), (end + timedelta(days=1)).isoformat()]).fetchall()


def _speed_kmh(distance_m: float, moving_s: float) -> float | None:
    return round(distance_m / moving_s * 3.6, 1) if moving_s > 0 else None


def summarize_rides(rides: list) -> dict:
    """
    Aggregiert Fahrten eines Fensters. Geschwindigkeit = Gesamtdistanz / Gesamtfahrzeit (sonst
    zählen kurze Fahrten so viel wie lange); Ø HF zeitgewichtet, nur über Fahrten mit HF.
    Effizienz = Tempo der HF-Fahrten / Ø HF × 100 – wie beim Fitness-Fingerprint bewusst ohne
    Betablocker-Korrektur, da gemessene Kennzahl.
    @param rides Zeilen mit start_date, distance_m, moving_time_s, elevation_gain_m, avg_hr
    @return Kennzahlen-Dict (Werte None, wenn keine Daten)
    """
    total_m = sum(r["distance_m"] for r in rides)
    total_s = sum(r["moving_time_s"] for r in rides)
    hr_rides = [r for r in rides if r["avg_hr"] and r["avg_hr"] > 0]
    hr_m = sum(r["distance_m"] for r in hr_rides)
    hr_s = sum(r["moving_time_s"] for r in hr_rides)
    avg_hr = sum(r["avg_hr"] * r["moving_time_s"] for r in hr_rides) / hr_s if hr_s > 0 else None
    hr_speed = _speed_kmh(hr_m, hr_s)
    weeks = {Date.fromisoformat(r["start_date"][:10]).isocalendar()[:2] for r in rides}
    return {
        "rides": len(rides),
        "km": round(total_m / 1000, 1),
        "hours": round(total_s / 3600, 1),
        "elevation_m": round(sum(r["elevation_gain_m"] or 0 for r in rides)),
        "avg_speed_kmh": _speed_kmh(total_m, total_s),
        "hr_rides": len(hr_rides),
        "avg_hr": round(avg_hr, 1) if avg_hr is not None else None,
        "efficiency": round(hr_speed / avg_hr * 100, 2) if hr_speed and avg_hr else None,
        "active_weeks": len(weeks),
    }


def best_efforts_in(conn, activity_ids: list[int]) -> dict[str, float | None]:
    """Schnellste Zeit (s) je Distanz, nur über die übergebenen Fahrten – scannt nicht alle Tracks."""
    empty = {str(d): None for d in BEST_EFFORT_DISTANCES_KM}
    if not activity_ids:
        return empty
    best = _best_by_distance_map(conn, activity_ids=activity_ids)
    return {str(d): (best.get(d) or {}).get("best_time_s") for d in BEST_EFFORT_DISTANCES_KM}


def _pct_change(current: float | None, previous: float | None) -> float | None:
    if current is None or not previous:
        return None
    return (current - previous) / previous * 100


def _speed_insight(current: dict, previous: dict, hr_ok: bool) -> dict | None:
    if current["avg_speed_kmh"] is None or previous["avg_speed_kmh"] is None:
        return None
    delta = current["avg_speed_kmh"] - previous["avg_speed_kmh"]
    if abs(delta) < SPEED_CHANGE_KMH:
        return None
    direction = "faster" if delta > 0 else "slower"
    values = {"delta": round(abs(delta), 1)}
    if hr_ok and abs(current["avg_hr"] - previous["avg_hr"]) <= SIMILAR_HR_BPM:
        return {"code": f"{direction}_similar_hr", "values": values}
    return {"code": direction, "values": values}


def _best_effort_insights(current: dict, previous: dict) -> list[dict]:
    improved, worse = [], []
    for distance in BEST_EFFORT_DISTANCES_KM:
        change = _pct_change(current["best_efforts"][str(distance)], previous["best_efforts"][str(distance)])
        if change is None:
            continue
        # Kürzere Zeit = besser
        if change <= -BEST_EFFORT_CHANGE_PCT:
            improved.append(distance)
        elif change >= BEST_EFFORT_CHANGE_PCT:
            worse.append(distance)
    insights = []
    if improved:
        insights.append({"code": "best_efforts_improved", "values": {"distances": ", ".join(map(str, improved))}})
    if worse:
        insights.append({"code": "best_efforts_worse", "values": {"distances": ", ".join(map(str, worse))}})
    return insights


def build_insights(current: dict, previous: dict) -> list[dict]:
    """
    Leitet Aussagen aus zwei Fenster-Zusammenfassungen ab. Nur Änderungen oberhalb der Schwellen
    erzeugen eine Aussage; ohne genug Fahrten in beiden Fenstern gibt es nur einen Hinweis.
    @return Liste von {"code": str, "values": dict} – Übersetzung über progress.changeSummary.insights.<code>
    """
    if current["rides"] < MIN_RIDES or previous["rides"] < MIN_RIDES:
        return [{"code": "not_enough_rides", "values": {"min": MIN_RIDES}}]

    insights: list[dict] = []
    km_change = _pct_change(current["km"], previous["km"])
    if km_change is not None and abs(km_change) >= VOLUME_CHANGE_PCT:
        insights.append({"code": "volume_up" if km_change > 0 else "volume_down", "values": {"pct": round(abs(km_change))}})

    hr_ok = current["hr_rides"] >= MIN_HR_RIDES and previous["hr_rides"] >= MIN_HR_RIDES
    speed = _speed_insight(current, previous, hr_ok)
    if speed:
        insights.append(speed)

    # "Schneller bei ähnlicher HF" sagt dasselbe wie gestiegene Effizienz – nicht doppelt melden
    if hr_ok and not (speed and speed["code"].endswith("_similar_hr")):
        eff_change = _pct_change(current["efficiency"], previous["efficiency"])
        if eff_change is not None and abs(eff_change) >= EFFICIENCY_CHANGE_PCT:
            insights.append({"code": "efficiency_up" if eff_change > 0 else "efficiency_down", "values": {"pct": round(abs(eff_change))}})

    insights.extend(_best_effort_insights(current, previous))

    if current["ctl"] is not None and previous["ctl"] is not None:
        ctl_delta = current["ctl"] - previous["ctl"]
        if abs(ctl_delta) >= CTL_CHANGE:
            insights.append({"code": "fitness_up" if ctl_delta > 0 else "fitness_down", "values": {"delta": round(abs(ctl_delta))}})

    weeks_delta = current["active_weeks"] - previous["active_weeks"]
    if abs(weeks_delta) >= ACTIVE_WEEKS_CHANGE:
        insights.append({"code": "consistency_up" if weeks_delta > 0 else "consistency_down", "values": {"delta": abs(weeks_delta)}})

    return insights or [{"code": "no_notable_change", "values": {}}]


def _ctl_on(pmc_days: list[dict], day: Date) -> float | None:
    target = day.isoformat()
    for entry in reversed(pmc_days):
        if entry["date"] <= target:
            return entry["ctl"]
    return None


def _window_summary(conn, window: tuple[Date, Date], pmc_days: list[dict]) -> dict:
    rides = _window_rides(conn, *window)
    summary = summarize_rides(rides)
    summary["start"] = window[0].isoformat()
    summary["end"] = window[1].isoformat()
    summary["ctl"] = _ctl_on(pmc_days, window[1])
    summary["best_efforts"] = best_efforts_in(conn, [r["id"] for r in rides])
    return summary


@router.get("/period-comparison")
def period_comparison(
    days: int = Query(90, ge=7, le=365),
    baseline: Literal["last_year", "previous"] = "last_year",
):
    """Vergleicht die letzten `days` Tage mit dem Vergleichsfenster und liefert Kennzahlen + Aussagen."""
    current_window, baseline_window = comparison_windows(Date.today(), days, baseline)
    pmc_days = performance_management_chart()["days"]
    with db_connection() as conn:
        current = _window_summary(conn, current_window, pmc_days)
        previous = _window_summary(conn, baseline_window, pmc_days)
    return {
        "days": days,
        "baseline": baseline,
        "current": current,
        "previous": previous,
        "insights": build_insights(current, previous),
    }
