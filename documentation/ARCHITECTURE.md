# Architecture

Technical overview of WattLoom Cycling for developers. For formulas see
[CALCULATIONS.md](CALCULATIONS.md), for setup see [DEVELOPMENT.md](DEVELOPMENT.md).

## Overview

```
Browser (React SPA)
   │  REST/JSON
   ▼
FastAPI (single uvicorn process)
   ├── api/            REST endpoints (activities, analytics, bikes, segments, import, …)
   ├── importer/       Strava ZIP + single FIT/TCX/GPX import, power estimation
   ├── weather.py      Open-Meteo archive API (on demand, after import)
   └── cache.py        in-process cache for expensive analytics (invalidated on data changes)
   │
   ▼
SQLite  (data/mybiking.db)
```

- **Single-user, local-first**: no authentication, no multi-tenancy – by design.
- **One process, one port** in Docker and the desktop build: FastAPI serves the built frontend
  (`frontend/dist`) and the API from the same origin. In development, Vite runs separately on 5173.
- **One uvicorn worker only** – SQLite does not handle parallel writers.
- **API reference**: FastAPI generates it automatically – open **http://localhost:8000/docs**
  (Swagger UI) while the backend is running.

## Project structure

```
WattLoom/
├── backend/
│   ├── main.py              # FastAPI app, router setup, serves frontend/dist if present
│   ├── database.py          # SQLite schema, init_db() with additive migrations
│   ├── paths.py             # data/resource paths for dev, Docker (WATTLOOM_DATA_DIR) and frozen build
│   ├── cache.py             # minimal in-process cache (get_or_set / invalidate)
│   ├── utils.py             # haversine_km/m, path_match_fraction, MS_TO_KMH
│   ├── pr_detection.py      # best-effort snapshot diff before/after import → pr_events
│   ├── segment_matching.py  # matches custom segments against activity tracks
│   ├── weather.py           # Open-Meteo archive API: fetch_weather(lat, lon, date_utc)
│   ├── api/
│   │   ├── activities.py    # /activities/* (list, detail, laps, power patch, similar rides)
│   │   ├── analytics/       # /analytics/* – overview, pmc (+ fitness fingerprint), best_by_distance, zone_distribution
│   │   ├── bikes/           # /bikes/* – bikes, components, compare, deleted components
│   │   ├── purchases.py     # /purchases – stock management (purchase_items: 1 row per physical item)
│   │   ├── segments.py      # /segments – custom route sections
│   │   ├── storage_locations.py # /storage-locations
│   │   ├── heatmap.py       # /tracks/heatmap
│   │   ├── tracks.py        # /activities/{id}/track
│   │   ├── zones.py         # /activities/{id}/zones, HR zones + beta-blocker correction
│   │   ├── importer.py      # /import/* (ZIP, single files, recalculations, reset)
│   │   ├── weather.py       # /weather/*
│   │   ├── settings.py      # /settings
│   │   ├── translations.py  # /translations/*
│   │   ├── system.py        # /system/log
│   │   └── errors.py        # api_error() – unified error format
│   ├── importer/
│   │   ├── pipeline.py      # run_import() – ZIP import entry point
│   │   ├── fit.py / tcx.py / gpx.py            # parsers
│   │   ├── fit_single.py / tcx_single.py / gpx_single.py  # single-file imports
│   │   ├── power_estimator.py # physics-based power estimation
│   │   └── sport_codes.py   # canonical sport codes
│   └── requirements.txt
├── frontend/src/
│   ├── App.tsx              # routes (react-router-dom v7)
│   ├── lib/                 # api.ts (typed client), config-context.tsx, format.ts, i18n.ts, insights.ts
│   ├── components/          # AppSidebar, LeafletMap, RouteThumbnail, ui/ (shadcn/ui base-nova)
│   └── pages/               # one file per page; larger pages split into subfolders
│                            #   (bikes/, dashboard/, progress/, settings/, onboarding/)
├── tests/                   # pytest
├── scripts/                 # bump_version.py, folder_watcher.py (systemd entry point), maintenance scripts
├── data/                    # SQLite DB, media, bike images, backups (created at runtime)
├── download/                # place the Strava export ZIP here
└── sync/                    # auto-import folder for FIT/TCX/GPX (backend/folder_watcher.py)
```

