# Changelog

## v1.0.1 – 2026-09-12

- Wahoo-FIT-Import repariert (Geräteerkennung, Löschen von Aktivitäten mit Segmenten)
- Neuer Steigungs-Chart (grade_pct) auf der Aktivitäts-Detailseite
- Segment-Daten (segment_efforts) um UUID/Koordinaten erweitert, Dauer-Erfassung für Wahoo-Geräte gefixt

## v1.0.0 – 2026-09-10

Erstes Open-Source-Release (Git-Tag `v1.0.0`).

- AGPL-3.0-Lizenz, Sicherheitshinweis, Contributing-Grundausstattung
- Docker-Paketierung (Multi-Stage-Build, `docker-compose.yml`)
- README (DE+EN) aktualisiert, Demo-Video/GIF ergänzt
- PR-Events werden beim Verwerfen/Überholen nur noch inaktiv markiert statt gelöscht (Historie bleibt erhalten)
- Versionsnummer im Sidebar-Footer sichtbar, `scripts/bump_version.py` für künftige Releases
