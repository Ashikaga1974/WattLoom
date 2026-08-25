"""Import von Track-Dateien (FIT/TCX/GPX), Routen und Medien aus dem ZIP-Export."""

import logging
import zipfile
from pathlib import Path

from backend.database import db_connection
from backend.importer.csv_helpers import _to_int
from backend.paths import MEDIA_DIR

logger = logging.getLogger(__name__)


def import_tracks(zf: zipfile.ZipFile, rides: list[dict]) -> None:
    from backend.importer import fit, tcx, gpx

    ok = err = skip = 0
    total = len(rides)

    with db_connection() as conn:
        for i, r in enumerate(rides):
            filename = r.get("Filename")
            if not filename:
                skip += 1
                continue

            activity_id = _to_int(r.get("Activity ID"))
            try:
                with zf.open(filename) as raw:
                    data = raw.read()
            except KeyError:
                print(f"  WARN: {filename} nicht in ZIP")
                logger.warning("Track-Datei nicht in ZIP: %s (activity %s)", filename, activity_id)
                err += 1
                continue

            try:
                if filename.endswith(".fit.gz"):
                    fit.import_fit(conn, activity_id, data, compressed=True)
                    device = fit.read_fit_device(data, compressed=True)
                elif filename.endswith(".fit"):
                    fit.import_fit(conn, activity_id, data, compressed=False)
                    device = fit.read_fit_device(data, compressed=False)
                elif filename.endswith(".tcx.gz"):
                    tcx.import_tcx(conn, activity_id, data, compressed=True)
                    device = tcx.read_tcx_device(data, compressed=True)
                elif filename.endswith(".tcx"):
                    tcx.import_tcx(conn, activity_id, data, compressed=False)
                    device = tcx.read_tcx_device(data, compressed=False)
                elif filename.endswith(".gpx.gz"):
                    gpx.import_gpx(conn, activity_id, data, compressed=True)
                    device = gpx.read_gpx_device(data, compressed=True)
                elif filename.endswith(".gpx"):
                    gpx.import_gpx(conn, activity_id, data, compressed=False)
                    device = gpx.read_gpx_device(data, compressed=False)
                else:
                    skip += 1
                    continue

                with conn:
                    conn.execute(
                        "UPDATE activities SET has_track=1, smart_device=? WHERE id=?",
                        (device, activity_id),
                    )
                ok += 1
                if ok % 25 == 0:
                    print(f"  … {ok}/{total} Tracks importiert ({err} Fehler)")
            except Exception as exc:
                print(f"  ERR [{filename}]: {exc}")
                logger.error("Track-Import fehlgeschlagen [%s, activity %s]: %s", filename, activity_id, exc, exc_info=True)
                err += 1

    print(f"  Tracks: {ok} OK, {err} Fehler, {skip} übersprungen")


def import_routes(zf: zipfile.ZipFile) -> None:
    from backend.importer import gpx as gpx_mod

    route_files = [n for n in zf.namelist() if n.startswith("routes/") and n.endswith(".gpx")]

    with db_connection() as conn:
        for path in route_files:
            with zf.open(path) as f:
                data = f.read()
            gpx_mod.import_route(conn, Path(path).name, data)

    print(f"  Routen importiert: {len(route_files)}")


def import_media(zf: zipfile.ZipFile, media_map: dict[str, int]) -> None:
    """Extrahiert Mediadateien nach data/media/ und verknüpft sie mit Aktivitäten."""
    MEDIA_DIR.mkdir(parents=True, exist_ok=True)

    media_files = [
        n for n in zf.namelist()
        if n.startswith("media/") and not n.endswith("/")
    ]
    with db_connection() as conn:
        with conn:
            for path in media_files:
                fname = Path(path).name
                activity_id = media_map.get(fname)

                with zf.open(path) as f:
                    (MEDIA_DIR / fname).write_bytes(f.read())

                conn.execute(
                    "INSERT OR REPLACE INTO media (activity_id, filename) VALUES (?, ?)",
                    (activity_id, fname),
                )
    print(f"  Media importiert: {len(media_files)} Dateien ({len(media_map)} verknüpft)")
