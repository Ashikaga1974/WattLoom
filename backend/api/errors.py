"""
Fehler-Codes statt übersetzter Prosa.

Backend übersetzt keine Fehlermeldungen selbst (siehe backend/importer/sport_codes.py für
dieselbe Begründung bei Sport-Codes) – `message` ist nur ein Debug-/Log-Fallback, niemals
für die Anzeige gedacht. Das Frontend übersetzt über `code` (t('errors.<code>', {defaultValue:
message})), das degradiert sauber auf `message`, solange ein Code noch keine Übersetzung hat.
"""

from fastapi import HTTPException


def api_error(status_code: int, code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status_code, detail={"code": code, "message": message})
