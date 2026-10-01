"""
Standalone-Start des Ordner-Watchers für den systemd-Dienst (siehe
systemd/wattloom-watcher.service). Die eigentliche Logik liegt in
backend/folder_watcher.py, damit der gebündelte Build (launcher.py) sie mitnutzen kann.
"""

import logging
import sys
from pathlib import Path

# Beim Aufruf als `python scripts/folder_watcher.py` liegt nur scripts/ auf sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.folder_watcher import run_forever  # noqa: E402

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    run_forever()
