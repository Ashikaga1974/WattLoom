"""
Zentrale Pfad-Auflösung – einzige Stelle, die weiß, ob WattLoom gerade im Dev-Modus
(aus dem Repo heraus), als von PyInstaller gebündelte .exe/Binary oder im Docker-Container läuft.

Dev-Modus: Datenverzeichnis = Repo-Root (wie bisher, `Path(__file__).parent.parent`).
Gebündelt (PyInstaller, `sys.frozen`): es gibt zwei unterschiedliche Basisverzeichnisse,
die nicht verwechselt werden dürfen:
  - RESOURCE_DIR: schreibgeschützte, mitgelieferte Dateien (z.B. frontend/dist), liegen im
    von PyInstaller entpackten Temp-Ordner (`sys._MEIPASS`) – bei jedem Start neu, nie beschreiben.
  - DATA_BASE_DIR: Verzeichnis neben der .exe selbst – hier lebt die echte Nutzerdatenbank,
    Backups, Medien, Logs. Muss über Programmstarts hinweg erhalten bleiben, also NICHT
    `sys._MEIPASS` (das wird bei jedem Start frisch entpackt und beim Beenden aufgeräumt).
    Ausnahme Windows (ab v1.1.2): DATA_DIR liegt unter %APPDATA%\\WattLoom\\data, damit ein
    Update in einen neuen Ordner die Daten weiter findet; ein altes data/ neben der .exe wird
    beim ersten Start einmalig dorthin migriert (siehe migrate_legacy_data_dir()).
Docker: RESOURCE_DIR bleibt der Code-Pfad im Image (schreibgeschützt, wird bei jedem Rebuild
neu erzeugt), DATA_BASE_DIR wird über WATTLOOM_DATA_DIR auf das gemountete Volume gelegt –
sonst würde die DB im Container landen und beim nächsten `docker compose up --build` weg sein.
"""
import os
import shutil
import sqlite3
import sys
from contextlib import closing
from datetime import datetime
from pathlib import Path

_FROZEN = getattr(sys, "frozen", False)
_ENV_DATA_DIR = os.environ.get("WATTLOOM_DATA_DIR")
_DB_FILENAME = "mybiking.db"
# Tabellen, in denen eine frisch von init_db() angelegte DB garantiert noch nichts enthält
_USER_DATA_TABLES = ("activities", "other_activities", "bikes", "purchases")


def _is_untouched_db(db_path: Path) -> bool:
    """True, wenn die DB noch keinerlei Nutzerdaten enthält (nur init_db()-Seeds).
    Im Zweifel (defekte DB, fehlende Tabelle) False – dann wird sie nie ersetzt."""
    try:
        with closing(sqlite3.connect(f"{db_path.as_uri()}?mode=ro", uri=True)) as conn:
            return not any(
                conn.execute(f"SELECT 1 FROM {table} LIMIT 1").fetchone()
                for table in _USER_DATA_TABLES
            )
    except sqlite3.Error:
        return False


def migrate_legacy_data_dir(legacy_data_dir: Path, new_data_dir: Path) -> bool:
    """Verschiebt ein data/ vom alten Ort (neben der .exe, bis v1.1.1) einmalig an den neuen.

    Kopiert erst vollständig und benennt den alten Ordner danach nur um (nie löschen) – bricht
    die Kopie ab, bleibt der alte Stand unverändert. Eine am neuen Ort bereits vorhandene DB mit
    Nutzerdaten gewinnt immer; eine noch unberührte (z.B. weil die neue Version vorher aus einem
    anderen Ordner gestartet wurde) wird beiseite gelegt statt überschrieben.
    Rückgabe: True, wenn migriert wurde. Wirft OSError bei fehlgeschlagener Kopie."""
    if not (legacy_data_dir / _DB_FILENAME).exists():
        return False
    new_db = new_data_dir / _DB_FILENAME
    if new_db.exists() and not _is_untouched_db(new_db):
        return False

    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    staging_dir = new_data_dir.with_name(f"{new_data_dir.name}.migrating")
    shutil.rmtree(staging_dir, ignore_errors=True)
    try:
        shutil.copytree(legacy_data_dir, staging_dir)
    except OSError:
        shutil.rmtree(staging_dir, ignore_errors=True)
        raise

    if new_data_dir.exists():
        new_data_dir.rename(new_data_dir.with_name(f"{new_data_dir.name}.unused-{stamp}"))
    staging_dir.rename(new_data_dir)
    legacy_data_dir.rename(legacy_data_dir.with_name(f"{legacy_data_dir.name}.migrated-{stamp}"))
    return True


