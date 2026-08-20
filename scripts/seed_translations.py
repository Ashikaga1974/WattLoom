"""
Einmaliger Seed: liest die bisher im Frontend gebündelten locales/{de,en}/<ns>.json und
schreibt sie in die neue translations-Tabelle (DB-gestützte Übersetzungen statt Bundle).

Sichert vorher die DB nach data/backups/ (analog zur i18n-Sport-Code-Migration in
database.py). Idempotent: INSERT OR REPLACE, kann mehrfach laufen ohne Duplikate.
"""
import json
import shutil
import sqlite3
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).parent.parent
DB_PATH = ROOT / "data" / "mybiking.db"
LOCALES_DIR = ROOT / "frontend" / "src" / "locales"


def _flatten(obj: dict, prefix: str = "") -> dict[str, str]:
    flat: dict[str, str] = {}
    for k, v in obj.items():
        dotted_key = f"{prefix}.{k}" if prefix else k
        if isinstance(v, dict):
            flat.update(_flatten(v, dotted_key))
        else:
            flat[dotted_key] = v
    return flat


def main() -> None:
    if DB_PATH.exists():
        backup_dir = DB_PATH.parent / "backups"
        backup_dir.mkdir(exist_ok=True)
        backup_path = backup_dir / f"mybiking_pre-translations-seed_{datetime.now():%Y%m%d_%H%M%S}.db"
        shutil.copy2(DB_PATH, backup_path)
        print(f"Backup: {backup_path}")

    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS translations (
            lang  TEXT NOT NULL,
            ns    TEXT NOT NULL,
            key   TEXT NOT NULL,
            value TEXT NOT NULL,
            PRIMARY KEY (lang, ns, key)
        )
    """)

    rows_written = 0
    for lang_dir in sorted(LOCALES_DIR.iterdir()):
        if not lang_dir.is_dir():
            continue
        lang = lang_dir.name
        for json_file in sorted(lang_dir.glob("*.json")):
            ns = json_file.stem
            data = json.loads(json_file.read_text(encoding="utf-8"))
            for key, value in _flatten(data).items():
                conn.execute(
                    "INSERT OR REPLACE INTO translations(lang, ns, key, value) VALUES (?, ?, ?, ?)",
                    (lang, ns, key, str(value)),
                )
                rows_written += 1
        print(f"{lang}: geschrieben")

    conn.commit()
    conn.close()
    print(f"Fertig – {rows_written} Übersetzungs-Zeilen geschrieben.")


if __name__ == "__main__":
    main()
