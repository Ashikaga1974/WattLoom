import logging
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from backend.api import activities, tracks, bikes, heatmap, analytics, settings, importer, zones, weather, purchases, storage_locations, translations, system
from backend.database import db_connection, init_db
from backend.paths import FRONTEND_DIST_DIR, LOG_FILE, MEDIA_DIR

_LOG_FILE = LOG_FILE
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(name)s  %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[
        logging.FileHandler(_LOG_FILE, encoding="utf-8"),
        logging.StreamHandler(),
    ],
)

app = FastAPI(title="WattLoom API", version="1.0.1")
init_db()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174", "http://localhost:4173"],
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH"],
    allow_headers=["*"],
)

app.include_router(activities.router)
app.include_router(tracks.router)
app.include_router(bikes.router)
app.include_router(heatmap.router)
app.include_router(analytics.router)
app.include_router(settings.router)
app.include_router(importer.router)
app.include_router(zones.router)
app.include_router(weather.router)
app.include_router(purchases.router)
app.include_router(storage_locations.router)
app.include_router(translations.router)
app.include_router(system.router)


@app.get("/media/{filename}")
def serve_media(filename: str):
    path = MEDIA_DIR / filename
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404, detail="Media not found")
    return FileResponse(path)


@app.get("/health")
def health():
    return {"status": "ok"}


# Gebautes Frontend (frontend/dist) ausliefern – nur wenn vorhanden. Im Dev-Betrieb läuft
# das Frontend über den separaten Vite-Server (Port 5173), dieses Mount greift dann nie.
# In der gebündelten .exe (siehe launcher.py) ist das der einzige Weg, wie der Kunde die
# UI überhaupt zu sehen bekommt – ein Prozess, kein separater Node-Server nötig.
if FRONTEND_DIST_DIR.is_dir():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST_DIR / "assets"), name="frontend-assets")

    # Einige Frontend-Routen (React-Router) und Backend-Endpunkte teilen sich zufällig denselben
    # Pfad (/bikes, /activities, /settings sind jeweils sowohl eine Seite als auch ein GET-Listen-
    # Endpunkt). Solange man in der App navigiert, läuft das clientseitig und stört nicht – aber
    # ein direkter Aufruf/Reload/Bookmark auf genau so einen Pfad ist ein echter Browser-Request,
    # der sonst am API-Router hängen bleibt und rohes JSON statt der Seite zeigt. Browser markieren
    # einen solchen Top-Level-Seitenaufruf mit "Sec-Fetch-Mode: navigate" – der interne fetch()-Call
    # der SPA auf denselben Pfad (um die eigentlichen Daten zu laden) hat dieses Mode nicht und
    # erreicht die API dadurch weiterhin ganz normal.
    @app.middleware("http")
    async def spa_navigation_fallback(request: Request, call_next):
        if (
            request.method == "GET"
            and request.headers.get("sec-fetch-mode") == "navigate"
            and not request.url.path.startswith(("/assets/", "/media/"))
        ):
            return FileResponse(FRONTEND_DIST_DIR / "index.html")
        return await call_next(request)

    @app.get("/{full_path:path}")
    def serve_frontend(full_path: str):
        candidate = FRONTEND_DIST_DIR / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(FRONTEND_DIST_DIR / "index.html")
