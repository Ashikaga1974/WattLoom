"""
Import-Pipeline: liest den Strava-Export-ZIP und befüllt die SQLite-DB.
Reihenfolge: bikes → activities (CSV) → track-Dateien (FIT/TCX/GPX) → routes → media
"""

import zipfile
from pathlib import Path

from backend.database import init_db
from backend.importer.csv_helpers import _find_latest_zip
from backend.importer.import_csv import import_activities_csv, import_bikes, import_other_activities_csv
from backend.importer.import_media_tracks import import_media, import_routes, import_tracks


def run_import(zip_path: Path | None = None) -> None:
    if zip_path is None:
        zip_path = _find_latest_zip()
    print(f"Starte Import aus: {zip_path}")
    init_db()

    with zipfile.ZipFile(zip_path, "r") as zf:
        print("→ Bikes …")
        bike_map = import_bikes(zf)

        print("→ Activities (CSV) …")
        rides, media_map = import_activities_csv(zf, bike_map)

        print("→ Other Activities (CSV) …")
        import_other_activities_csv(zf)

        print("→ Track-Dateien …")
        import_tracks(zf, rides)

        print("→ Routen …")
        import_routes(zf)

        print("→ Media …")
        import_media(zf, media_map)

    print("Import abgeschlossen.")


if __name__ == "__main__":
    run_import()  # auto-detektiert neueste ZIP in download/
