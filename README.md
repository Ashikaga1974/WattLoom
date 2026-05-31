# MyBiking

Lokale Web-App zur Analyse von Strava-Exportdaten. Kein Strava-API-Zugriff nötig – alles läuft lokal auf Basis eines heruntergeladenen ZIP-Exports.

![Stack](https://img.shields.io/badge/Backend-FastAPI%20%2B%20SQLite-blue)
![Stack](https://img.shields.io/badge/Frontend-SvelteKit%205%20%2B%20TailwindCSS%20v4-orange)
![Platform](https://img.shields.io/badge/Platform-Linux%20%2F%20macOS-lightgrey)

---

## Features

| Bereich | Was es kann |
|---------|-------------|
| **Dashboard** | Schnellübersicht: letzte Wochen, Jahresstatistik, Streak |
| **Aktivitätsliste** | Filterbar nach Jahr, Bike, GPS-Track; sortierbar |
| **Aktivitätsdetail** | Karte (Leaflet), Höhenprofil, Geschwindigkeits- und HR-Profil, kombinierte Ansicht, Fotos |
| **Jahresrückblick** | „Wrapped"-Style: beste Rides, stärkste Monate, Tages-/Stunden-Heatmaps |
| **Jahresfortschritt** | Kumulative km pro Kalenderjar mit Prognose |
| **Heatmap** | Alle Tracks als interaktive Karte, filterbar nach Jahr |
| **Aerobe Effizienz** | Monatliche Effizienz-Trendlinie (Geschwindigkeit ÷ HF), Jahresvergleich |
| **HR-Kurve** | Beste Durchschnitts-HF über verschiedene Dauern |
| **FTP** | HR-korrigierte FTP-Schätzung, Trend, VO2max-Näherung |
| **Formkurve (PMC)** | CTL/ATL/TSB nach Trainingstagebuch-Methodik, hrTSS, Einschätzungs-Banner |
| **Training** | Wochentraining-Chart inkl. andere Sportarten |
| **Statistiken** | Verteilungsdiagramme (Distanz, Höhenmeter, Geschwindigkeit, …) |
| **Bestzeiten** | Rekorde und Top-Leistungen |
| **Jahresvergleich** | Jahre direkt gegenüberstellen |
| **Bikes** | Kilometerstand und Statistiken je Fahrrad |
| **Bike-Vergleich** | Bikes gegenüberstellen (km, Speed, Höhenmeter, Jahresverlauf) |
| **Top-Strecken** | Greedy-Clustering aller Rides (2 km Startradius, ±15 % Distanz), SVG-Zeitchart mit PR-Markierung, Trend, Karte |
| **Streckenvergleich** | Ähnliche Rides finden (Haversine-Radius + Distanzabgleich) |
| **Kadenz-Analyse** | Radiales Verteilungsdiagramm (Polar-Chart), 6 Kadenz-Zonen, Monatstrend, Effizienz-Sweetspot |
| **Ermüdungsindex** | Speed 1. vs. 2. Hälfte pro Ride – Histogramm, Negativsplit-Erkennung, Monatstrend |
| **Zeit-Heatmap** | Aktivitäten nach Wochentag/Uhrzeit |
| **Temp-Korrelation** | Zusammenhang Temperatur ↔ Leistung/Speed |
| **Kalender** | Monatskalender aller Aktivitäten |
| **Berechnungen** | Dokumentation aller verwendeten Formeln und Parameter |
| **Einstellungen** | Gewicht, Geburtsjahr, manueller FTP, Zeitzone |

---

## Screenshot

> Dashboard und Aktivitätsdetail mit Kartenansicht, Profilen und Stats.

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
# Aus dem Projektwurzel
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
# Services aktivieren
systemctl --user enable mybiking-backend.service
systemctl --user enable mybiking-frontend.service

# Ohne aktive Login-Session laufen lassen
loginctl enable-linger $USER

# Manuell steuern
systemctl --user start|stop|restart mybiking-backend
systemctl --user start|stop|restart mybiking-frontend

# Logs beobachten
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
│   │   ├── importer.py      # /import/start|status|reset
│   │   └── tracks.py        # /activities/{id}/track
│   ├── importer/
│   │   ├── pipeline.py      # run_import() – Haupteinstieg
│   │   ├── fit.py           # FIT-Parser (Garmin, mit _SafeProcessor)
│   │   ├── tcx.py           # TCX-Parser
│   │   └── gpx.py           # GPX-Parser (Tracks + Routen)
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── lib/
│       │   ├── api.ts              # Typisierter API-Client
│       │   ├── config.ts           # Zentrale Parameter (Glättung, Vereinfachung, …)
│       │   ├── chart-utils.ts      # Catmull-Rom → Bezier Splines
│       │   ├── tz.svelte.ts        # Timezone-Handling (UTC→lokal)
│       │   ├── ElevationProfile.svelte
│       │   ├── SpeedProfile.svelte
│       │   ├── HRProfile.svelte
│       │   ├── CombinedProfile.svelte
│       │   └── Sparkline.svelte
│       └── routes/
│           ├── +layout.svelte      # Navigation
│           ├── +page.svelte        # Dashboard
│           ├── activities/         # Liste + Detailseite
│           ├── berechnungen/       # Formel-Dokumentation
│           ├── best/               # Bestzeiten / Rekorde
│           ├── bikes/              # Bike-Übersicht + Vergleich
│           ├── calendar/           # Monatskalender
│           ├── compare/            # Jahresvergleich
│           ├── form/               # Formkurve (PMC)
│           ├── ftp/                # FTP-Analyse
│           ├── heatmap/            # Karten-Heatmap
│           ├── hrcurve/            # HR-Kurve
│           ├── progress/           # Jahresfortschritt + Prognose
│           ├── settings/           # Einstellungen + Import
│           ├── speedhr/            # Aerobe Effizienz
│           ├── stats/              # Verteilungsdiagramme
│           ├── routes/             # Top-Strecken (Greedy-Clustering)
│           ├── cadence/            # Kadenz-Analyse (Polar-Chart, Zonen)
│           ├── fatigue-index/      # Ermüdungsindex (H1 vs. H2 Speed)
│           ├── strecken/           # Streckenvergleich
│           ├── tempcorr/           # Temp-Korrelation
│           ├── timeheatmap/        # Zeit-Heatmap
│           ├── training/           # Wochentraining
│           └── wrapped/            # Jahresrückblick
├── data/
│   └── mybiking.db          # SQLite-Datenbank (wird beim Import erstellt)
├── download/                # Strava-Export-ZIP ablegen
├── SETUP.md                 # Detaillierte Setup-Doku (VS Code, systemd, …)
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
GET  /activities/{id}
GET  /activities/{id}/track         ?simplify, fields
GET  /activities/{id}/media
GET  /activities/{id}/zones
GET  /activities/{id}/similar

GET  /analytics/year-progress
GET  /analytics/time-heatmap        ?year, tz_offset
GET  /analytics/speed-hr
GET  /analytics/temp-correlation
GET  /analytics/ftp
GET  /analytics/hr-curve            ?year
GET  /analytics/pmc
GET  /analytics/wrapped             ?year, tz_offset
GET  /analytics/weekly-volume       ?weeks
GET  /analytics/best-by-distance               → schnellste Ø-Geschwindigkeit je Distanzklasse (1–60 km, ±20%)
GET  /analytics/route-clusters      ?min_rides → Greedy-Clustering aller Rides nach Startpunkt + Distanz
GET  /analytics/cadence             ?year      → Distribution, Zonen, Monatsverlauf, Effizienz-Buckets
GET  /analytics/fatigue-index       ?year      → Ermüdungsindex (H1 vs. H2 Speed) je Ride + Trend

GET  /bikes
GET  /bikes/{id}
GET  /bikes/compare
GET  /tracks/heatmap                ?simplify, year
GET  /settings
POST /settings
POST /import/start
GET  /import/status
POST /import/reset
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
| **Ermüdungsindex** | `(spd_h1 − spd_h2) / spd_h1 × 100` (positiv = Ermüdung, negativ = Negativsplit) |
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
- Ein Eintrag aus 1990/12 (Fehldatum) erscheint im monatlichen Gesamtverlauf
- Track-Punkte können `lat: null, lon: null` haben (kein GPS-Fix beim Start) → Frontend filtert diese
- fitparse 1.2.0 liefert component fields als Tupel → `_SafeProcessor` in `fit.py` als Workaround

---

## Tech Stack

### Backend
- **FastAPI** – REST-API mit automatischer OpenAPI-Doku (`/docs`)
- **SQLite** – Datenbank unter `data/mybiking.db`
- **fitparse** – FIT-Datei-Parser
- **lxml** – TCX/GPX-Parsing

### Frontend
- **SvelteKit** mit **Svelte 5 Runes** (`$state`, `$derived`, `$effect`)
- **TailwindCSS v4**
- **Leaflet.js** – interaktive Karten und Heatmaps
- **TypeScript** – vollständig typisiert

---

## Lizenz

Privates Projekt – kein offizieller Open-Source-Release. Keine Garantien.
