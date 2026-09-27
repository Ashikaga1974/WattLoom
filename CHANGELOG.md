# Changelog

## v1.1.0 – 2026-09-27

- Erholungszeit-Schätzung nach Aktivitäten/Workouts (grobe Heuristik aus hrTSS/IF, keine HRV-Messung)
- Jahres-Ø-Temperaturlinie im Wetterverlauf (/tempcorr)
- Rundenbasierte Trittfrequenz-Kadenz-Auswertung + Kadenz-Chart auf der Aktivitäts-Detailseite
- Dark-Mode-Umschalter in den Einstellungen
- GitHub-Pages-Landingpage
- Leistungsschätzung: zeitbasierte NP-Fensterlogik statt Punktanzahl, avg_power_w zeitgewichtet über Bewegungsphasen (Stillstand ausgeklammert)
- Settings: Domänen-Validierung (weight_kg, birth_year, hr_max, crr, cda, bike_kg)
- Genauigkeitsangabe zur Leistungsschätzung entschärft, media-Endpoint abgesichert

## v1.0.2 – 2026-09-13

Setup-Wizard, Import-Seite ausgelagert, has_media-Label

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