def _resolve_windows_data_dir(exe_dir: Path) -> Path:
    """Windows-Build: data/ unter %APPDATA%\\WattLoom statt neben der .exe – sonst startet
    jede in einen neuen Ordner entpackte Version mit leerer DB (Daten scheinbar weg)."""
    legacy_data_dir = exe_dir / "data"
    appdata = os.environ.get("APPDATA")
    if not appdata:
        return legacy_data_dir
    new_data_dir = Path(appdata) / "WattLoom" / "data"
    try:
        migrate_legacy_data_dir(legacy_data_dir, new_data_dir)
    except OSError:
        # Lieber am alten Ort weiterarbeiten als mit einer scheinbar leeren DB starten
        return legacy_data_dir
    return new_data_dir


if _FROZEN:
    RESOURCE_DIR = Path(getattr(sys, "_MEIPASS", Path(sys.executable).parent))
    DATA_BASE_DIR = Path(_ENV_DATA_DIR) if _ENV_DATA_DIR else Path(sys.executable).parent
else:
    RESOURCE_DIR = Path(__file__).resolve().parent.parent
    DATA_BASE_DIR = Path(_ENV_DATA_DIR) if _ENV_DATA_DIR else RESOURCE_DIR

# download/ bleibt bewusst neben der .exe: dort legt der Nutzer seinen Strava-ZIP selbst ab,
# im versteckten AppData-Ordner fände er ihn nicht. Nur die dauerhaften Daten ziehen um.
if _FROZEN and not _ENV_DATA_DIR and sys.platform == "win32":
    DATA_DIR = _resolve_windows_data_dir(DATA_BASE_DIR)
else:
    DATA_DIR = DATA_BASE_DIR / "data"
MEDIA_DIR = DATA_DIR / "media"
BIKE_IMAGES_DIR = DATA_DIR / "bike_images"
BACKUPS_DIR = DATA_DIR / "backups"
DOWNLOAD_DIR = DATA_BASE_DIR / "download"
# sync/ liegt wie download/ sichtbar neben der .exe: dorthin zeigt der Nutzer seine
# Companion-App, der Ordner-Watcher (backend/folder_watcher.py) importiert neue Dateien daraus.
SYNC_DIR = DATA_BASE_DIR / "sync"
DB_PATH = DATA_DIR / "mybiking.db"
# Demo-Modus (backend/demo_mode.py): eigene, bei jedem Einschalten neu erzeugte DB – die echte bleibt unberührt
DEMO_DB_PATH = DATA_DIR / "demo.db"
LOG_FILE = DATA_DIR / "mybiking.log"

FRONTEND_DIST_DIR = RESOURCE_DIR / "frontend" / "dist"


def ensure_data_dirs() -> None:
    """Legt alle Datenverzeichnisse an, falls sie fehlen (z.B. beim allerersten Start
    einer frisch installierten .exe, wo es noch kein data/-Verzeichnis gibt)."""
    for d in (DATA_DIR, MEDIA_DIR, BIKE_IMAGES_DIR, BACKUPS_DIR, DOWNLOAD_DIR, SYNC_DIR):
        d.mkdir(parents=True, exist_ok=True)
