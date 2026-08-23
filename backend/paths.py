"""
Zentrale Pfad-Auflösung – einzige Stelle, die weiß, ob WattLoom gerade im Dev-Modus
(aus dem Repo heraus) oder als von PyInstaller gebündelte .exe/Binary läuft.

Dev-Modus: Datenverzeichnis = Repo-Root (wie bisher, `Path(__file__).parent.parent`).
Gebündelt (PyInstaller, `sys.frozen`): es gibt zwei unterschiedliche Basisverzeichnisse,
die nicht verwechselt werden dürfen:
  - RESOURCE_DIR: schreibgeschützte, mitgelieferte Dateien (z.B. frontend/dist), liegen im
    von PyInstaller entpackten Temp-Ordner (`sys._MEIPASS`) – bei jedem Start neu, nie beschreiben.
  - DATA_BASE_DIR: Verzeichnis neben der .exe selbst – hier lebt die echte Nutzerdatenbank,
    Backups, Medien, Logs. Muss über Programmstarts hinweg erhalten bleiben, also NICHT
    `sys._MEIPASS` (das wird bei jedem Start frisch entpackt und beim Beenden aufgeräumt).
"""
import sys
from pathlib import Path

_FROZEN = getattr(sys, "frozen", False)

if _FROZEN:
    RESOURCE_DIR = Path(getattr(sys, "_MEIPASS", Path(sys.executable).parent))
    DATA_BASE_DIR = Path(sys.executable).parent
else:
    RESOURCE_DIR = Path(__file__).resolve().parent.parent
    DATA_BASE_DIR = RESOURCE_DIR

DATA_DIR = DATA_BASE_DIR / "data"
MEDIA_DIR = DATA_DIR / "media"
BIKE_IMAGES_DIR = DATA_DIR / "bike_images"
BACKUPS_DIR = DATA_DIR / "backups"
DOWNLOAD_DIR = DATA_BASE_DIR / "download"
DB_PATH = DATA_DIR / "mybiking.db"
LOG_FILE = DATA_DIR / "mybiking.log"

FRONTEND_DIST_DIR = RESOURCE_DIR / "frontend" / "dist"


def ensure_data_dirs() -> None:
    """Legt alle Datenverzeichnisse an, falls sie fehlen (z.B. beim allerersten Start
    einer frisch installierten .exe, wo es noch kein data/-Verzeichnis gibt)."""
    for d in (DATA_DIR, MEDIA_DIR, BIKE_IMAGES_DIR, BACKUPS_DIR, DOWNLOAD_DIR):
        d.mkdir(parents=True, exist_ok=True)
