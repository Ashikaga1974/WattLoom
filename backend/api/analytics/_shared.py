"""Helper-Funktionen, die von mehreren analytics-Submodulen genutzt werden."""

from backend.api.zones import correction_pct_for_date, corrected_hr, get_hr_correction_settings

# activity_type/sport_type ist seit der i18n-Migration ein kanonischer Code (siehe
# backend/importer/sport_codes.py) statt eines deutschen/englischen Klartext-Werts.
RIDE_TYPES = ('ride',)


def _hr_max_fallback(conn) -> float:
    """Liest hr_max aus der Config (Einstellungen); Standard 185 wenn nicht gesetzt."""
    row = conn.execute("SELECT value FROM config WHERE key = 'hr_max'").fetchone()
    return float(row["value"]) if row else 185.0


def _effective_hr_max(conn) -> float:
    """
    Höchste tatsächlich aufgezeichnete max_hr über alle Aktivitäten (echter Messwert),
    sonst Config-Fallback (_hr_max_fallback). Einheitliche Quelle für PMC,
    Fitness-Fingerprint und Zone-Distribution – analog zu backend/api/zones.py: get_zones().
    """
    row = conn.execute("SELECT MAX(max_hr) AS v FROM activities WHERE max_hr > 0").fetchone()
    return float(row["v"]) if row and row["v"] else _hr_max_fallback(conn)


def _threshold_hr_pct(conn) -> float:
    """Liest threshold_hr_pct aus der Config; Standard 0.85 (≈85 % HRmax) wenn nicht gesetzt."""
    row = conn.execute("SELECT value FROM config WHERE key = 'threshold_hr_pct'").fetchone()
    return float(row["value"]) if row else 0.85


def _ctl_atl_k(conn) -> tuple[float, float]:
    """EMA-Faktoren k = 2 / (N + 1) für CTL/ATL aus ctl_days/atl_days (Standard 42/7 Tage)."""
    ctl_row = conn.execute("SELECT value FROM config WHERE key = 'ctl_days'").fetchone()
    atl_row = conn.execute("SELECT value FROM config WHERE key = 'atl_days'").fetchone()
    ctl_days = float(ctl_row["value"]) if ctl_row else 42.0
    atl_days = float(atl_row["value"]) if atl_row else 7.0
    return 2.0 / (ctl_days + 1.0), 2.0 / (atl_days + 1.0)


def _recovery_base_h(conn) -> float:
    """Liest recovery_base_h aus der Config; Standard 6.0h wenn nicht gesetzt."""
    row = conn.execute("SELECT value FROM config WHERE key = 'recovery_base_h'").fetchone()
    return float(row["value"]) if row else 6.0


def _recovery_if_exponent(conn) -> float:
    """Liest recovery_if_exponent aus der Config; Standard 2.0 wenn nicht gesetzt."""
    row = conn.execute("SELECT value FROM config WHERE key = 'recovery_if_exponent'").fetchone()
    return float(row["value"]) if row else 2.0


def calc_recovery_hours(hr_tss: float, if_hr: float, base_h: float = 6.0, exponent: float = 2.0) -> float | None:
    """
    Grobe Erholungszeit-Schätzung (KEINE HRV-Messung, reine Heuristik aus Trainingslast statt
    einer echten physiologischen Messung – analog zur selbst kalibrierten hr_correction_pct):
    recovery_h = base_h × (hrTSS/100) × IF^exponent, gedeckelt bei 72h, auf halbe Stunden
    gerundet. None ohne gültige hrTSS/IF (z.B. fehlende HF-Daten).
    """
    if hr_tss <= 0 or if_hr <= 0:
        return None
    hours = base_h * (hr_tss / 100.0) * (if_hr ** exponent)
    return round(min(hours, 72.0) * 2) / 2


def estimate_recovery_hours(conn, duration_s: float | None, avg_hr: float | None, date_str: str | None) -> float | None:
    """
    Erholungszeit-Schätzung für eine einzelne Aktivität/Workout, gleiche hrTSS-Bausteine wie
    das PMC (inkl. optionaler Betablocker-Korrektur), aber pro Einheit statt über die History
    aggregiert.
    """
    if not duration_s or duration_s <= 0 or not avg_hr or avg_hr <= 0:
        return None
    global_max_hr = _effective_hr_max(conn)
    threshold_hr = _threshold_hr_pct(conn) * global_max_hr
    hr_correction = get_hr_correction_settings(conn)
    correction_pct = correction_pct_for_date(hr_correction, date_str)
    if_hr = corrected_hr(avg_hr, global_max_hr, correction_pct) / threshold_hr
    hr_tss = (duration_s / 3600.0) * (if_hr ** 2) * 100.0
    base_h = _recovery_base_h(conn)
    exponent = _recovery_if_exponent(conn)
    return calc_recovery_hours(hr_tss, if_hr, base_h, exponent)
