import json
import sqlite3
from pathlib import Path

import pytest

from backend.database import (
    _TRANSLATION_INSERTS_002,
    _TRANSLATION_INSERTS_003,
    _TRANSLATION_INSERTS_006,
    _TRANSLATION_UPDATES_002,
    _TRANSLATION_UPDATES_003,
    _migration_002_mark_estimates_and_drop_fitness_levels,
    _migration_003_clarify_fitness_periods,
)

SEED_DIR = Path(__file__).resolve().parent.parent / "backend" / "seed_data"


@pytest.fixture
def conn():
    c = sqlite3.connect(":memory:")
    c.execute("""
        CREATE TABLE translations (
            lang  TEXT NOT NULL,
            ns    TEXT NOT NULL,
            key   TEXT NOT NULL,
            value TEXT NOT NULL,
            PRIMARY KEY (lang, ns, key)
        )
    """)
    yield c
    c.close()


def _insert(conn, lang, ns, key, value):
    conn.execute(
        "INSERT INTO translations(lang, ns, key, value) VALUES (?, ?, ?, ?)",
        (lang, ns, key, json.dumps(value)),
    )


def _value(conn, lang, ns, key):
    row = conn.execute(
        "SELECT value FROM translations WHERE lang = ? AND ns = ? AND key = ?", (lang, ns, key)
    ).fetchone()
    return json.loads(row[0]) if row else None


def _seed_value(lang, ns, key):
    node = json.loads((SEED_DIR / f"translations_{lang}.json").read_text(encoding="utf-8"))[ns]
    for part in key.split("."):
        if part not in node:
            return None
        node = node[part]
    return node


def test_updates_values_that_still_match_old_seed(conn):
    _insert(conn, "en", "activitydetail", "stats.estPower", "~ Power")

    _migration_002_mark_estimates_and_drop_fitness_levels(conn)

    assert _value(conn, "en", "activitydetail", "stats.estPower") == "Est. power"


def test_keeps_custom_translations(conn):
    _insert(conn, "en", "activitydetail", "stats.estPower", "My own label")

    _migration_002_mark_estimates_and_drop_fitness_levels(conn)

    assert _value(conn, "en", "activitydetail", "stats.estPower") == "My own label"


def test_inserts_new_keys_and_removes_level_texts(conn):
    _insert(conn, "de", "fitness", "levels.elite", "Elite")
    _insert(conn, "de", "fitness", "history.tooltipLevel", "Level")
    _insert(conn, "de", "fitness", "history.tooltipScore", "Score")

    _migration_002_mark_estimates_and_drop_fitness_levels(conn)

    assert _value(conn, "de", "fitness", "levels.elite") is None
    assert _value(conn, "de", "fitness", "history.tooltipLevel") is None
    assert _value(conn, "de", "fitness", "history.tooltipScore") == "Score"
    assert _value(conn, "de", "fitness", "vsLastYear") == "{{delta}} ggü. Vorjahr"


def test_adds_period_to_fitness_trend_and_history_title(conn):
    _insert(conn, "de", "fitness", "trend.up", "Aufwärtstrend")
    _insert(conn, "en", "fitness", "history.title", "Score History (last 13 months)")

    _migration_003_clarify_fitness_periods(conn)

    assert _value(conn, "de", "fitness", "trend.up") == "Aufwärtstrend (3 Mon.)"
    assert _value(conn, "en", "fitness", "history.title") == "Score History (all time)"
    assert _value(conn, "de", "fitness", "trendHint").startswith("Ø-Score der letzten 3 Monate")


@pytest.mark.parametrize("updates, inserts", [
    (_TRANSLATION_UPDATES_002, _TRANSLATION_INSERTS_002),
    (_TRANSLATION_UPDATES_003, _TRANSLATION_INSERTS_003),
    ({}, _TRANSLATION_INSERTS_006),
])
def test_seed_files_already_contain_new_values(updates, inserts):
    # Frische Installationen bekommen die Texte aus dem Seed, nicht aus der Migration
    for (lang, ns, key), (_old, new) in updates.items():
        assert _seed_value(lang, ns, key) == new
    for (lang, ns, key), value in inserts.items():
        assert _seed_value(lang, ns, key) == value


def test_seed_files_contain_no_fitness_levels():
    for lang in ("de", "en"):
        assert _seed_value(lang, "fitness", "levels") is None
        assert _seed_value(lang, "fitness", "history.tooltipLevel") is None


def test_change_summary_texts_are_inserted_and_match_seed(conn):
    from backend.database import _CHANGE_SUMMARY_TRANSLATIONS, _migration_004_add_change_summary_translations

    _insert(conn, "de", "progress", "changeSummary.title", "Eigener Titel")

    _migration_004_add_change_summary_translations(conn)

    assert _value(conn, "de", "progress", "changeSummary.title") == "Eigener Titel"
    assert _value(conn, "en", "progress", "changeSummary.insights.volume_up") == "You rode {{pct}} % more."
    for lang in ("de", "en"):
        assert _seed_value(lang, "progress", "changeSummary") == _CHANGE_SUMMARY_TRANSLATIONS[lang]


def test_monthly_overview_texts_are_inserted_and_match_seed(conn):
    from backend.database import _MONTHLY_OVERVIEW_TRANSLATIONS, _migration_005_add_monthly_overview_translations

    _migration_005_add_monthly_overview_translations(conn)

    assert _value(conn, "de", "progress", "progressTab.tooltip.rides") == "Fahrten"
    for lang, nested in _MONTHLY_OVERVIEW_TRANSLATIONS.items():
        assert _seed_value(lang, "progress", "progressTab.bestMonth") == nested["bestMonth"]
        assert _seed_value(lang, "progress", "progressTab.tooltip.rolling12") == nested["tooltip"]["rolling12"]
