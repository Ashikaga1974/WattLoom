"""
UI-Übersetzungen aus der DB statt aus im Frontend gebündelten JSON-Dateien.

Ersetzt die vorher gebündelten locales/{de,en}/<ns>.json (Session 2026-08-20 i18n-Umstellung)
durch eine DB-Tabelle + Export/Import, damit Sascha selbst weitere Sprachen (z.B. per
ChatGPT/DeepL übersetzt) ohne Code-Änderung einspielen kann. Das Backend übersetzt dabei
nichts selbst – reine Ablage + Aus-/Eingabe, die eigentliche Übersetzung passiert extern.
i18next-http-backend lädt Namespaces per GET /translations/{lang}/{ns} im selben (verschachtelten)
JSON-Format, das die alten Locale-Dateien hatten – dadurch bleiben alle bestehenden t()-Aufrufe
im Frontend unverändert.
"""
import json

from fastapi import APIRouter, Response
from pydantic import BaseModel

from backend.api.errors import api_error
from backend.database import db_connection

router = APIRouter(prefix="/translations", tags=["translations"])

# Feste Liste statt frei eingebbarer Sprachcodes – verhindert Tippfehler-Sprachen und hält
# die Auswahl in den Settings überschaubar. Erweiterbar durch einfaches Ergänzen hier.
SUPPORTED_LANGUAGES: list[dict] = [
    {"code": "de", "name": "Deutsch"},
    {"code": "en", "name": "English"},
    {"code": "fr", "name": "Français"},
    {"code": "es", "name": "Español"},
    {"code": "it", "name": "Italiano"},
    {"code": "nl", "name": "Nederlands"},
    {"code": "pl", "name": "Polski"},
    {"code": "pt", "name": "Português"},
    {"code": "tr", "name": "Türkçe"},
]
_SUPPORTED_CODES = {lang["code"] for lang in SUPPORTED_LANGUAGES}


def _unflatten(flat: dict[str, str]) -> dict:
    root: dict = {}
    for dotted_key, value in flat.items():
        parts = dotted_key.split(".")
        node = root
        for part in parts[:-1]:
            node = node.setdefault(part, {})
        node[parts[-1]] = value
    return root


def _flatten(obj: dict, prefix: str = "") -> dict[str, str]:
    flat: dict[str, str] = {}
    for k, v in obj.items():
        dotted_key = f"{prefix}.{k}" if prefix else k
        if isinstance(v, dict):
            flat.update(_flatten(v, dotted_key))
        else:
            flat[dotted_key] = v
    return flat


@router.get("/languages")
def list_languages():
    with db_connection() as conn:
        available = {
            r[0] for r in conn.execute("SELECT DISTINCT lang FROM translations").fetchall()
        }
    return [{**lang, "available": lang["code"] in available} for lang in SUPPORTED_LANGUAGES]


@router.get("/export")
def export_language(lang: str):
    if lang not in _SUPPORTED_CODES:
        raise api_error(400, "invalid_language", f"Unbekannte Sprache: {lang}")
    with db_connection() as conn:
        rows = conn.execute(
            "SELECT ns, key, value FROM translations WHERE lang = ?", (lang,)
        ).fetchall()
    by_ns: dict[str, dict[str, str]] = {}
    for ns, key, value in rows:
        by_ns.setdefault(ns, {})[key] = json.loads(value)
    payload = {ns: _unflatten(flat) for ns, flat in by_ns.items()}
    return Response(
        content=json.dumps(payload, ensure_ascii=False, indent=2),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="wattloom-translations-{lang}.json"'},
    )


class ImportBody(BaseModel):
    lang: str
    translations: dict[str, dict]  # {ns: {...verschachtelt wie die alten Locale-Dateien...}}


@router.post("/import")
def import_language(body: ImportBody):
    if body.lang not in _SUPPORTED_CODES:
        raise api_error(400, "invalid_language", f"Unbekannte Sprache: {body.lang}")
    with db_connection() as conn:
        for ns, nested in body.translations.items():
            for key, value in _flatten(nested).items():
                conn.execute(
                    """
                    INSERT INTO translations(lang, ns, key, value) VALUES (?, ?, ?, ?)
                    ON CONFLICT(lang, ns, key) DO UPDATE SET value = excluded.value
                    """,
                    # json.dumps statt str(): eine Liste (z.B. weekdaysShort) würde mit str()
                    # als Python-Repr "['Mo', 'Di', ...]" gespeichert – kein gültiges JSON und
                    # im Frontend bei returnObjects:true kein Array, sondern dieser rohe String.
                    (body.lang, ns, key, json.dumps(value)),
                )
        conn.commit()
    return {"ok": True}


@router.get("/{lang}/{ns}")
def get_namespace(lang: str, ns: str):
    with db_connection() as conn:
        rows = conn.execute(
            "SELECT key, value FROM translations WHERE lang = ? AND ns = ?", (lang, ns)
        ).fetchall()
    return _unflatten({r[0]: json.loads(r[1]) for r in rows})
