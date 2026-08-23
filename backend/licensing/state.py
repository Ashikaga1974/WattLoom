"""
Liest/schreibt den Lizenz- und Trial-Zustand aus der config-Tabelle und bündelt
die Zugriffsentscheidung (`check_access()`), die main.py als Gate nutzt.
"""
from dataclasses import dataclass
from datetime import datetime, timezone

from backend.licensing.core import sign_trial_start, trial_days_left, trial_end_date, verify_license_key

_KEY_TRIAL_STARTED_AT = "trial_started_at"
_KEY_TRIAL_SIGNATURE = "trial_signature"
_KEY_LICENSE_KEY = "license_key"


@dataclass
class LicenseStatus:
    licensed: bool
    customer: str | None
    trial_days_left: int
    trial_end_date: str | None = None


def ensure_trial_started(conn) -> None:
    """Legt beim allerersten Start den signierten Trial-Beginn an. Idempotent."""
    row = conn.execute("SELECT value FROM config WHERE key = ?", (_KEY_TRIAL_STARTED_AT,)).fetchone()
    if row:
        return
    started_at = datetime.now(timezone.utc).isoformat()
    signature = sign_trial_start(started_at)
    with conn:
        conn.execute("INSERT INTO config (key, value) VALUES (?, ?)", (_KEY_TRIAL_STARTED_AT, started_at))
        conn.execute("INSERT INTO config (key, value) VALUES (?, ?)", (_KEY_TRIAL_SIGNATURE, signature))


def get_license_status(conn) -> LicenseStatus:
    license_row = conn.execute("SELECT value FROM config WHERE key = ?", (_KEY_LICENSE_KEY,)).fetchone()
    if license_row:
        info = verify_license_key(license_row["value"])
        if info is not None:
            return LicenseStatus(licensed=True, customer=info.customer, trial_days_left=0)

    started_row = conn.execute("SELECT value FROM config WHERE key = ?", (_KEY_TRIAL_STARTED_AT,)).fetchone()
    sig_row = conn.execute("SELECT value FROM config WHERE key = ?", (_KEY_TRIAL_SIGNATURE,)).fetchone()
    if not started_row or not sig_row:
        # Noch kein Trial-Start erfasst (sollte durch ensure_trial_started() beim Startup
        # nicht vorkommen) – auf Nummer sicher als abgelaufen behandeln, nicht als vollen Trial.
        return LicenseStatus(licensed=False, customer=None, trial_days_left=0)

    days_left = trial_days_left(started_row["value"], sig_row["value"])
    end_date = trial_end_date(started_row["value"])
    return LicenseStatus(licensed=False, customer=None, trial_days_left=days_left, trial_end_date=end_date)


def has_access(conn) -> bool:
    status = get_license_status(conn)
    return status.licensed or status.trial_days_left > 0


def activate_license(conn, license_key: str) -> LicenseStatus | None:
    """Prüft und speichert einen Lizenzschlüssel. None bei ungültigem Schlüssel."""
    info = verify_license_key(license_key)
    if info is None:
        return None
    with conn:
        conn.execute(
            "INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (_KEY_LICENSE_KEY, license_key),
        )
    return LicenseStatus(licensed=True, customer=info.customer, trial_days_left=0)
