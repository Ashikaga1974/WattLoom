"""
Setzt die WattLoom-Versionsnummer an allen synchron zu haltenden Stellen
(frontend/package.json, backend/main.py, frontend/src/lib/version.ts) und
legt einen neuen Abschnitt in CHANGELOG.md an.

Committet und taggt NICHT selbst – gibt am Ende die vorzuschlagenden
Git-Befehle aus, Sascha führt sie selbst aus (siehe CLAUDE.md).

Nutzung:
    python scripts/bump_version.py 1.1.0
    python scripts/bump_version.py 1.1.0 --notes "Kurzbeschreibung der Änderung"
"""
import argparse
import re
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PACKAGE_JSON = ROOT / "frontend" / "package.json"
MAIN_PY = ROOT / "backend" / "main.py"
VERSION_TS = ROOT / "frontend" / "src" / "lib" / "version.ts"
CHANGELOG = ROOT / "CHANGELOG.md"

_SEMVER_RE = re.compile(r"^\d+\.\d+\.\d+$")


def _update_package_json(version: str) -> None:
    text = PACKAGE_JSON.read_text(encoding="utf-8")
    new_text, n = re.subn(r'"version":\s*"[^"]*"', f'"version": "{version}"', text, count=1)
    if n != 1:
        raise RuntimeError(f'"version"-Feld in {PACKAGE_JSON} nicht gefunden')
    PACKAGE_JSON.write_text(new_text, encoding="utf-8")


def _update_main_py(version: str) -> None:
    text = MAIN_PY.read_text(encoding="utf-8")
    new_text, n = re.subn(r'(FastAPI\(title="WattLoom API", version=)"[^"]*"', rf'\1"{version}"', text, count=1)
    if n != 1:
        raise RuntimeError(f"FastAPI(version=...) in {MAIN_PY} nicht gefunden")
    MAIN_PY.write_text(new_text, encoding="utf-8")


def _update_version_ts(version: str, release_date: str) -> None:
    text = VERSION_TS.read_text(encoding="utf-8")
    text, n1 = re.subn(r"(APP_VERSION = )'[^']*'", rf"\1'{version}'", text, count=1)
    text, n2 = re.subn(r"(RELEASE_DATE = )'[^']*'", rf"\1'{release_date}'", text, count=1)
    if n1 != 1 or n2 != 1:
        raise RuntimeError(f"APP_VERSION/RELEASE_DATE in {VERSION_TS} nicht gefunden")
    VERSION_TS.write_text(text, encoding="utf-8")


def _prepend_changelog(version: str, release_date: str, notes: str | None) -> None:
    text = CHANGELOG.read_text(encoding="utf-8")
    body = notes.strip() if notes else "- TODO: Änderungen eintragen"
    entry = f"## v{version} – {release_date}\n\n{body}\n\n"
    header, _, rest = text.partition("\n\n")
    CHANGELOG.write_text(f"{header}\n\n{entry}{rest}", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("version", help="Neue Version im SemVer-Format, z.B. 1.1.0 (ohne führendes 'v')")
    parser.add_argument("--notes", help="Changelog-Text für diese Version (sonst TODO-Platzhalter)")
    parser.add_argument("--date", default=date.today().isoformat(), help="Release-Datum (Default: heute)")
    args = parser.parse_args()

    if not _SEMVER_RE.match(args.version):
        raise SystemExit(f"Version '{args.version}' ist kein gültiges SemVer-Format (X.Y.Z)")

    _update_package_json(args.version)
    _update_main_py(args.version)
    _update_version_ts(args.version, args.date)
    _prepend_changelog(args.version, args.date, args.notes)

    print(f"Version auf {args.version} gesetzt ({args.date}).")
    print("Geänderte Dateien: frontend/package.json, backend/main.py, "
          "frontend/src/lib/version.ts, CHANGELOG.md")
    if not args.notes:
        print(f"CHANGELOG.md hat nur einen TODO-Platzhalter – Eintrag noch von Hand ausfüllen.")
    print()
    print("Vorschlag zum Abschließen (Sascha committet/taggt selbst):")
    print(f'  git add frontend/package.json backend/main.py frontend/src/lib/version.ts CHANGELOG.md')
    print(f'  git commit -m "Release v{args.version}"')
    print(f'  git tag v{args.version}')


if __name__ == "__main__":
    main()
