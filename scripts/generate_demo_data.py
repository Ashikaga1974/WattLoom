#!/usr/bin/env python3
"""
CLI-Skript zum Erzeugen einer realistischen Demo-Datenbank für WattLoom.

Verwendung:
    python scripts/generate_demo_data.py --output data/demo.db
    python scripts/generate_demo_data.py --months 12
"""

import sys
from pathlib import Path

# Projektwurzel in sys.path aufnehmen, damit backend importiert werden kann
REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from backend.seed_demo_data import main

if __name__ == "__main__":
    main()
