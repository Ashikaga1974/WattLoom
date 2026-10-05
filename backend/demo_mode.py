"""
Demo-Modus: schaltet die App zur Laufzeit auf eine Demo-DB (DEMO_DB_PATH) um, ohne die echte
DB anzufassen. Die Demo-DB wird bei jedem Einschalten (und bei jedem Start im Demo-Modus) frisch
erzeugt – eine mitgelieferte fertige DB wäre nach ein paar Monaten veraltet (letzte Fahrt weit in
der Vergangenheit, Fitness-Kurve und Jahresziel leer). Änderungen im Demo-Modus sind damit
bewusst Wegwerf-Daten.

Der Zustand liegt als Marker-Datei neben der DB statt in der config-Tabelle: config gehört zur
jeweils aktiven DB und kann deshalb nicht selbst entscheiden, welche DB aktiv ist.
"""
import sqlite3
import threading
from pathlib import Path

from backend import cache
from backend.paths import DATA_DIR, DB_PATH, DEMO_DB_PATH

_FLAG_FILE = DATA_DIR / "demo_mode"
_lock = threading.Lock()
_is_active = _FLAG_FILE.exists()


def is_active() -> bool:
    return _is_active


def active_db_path() -> Path:
    """Pfad der DB, gegen die alle Requests laufen."""
    return DEMO_DB_PATH if _is_active else DB_PATH


def enable() -> None:
    """Erzeugt die Demo-DB neu und schaltet auf sie um. No-op, wenn bereits aktiv."""
    global _is_active
    with _lock:
        if _is_active:
            return
        _build_demo_db()
        _FLAG_FILE.touch()
        _is_active = True
    cache.invalidate()


def disable() -> None:
    """Schaltet zurück auf die echte DB. Die Demo-DB bleibt liegen, wird beim nächsten Einschalten ersetzt."""
    global _is_active
    with _lock:
        _FLAG_FILE.unlink(missing_ok=True)
        _is_active = False
    cache.invalidate()


def refresh_on_startup() -> None:
    """Startet die App im Demo-Modus, wird die Demo-DB neu erzeugt – hält die Daten aktuell und
    das Schema passend zum Code nach einem Update."""
    if _is_active:
        with _lock:
            _build_demo_db()


def _build_demo_db() -> None:
    """Erzeugt die Demo-DB in einer Temp-Datei und tauscht sie erst danach aus – ein Abbruch
    mittendrin hinterlässt so keine halb befüllte Demo-DB."""
    # Lazy: seed_demo_data importiert backend.database, das wiederum dieses Modul importiert
    from backend.seed_demo_data import seed_demo_data

    tmp_path = DEMO_DB_PATH.with_name(f"{DEMO_DB_PATH.name}.tmp")
    tmp_path.unlink(missing_ok=True)
    conn = sqlite3.connect(tmp_path)
    conn.row_factory = sqlite3.Row
    try:
        seed_demo_data(conn)
        _copy_language_from_real_db(conn)
        conn.commit()
    finally:
        conn.close()

    # WAL-Nebendateien der alten Demo-DB gehören nicht zur neuen Datei
    for suffix in ("-wal", "-shm"):
        Path(f"{DEMO_DB_PATH}{suffix}").unlink(missing_ok=True)
    tmp_path.replace(DEMO_DB_PATH)


def _copy_language_from_real_db(demo_conn: sqlite3.Connection) -> None:
    """Der Demo-Seed setzt fest "de" – sonst würde ein englischsprachiger Nutzer beim
    Einschalten plötzlich eine deutsche Oberfläche sehen."""
    if not DB_PATH.exists():
        return
    try:
        real_conn = sqlite3.connect(f"{DB_PATH.as_uri()}?mode=ro", uri=True)
        try:
            row = real_conn.execute("SELECT value FROM config WHERE key = 'language'").fetchone()
        finally:
            real_conn.close()
    except sqlite3.Error:
        return
    if row:
        demo_conn.execute("INSERT OR REPLACE INTO config(key, value) VALUES ('language', ?)", (row[0],))
