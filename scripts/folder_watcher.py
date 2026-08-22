"""
Ordner-Watcher: importiert automatisch FIT/TCX/GPX-Dateien, die eine
Smartwatch-Companion-App in sync/ ablegt, per POST an die laufende
WattLoom-API. Läuft als eigener systemd-Dienst, unabhängig vom Backend-Prozess
(siehe systemd/wattloom-watcher.service) – Backend-Downtime führt zu Retries
mit Backoff, nicht zu Datenverlust.
"""

import json
import logging
import os
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("folder_watcher")

REPO_DIR = Path(__file__).resolve().parent.parent
SYNC_DIR = REPO_DIR / "sync"
IMPORTED_DIR = SYNC_DIR / "imported"
FAILED_DIR = SYNC_DIR / "failed"
API_BASE = "http://localhost:8000"

POLL_INTERVAL_S = 15
STABLE_WAIT_S = 5  # Datei muss seit diesem Intervall unverändert sein (Schreibvorgang der Companion-App abgeschlossen)
MAX_BACKOFF_S = 300

_EXT_TO_ENDPOINT = {
    ".fit": "/import/fit-file",
    ".tcx": "/import/tcx-file",
    ".gpx": "/import/gpx-file",
}


def _fetch_default_bike_id() -> str | None:
    """Holt default_bike_id aus den Settings – wird für alle Importe mitgeschickt (Radtouren brauchen ein bike_id, Workouts ignorieren es)."""
    try:
        with urllib.request.urlopen(f"{API_BASE}/settings", timeout=10) as resp:
            data = json.loads(resp.read())
        return data.get("default_bike_id")
    except Exception as exc:
        logger.warning("Konnte default_bike_id nicht laden: %s", exc)
        return None


def _build_multipart(filename: str, file_bytes: bytes, bike_id: str | None) -> tuple[bytes, str]:
    boundary = uuid.uuid4().hex
    parts = []
    if bike_id:
        parts.append(
            f'--{boundary}\r\nContent-Disposition: form-data; name="bike_id"\r\n\r\n{bike_id}\r\n'.encode()
        )
    parts.append(
        f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{filename}"\r\n'
        f"Content-Type: application/octet-stream\r\n\r\n".encode()
    )
    parts.append(file_bytes)
    parts.append(f"\r\n--{boundary}--\r\n".encode())
    body = b"".join(parts)
    content_type = f"multipart/form-data; boundary={boundary}"
    return body, content_type


def _is_stable(path: Path) -> bool:
    try:
        return (time.time() - path.stat().st_mtime) > STABLE_WAIT_S
    except FileNotFoundError:
        return False


def _import_file(path: Path, bike_id: str | None) -> bool:
    """True = erfolgreich importiert oder endgültig fehlgeschlagen (Datei behandelt). False = Backend nicht erreichbar (Retry später)."""
    endpoint = _EXT_TO_ENDPOINT[path.suffix.lower()]
    body, content_type = _build_multipart(path.name, path.read_bytes(), bike_id)
    req = urllib.request.Request(
        f"{API_BASE}{endpoint}", data=body, headers={"Content-Type": content_type}, method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            result = json.loads(resp.read())
        logger.info("Importiert: %s -> activity %s", path.name, result.get("activity_id"))
        IMPORTED_DIR.mkdir(exist_ok=True)
        path.rename(IMPORTED_DIR / path.name)
        return True
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode(errors="replace")
        logger.error("Import fehlgeschlagen für %s (HTTP %s): %s", path.name, exc.code, detail)
        FAILED_DIR.mkdir(exist_ok=True)
        path.rename(FAILED_DIR / path.name)
        return True
    except urllib.error.URLError as exc:
        logger.warning("Backend nicht erreichbar (%s) – %s wird erneut versucht", exc, path.name)
        return False


def main() -> None:
    SYNC_DIR.mkdir(exist_ok=True)
    IMPORTED_DIR.mkdir(exist_ok=True)
    FAILED_DIR.mkdir(exist_ok=True)
    logger.info("Watcher gestartet, beobachte %s", SYNC_DIR)

    backend_down_streak = 0
    default_bike_id = _fetch_default_bike_id()

    while True:
        candidates = [
            p
            for p in SYNC_DIR.iterdir()
            if p.is_file() and p.suffix.lower() in _EXT_TO_ENDPOINT and _is_stable(p)
        ]

        if candidates and default_bike_id is None:
            default_bike_id = _fetch_default_bike_id()

        any_backend_down = False
        for path in candidates:
            if not _import_file(path, default_bike_id):
                any_backend_down = True

        backend_down_streak = backend_down_streak + 1 if any_backend_down else 0
        sleep_s = min(POLL_INTERVAL_S * (2**backend_down_streak), MAX_BACKOFF_S) if backend_down_streak else POLL_INTERVAL_S
        time.sleep(sleep_s)


if __name__ == "__main__":
    main()