## Database schema

SQLite file at `data/mybiking.db`, schema defined in `backend/database.py` (`init_db()`; older migrations are additive `ALTER TABLE`/`PRAGMA table_info` checks, new ones are numbered functions in `_MIGRATIONS`, tracked via `PRAGMA user_version`). Distances are stored in **meters** throughout, speeds in **m/s** (the UI converts to km/h resp. km). Timestamps are ISO8601 text without a timezone (see "Known quirks" – effectively UTC).

### `activities` – imported rides
| Field | Meaning |
|-------|---------|
| `id` | Strava activity ID (positive) or `-int(start_ts)` for single FIT/TCX/GPX imports (negative) |
| `name`, `activity_type`, `sport_type` | Title + Strava type (normalized DE→EN during CSV import) |
| `start_date`, `start_date_local`, `timezone` | Both date fields contain UTC (Strava export artifact, see below) |
| `distance_m`, `moving_time_s`, `elapsed_time_s`, `elevation_gain_m`, `elevation_loss_m` | Core metrics |
| `avg_speed_ms`, `max_speed_ms`, `avg_hr`, `max_hr`, `avg_power_w`, `max_power_w`, `avg_cadence` | Avg/max values from Strava resp. the track |
| `avg_temp_c` | **always NULL** – actual temperature lives in `track_points.temp_c` |
| `calories` | Calorie expenditure |
| `bike_id` | FK → `bikes.id`; if the Strava gear assignment is missing, `DEFAULT_BIKE_ID` applies |
| `commute`, `trainer`, `manual` | Boolean flags (0/1) from Strava |
| `track_file` | Relative path to the track file inside the ZIP export |
| `has_track` | 0/1, whether `track_points` exist |
| `imported_at` | Time of import |
| `smart_device` | Device name, read from the file content (`read_fit/tcx/gpx_device()`), not guessed |
| `weather_temp_c`, `weather_wind_ms`, `weather_wind_deg`, `weather_precip_mm` | Filled in after import via Open-Meteo, NULL until fetched |
| `est_avg_power_w`, `est_norm_power_w` | Physics-based power estimate (`power_estimator.py`), NULL without a track/weight |

### `track_points` – per-second telemetry per activity
`activity_id` (FK), `timestamp`, `lat`/`lon` (can be NULL if no GPS fix at start), `altitude_m`, `distance_m` (cumulative, Haversine fallback for TCX where needed), `speed_ms`, `hr`, `power_w` (mostly NULL – no power meter), `cadence`, `temp_c`.

### `laps` – lap splits (from FIT/TCX)
`activity_id` (FK), `lap_number`, `start_time`, `total_time_s`, `distance_m`, `avg_speed_ms`, `max_speed_ms`, `avg_hr`, `max_hr`, `avg_power_w`, `max_power_w`, `avg_cadence`, `elevation_gain_m`.

### `segment_efforts` – Strava segment attempts (from FIT)
`activity_id` (FK), `name`, `start_time`, `elapsed_time_s`, `distance_m`, `avg_speed_ms`, `max_speed_ms`, `avg_hr`, `max_hr`, `avg_power_w`, `max_power_w`, `avg_cadence`, `total_ascent_m`, `rank`, `pr_rank`. Deleted along with the ZIP reset (`activity_id > 0`).

### `other_activities` – non-cycling activities (workouts)
`id` (Strava activity ID), `name`, `sport_type`, `start_date_local`, `moving_time_s`, `elapsed_time_s`, `avg_hr`, `max_hr`, `calories`, `imported_at`. No `bike_id` – workouts aren't tied to a bike.

### `bikes` – bikes
| Field | Meaning |
|-------|---------|
| `id` | Strava gear ID (e.g. `giant_propel`) or manually assigned |
| `name` | Display name, editable inline |
| `brand`, `model`, `description` | Free-text metadata, shown as a subtitle when it differs from the name |
| `distance_m` | **unused** (dead field from the original Strava gear import) – mileage is instead summed live from `activities` (`current_km`) |
| `retired` | 0/1, active/inactive (toggle button) |
| `image_filename` | File name in `data/bike_images/` |

