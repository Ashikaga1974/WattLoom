"""Helper-Funktionen, die von mehreren analytics-Submodulen genutzt werden."""

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
