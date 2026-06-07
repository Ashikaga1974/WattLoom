from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from backend.api import activities, tracks, bikes, segments, heatmap, analytics, settings, importer, zones, weather
from backend.database import init_db

app = FastAPI(title="MyBiking API", version="0.1.0")
init_db()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:4173"],
    allow_methods=["GET", "POST", "DELETE", "PATCH"],
    allow_headers=["*"],
)

app.include_router(activities.router)
app.include_router(tracks.router)
app.include_router(bikes.router)
app.include_router(segments.router)
app.include_router(heatmap.router)
app.include_router(analytics.router)
app.include_router(settings.router)
app.include_router(importer.router)
app.include_router(zones.router)
app.include_router(weather.router)


MEDIA_DIR = Path(__file__).parent.parent / "data" / "media"


@app.get("/media/{filename}")
def serve_media(filename: str):
    path = MEDIA_DIR / filename
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404, detail="Media not found")
    return FileResponse(path)


@app.get("/health")
def health():
    return {"status": "ok"}