### `bike_components` – wear parts currently mounted on a bike
| Field | Meaning |
|-------|---------|
| `bike_id` | FK → `bikes.id` |
| `type` | Component type (chain, tire front/rear, …) |
| `model`, `description`, `distance_m` | **unused** (leftovers from the original schema, never wired up to the frontend) |
| `added_at` | Install date (ISO) |
| `retired_at` | Set on uninstall (see `uninstall_component`); as long as it's NULL, the component counts as actively mounted |
| `km_threshold` | Maintenance interval in km |
| `km_at_service` | Bike mileage on the install date (or shifted to account for prior mileage) – basis for `km_since_service` |
| `uninstalled_km` | Mileage ridden at uninstall time **without** a stock link (transitional case, the row stays as history) |
| `purchase_item_id` | FK → `purchase_items.id`; NULL = no stock link (legacy stock or not linked yet) |

`km_since_service`, `pct_used`, `estimated_service_date`, `purchase_url`, `purchase_name` are **not stored** – they're computed live on every `GET`, resp. joined via `purchase_item_id → purchase_items.purchase_id → purchases`.

### `purchases` – purchase orders (order header)
| Field | Meaning |
|-------|---------|
| `name` | Item name (required) |
| `shop` | Retailer (e.g. "Amazon", "BOC Eschweiler") – **not** a manufacturer field |
| `url`, `price`, `order_date`, `delivery_date`, `notes` | Free-text order metadata |
| `component_type` | Base type (e.g. "tire") used for matching in the install form, overrides name-based detection |

`quantity`/`installed_count` are **not stored** – they're derived from `purchase_items`.

### `purchase_items` – 1 row per physical item purchased
`purchase_id` (FK → `purchases.id`, NOT NULL), `disposed_at` (TEXT, NULL = not disposed of). Status is never stored, only derived: **mounted** = a `bike_components` row references it via `purchase_item_id`, **disposed of** = `disposed_at` set, otherwise **in stock**.

### `purchase_returns` – mileage history of returned components
`purchase_item_id` (FK), `bike_id`, `component_type`, `km_ridden`, `returned_at`. Created when a stock-linked component is returned to stock; **deleted** again (not just marked) when its mileage is carried over on reinstall (`return_id`) – the mileage then lives on in the new `bike_components` row.

### `deleted_components` – history of irreversibly deleted components
Snapshot of all `bike_components` fields at the time of deletion, plus `km_since_service` (computed wear level) and `deleted_at`. `purchase_item_id` stays referenced (not copied) – price/shop/link, if needed, still come from the purchase. On deletion, a linked `purchase_item` is **disposed of** (`disposed_at` set) rather than freed back to stock – the physical component is gone, not returned. Informational only, no restore.

### `pr_events` – detected new personal records
`distance_km`, `best_time_s`, `best_speed_kmh`, `activity_id`, `activity_name` (snapshot, not live-joined), `previous_time_s`, `created_at`. Filled by `pr_detection.py` via a snapshot diff over `best_by_distance()` before/after every import; shown as a dashboard tile until dismissed via `DELETE /analytics/pr-events/{id}`.

### `media` – photos attached to activities
`activity_id` (FK), `filename` (UUID, file in `data/media/`), `taken_at`, `lat`, `lon`.

### `config` – key-value settings
`key`/`value` (both TEXT). ~29 keys, defined in `backend/api/settings.py: _FIELDS` – incl. `weight_kg`, `birth_year`, `tz_offset`, `hr_max`, `language`, `yearly_km_goal`, `weekly_hours_goal`, `default_bike_id`, `crr`, `cda`, `bike_kg`, `ctl_days`, `atl_days`, plus every value from the "Configurable parameters" table below. Additionally (outside `_FIELDS`, unused leftovers from the removed licensing system – logic lives in branch `licensing-system`): `trial_started_at`, `trial_signature`, `license_key`.

