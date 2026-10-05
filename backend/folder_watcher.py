"""
Ordner-Watcher: importiert automatisch FIT/TCX/GPX-Dateien, die eine
Smartwatch-Companion-App in sync/ ablegt, per POST an die laufende
WattLoom-API. Zwei Betriebsarten:
  - Linux/Dev: eigener systemd-Dienst über scripts/folder_watcher.py, unabhängig vom
    Backend-Prozess (siehe systemd/wattloom-watcher.service).
  - Gebündelter Build (Windows-.exe): launcher.py startet ihn als Hintergrund-Thread
    (start_in_background()), da es dort kein systemd gibt.
Backend-Downtime führt zu Retries mit Backoff, nicht zu Datenverlust.
Bewusst reines Polling (nur Standardbibliothek) statt inotify/ReadDirectoryChangesW –
läuft dadurch unverändert auf allen Plattformen.
"""

import json
import logging
import threading
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path

from backend.paths import SYNC_DIR

logger = logging.getLogger("folder_watcher")

IMPORTED_DIR = SYNC_DIR / "imported"
FAILED_DIR = SYNC_DIR / "failed"
API_BASE = "http://localhost:8000"

POLL_INTERVAL_S = 15
STABLE_WAIT_S = 5  # Datei muss seit diesem Intervall unverändert sein (Schreibvorgang der Companion-App abgeschlossen)
MAX_BACKOFF_S = 300
# Im Launcher startet der Watcher parallel zu Uvicorn – kurz warten, damit der erste
# Poll nicht schon vor dem Server-Start ins Backoff läuft
STARTUP_DELAY_S = 3

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


def _move_to(path: Path, target_dir: Path) -> None:
    """Verschiebt die Datei nach target_dir. replace() statt rename(), weil rename() unter
    Windows bei bereits vorhandenem Ziel (gleicher Dateiname erneut exportiert) FileExistsError wirft."""
    target_dir.mkdir(parents=True, exist_ok=True)
    path.replace(target_dir / path.name)


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
        _move_to(path, IMPORTED_DIR)
        return True
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode(errors="replace")
        if exc.code == 409:
            # Demo-Modus wurde gerade eingeschaltet – Datei liegen lassen, nicht als fehlgeschlagen verschieben
            logger.info("%s: Backend nimmt gerade keine Importe an (%s) – später erneut", path.name, detail)
            return False
        logger.error("Import fehlgeschlagen für %s (HTTP %s): %s", path.name, exc.code, detail)
        _move_to(path, FAILED_DIR)
        return True
    except urllib.error.URLError as exc:
        logger.warning("Backend nicht erreichbar (%s) – %s wird erneut versucht", exc, path.name)
        return False


def _find_candidates() -> list[Path]:
    """Alle importierbaren Dateien in sync/, deren Schreibvorgang abgeschlossen ist."""
    return [
        p
        for p in SYNC_DIR.iterdir()
        if p.is_file() and p.suffix.lower() in _EXT_TO_ENDPOINT and _is_stable(p)
    ]


def _is_demo_mode() -> bool:
    """Im Demo-Modus bleiben Dateien in sync/ liegen und werden nach dem Ausschalten importiert.
    Backend nicht erreichbar → False, der Import-Versuch läuft dann ohnehin in den Retry."""
    try:
        with urllib.request.urlopen(f"{API_BASE}/system/demo-mode", timeout=10) as resp:
            return bool(json.loads(resp.read()).get("active"))
    except Exception:
        return False


def _poll_once(default_bike_id: str | None) -> tuple[str | None, bool]:
    """Ein Durchlauf über sync/. Rückgabe: (ggf. nachgeladene default_bike_id, Backend war nicht erreichbar)."""
    candidates = _find_candidates()
    if candidates and _is_demo_mode():
        return default_bike_id, False
    if candidates and default_bike_id is None:
        default_bike_id = _fetch_default_bike_id()

    any_backend_down = False
    for path in candidates:
        try:
            if not _import_file(path, default_bike_id):
                any_backend_down = True
        except OSError as exc:
            # Unter Windows hält die Companion-App die Datei evtl. noch gesperrt – im nächsten
            # Poll erneut versuchen, statt den ganzen Watcher-Thread sterben zu lassen
            logger.warning("Datei %s nicht lesbar/verschiebbar (%s) – erneuter Versuch beim nächsten Poll", path.name, exc)
    return default_bike_id, any_backend_down


def _next_sleep_s(backend_down_streak: int) -> int:
    """Exponentielles Backoff bei nicht erreichbarem Backend, sonst normales Poll-Intervall."""
    if not backend_down_streak:
        return POLL_INTERVAL_S
    return min(POLL_INTERVAL_S * (2**backend_down_streak), MAX_BACKOFF_S)


def run_forever() -> None:
    """Endlosschleife des Watchers – blockiert, kehrt nie zurück."""
    SYNC_DIR.mkdir(parents=True, exist_ok=True)
    IMPORTED_DIR.mkdir(exist_ok=True)
    FAILED_DIR.mkdir(exist_ok=True)
    logger.info("Watcher gestartet, beobachte %s", SYNC_DIR)

    backend_down_streak = 0
    default_bike_id = _fetch_default_bike_id()

    while True:
        try:
            default_bike_id, any_backend_down = _poll_once(default_bike_id)
        except OSError as exc:
            # z.B. sync/ vom Nutzer gelöscht – neu anlegen und weiterlaufen
            logger.warning("Sync-Ordner nicht lesbar (%s) – lege ihn neu an", exc)
            SYNC_DIR.mkdir(parents=True, exist_ok=True)
            any_backend_down = False
        backend_down_streak = backend_down_streak + 1 if any_backend_down else 0
        time.sleep(_next_sleep_s(backend_down_streak))


def _run_delayed() -> None:
    time.sleep(STARTUP_DELAY_S)
    run_forever()


def start_in_background() -> threading.Thread:
    """Startet den Watcher als Daemon-Thread (für launcher.py) – endet automatisch mit dem Prozess."""
    thread = threading.Thread(target=_run_delayed, name="folder-watcher", daemon=True)
    thread.start()
    return thread
