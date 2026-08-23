"""
Schlüsselmaterial für die Lizenzierung.

Zwei völlig unterschiedliche Geheimnis-Klassen, die nicht verwechselt werden dürfen:

1. LICENSE_PUBLIC_KEY_B64 – der öffentliche Ed25519-Schlüssel, mit dem gekaufte
   Lizenzschlüssel geprüft werden. Dieser darf und soll öffentlich sein (auch auf
   GitHub) – ohne den privaten Gegenpart (der offline bei Sascha bleibt, siehe
   scripts/licensing_keygen.py) lässt sich damit kein gültiger Schlüssel fälschen.
   Sicherheit kommt hier aus der Asymmetrie der Kryptografie, nicht aus Geheimhaltung.

2. TRIAL_SECRET – ein symmetrisches HMAC-Geheimnis, das den 14-Tage-Test signiert
   (siehe core.py: sign_trial_start/verify_trial_signature). Dieses MUSS geheim
   bleiben – wer es kennt, kann den Trial-Zeitstempel beliebig neu signieren und
   den Test unbegrenzt verlängern. Kommt aus einer Umgebungsvariable oder einer
   lokalen, per .gitignore ausgeschlossenen backend/licensing/_secret.py – landet
   nie im Repo.
"""
import logging
import os

logger = logging.getLogger(__name__)

# Öffentlicher Ed25519-Schlüssel (32 Bytes, base64) – siehe Docstring oben, darf öffentlich sein.
# Platzhalter bis scripts/licensing_keygen.py ein echtes Vendor-Schlüsselpaar erzeugt hat.
LICENSE_PUBLIC_KEY_B64 = "kaCxtUyqmNTxGcqaEunju0n4WuuTvzEfXZ8067b9C0E"

_DEV_FALLBACK_TRIAL_SECRET = "wattloom-dev-only-insecure-trial-secret-do-not-ship"


def trial_secret() -> bytes:
    """Lädt das symmetrische Trial-Signing-Secret. Priorität: Umgebungsvariable
    → lokale (gitignorete) _secret.py → unsicherer Dev-Fallback mit Warnung.
    Ein ausgelieferter/verkaufter Build MUSS eines der ersten beiden Wege nutzen –
    der Fallback macht den 14-Tage-Test wirkungslos (jeder kennt den Wert aus dem
    öffentlichen Repo)."""
    env_val = os.environ.get("WATTLOOM_TRIAL_SECRET")
    if env_val:
        return env_val.encode("utf-8")

    try:
        from backend.licensing._secret import TRIAL_SECRET  # type: ignore
        return TRIAL_SECRET.encode("utf-8")
    except ImportError:
        pass

    logger.warning(
        "Kein WATTLOOM_TRIAL_SECRET gesetzt und keine backend/licensing/_secret.py gefunden – "
        "nutze unsicheren Dev-Fallback. Der 14-Tage-Test ist damit NICHT manipulationssicher. "
        "Für einen echten Build: Umgebungsvariable setzen oder _secret.py anlegen (siehe .gitignore)."
    )
    return _DEV_FALLBACK_TRIAL_SECRET.encode("utf-8")
