"""
Startpunkt für die gebündelte Desktop-Version (PyInstaller, siehe wattloom.spec).
Startet den Uvicorn-Server und öffnet danach automatisch den Standard-Browser –
der Kunde doppelklickt nur die .exe, kein Terminal, kein "zwei Server starten".
Im normalen Entwicklungsbetrieb (uvicorn backend.main:app --reload) wird diese
Datei nicht verwendet.
"""
import threading
import time
import webbrowser

import uvicorn

from backend.main import app

HOST = "127.0.0.1"
PORT = 8000


def _open_browser() -> None:
    time.sleep(1.5)
    webbrowser.open(f"http://{HOST}:{PORT}")


if __name__ == "__main__":
    threading.Thread(target=_open_browser, daemon=True).start()
    uvicorn.run(app, host=HOST, port=PORT, log_level="info")
