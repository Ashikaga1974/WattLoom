# MyBiking

Lokale Web-App zur Analyse von Strava-Exportdaten. Kein Strava-API-Zugriff nötig – alles läuft lokal auf Basis eines heruntergeladenen ZIP-Exports.

> 🇬🇧 [English README](README.en.md)

![Stack](https://img.shields.io/badge/Backend-FastAPI%20%2B%20SQLite-blue)
![Stack](https://img.shields.io/badge/Frontend-React%2019%20%2B%20Vite%20%2B%20shadcn%2Fui-orange)
![Platform](https://img.shields.io/badge/Platform-Linux%20%2F%20macOS-lightgrey)

---

## Inhaltsverzeichnis

- [Features](#features)
- [Voraussetzungen](#voraussetzungen)
- [Installation & Start](#installation--start)
- [Autostart via systemd (optional)](#autostart-via-systemd-optional)
- [Projektstruktur](#projektstruktur)
- [API-Übersicht](#api-übersicht)
- [Datenbankschema](#datenbankschema)
- [Unterstützte Datei-Formate](#unterstützte-datei-formate)
- [Berechnungen & Formeln](#berechnungen--formeln)
- [Konfigurierbare Parameter](#konfigurierbare-parameter)
- [Bekannte Eigenheiten](#bekannte-eigenheiten)
- [Tech Stack](#tech-stack)
- [Lizenz](#lizenz)

---

## Features

| Bereich | Was es kann |
|---------|-------------|
| **Dashboard** | Hero-Banner (letzter Ride), Trainingsform-Widget (TSB/CTL/ATL mit Empfehlung), animierte KPI-Zahlen (count-up), Distanz-Chart, Trainingsvolumen, letzte Aktivitäten, Bike-Progress |
| **Aktivitätsliste** | Tabs: Radtouren (Filter/Sort/Paginierung) + Workouts (Sportart-Badges, Kalorien farbig); Watt-Spalte zeigt Leistung + NP-Zeile; einzelne Aktivitäten löschbar |
| **Aktivitätsdetail** | Karte (Leaflet), Höhenprofil, Geschwindigkeits-Profil (Farben synchron mit Karten-Gradient), HR-Profil, Wetterkachel, Fotos; Kachel „~ Leistung" (physikalische Schätzung ~W + NP + W/kg) |
| **Jahresrückblick** | „Wrapped"-Style: beste Rides, stärkste Monate, Tages-/Stunden-Heatmaps |
| **Jahresübersicht** | 4 Tabs: Fortschritt (kumulierte km + Prognose) · Jahresvergleich (km/Monat je Jahr) · Volumen (Wochentraining gestapelt) · Tageszeit-Heatmap |
| **HR-Analyse** | 2 Tabs: HR-Kurve (beste Ø-HF je Zeitfenster 1–60 min, Schwellen-HF, monatlicher HR-Trend) · Aerobe Effizienz (km/h ÷ bpm monatlich, Jahresvergleich) |
| **Heatmap** | Alle Tracks als interaktive Karte, filterbar nach Jahr |
| **Tempoentwicklung** | Scatter + 20-Rides-Rolling-Ø, Jahresvergleich, Saison-Heatmap (Monat × Jahr) |
| **Kalorien** | Energieverbrauch aus Rides + Workouts; KPI-Kacheln, gestapelter Monatsverlauf mit 3M-gleitendem Ø, Jahresvergleich |
| **Wetter & Leistung** | Ø-Speed nach Temperatur-Buckets, Wind-Impact-Chart; Wetterdaten via Open-Meteo (abrufbar per Knopfdruck) |
| **Formkurve (PMC)** | CTL/ATL/TSB nach Trainingstagebuch-Methodik, hrTSS, 28-Tage-CTL-Trend, Ride- und Workout-Marker, Einschätzungs-Banner |
| **Bestzeiten** | Rekorde und Top-Leistungen |
| **Bikes** | 3 Tabs: Übersicht (Foto-Thumbnail, Kennzahlen einzeilig, Verschleiß-Tracker als Karten mit Fortschrittsbalken + verknüpftem Lagerartikel-Namen, Einbauen aus Lager inkl. Übernahme der Laufleistung gebrauchter Teile, Ausbauen mit km-Erfassung + automatischer Lagerrückgabe, nachträgliches Verknüpfen verbauter Altbestand-Komponenten mit einem Einkauf; Einkaufs-Lager-Tabelle darunter, inaktive Bikes per Dropdown ganz unten) · Gelöscht (Historie unwiderruflich gelöschter Komponenten inkl. Lagerbezug, rein informativ) · Vergleich (km, Speed, Höhenmeter, Jahresverlauf, Distanzhistogramm) |
| **Workout-Detail** | Detailansicht je Workout: Sport-Hero, 4 KPI-Kacheln, SVG-Intensitätsgauge (Ø HR / Max HR), Verlaufschart, Ø-Vergleich |
| **Wochentag-Analyse** | Werktag (Mo–Fr) vs. Wochenende (Sa–So): Duell-Karte mit Gewinner-Indikatoren, Rides/Wochentag-Balken, Monatsverlauf |
| **Top-Strecken** | Greedy-Clustering aller Rides (2 km Startradius, ±10 % Distanz), Zeitchart mit PR-Markierung, Trend, Karte |
| **Streckenvergleich** | Ähnliche Rides finden (Haversine-Radius + Distanzabgleich) |
| **Kadenz-Analyse** | Radiales Verteilungsdiagramm (Polar-Chart), 6 Kadenz-Zonen, Monatstrend, Effizienz-Sweetspot |
| **Fitness-Fingerprint** | Gesamtscore 0–100 aus CTL, Aerober Effizienz, Form (TSB) und Kontinuität; Arc-Gauge, Stärken-Radar, 4 Komponenten-Karten, 13-Monats-Verlauf, Level-System (Einsteiger → Elite) |
| **Ermüdungsindex** | 3 Tabs: Trend (Monatsverlauf, YoY-Hero, Wetter-Korrelation, Distanz-Tabelle) · Strecke (nach Route-Cluster) · Einzelfahrt (Karte + 10-Segment-Chart) |
| **Kalender** | Monatskalender: Radtouren + Workouts (grau markiert), Ring-Indikator bei Kombi-Tagen |
| **Berechnungen** | Dokumentation aller verwendeten Formeln und Parameter |
| **Einstellungen** | Gewicht, Geburtsjahr, Zeitzone; FIT/TCX-Einzelimport (Amazfit, Garmin ohne Strava); Wetterdaten-Abruf; Leistung für alle Rides neu berechnen |

---

## Voraussetzungen

| Tool | Version | Hinweis |
|------|---------|---------|
| Python | ≥ 3.11 | `python3 --version` |
| Node.js | ≥ 20 | via [fnm](https://github.com/Schniz/fnm) oder nvm empfohlen |
| npm | ≥ 10 | kommt mit Node |

---

## Installation & Start

### 1. Strava-Export herunterladen

Strava → Einstellungen → Mein Konto → Meine Daten herunterladen → ZIP herunterladen.

Die ZIP-Datei in den `download/`-Ordner legen (wird automatisch erkannt):

```
download/export_XXXXXXXX.zip
```

### 2. Backend einrichten

```bash
python3 -m venv .venv
source .venv/bin/activate        # Linux/macOS
pip install -r backend/requirements.txt
```

### 3. Frontend einrichten

```bash
cd frontend
npm install
```

### 4. Starten

**Terminal 1 – Backend (Port 8000):**
```bash
source .venv/bin/activate
python -m uvicorn backend.main:app --port 8000 --reload
```

**Terminal 2 – Frontend (Port 5173):**
```bash
cd frontend
npm run dev
```

App öffnen: **http://localhost:5173**

### 5. Tests ausführen

```bash
source .venv/bin/activate
python -m pytest tests/ -v
```

78 Tests in `tests/` (pytest): Haversine, Physik-Engine, hrTSS/CTL/ATL, FIT- und TCX-Importer.

### 6. Daten importieren

Im Browser: **Einstellungen → Import starten** – der Importer liest die ZIP, parst alle FIT/TCX/GPX-Dateien und befüllt die SQLite-Datenbank.

---

## Autostart via systemd (optional)

Für dauerhaften Betrieb ohne manuellen Start:

```bash
systemctl --user enable mybiking-backend.service
systemctl --user enable mybiking-frontend.service
loginctl enable-linger $USER

# Manuell steuern
systemctl --user start|stop|restart mybiking-backend
systemctl --user start|stop|restart mybiking-frontend

# Logs
journalctl --user -u mybiking-backend.service -f
```

Service-Dateien liegen in `~/.config/systemd/user/`. Beim Debuggen mit VS Code vorher stoppen, damit Port 8000/5173 frei sind.

---

## Projektstruktur

```
MyBiking/
├── backend/
│   ├── main.py              # FastAPI-App, CORS für localhost:5173
│   ├── database.py          # SQLite-Schema, init_db()
│   ├── api/
│   │   ├── activities.py    # /activities/*
│   │   ├── analytics.py     # /analytics/* (PMC, Wrapped, Kalorien, Ermüdung, …)
│   │   ├── bikes.py         # /bikes, /bikes/{id}, /bikes/compare, Komponenten-Einbau/Ausbau
│   │   ├── purchases.py     # /purchases – Einkaufs-Lager (purchase_items: 1 Zeile je physischem Teil)
│   │   ├── heatmap.py       # /tracks/heatmap
│   │   ├── settings.py      # /settings (Gewicht, Geburtsjahr, HRmax, Timezone)
│   │   ├── importer.py      # /import/start|status|reset|fit-file
│   │   ├── tracks.py        # /activities/{id}/track
│   │   └── weather.py       # /weather/status, /weather/fetch-all (Open-Meteo)
│   ├── utils.py             # Shared: haversine_km(), haversine_m(), MS_TO_KMH
│   ├── importer/
│   │   ├── pipeline.py      # run_import() – Haupteinstieg
│   │   ├── fit.py           # FIT-Parser (Garmin, mit _SafeProcessor)
│   │   ├── fit_single.py    # FIT-Einzelimport (Amazfit, Garmin ohne Strava)
│   │   ├── tcx.py           # TCX-Parser
│   │   └── gpx.py           # GPX-Parser (Tracks + Routen)
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── main.tsx                    # Einstiegspunkt, React + Router
│       ├── App.tsx                     # Root-Komponente mit react-router-dom-Routen
│       ├── index.css                   # TailwindCSS v4, CSS Custom Properties, Themes
│       ├── lib/
│       │   ├── api.ts                  # Typisierter API-Client
│       │   ├── config.ts               # Zentrale Parameter (Glättung, Vereinfachung, …)
│       │   ├── format.ts               # fmtKm, fmtSpeed, fmtTime, fmtDate, fmtNum, fmtHm
│       │   └── utils.ts                # cn() Tailwind-Merge-Helper
│       ├── components/
│       │   ├── layout/
│       │   │   └── AppSidebar.tsx      # Collapsible Sidebar mit Sub-Navigation
│       │   ├── LeafletMap.tsx          # Leaflet-Karte (React.lazy), Speed-Halo, Hover-Sync
│       │   └── ui/                     # shadcn/ui base-nova Komponenten
│       ├── hooks/
│       │   └── use-mobile.ts
│       └── pages/                      # 21 Seiten als .tsx (Tab-Container bündeln verwandte Ansichten)
│           ├── DashboardPage.tsx
│           ├── ActivitiesPage.tsx
│           ├── ActivityDetailPage.tsx
│           ├── BestPage.tsx
│           ├── BikesPage.tsx           # Tabs: Übersicht · Gelöscht · Vergleich (/bikes?tab=übersicht|gelöscht|vergleich)
│           ├── WorkoutDetailPage.tsx   # Workout-Detail mit Intensitätsgauge (/workouts/:id)
│           ├── WeekendPage.tsx         # Wochentag-Analyse (/weekend)
│           ├── CalendarPage.tsx
│           ├── FormPage.tsx
│           ├── HeatmapPage.tsx
│           ├── HrCurvePage.tsx         # Tabs: HR-Kurve · Aerobe Effizienz (/hrcurve?tab=kurve|effizienz)
│           ├── ProgressPage.tsx        # Tabs: Fortschritt · Jahresvergleich · Volumen · Tageszeit (/progress?tab=…)
│           ├── SettingsPage.tsx
│           ├── RoutesPage.tsx
│           ├── StreckenPage.tsx
│           ├── TempCorrPage.tsx
│           ├── WrappedPage.tsx
│           ├── BerechnungenPage.tsx
│           ├── CadencePage.tsx
│           ├── FatiguePage.tsx         # Tabs: Übersicht · Strecke · Einzelfahrt (/fatigue?tab=…)
│           ├── CaloriesPage.tsx
│           ├── SpeedTrendPage.tsx      # Tempoentwicklung (/speed-trend)
│           └── FitnessPage.tsx         # Fitness-Fingerprint (/fitness)
├── data/
│   └── mybiking.db          # SQLite-Datenbank (wird beim Import erstellt)
├── download/                # Strava-Export-ZIP ablegen
└── README.md
```

---

## API-Übersicht

```
GET  /activities                    ?limit, offset, year, bike_id, has_track, sort_by, sort_dir
GET  /activities/stats              ?year
GET  /activities/weekly             ?weeks=8
GET  /activities/monthly            ?year
GET  /activities/monthly-all
GET    /activities/{id}
DELETE /activities/{id}             → löscht Aktivität inkl. track_points, media, laps
GET  /activities/{id}/track         ?simplify, fields
GET  /activities/{id}/media
GET  /activities/{id}/zones
GET  /activities/{id}/similar

GET  /activities/other              ?year      → andere Sportarten (Laufen, Kraft, …)
GET  /activities/{id}/zones         → HR-Zonen + Power-Zonen
GET  /activities/{id}/similar       ?limit=10  → ähnliche Rides (Haversine + Distanz)

GET  /analytics/year-progress
GET  /analytics/time-heatmap        ?year, tz_offset
GET  /analytics/speed-hr                       → per Ride: month, speed_kmh, hr, dist_km
GET  /analytics/speed-trend         ?year      → Scatter, Rolling-Ø, Jahres-Aggregate, Monats-Heatmap
GET  /analytics/temp-correlation
GET  /analytics/hr-curve            ?year
GET  /analytics/pmc                            → CTL/ATL/TSB + hrTSS
GET  /analytics/wrapped             ?year, tz_offset
GET  /analytics/weekly-volume       ?weeks
GET  /analytics/best-by-distance               → schnellste Ø-Geschwindigkeit je Distanzklasse (1–60 km, ±20%)
GET  /analytics/route-clusters      ?min_rides → Greedy-Clustering aller Rides nach Startpunkt + Distanz
GET  /analytics/cadence             ?year      → Distribution, Zonen, Monatsverlauf, Effizienz-Buckets
GET  /analytics/fatigue-index       ?year      → Ermüdungsindex (H1 vs. H2 Speed) je Ride + Trend
GET  /analytics/fatigue-index-track ?activity_ids → Ermüdungsindex für kommaseparierte IDs
GET  /analytics/calories            ?year      → total_kcal, rides + workouts, monatlich/jährlich
GET  /analytics/fitness-fingerprint            → Score 0–100 aus CTL, Effizienz, Form, Kontinuität + History

GET  /weather/status
POST /weather/fetch-all             → Wetterdaten für alle Aktivitäten via Open-Meteo (Background-Job)

GET  /bikes
GET  /bikes/{id}                   → inkl. current_km, components (km_since_service, pct_used, estimated_service_date, purchase_name, purchase_url live über Lagerbezug abgeleitet)
PUT  /bikes/{id}                   → { name } Bikenamen umbenennen
GET  /bikes/compare
GET  /bikes/deleted-components     → Historie unwiderruflich gelöschter Komponenten (Snapshot + Einkaufsbezug)
PUT  /bikes/{id}/toggle-retired    → Bike aktiv ↔ inaktiv
GET  /bikes/{id}/image
POST /bikes/{id}/image             → Foto hochladen (multipart)
POST /bikes/{id}/components        → Komponente aus Lager einbauen (purchase_id, optional return_id für Vorbelastungs-Übernahme)
PUT  /bikes/{id}/components/{cid}  → Komponente editieren (type, km_threshold, installed_at)
PUT  /bikes/{id}/components/{cid}/uninstall     → {km_ridden, purchase_id?} → bei Lagerbezug: Rückgabe vermerken + Komponente löschen
PUT  /bikes/{id}/components/{cid}/return-to-stock → {purchase_id} → bereits ausgebaute Komponente nachträglich ins Lager zurücklegen
PUT  /bikes/{id}/components/{cid}/link-purchase   → {purchase_id} → noch verbaute Komponente nachträglich einem Einkauf zuordnen (bleibt verbaut)
DELETE /bikes/{id}/components/{cid} → löscht unwiderruflich; Snapshot nach deleted_components, verknüpftes purchase_item wird entsorgt (disposed_at) statt ins Lager freigegeben
GET  /purchases                    → Einkaufs-Lager: 1 purchase_items-Zeile je physischem Teil, quantity/installed_count live daraus abgeleitet + returns (Laufleistungs-Historie)
POST /purchases                    → neuer Einkauf (quantity legt entsprechend viele purchase_items an, inkl. component_type)
PUT  /purchases/{id}               → Bestellung bearbeiten (Menge nicht editierbar – nur über /adjust)
PUT  /purchases/{id}/adjust        → {delta} → legt |delta| neue Items an (delta>0) bzw. entsorgt |delta| unverbaute Items (delta<0)
DELETE /purchases/{id}             → 409 falls noch Items verbaut sind oder offene Rückgaben existieren
GET  /tracks/heatmap                ?simplify, year
GET  /settings
POST /settings
POST /import/start
GET  /import/status
POST /import/reset
POST /import/fit-file               → multipart: file (.fit) + bike_id
POST /import/tcx-file               → multipart: file (.tcx) + bike_id
GET  /media/{filename}
```

---

## Datenbankschema

SQLite-Datei unter `data/mybiking.db`, Schema in `backend/database.py` (`init_db()`, additive Migrationen per `ALTER TABLE`/`PRAGMA table_info`-Check). Distanzen sind durchgehend in **Metern**, Geschwindigkeiten in **m/s** gespeichert (Anzeige rechnet auf km/h bzw. km um). Zeiten als ISO8601-Text ohne Zeitzone (siehe „Bekannte Eigenheiten" – de facto UTC).

### `activities` – importierte Radtouren
| Feld | Bedeutung |
|------|-----------|
| `id` | Strava Activity-ID (positiv) oder `-int(start_ts)` bei FIT/TCX/GPX-Einzelimport (negativ) |
| `name`, `activity_type`, `sport_type` | Bezeichnung + Strava-Typ (normalisiert DE→EN beim CSV-Import) |
| `start_date`, `start_date_local`, `timezone` | Beide Datumsfelder enthalten UTC (Strava-Export-Artefakt, siehe unten) |
| `distance_m`, `moving_time_s`, `elapsed_time_s`, `elevation_gain_m`, `elevation_loss_m` | Kernkennzahlen |
| `avg_speed_ms`, `max_speed_ms`, `avg_hr`, `max_hr`, `avg_power_w`, `max_power_w`, `avg_cadence` | Ø/Max-Werte aus Strava bzw. Track |
| `avg_temp_c` | **immer NULL** – echte Temperatur liegt in `track_points.temp_c` |
| `calories` | Kalorienverbrauch |
| `bike_id` | FK → `bikes.id`; fehlt die Strava-Gear-Zuweisung, greift `DEFAULT_BIKE_ID` |
| `commute`, `trainer`, `manual` | Boolean-Flags (0/1) aus Strava |
| `track_file` | relativer Pfad zur Track-Datei im ZIP-Export |
| `has_track` | 0/1, ob `track_points` existieren |
| `imported_at` | Zeitpunkt des Imports |
| `smart_device` | Gerätename, aus Dateiinhalt gelesen (`read_fit/tcx/gpx_device()`), nicht geraten |
| `weather_temp_c`, `weather_wind_ms`, `weather_wind_deg`, `weather_precip_mm` | Open-Meteo-Nachimport, NULL bis abgerufen |
| `est_avg_power_w`, `est_norm_power_w` | physikalische Leistungsschätzung (`power_estimator.py`), NULL ohne Track/Gewicht |

### `track_points` – Sekunden-Telemetrie je Aktivität
`activity_id` (FK), `timestamp`, `lat`/`lon` (können NULL sein bei fehlendem GPS-Fix), `altitude_m`, `distance_m` (kumulativ, bei TCX ggf. Haversine-Fallback), `speed_ms`, `hr`, `power_w` (meist NULL – kein Powermeter), `cadence`, `temp_c`.

### `laps` – Rundensplits (aus FIT/TCX)
`activity_id` (FK), `lap_number`, `start_time`, `total_time_s`, `distance_m`, `avg_speed_ms`, `max_speed_ms`, `avg_hr`, `max_hr`, `avg_power_w`, `max_power_w`, `avg_cadence`, `elevation_gain_m`.

### `segment_efforts` – Strava-Segment-Versuche (aus FIT)
`activity_id` (FK), `name`, `start_time`, `elapsed_time_s`, `distance_m`, `avg_speed_ms`, `max_speed_ms`, `avg_hr`, `max_hr`, `avg_power_w`, `max_power_w`, `avg_cadence`, `total_ascent_m`, `rank`, `pr_rank`. Wird beim ZIP-Reset mitgelöscht (`activity_id > 0`).

### `other_activities` – Nicht-Rad-Aktivitäten (Workouts)
`id` (Strava Activity-ID), `name`, `sport_type`, `start_date_local`, `moving_time_s`, `elapsed_time_s`, `avg_hr`, `max_hr`, `calories`, `imported_at`. Kein `bike_id` – Workouts sind nicht bikebezogen.

### `bikes` – Räder
| Feld | Bedeutung |
|------|-----------|
| `id` | Strava Gear-ID (z.B. `giant_propel`) oder manuell vergeben |
| `name` | Anzeigename, inline editierbar |
| `brand`, `model`, `description` | Freitext-Metadaten, Anzeige als Untertitel wenn abweichend vom Namen |
| `distance_m` | **unbenutzt** (totes Feld aus dem ursprünglichen Strava-Gear-Import) – Kilometerstand wird stattdessen live aus `activities` summiert (`current_km`) |
| `retired` | 0/1, aktiv/inaktiv (Toggle-Button) |
| `image_filename` | Dateiname in `data/bike_images/` |

### `bike_components` – Verschleißteile, die aktuell an einem Bike verbaut sind
| Feld | Bedeutung |
|------|-----------|
| `bike_id` | FK → `bikes.id` |
| `type` | Komponenten-Typ (Kette, Mantel vorne/hinten, …) |
| `model`, `description`, `distance_m` | **unbenutzt** (Reste aus dem ursprünglichen Schema, nie ans Frontend angebunden) |
| `added_at` | Einbaudatum (ISO) |
| `retired_at` | gesetzt beim Ausbau (siehe `uninstall_component`); solange NULL gilt die Komponente als aktiv verbaut |
| `km_threshold` | Wartungsintervall in km |
| `km_at_service` | Bike-km-Stand am Einbaudatum (bzw. um Vorbelastung verschoben) – Basis für `km_since_service` |
| `uninstalled_km` | gefahrene km beim Ausbau **ohne** Lagerbezug (Übergangsfall, Zeile bleibt als Verlauf stehen) |
| `purchase_item_id` | FK → `purchase_items.id`; NULL = kein Lagerbezug (Altbestand oder noch nicht verknüpft) |

`km_since_service`, `pct_used`, `estimated_service_date`, `purchase_url`, `purchase_name` werden **nicht gespeichert**, sondern bei jedem `GET` live berechnet bzw. über `purchase_item_id → purchase_items.purchase_id → purchases` gejoint.

### `purchases` – Einkäufe (Bestell-Kopfzeile)
| Feld | Bedeutung |
|------|-----------|
| `name` | Artikelbezeichnung (Pflichtfeld) |
| `shop` | Händler (z.B. „Amazon", „BOC Eschweiler") – **kein** Hersteller-Feld |
| `url`, `price`, `order_date`, `delivery_date`, `notes` | Freitext-Metadaten der Bestellung |
| `used_at` | **unbenutzt** (Rest aus einer früheren Schema-Version vor `purchase_items`) |
| `component_type` | Basis-Typ (z.B. „Mantel") für die Zuordnung im Einbauen-Formular, überschreibt Namens-Erkennung |

`quantity`/`installed_count` werden **nicht gespeichert**, sondern aus `purchase_items` abgeleitet.

### `purchase_items` – 1 Zeile je physisch gekauftem Teil
`purchase_id` (FK → `purchases.id`, NOT NULL), `disposed_at` (TEXT, NULL = nicht entsorgt). Status wird nie gespeichert, sondern abgeleitet: **verbaut** = eine `bike_components`-Zeile verweist per `purchase_item_id` darauf, **entsorgt** = `disposed_at` gesetzt, sonst **auf Lager**.

### `purchase_returns` – Laufleistungs-Historie zurückgelegter Komponenten
`purchase_item_id` (FK), `bike_id`, `component_type`, `km_ridden`, `returned_at`. Entsteht beim Zurücklegen einer Komponente mit Lagerbezug ins Lager; wird beim Wiedereinbau mit Vorbelastungs-Übernahme (`return_id`) wieder **gelöscht** (nicht nur markiert) – die km leben dann in der neuen `bike_components`-Zeile weiter.

### `deleted_components` – Historie unwiderruflich gelöschter Komponenten
Snapshot aller `bike_components`-Felder zum Löschzeitpunkt plus `km_since_service` (berechneter Verschleißstand) und `deleted_at`. `purchase_item_id` bleibt referenziert (nicht kopiert) – Preis/Shop/Link kommen bei Bedarf weiterhin über den Einkauf. Beim Löschen wird ein verknüpftes `purchase_item` **entsorgt** (`disposed_at` gesetzt), nicht wieder freigegeben – die physische Komponente ist weg, nicht zurückgelegt. Rein informativ, kein Wiederherstellen vorgesehen.

### `routes` / `route_points` – importierte GPX-Routen (keine Rides)
`routes`: `name`, `description`, `distance_m`, `source_file`. `route_points`: `route_id` (FK), `seq`, `lat`, `lon`, `altitude_m`.

### `media` – Fotos zu Aktivitäten
`activity_id` (FK), `filename` (UUID, Datei in `data/media/`), `taken_at`, `lat`, `lon`.

### `config` – Key-Value-Einstellungen
`key`/`value` (beide TEXT). Bekannte Keys: `weight_kg`, `birth_year`, `tz_offset`, `hr_max`.

---

## Unterstützte Datei-Formate

| Format | Quelle | Hinweise |
|--------|--------|---------|
| **FIT** | Garmin-Geräte | `enhanced_altitude`/`enhanced_speed` bevorzugt; Semicircle-Koordinaten |
| **TCX** | Garmin Connect (alt) | Führender Whitespace wird toleriert |
| **GPX** | Viele Geräte / Apps | Tracks + Routen |
| **CSV** | Strava (`activities.csv`) | Distanz in Metern, Datumsformat `Jun 17, 2023, 8:59:12 AM` |

---

## Berechnungen & Formeln

Alle verwendeten Formeln sind auf der Seite `/berechnungen` dokumentiert und werden direkt aus `config.ts` gelesen – immer aktuell. Wichtigste Kennzahlen:

| Kennzahl | Formel |
|----------|--------|
| **hrTSS** | `(dauer_h × hr_ratio² / 0.81) × 100` |
| **CTL** | 42-Tage EMA, K = 2/43 |
| **ATL** | 7-Tage EMA, K = 2/8 |
| **TSB** | `CTL − ATL` |
| **Aerobe Effizienz** | `avg_speed_kmh / avg_hr × 100` (monatlich aggregiert) |
| **Ermüdungsindex** | `(spd_h2 − spd_h1) / spd_h1 × 100` (negativ = Ermüdung, positiv = Steigerung) |
| **Jahresprognose** | `(km_heute / Jahrestag) × 365` |

---

## Konfigurierbare Parameter

In [frontend/src/lib/config.ts](frontend/src/lib/config.ts):

| Konstante | Standard | Bedeutung |
|-----------|----------|-----------|
| `BEZIER_TENSION` | `0.2` | Kurvenglättung (0 = gerade, 0.5 = stark) |
| `SPARKLINE_WEEKS` | `8` | Wochen im Dashboard-Sparkline |
| `SPEED_COLOR_BUCKETS` | `20` | Farbstufen auf der Geschwindigkeitskarte |
| `TRACK_SIMPLIFY_M` | `5` | Schritt beim rowid-Downsampling für Einzeltrack |
| `COMPARISON_SIMPLIFY` | `20` | Schritt für Multi-Track (Vergleich + Heatmap) |

---

## Bekannte Eigenheiten

- Aktivitäten ohne Strava-Gear-Zuweisung erhalten beim Import automatisch das Standard-Bike
- `activities.avg_temp_c` ist immer NULL – Temperatur liegt in `track_points.temp_c`
- GPS-Ausreißer (Koordinaten außerhalb des Ursprungslandes) werden in der Heatmap per Median±5° gefiltert
- Ein Eintrag aus 1990/12 (Fehldatum) erscheint im monatlichen Gesamtverlauf; Analysen filtern mit `>= '2000'`
- Track-Punkte können `lat: null, lon: null` haben (kein GPS-Fix beim Start) → Frontend filtert diese
- fitparse 1.2.0 liefert component fields als Tupel → `_SafeProcessor` in `fit.py` als Workaround
- **`Activity Date` im Strava-Export ist UTC** (nicht Lokalzeit) – `start_date_local` in der DB enthält daher ebenfalls UTC; Seiten mit Tageszeit-Auswertung übergeben den Browser-Timezone-Offset an die API
- **Strava-Export-Sprache**: Spaltennamen und Aktivitätstypen kommen je nach Strava-Konto-Sprache auf Englisch oder Deutsch – der Importer erkennt beide automatisch

---

## Tech Stack

### Backend
- **FastAPI** – REST-API mit automatischer OpenAPI-Doku (`/docs`)
- **SQLite** – Datenbank unter `data/mybiking.db`
- **fitparse** – FIT-Datei-Parser
- **lxml** – TCX/GPX-Parsing

### Frontend
- **React 19** + **Vite** – SPA mit react-router-dom v7
- **shadcn/ui base-nova** – Komponenten-Bibliothek (nutzt `@base-ui/react`)
- **Recharts** – Chart-Bibliothek
- **TailwindCSS v4**
- **Leaflet.js** – interaktive Karten (dynamischer Import via `React.lazy()`)
- **TypeScript** – vollständig typisiert

---

## Lizenz

[MIT License](LICENSE) – Copyright (c) 2026 Ashikaga1974
