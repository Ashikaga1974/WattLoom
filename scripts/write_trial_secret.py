"""
Schreibt backend/licensing/_secret.py aus der Umgebungsvariable WATTLOOM_TRIAL_SECRET.
Nur für den CI-Build (.github/workflows/build-windows.yml) gedacht – dort kommt der Wert
aus dem GitHub-Repository-Secret WATTLOOM_TRIAL_SECRET. Lokal reicht stattdessen, die
Umgebungsvariable selbst beim Start zu setzen (siehe backend/licensing/keys.py) – dieses
Script muss dafür nicht laufen.
"""
import os
import sys
from pathlib import Path

secret = os.environ.get("WATTLOOM_TRIAL_SECRET")
if not secret:
    print("WATTLOOM_TRIAL_SECRET ist nicht gesetzt – breche ab.", file=sys.stderr)
    sys.exit(1)

target = Path(__file__).resolve().parent.parent / "backend" / "licensing" / "_secret.py"
target.write_text(f"TRIAL_SECRET = {secret!r}\n", encoding="utf-8")
print(f"Geschrieben: {target}")
