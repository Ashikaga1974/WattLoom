import sqlite3
from contextlib import closing
from pathlib import Path

import pytest

from backend import paths
from backend.paths import migrate_legacy_data_dir


def _make_db(data_dir: Path, with_activity: bool) -> Path:
    """Legt eine Mini-DB mit den für _is_untouched_db() relevanten Tabellen an."""
    data_dir.mkdir(parents=True, exist_ok=True)
    db_path = data_dir / "mybiking.db"
    with closing(sqlite3.connect(db_path)) as conn:
        for table in ("activities", "other_activities", "bikes", "purchases"):
            conn.execute(f"CREATE TABLE {table} (id INTEGER PRIMARY KEY)")
        if with_activity:
            conn.execute("INSERT INTO activities (id) VALUES (1)")
        conn.commit()
    return db_path


def _has_activity(db_path: Path) -> bool:
    with closing(sqlite3.connect(db_path)) as conn:
        return conn.execute("SELECT 1 FROM activities").fetchone() is not None


class TestMigrateLegacyDataDir:
    def test_moves_legacy_data_when_target_missing(self, tmp_path):
        legacy = tmp_path / "exe" / "data"
        _make_db(legacy, with_activity=True)
        (legacy / "media").mkdir()
        (legacy / "media" / "photo.jpg").write_bytes(b"x")
        target = tmp_path / "appdata" / "WattLoom" / "data"

        assert migrate_legacy_data_dir(legacy, target) is True

        assert _has_activity(target / "mybiking.db")
        assert (target / "media" / "photo.jpg").read_bytes() == b"x"
        assert not legacy.exists()
        # Alter Stand wird nur umbenannt, nie gelöscht
        assert len(list((tmp_path / "exe").glob("data.migrated-*"))) == 1

    def test_no_legacy_db_does_nothing(self, tmp_path):
        legacy = tmp_path / "exe" / "data"
        legacy.mkdir(parents=True)
        target = tmp_path / "appdata" / "data"

        assert migrate_legacy_data_dir(legacy, target) is False
        assert not target.exists()

    def test_existing_target_with_user_data_wins(self, tmp_path):
        legacy = tmp_path / "exe" / "data"
        _make_db(legacy, with_activity=True)
        target = tmp_path / "appdata" / "data"
        _make_db(target, with_activity=True)

        assert migrate_legacy_data_dir(legacy, target) is False
        assert (legacy / "mybiking.db").exists()

    def test_untouched_target_is_set_aside_not_deleted(self, tmp_path):
        legacy = tmp_path / "exe" / "data"
        _make_db(legacy, with_activity=True)
        target = tmp_path / "appdata" / "data"
        _make_db(target, with_activity=False)

        assert migrate_legacy_data_dir(legacy, target) is True

        assert _has_activity(target / "mybiking.db")
        assert len(list((tmp_path / "appdata").glob("data.unused-*"))) == 1

    def test_broken_target_db_is_never_replaced(self, tmp_path):
        legacy = tmp_path / "exe" / "data"
        _make_db(legacy, with_activity=True)
        target = tmp_path / "appdata" / "data"
        target.mkdir(parents=True)
        (target / "mybiking.db").write_bytes(b"not a sqlite file")

        assert migrate_legacy_data_dir(legacy, target) is False

    def test_failed_copy_keeps_legacy_intact(self, tmp_path, monkeypatch):
        legacy = tmp_path / "exe" / "data"
        _make_db(legacy, with_activity=True)
        target = tmp_path / "appdata" / "data"

        def _failing_copytree(src, dst, *args, **kwargs):
            Path(dst).mkdir(parents=True)
            raise OSError("disk full")

        monkeypatch.setattr(paths.shutil, "copytree", _failing_copytree)

        with pytest.raises(OSError):
            migrate_legacy_data_dir(legacy, target)

        assert _has_activity(legacy / "mybiking.db")
        assert not target.exists()
        assert not (tmp_path / "appdata" / "data.migrating").exists()


class TestResolveWindowsDataDir:
    def test_uses_appdata(self, tmp_path, monkeypatch):
        monkeypatch.setenv("APPDATA", str(tmp_path / "Roaming"))

        result = paths._resolve_windows_data_dir(tmp_path / "exe")

        assert result == tmp_path / "Roaming" / "WattLoom" / "data"

    def test_falls_back_to_exe_dir_without_appdata(self, tmp_path, monkeypatch):
        monkeypatch.delenv("APPDATA", raising=False)

        assert paths._resolve_windows_data_dir(tmp_path / "exe") == tmp_path / "exe" / "data"

    def test_falls_back_to_legacy_when_migration_fails(self, tmp_path, monkeypatch):
        monkeypatch.setenv("APPDATA", str(tmp_path / "Roaming"))

        def _raise(*args, **kwargs):
            raise OSError("locked")

        monkeypatch.setattr(paths, "migrate_legacy_data_dir", _raise)

        assert paths._resolve_windows_data_dir(tmp_path / "exe") == tmp_path / "exe" / "data"
