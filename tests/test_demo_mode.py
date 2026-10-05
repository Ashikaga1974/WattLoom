import sqlite3
from contextlib import closing

import pytest
from fastapi import HTTPException

from backend import cache, demo_mode
from backend.api import importer, system


@pytest.fixture
def demo_paths(tmp_path, monkeypatch):
    """Lenkt echte DB, Demo-DB und Marker-Datei in ein Temp-Verzeichnis um, Demo-Modus aus."""
    real_db = tmp_path / "mybiking.db"
    with closing(sqlite3.connect(real_db)) as conn:
        conn.execute("CREATE TABLE config (key TEXT PRIMARY KEY, value TEXT)")
        conn.execute("INSERT INTO config(key, value) VALUES ('language', 'en')")
        conn.commit()
    monkeypatch.setattr(demo_mode, "DB_PATH", real_db)
    monkeypatch.setattr(demo_mode, "DEMO_DB_PATH", tmp_path / "demo.db")
    monkeypatch.setattr(demo_mode, "_FLAG_FILE", tmp_path / "demo_mode")
    monkeypatch.setattr(demo_mode, "_is_active", False)
    return tmp_path


def _count_activities(db_path) -> int:
    with closing(sqlite3.connect(db_path)) as conn:
        return conn.execute("SELECT COUNT(*) FROM activities").fetchone()[0]


class TestEnableDisable:
    def test_enable_builds_demo_db_and_switches(self, demo_paths):
        demo_mode.enable()

        assert demo_mode.is_active()
        assert demo_mode.active_db_path() == demo_paths / "demo.db"
        assert _count_activities(demo_paths / "demo.db") > 0
        assert (demo_paths / "demo_mode").exists()
        assert not (demo_paths / "demo.db.tmp").exists()

    def test_enable_keeps_language_of_real_db(self, demo_paths):
        demo_mode.enable()

        with closing(sqlite3.connect(demo_paths / "demo.db")) as conn:
            language = conn.execute("SELECT value FROM config WHERE key = 'language'").fetchone()[0]
        assert language == "en"

    def test_enable_does_not_touch_real_db(self, demo_paths):
        before = (demo_paths / "mybiking.db").read_bytes()

        demo_mode.enable()

        assert (demo_paths / "mybiking.db").read_bytes() == before

    def test_disable_switches_back(self, demo_paths):
        demo_mode.enable()
        demo_mode.disable()

        assert not demo_mode.is_active()
        assert demo_mode.active_db_path() == demo_paths / "mybiking.db"
        assert not (demo_paths / "demo_mode").exists()

    def test_toggle_clears_cache(self, demo_paths):
        cache.get_or_set("heatmap:x", lambda: "real")
        demo_mode.enable()

        assert cache.get_or_set("heatmap:x", lambda: "demo") == "demo"

    def test_refresh_on_startup_rebuilds_only_when_active(self, demo_paths):
        demo_mode.refresh_on_startup()
        assert not (demo_paths / "demo.db").exists()

        demo_mode.enable()
        with closing(sqlite3.connect(demo_paths / "demo.db")) as conn:
            conn.execute("DELETE FROM activities")
            conn.commit()

        demo_mode.refresh_on_startup()

        assert _count_activities(demo_paths / "demo.db") > 0


class TestGuards:
    def test_import_rejected_in_demo_mode(self, demo_paths):
        demo_mode.enable()

        with pytest.raises(HTTPException) as exc:
            importer._reject_in_demo_mode()
        assert exc.value.status_code == 409
        assert exc.value.detail["code"] == "demo_mode_active"

    def test_import_allowed_without_demo_mode(self, demo_paths):
        importer._reject_in_demo_mode()

    def test_toggle_refused_while_import_running(self, demo_paths, monkeypatch):
        monkeypatch.setattr(system, "is_import_running", lambda: True)

        with pytest.raises(HTTPException) as exc:
            system.set_demo_mode(system.DemoModeUpdate(active=True))
        assert exc.value.status_code == 409
        assert not demo_mode.is_active()
