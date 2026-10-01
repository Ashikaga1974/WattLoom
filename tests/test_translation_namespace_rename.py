import json
import sqlite3

import pytest

from backend.database import _migration_001_rename_german_translation_namespaces


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


def _rows(conn):
    return conn.execute("SELECT lang, ns, key, value FROM translations ORDER BY 1, 2, 3").fetchall()


def test_renames_german_namespaces(conn):
    _insert(conn, "de", "strecken", "title", "Streckenvergleich")
    _insert(conn, "en", "berechnungen", "title", "Calculations")
    _insert(conn, "de", "common", "nav.home", "Start")

    _migration_001_rename_german_translation_namespaces(conn)

    assert _rows(conn) == [
        ("de", "common", "nav.home", json.dumps("Start")),
        ("de", "routecomparison", "title", json.dumps("Streckenvergleich")),
        ("en", "calculations", "title", json.dumps("Calculations")),
    ]


def test_existing_new_namespace_key_wins_and_old_row_is_removed(conn):
    _insert(conn, "de", "routecomparison", "title", "Neu")
    _insert(conn, "de", "strecken", "title", "Alt")
    _insert(conn, "de", "strecken", "subtitle", "Nur alt")

    _migration_001_rename_german_translation_namespaces(conn)

    assert _rows(conn) == [
        ("de", "routecomparison", "subtitle", json.dumps("Nur alt")),
        ("de", "routecomparison", "title", json.dumps("Neu")),
    ]


def test_is_noop_without_old_namespaces(conn):
    _insert(conn, "en", "calculations", "title", "Calculations")

    _migration_001_rename_german_translation_namespaces(conn)
    _migration_001_rename_german_translation_namespaces(conn)

    assert _rows(conn) == [("en", "calculations", "title", json.dumps("Calculations"))]
