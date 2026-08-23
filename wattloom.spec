# PyInstaller-Spec für die gebündelte Desktop-Version (Windows/Linux/macOS).
# Bauen: pyinstaller wattloom.spec  (vorher: cd frontend && npm ci && npm run build)
# Ergebnis liegt in dist/WattLoom/ (bzw. dist/WattLoom.exe unter Windows).
import sys
from pathlib import Path

block_cipher = None

REPO_ROOT = Path(SPECPATH)
FRONTEND_DIST = REPO_ROOT / "frontend" / "dist"
SEED_DATA = REPO_ROOT / "backend" / "seed_data"

if not FRONTEND_DIST.is_dir():
    raise SystemExit(
        "frontend/dist fehlt – erst `cd frontend && npm ci && npm run build` ausführen, "
        "dann wattloom.spec erneut bauen."
    )

a = Analysis(
    ["launcher.py"],
    pathex=[str(REPO_ROOT)],
    binaries=[],
    datas=[
        (str(FRONTEND_DIST), "frontend/dist"),
        (str(SEED_DATA), "backend/seed_data"),
    ],
    hiddenimports=[
        "uvicorn.logging",
        "uvicorn.loops",
        "uvicorn.loops.auto",
        "uvicorn.protocols",
        "uvicorn.protocols.http",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.websockets",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.lifespan",
        "uvicorn.lifespan.on",
    ],
    hookspath=[],
    runtime_hooks=[],
    excludes=[],
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="WattLoom",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,  # zeigt ein Konsolenfenster mit Server-Log; für v1 bewusst sichtbar
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=False,
    name="WattLoom",
)
