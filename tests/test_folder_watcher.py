import io
import json
import os
import time
import urllib.error

import pytest

from backend import folder_watcher


@pytest.fixture
def sync_dir(tmp_path, monkeypatch):
    """Lenkt sync/, imported/ und failed/ in ein Temp-Verzeichnis um."""
    sync = tmp_path / "sync"
    sync.mkdir()
    monkeypatch.setattr(folder_watcher, "SYNC_DIR", sync)
    monkeypatch.setattr(folder_watcher, "IMPORTED_DIR", sync / "imported")
    monkeypatch.setattr(folder_watcher, "FAILED_DIR", sync / "failed")
    # Sonst fragt _poll_once() ein evtl. lokal laufendes Backend nach dem Demo-Modus
    monkeypatch.setattr(folder_watcher, "_is_demo_mode", lambda: False)
    return sync


def _write_old(path, content=b"data"):
    """Legt eine Datei an, deren mtime bereits außerhalb von STABLE_WAIT_S liegt."""
    path.write_bytes(content)
    old = time.time() - folder_watcher.STABLE_WAIT_S - 10
    os.utime(path, (old, old))
    return path


class _FakeResponse(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()


def _ok_urlopen(*args, **kwargs):
    return _FakeResponse(json.dumps({"activity_id": 42}).encode())


class TestFindCandidates:
    def test_returns_only_stable_supported_files(self, sync_dir):
        fit = _write_old(sync_dir / "ride.FIT")
        _write_old(sync_dir / "notes.txt")
        (sync_dir / "fresh.gpx").write_bytes(b"x")  # gerade erst geschrieben
        (sync_dir / "sub.fit").mkdir()

        assert folder_watcher._find_candidates() == [fit]


class TestImportFile:
    def test_success_moves_to_imported(self, sync_dir, monkeypatch):
        monkeypatch.setattr(folder_watcher.urllib.request, "urlopen", _ok_urlopen)
        path = _write_old(sync_dir / "ride.fit")

        assert folder_watcher._import_file(path, "b1") is True
        assert (sync_dir / "imported" / "ride.fit").exists()
        assert not path.exists()

    def test_success_overwrites_existing_target(self, sync_dir, monkeypatch):
        monkeypatch.setattr(folder_watcher.urllib.request, "urlopen", _ok_urlopen)
        (sync_dir / "imported").mkdir()
        (sync_dir / "imported" / "ride.fit").write_bytes(b"old")
        path = _write_old(sync_dir / "ride.fit", b"new")

        assert folder_watcher._import_file(path, None) is True
        assert (sync_dir / "imported" / "ride.fit").read_bytes() == b"new"

    def test_http_error_moves_to_failed(self, sync_dir, monkeypatch):
        def _fail(*args, **kwargs):
            raise urllib.error.HTTPError("u", 422, "bad", {}, io.BytesIO(b"kaputt"))

        monkeypatch.setattr(folder_watcher.urllib.request, "urlopen", _fail)
        path = _write_old(sync_dir / "ride.tcx")

        assert folder_watcher._import_file(path, None) is True
        assert (sync_dir / "failed" / "ride.tcx").exists()

    def test_conflict_keeps_file_for_retry(self, sync_dir, monkeypatch):
        """409 = Demo-Modus aktiv – Datei ist nicht kaputt und darf nicht nach failed/."""
        def _conflict(*args, **kwargs):
            raise urllib.error.HTTPError("u", 409, "conflict", {}, io.BytesIO(b"demo"))

        monkeypatch.setattr(folder_watcher.urllib.request, "urlopen", _conflict)
        path = _write_old(sync_dir / "ride.fit")

        assert folder_watcher._import_file(path, None) is False
        assert path.exists()
        assert not (sync_dir / "failed").exists()

    def test_backend_down_keeps_file(self, sync_dir, monkeypatch):
        def _down(*args, **kwargs):
            raise urllib.error.URLError("refused")

        monkeypatch.setattr(folder_watcher.urllib.request, "urlopen", _down)
        path = _write_old(sync_dir / "ride.gpx")

        assert folder_watcher._import_file(path, None) is False
        assert path.exists()


class TestPollOnce:
    def test_locked_file_does_not_abort_poll(self, sync_dir, monkeypatch):
        """Gesperrte Datei (Windows) darf den Poll nicht abbrechen – die übrigen Dateien laufen weiter."""
        _write_old(sync_dir / "a.fit")
        _write_old(sync_dir / "b.fit")
        handled = []

        def _fake_import(path, bike_id):
            if path.name == "a.fit":
                raise PermissionError("locked")
            handled.append(path.name)
            return True

        monkeypatch.setattr(folder_watcher, "_import_file", _fake_import)

        bike_id, backend_down = folder_watcher._poll_once("b1")

        assert handled == ["b.fit"]
        assert bike_id == "b1"
        assert backend_down is False

    def test_fetches_bike_id_lazily(self, sync_dir, monkeypatch):
        _write_old(sync_dir / "a.fit")
        monkeypatch.setattr(folder_watcher, "_fetch_default_bike_id", lambda: "b7")
        monkeypatch.setattr(folder_watcher, "_import_file", lambda path, bike_id: False)

        assert folder_watcher._poll_once(None) == ("b7", True)


    def test_demo_mode_skips_import(self, sync_dir, monkeypatch):
        _write_old(sync_dir / "a.fit")
        monkeypatch.setattr(folder_watcher, "_is_demo_mode", lambda: True)

        def _must_not_import(path, bike_id):
            raise AssertionError("darf im Demo-Modus nicht importieren")

        monkeypatch.setattr(folder_watcher, "_import_file", _must_not_import)

        assert folder_watcher._poll_once("b1") == ("b1", False)
        assert (sync_dir / "a.fit").exists()


class TestNextSleep:
    def test_backoff_grows_and_is_capped(self):
        assert folder_watcher._next_sleep_s(0) == folder_watcher.POLL_INTERVAL_S
        assert folder_watcher._next_sleep_s(1) == folder_watcher.POLL_INTERVAL_S * 2
        assert folder_watcher._next_sleep_s(20) == folder_watcher.MAX_BACKOFF_S