### `translations` – UI translations (DB instead of frontend bundle)
`lang`, `ns` (namespace, corresponds to one frontend page or `common`), `key` (dot path, e.g. `nav.activities`), `value` (JSON-encoded – even plain strings, so arrays/objects like `weekdaysShort` round-trip losslessly). Primary key `(lang, ns, key)`. Managed via `GET/POST /translations/*`, not edited directly on the settings page.

### `custom_segments` – self-defined route sections
`name`, `source_activity_id` (FK → `activities.id`), `distance_m`, `points` (JSON `[{dist_m, lat, lon}, …]`, `dist_m` relative to the segment start), `created_at`.

### `custom_segment_efforts` – matched attempts per segment
`segment_id` (FK), `activity_id` (FK), `time_s`, `avg_speed_kmh`, `avg_hr`, `avg_power_w`, `norm_power_w`, `match_pct`, `created_at`. Unique per `(segment_id, activity_id)`.

---

## Supported file formats

| Format | Source | Notes |
|--------|--------|-------|
| **FIT** | Garmin devices | `enhanced_altitude`/`enhanced_speed` preferred; semicircle coordinates |
| **TCX** | Garmin Connect (legacy) | Leading whitespace is tolerated |
| **GPX** | Many devices/apps | Tracks + routes |
| **CSV** | Strava (`activities.csv`) | Distance in meters, date format `Jun 17, 2023, 8:59:12 AM` |

---

## Configurable parameters

Display parameters, stored as backend settings with defaults in
[frontend/src/lib/config-context.tsx](../frontend/src/lib/config-context.tsx):

| Constant | Default | Meaning |
|----------|---------|---------|
| `bezier_tension` | `0.2` | Curve smoothing (0 = straight, 0.5 = strong) |
| `sparkline_weeks` | `8` | Weeks shown in the dashboard sparkline |
| `block_hours` | `3` | Hour width of time blocks (time-of-day tab, /progress) |
| `volume_trend_weeks` | `4` | Rolling-average window for the volume trend line (/progress) |
| `speed_color_buckets` | `20` | Color steps on the speed map |
| `track_simplify_m` | `5` | RDP tolerance in meters when loading a track |
| `wear_warning_pct` | `90` | Wear warning threshold (dashboard widget) |
| `comparison_simplify` | `20` | Simplification used for route comparison |
| `chart_height_mini` | `100` | Tiny inline sparklines |
| `chart_height_compact` | `140` | Small trend charts |
| `chart_height` | `200` | Standard analytics chart |
| `chart_height_dense` | `220` | Dense multi-series charts (upper cap) |
| `comparison_colors` | `#f97316,#3b82f6,#22c55e,#a855f7,#eab308` | Color order for route comparison |

---

## Known quirks

- Activities without a Strava gear assignment automatically get the default bike on import
- `activities.avg_temp_c` is always NULL – the actual temperature lives in `track_points.temp_c`
- GPS outliers (coordinates outside the country of origin) are filtered in the heatmap via median±5°
- One entry from 1990/12 (bad date) shows up in the monthly overall trend; analyses filter with `>= '2000'`
- Track points can have `lat: null, lon: null` (no GPS fix at start) → the frontend filters these out
- fitparse 1.2.0 returns component fields as tuples → `_SafeProcessor` in `fit.py` works around this
- **`Activity Date` in the Strava export is UTC** (not local time) – `start_date_local` in the DB therefore also contains UTC; pages with time-of-day analysis pass the browser's timezone offset to the API
- **Strava export language**: column names and activity types come in English or German depending on the Strava account language – the importer detects both automatically

---

## Tech stack

### Backend
- **FastAPI** – REST API with automatic OpenAPI docs (`/docs`)
- **SQLite** – database at `data/mybiking.db`
- **fitparse** – FIT file parser
- **lxml** – TCX/GPX parsing

### Frontend
- **React 19** + **Vite** – SPA with react-router-dom v7
- **shadcn/ui base-nova** – component library (built on `@base-ui/react`)
- **Recharts** – charting library
- **TailwindCSS v4**
- **Leaflet.js** – interactive maps (dynamic import via `React.lazy()`)
- **react-i18next** – multi-language support, translations from the `translations` DB table instead of a bundle
- **TypeScript** – fully typed
