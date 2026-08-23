"""
Lizenz- und Trial-Kernlogik.

Lizenzschlüssel: Ed25519-signiertes JSON-Payload, Format "WLM1.<payload_b64>.<sig_b64>".
Geprüft wird ausschließlich mit dem öffentlichen Schlüssel (keys.LICENSE_PUBLIC_KEY_B64) –
das Erzeugen gültiger Schlüssel (scripts/licensing_keygen.py) erfordert den privaten
Gegenpart, der nie in diesem Repo liegt.

Trial: 14-Tage-Test ab erstem Programmstart. Der Start-Zeitstempel wird mit einem
symmetrischen HMAC signiert (keys.trial_secret()), damit ein simples Editieren der
config-Tabelle (SQLite ist mit sqlite3-CLI trivial editierbar) nicht ausreicht, um
den Test zurückzusetzen – wer die Signatur nicht neu erzeugen kann, dessen manipulierter
Zeitstempel fällt bei der Prüfung durch und der Trial gilt als abgelaufen.
"""
import base64
import hashlib
import hmac
import json
import time
from dataclasses import dataclass

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey

from backend.licensing.keys import LICENSE_PUBLIC_KEY_B64, trial_secret

TRIAL_DAYS = 14
_KEY_PREFIX = "WLM1"


def _b64e(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64d(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)


@dataclass
class LicenseInfo:
    customer: str
    issued_at: int


def issue_license_key(customer: str, private_key: Ed25519PrivateKey) -> str:
    """Erzeugt einen signierten Lizenzschlüssel. Läuft NIE im ausgelieferten Produkt,
    nur offline in scripts/licensing_keygen.py mit dem privaten Vendor-Schlüssel."""
    payload = json.dumps({"cid": customer, "iat": int(time.time()), "prod": "wattloom"}, separators=(",", ":")).encode("utf-8")
    signature = private_key.sign(payload)
    return f"{_KEY_PREFIX}.{_b64e(payload)}.{_b64e(signature)}"


def verify_license_key(key_str: str) -> LicenseInfo | None:
    """Prüft einen Lizenzschlüssel gegen den öffentlichen Vendor-Schlüssel.
    None bei ungültigem Format, falscher Signatur oder unbekanntem Produkt."""
    if LICENSE_PUBLIC_KEY_B64 == "REPLACE_ME_WITH_VENDOR_PUBLIC_KEY":
        return None

    parts = key_str.strip().split(".")
    if len(parts) != 3 or parts[0] != _KEY_PREFIX:
        return None

    try:
        payload_bytes = _b64d(parts[1])
        signature = _b64d(parts[2])
        public_key = Ed25519PublicKey.from_public_bytes(_b64d(LICENSE_PUBLIC_KEY_B64))
        public_key.verify(signature, payload_bytes)
        payload = json.loads(payload_bytes)
    except (ValueError, InvalidSignature, json.JSONDecodeError):
        return None

    if payload.get("prod") != "wattloom":
        return None

    return LicenseInfo(customer=payload["cid"], issued_at=payload["iat"])


def sign_trial_start(started_at_iso: str) -> str:
    """HMAC-Signatur über den Trial-Start-Zeitstempel."""
    return hmac.new(trial_secret(), started_at_iso.encode("utf-8"), hashlib.sha256).hexdigest()


def verify_trial_signature(started_at_iso: str, signature_hex: str) -> bool:
    """Konstante-Zeit-Vergleich – verhindert Timing-Angriffe auf die Signaturprüfung."""
    expected = sign_trial_start(started_at_iso)
    return hmac.compare_digest(expected, signature_hex)


def trial_days_left(started_at_iso: str, signature_hex: str) -> int:
    """Verbleibende Trial-Tage. Bei manipulierter Signatur: 0 (abgelaufen), nicht neu gestartet –
    Manipulation soll den Test beenden, nicht verlängern."""
    from datetime import datetime, timezone

    if not verify_trial_signature(started_at_iso, signature_hex):
        return 0

    started = datetime.fromisoformat(started_at_iso).replace(tzinfo=timezone.utc)
    elapsed_days = (datetime.now(timezone.utc) - started).total_seconds() / 86400
    return max(0, TRIAL_DAYS - int(elapsed_days))


def trial_end_date(started_at_iso: str) -> str:
    """ISO-Datum, an dem der Trial endet – nur für die Anzeige (Banner), nicht Teil
    der Zugriffsprüfung selbst (die läuft über trial_days_left())."""
    from datetime import datetime, timedelta, timezone

    started = datetime.fromisoformat(started_at_iso).replace(tzinfo=timezone.utc)
    return (started + timedelta(days=TRIAL_DAYS)).date().isoformat()
