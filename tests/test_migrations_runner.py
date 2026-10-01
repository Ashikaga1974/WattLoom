import sqlite3

import pytest

from backend.database import _MIGRATIONS, _run_migrations


@pytest.fixture
def conn():
    c = sqlite3.connect(":memory:")
    c.execute("CREATE TABLE log (entry TEXT)")
    c.commit()
    yield c
    c.close()


def _user_version(conn):
    return conn.execute("PRAGMA user_version").fetchone()[0]


def _log(conn):
    return [r[0] for r in conn.execute("SELECT entry FROM log ORDER BY rowid")]


def _logging_migration(entry):
    def migration(conn):
        conn.execute("INSERT INTO log(entry) VALUES (?)", (entry,))
    return migration


def test_runs_pending_migrations_in_order_and_sets_version(conn):
    migrations = [(2, _logging_migration("two")), (1, _logging_migration("one"))]

    _run_migrations(conn, migrations)

    assert _log(conn) == ["one", "two"]
    assert _user_version(conn) == 2


def test_skips_already_applied_migrations(conn):
    conn.execute("PRAGMA user_version = 1")
    migrations = [(1, _logging_migration("one")), (2, _logging_migration("two"))]

    _run_migrations(conn, migrations)
    _run_migrations(conn, migrations)

    assert _log(conn) == ["two"]
    assert _user_version(conn) == 2


def test_failed_migration_is_rolled_back_and_version_stays(conn):
    def failing(conn):
        conn.execute("INSERT INTO log(entry) VALUES ('partial')")
        conn.execute("ALTER TABLE log ADD COLUMN extra TEXT")
        raise RuntimeError("boom")

    migrations = [(1, _logging_migration("one")), (2, failing), (3, _logging_migration("three"))]

    with pytest.raises(RuntimeError):
        _run_migrations(conn, migrations)

    assert _log(conn) == ["one"]
    assert _user_version(conn) == 1
    cols = [r[1] for r in conn.execute("PRAGMA table_info(log)")]
    assert "extra" not in cols


def test_migration_numbers_are_unique_and_gapless():
    versions = [v for v, _ in _MIGRATIONS]
    assert versions == list(range(1, len(versions) + 1))
