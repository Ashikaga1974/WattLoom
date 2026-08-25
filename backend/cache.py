"""
Minimaler In-Prozess-Cache für teure, rein DB-abgeleitete Analytics-Antworten
(aktuell best_by_distance + heatmap – beide laden bei jedem Request alle
Trackpunkte neu, siehe CLAUDE.md "Live-Full-Table-Scans über track_points").

Bewusst kein TTL: die einzige Quelle für Änderungen ist ein Import/Reset, und
genau dort wird explizit invalidate() aufgerufen (siehe backend/api/importer.py) –
ein zeitbasiertes Verfallen würde nur unnötig recht früh Falsch-Negative
(vermeidbare Neuberechnung) oder Falsch-Positive (veraltete Anzeige) riskieren.
Prozesslokal und nicht auf Disk persistiert: WattLoom läuft als einzelner
Dauerprozess (Uvicorn/PyInstaller-Build), ein Neustart berechnet ohnehin neu.
"""

_store: dict[str, object] = {}


def get_or_set(key: str, compute):
    """Liefert den gecachten Wert zu `key`, berechnet ihn sonst per `compute()` und speichert ihn."""
    if key not in _store:
        _store[key] = compute()
    return _store[key]


def invalidate(prefix: str = "") -> None:
    """Verwirft gecachte Einträge. Ohne prefix: alles. Mit prefix: nur Keys, die damit beginnen
    (z.B. 'heatmap:' für alle Heatmap-Varianten, aber nicht 'best_by_distance')."""
    if not prefix:
        _store.clear()
        return
    for key in [k for k in _store if k.startswith(prefix)]:
        del _store[key]
