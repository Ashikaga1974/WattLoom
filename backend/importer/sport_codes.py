"""
Kanonische, sprachneutrale Sport-Codes.

Vorher schrieb jeder Importer (fit_single.py, tcx_single.py, gpx_single.py) sein eigenes
Deutsch-Label direkt in other_activities.sport_type/name – das machte die Werte für eine
mehrsprachige UI unübersetzbar (die Übersetzung würde dann in der DB stehen) und führte zu
Drift zwischen den drei Formaten (z.B. "fitness_equipment" vs. "fitness" vs. kein Mapping).
Diese eine Zuordnungstabelle ersetzt alle drei – Rohwerte aus FIT/TCX/GPX/Strava-CSV
UND bereits in der DB stehende deutsche Alt-Werte (für die einmalige Migration in
database.py) münden in denselben kleinen Satz stabiler Codes. Das Frontend übersetzt diese
Codes über react-i18next; das Backend selbst übersetzt nichts.
"""

CANONICAL_SPORT_CODES: set[str] = {
    "ride", "strength_training", "cardio", "flexibility", "warm_up", "cool_down",
    "running", "walking", "hiking", "swimming", "yoga", "rowing", "training",
}

# Rohwert (lowercase, Leerzeichen→"_") → kanonischer Code.
# Enthält bewusst sowohl Vendor-Rohwerte (FIT sub_sport/sport, TCX Sport-Attribut,
# GPX trk/type) als auch deutsche Alt-Werte, die vor dieser Umstellung direkt in der DB
# gelandet sind (siehe Migration in backend/database.py) – beide Richtungen laufen über
# dieselbe Tabelle, damit nichts doppelt gepflegt wird.
_RAW_TO_CODE: dict[str, str] = {
    # FIT sub_sport / sport
    "strength_training": "strength_training",
    "cardio_training": "cardio",
    "flexibility_training": "flexibility",
    "warm_up": "warm_up",
    "cool_down": "cool_down",
    "running": "running",
    "walking": "walking",
    "hiking": "hiking",
    "swimming": "swimming",
    "yoga": "yoga",
    "rowing": "rowing",
    "fitness_equipment": "strength_training",
    "generic": "training",
    "training": "training",
    "cycling": "ride",
    # TCX Sport-Attribut
    "other": "training",
    "fitness": "strength_training",
    "biking": "ride",
    "bike": "ride",
    # GPX trk/type + numerische Garmin-Codes
    "run": "running",
    "9": "running",
    "walk": "walking",
    "hike": "hiking",
    "swim": "swimming",
    "1": "ride",
    "ride": "ride",
    "e-bike_ride": "ride",
    # Strava-CSV "Activity Type" (EN)
    "virtualride": "ride",
    "ebikeride": "ride",
    "gravelride": "ride",
    "mountainbikeride": "ride",
    "workout": "training",
    "weight_training": "strength_training",
    # Strava-CSV "Aktivitätsart" (DE-Export)
    "radfahrt": "ride",
    "virtuelles_radfahren": "ride",
    "e-bike-fahrt": "ride",
    "gravelbike-fahrt": "ride",
    "mountainbikefahrt": "ride",
    "gewichtstraining": "strength_training",
    # Deutsche Alt-Werte, die vor dieser Umstellung direkt in other_activities.sport_type
    # gespeichert wurden (nur für die Migration relevant, siehe database.py)
    "krafttraining": "strength_training",
    "laufen": "running",
    "gehen": "walking",
    "wandern": "hiking",
    "schwimmen": "swimming",
    "rudern": "rowing",
    "dehnen": "flexibility",
    "aufwärmen": "warm_up",
    "abkühlen": "cool_down",
}


def lookup_sport_code(raw: str | None) -> str | None:
    """Wie to_sport_code(), aber ohne Fallback – None wenn der Rohwert unbekannt ist.
    Für Aufrufer, die mehrere Rohwerte in Prioritätsreihenfolge prüfen wollen
    (z.B. sub_sport vor sport), ohne dass ein unbekannter erster Wert den
    zweiten verdeckt."""
    if not raw:
        return None
    key = raw.strip().lower().replace(" ", "_")
    if key in _RAW_TO_CODE:
        return _RAW_TO_CODE[key]
    if key in CANONICAL_SPORT_CODES:
        return key
    return None


def to_sport_code(raw: str | None) -> str:
    """Rohwert (Vendor-Code oder deutscher Alt-Wert) → kanonischer, sprachneutraler Code.
    Unbekannte Werte fallen auf "training" zurück (generischer Auffang-Code)."""
    return lookup_sport_code(raw) or "training"
