"""Tests für scripts/changelog_section.py (Release-Notes für den Windows-Build)."""
from pathlib import Path
import importlib.util

import pytest

_SPEC = importlib.util.spec_from_file_location(
    "changelog_section", Path(__file__).resolve().parent.parent / "scripts" / "changelog_section.py"
)
changelog_section = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(changelog_section)

CHANGELOG = """# Changelog

## v1.2.0 – 2026-10-01

- New feature
- Another one

## v1.1.1 – 2026-09-28

- Fix

## v1.1.0 – 2026-09-27

Single line
"""


def test_extracts_section_until_next_heading():
    assert changelog_section.extract_section(CHANGELOG, "v1.2.0") == "- New feature\n- Another one\n"


def test_accepts_version_without_v_and_last_section():
    assert changelog_section.extract_section(CHANGELOG, "1.1.0") == "Single line\n"


def test_does_not_match_version_prefix():
    # v1.1 darf nicht den Abschnitt v1.1.1 liefern
    with pytest.raises(ValueError):
        changelog_section.extract_section(CHANGELOG, "v1.1")


def test_missing_version_raises():
    with pytest.raises(ValueError):
        changelog_section.extract_section(CHANGELOG, "v9.9.9")


def test_real_changelog_has_current_release():
    real = (Path(__file__).resolve().parent.parent / "CHANGELOG.md").read_text(encoding="utf-8")
    assert "What changed?" in changelog_section.extract_section(real, "v1.2.0")
