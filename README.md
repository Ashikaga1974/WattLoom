# MyBiking

Lokale Web-App zur Analyse von Strava-Exportdaten. Kein Strava-API-Zugriff nötig – alles läuft lokal auf Basis eines heruntergeladenen ZIP-Exports.

![Stack](https://img.shields.io/badge/Backend-FastAPI%20%2B%20SQLite-blue)
![Stack](https://img.shields.io/badge/Frontend-React%2019%20%2B%20Vite%20%2B%20shadcn%2Fui-orange)
![Platform](https://img.shields.io/badge/Platform-Linux%20%2F%20macOS-lightgrey)

> **Branch `design-refresh`** – React 19 + Vite + shadcn/ui base-nova. Der stabile SvelteKit-Stand ist im Branch `main`.

---

## Features

| Bereich | Was es kann |
|---------|-------------|
| **Dashboard** | Hero-Banner (letzter Ride), animierte KPI-Zahlen (count-up), Distanz-Chart, Trainingsvolumen, letzte Aktivitäten, Bike-Progress |
| **Aktivitätsliste** | Tabs: Radtouren (Filter/Sort/Paginierung) + Workouts (Sportart-Badges, Kalorien farbig); einzelne Aktivitäten löschbar |
| **Aktivitätsdetail** | Karte (Leaflet), Höhenprofil, Geschwindigkeits-Profil (Farben synchron mit Karten-Gradient), HR-Profil, Wetterkachel, Fotos |
| **Jahresrückblick** | „Wrapped"-Style: beste Rides, stärkste Monate, Tages-/Stunden-Heatmaps |
| **Jahresübersicht** | 4 Tabs: Fortschritt (kumulierte km + Prognose) · Jahresvergleich (km/Monat je Jahr) · Volumen (Wochentraining gestapelt) · Tageszeit-Heatmap |
| **HR-Analyse** | 2 Tabs: HR-Kurve (beste Ø-HF je Zeitfenster 1–60 min, Schwellen-HF, monatlicher HR-Trend) · Aerobe Effizienz (km/h ÷ bpm monatlich, Jahresvergleich) |
| **Heatmap** | Alle Tracks als interaktive Karte, filterbar nach Jahr |
| **Tempoentwicklung** | Scatter + 20-Rides-Rolling-Ø, Jahresvergleich, Saison-Heatmap (Monat × Jahr) |
| **Kalorien** | Energieverbrauch aus Rides + Workouts; KPI-Kacheln, gestapelter Monatsverlauf mit 3M-gleitendem Ø, Jahresvergleich |
| **Wetter & Leistung** | Ø-Speed nach Temperatur-Buckets, Wind-Impact-Chart; Wetterdaten via Open-Meteo (abrufbar per Knopfdruck) |
| **FTP** | HR-korrigierte FTP-Schätzung, Trend, VO2max-Näherung |
| **Formkurve (PMC)** | CTL/ATL/TSB nach Trainingstagebuch-Methodik, hrTSS, Einschätzungs-Banner |
| **Bestzeiten** | Rekorde und Top-Leistungen |
| **Bikes** | Kilometerstand und Statistiken je Fahrrad; Bike-Vergleich (km, Speed, Höhenmeter, Jahresverlauf) |
| **Top-Strecken** | Greedy-Clustering aller Rides (2 km Startradius, ±10 % Distanz), Zeitchart mit PR-Markierung, Trend, Karte |
| **Streckenvergleich** | Ähnliche Rides finden (Haversine-Radius + Distanzabgleich) |
| **Kadenz-Analyse** | Radiales Verteilungsdiagramm (Polar-Chart), 6 Kadenz-Zonen, Monatstrend, Effizienz-Sweetspot |
| **Ermüdungsindex** | 3 Tabs: Übersicht (Speed H1 vs. H2, Histogramm, Trend) · Strecke (nach Route-Cluster) · Einzelfahrt (Karte + 10-Segment-Chart) |
| **Kalender** | Monatskalender: Radtouren + Workouts (grau markiert), Ring-Indikator bei Kombi-Tagen |
| **Berechnungen** | Dokumentation aller verwendeten Formeln und Parameter |
| **Einstellungen** | Gewicht, Geburtsjahr, manueller FTP, Zeitzone; FIT-Einzelimport (Amazfit, Garmin ohne Strava); Wetterdaten-Abruf |

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

### 5. Daten importieren

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
│   │   ├── analytics.py     # /analytics/* (FTP, PMC, Wrapped, …)
│   │   ├── bikes.py         # /bikes, /bikes/{id}, /bikes/compare
│   │   ├── heatmap.py       # /tracks/heatmap
│   │   ├── segments.py      # /segments
│   │   ├── settings.py      # /settings (Gewicht, Geburtsjahr, FTP, Timezone)
│   │   ├── importer.py      # /import/start|status|reset|fit-file
│   │   ├── tracks.py        # /activities/{id}/track
│   │   └── weather.py       # /weather/status, /weather/fetch-all (Open-Meteo)
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
│       │   ├── format.ts               # fmtKm, fmtSpeed, fmtTime, fmtDate, fmtNum
│       │   └── utils.ts                # cn() Tailwind-Merge-Helper
│       ├── components/
│       │   ├── layout/
│       │   │   └── AppSidebar.tsx      # Collapsible Sidebar mit Sub-Navigation
│       │   ├── LeafletMap.tsx          # Leaflet-Karte (React.lazy), Speed-Halo, Hover-Sync
│       │   └── ui/                     # shadcn/ui base-nova Komponenten
│       ├── hooks/
│       │   └── use-mobile.ts
│       └── pages/                      # 22 Seiten als .tsx (Tab-Container bündeln verwandte Ansichten)
│           ├── DashboardPage.tsx
│           ├── ActivitiesPage.tsx
│           ├── ActivityDetailPage.tsx
│           ├── BestPage.tsx
│           ├── BikesPage.tsx           # Tab: Übersicht
│           ├── BikeComparePage.tsx     # Tab: Bike-Vergleich  (direkt unter /bikes/compare)
│           ├── CalendarPage.tsx
│           ├── FormPage.tsx
│           ├── FtpPage.tsx
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
│           └── SpeedTrendPage.tsx
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
GET  /analytics/ftp
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

GET  /weather/status
POST /weather/fetch-all             → Wetterdaten für alle Aktivitäten via Open-Meteo (Background-Job)

GET  /bikes
GET  /bikes/{id}
GET  /bikes/compare
GET  /tracks/heatmap                ?simplify, year
GET  /settings
POST /settings
POST /import/start
GET  /import/status
POST /import/reset
POST /import/fit-file               → multipart: file (.fit) + bike_id
GET  /media/{filename}
```

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
| **FTP-Schätzung** | `avg_power × (0.90 × 1.20) / (avg_hr / hr_max)` |
| **VO2max** | `(FTP_W / weight_kg) × 10.8 + 7` (Coggan) |
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
| `TRACK_SIMPLIFY_M` | `5` | RDP-Toleranz in Metern beim Track-Laden |
| `COMPARISON_SIMPLIFY` | `20` | Vereinfachung beim Streckenvergleich |

---

## Bekannte Eigenheiten

- Aktivitäten ohne Strava-Gear-Zuweisung erhalten beim Import automatisch das Standard-Bike
- `activities.avg_temp_c` ist immer NULL – Temperatur liegt in `track_points.temp_c`
- GPS-Ausreißer (Koordinaten außerhalb des Ursprungslandes) werden in der Heatmap per Median±5° gefiltert
- Ein Eintrag aus 1990/12 (Fehldatum) erscheint im monatlichen Gesamtverlauf; Analysen filtern mit `>= '2000'`
- Track-Punkte können `lat: null, lon: null` haben (kein GPS-Fix beim Start) → Frontend filtert diese
- fitparse 1.2.0 liefert component fields als Tupel → `_SafeProcessor` in `fit.py` als Workaround
- **`Activity Date` im Strava-Export ist UTC** (nicht Lokalzeit) – `start_date_local` in der DB enthält daher ebenfalls UTC; Seiten mit Tageszeit-Auswertung übergeben den Browser-Timezone-Offset an die API

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

Privates Projekt – kein offizieller Open-Source-Release. Keine Garantien.
