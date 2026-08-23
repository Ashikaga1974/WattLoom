import logging
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from backend.api import activities, tracks, bikes, heatmap, analytics, settings, importer, zones, weather, purchases, storage_locations, app_sync, translations, system, license as license_api
from backend.database import db_connection, init_db
from backend.licensing.state import ensure_trial_started, has_access
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

app = FastAPI(title="WattLoom API", version="0.1.0")
init_db()
with db_connection() as _conn:
    ensure_trial_started(_conn)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174", "http://localhost:4173"],
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH"],
    allow_headers=["*"],
)

# Allowlist statt Denylist: nur echte Daten-API-Pfade werden gesperrt. Alles andere
# (Frontend-Static-Files, /health, /license/*) muss immer erreichbar bleiben – sonst
# könnte die UI nicht mal den Sperr-Bildschirm selbst laden (Henne-Ei-Problem beim
# gebündelten Frontend, siehe StaticFiles-Mount unten).
_PROTECTED_PREFIXES = (
    "/activities", "/tracks", "/bikes", "/analytics", "/settings",
    "/import", "/weather", "/purchases", "/storage-locations",
    "/app-sync", "/translations", "/media", "/system",
)


@app.middleware("http")
async def license_gate(request: Request, call_next):
    if request.method == "OPTIONS" or not request.url.path.startswith(_PROTECTED_PREFIXES):
        return await call_next(request)
    with db_connection() as conn:
        allowed = has_access(conn)
    if not allowed:
        return JSONResponse(
            status_code=402,
            content={"code": "trial_expired", "message": "Testzeitraum abgelaufen – bitte Lizenzschlüssel eingeben"},
        )
    return await call_next(request)


app.include_router(license_api.router)
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
app.include_router(app_sync.router)
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

    @app.get("/{full_path:path}")
    def serve_frontend(full_path: str):
        candidate = FRONTEND_DIST_DIR / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(FRONTEND_DIST_DIR / "index.html")
