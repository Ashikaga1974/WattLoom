"""
Schreibt den CHANGELOG.md-Abschnitt einer Version in eine Datei – der Windows-Build übergibt ihn
als Beschreibung an das GitHub-Release (sonst legt action-gh-release ein Release ohne Text an).

Nutzung:
    python scripts/changelog_section.py v1.2.0 --output release-notes.md
"""
import argparse
import re
from pathlib import Path

CHANGELOG = Path(__file__).resolve().parent.parent / "CHANGELOG.md"


def extract_section(changelog: str, version: str) -> str:
    """
    Liefert den Text unter "## v<version> – <Datum>" bis zur nächsten "## "-Überschrift.
    @param changelog Inhalt von CHANGELOG.md
    @param version Version mit oder ohne führendes "v"
    @return Abschnittstext ohne Überschrift
    @raises ValueError wenn es für die Version keinen Abschnitt gibt – ein Release ohne Notes
            soll den Build scheitern lassen statt still leer zu bleiben
    """
    tag = version if version.startswith("v") else f"v{version}"
    match = re.search(rf"^## {re.escape(tag)}(?=\s)[^\n]*\n(.*?)(?=^## |\Z)", changelog, re.MULTILINE | re.DOTALL)
    if not match or not match.group(1).strip():
        raise ValueError(f"Kein CHANGELOG-Abschnitt für {tag} gefunden")
    return match.group(1).strip() + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("version", help="Version bzw. Tag, z.B. v1.2.0")
    parser.add_argument("--output", required=True, help="Zieldatei für den Abschnitt")
    args = parser.parse_args()
    section = extract_section(CHANGELOG.read_text(encoding="utf-8"), args.version)
    Path(args.output).write_text(section, encoding="utf-8")


if __name__ == "__main__":
    main()
