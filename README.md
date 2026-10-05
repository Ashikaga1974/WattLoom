# WattLoom Cycling

> 🇩🇪 [Deutsche README](README.de.md)

**Local-first Strava analytics for cyclists.**

Analyze your complete Strava history locally – without Strava API access, without cloud upload.
Just download the ZIP export, import it, done.

![Demo](res/demo.gif)

⭐ **Features**
📊 Training analytics · 🚴 Bike management · 🌦 Weather & performance · 🏆 PRs & best efforts ·
🗺 Routes & heatmap · 🔒 100% local

![Stack](https://img.shields.io/badge/Backend-FastAPI%20%2B%20SQLite-blue)
![Stack](https://img.shields.io/badge/Frontend-React%2019%20%2B%20Vite%20%2B%20shadcn%2Fui-orange)
![Platform](https://img.shields.io/badge/Platform-Linux%20%2F%20macOS-lightgrey)
![License](https://img.shields.io/badge/License-AGPL--3.0-green)
[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-support-FFDD00?logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/saschalerst)

---

### Why WattLoom Cycling?

**No API.**
Import your Strava ZIP export.

**No cloud.**
Your activities stay on your own machine.

**No subscription.**
Fully open source (AGPL-3.0) – no license key, ever.

**One dashboard.**
Training, performance, weather, and bike maintenance in one place.

### Comparison with existing solutions

| | WattLoom Cycling | Strava | GoldenCheetah | Intervals.icu |
|---|---|---|---|---|
| Local data | ✅ | ❌ | ✅ | ❌ |
| Strava API required | ❌ | — | optional | optional |
| Cloud account required | ❌ | ✅ | ❌ | ✅ |
| Web UI | ✅ | ✅ | ❌ (desktop app) | ✅ |
| Open source | ✅ | ❌ | ✅ | ❌ |

Feature sets of the other tools change over time – check their current documentation. What
WattLoom brings out of the box: bike maintenance (wear, parts stock, cost per km) and weather
analysis for every ride, both free.

---

## Screenshots

<table>
  <tr>
    <td width="50%"><a href="documentation/screenshots/dashboard.png"><img src="documentation/screenshots/dashboard.png" alt="Dashboard"></a><br><sub>Dashboard</sub></td>
    <td width="50%"><a href="documentation/screenshots/activitieslist.png"><img src="documentation/screenshots/activitieslist.png" alt="Activity list"></a><br><sub>Activity list</sub></td>
  </tr>
  <tr>
    <td width="50%"><a href="documentation/screenshots/activitiesdetails.png"><img src="documentation/screenshots/activitiesdetails.png" alt="Activity detail with speed-colored map"></a><br><sub>Activity detail with speed-colored map</sub></td>
    <td width="50%"><a href="documentation/screenshots/form.png"><img src="documentation/screenshots/form.png" alt="Form & fitness (PMC)"></a><br><sub>Form & fitness (PMC)</sub></td>
  </tr>
  <tr>
    <td width="50%"><a href="documentation/screenshots/segments.png"><img src="documentation/screenshots/segments.png" alt="Custom segment with all efforts"></a><br><sub>Custom segment with all efforts</sub></td>
    <td width="50%"><a href="documentation/screenshots/weather.png"><img src="documentation/screenshots/weather.png" alt="Weather & performance"></a><br><sub>Weather & performance</sub></td>
  </tr>
  <tr>
    <td width="50%"><a href="documentation/screenshots/bikes.png"><img src="documentation/screenshots/bikes.png" alt="Bikes & component wear"></a><br><sub>Bikes & component wear</sub></td>
  </tr>
</table>

---

## Features

| Area | What it does |
|------|---------------|
| **Dashboard** | Latest ride, training form (TSB/CTL/ATL), training goals, wear warnings, new personal records, KPIs, distance and volume charts |
| **Activities** | Rides and workouts with filters; detail view with map, elevation/speed/HR profiles, weather, photos, estimated power |
| **Training load** | Form curve (CTL/ATL/TSB, hrTSS), HR zones, 80/20 training distribution, fitness fingerprint score |
| **Performance** | Best efforts per distance (5–70 km), pace trend, aerobic efficiency, HR curve, cadence |
| **Routes** | Heatmap of all tracks, find similar rides by real track overlap, custom segments with all your efforts compared |
| **Weather** | Speed vs. temperature and wind, weather timeline over all years (free via Open-Meteo) |
| **Bikes** | Wear tracking per component, maintenance queue, parts inventory, maintenance cost per 100 km, bike comparison |
| **Overviews** | "What changed?" comparison of the last 30/90/365 days, year progress and forecast, year comparison, calendar, weekday vs. weekend, calories, "Wrapped" year in review |
| **Import** | Strava ZIP export plus single FIT/TCX/GPX files (e.g. straight from your watch) |
| **Other** | Optional beta-blocker HR correction, UI in German/English, 5 themes |

How each value is calculated – and which values are estimates – is documented in
[CALCULATIONS.md](documentation/CALCULATIONS.md).

---

## Getting started

### Docker (recommended)

Requires [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Windows/macOS) or
Docker Engine with the Compose plugin (Linux).

```bash
docker compose up --build
```

Open **http://localhost:8000**. Your data lives in the local `wattloom-data/` folder and
survives container restarts. Put your Strava export ZIP in `wattloom-data/download/`.

By default the port is bound to `127.0.0.1` only, so WattLoom is reachable from this computer
alone. To use it from other devices in your LAN, start it with
`WATTLOOM_BIND=0.0.0.0 docker compose up --build`.

### Windows (desktop build)

Download `WattLoom-windows.zip` from the [Releases](https://github.com/Ashikaga1974/WattLoom/releases),
extract it anywhere and start `WattLoom.exe` – the browser opens automatically on
**http://localhost:8000**.

- Your data lives in `%APPDATA%\WattLoom\data`, not in the program folder – it survives updates.
- Put your Strava export ZIP in the `download\` folder next to `WattLoom.exe`.
- Automatic import: FIT/TCX/GPX files placed in the `sync\` folder next to `WattLoom.exe`
  (e.g. by your watch's companion app) are imported while WattLoom is running.

**Updating from v1.1.1 or older:** these versions stored `data\` next to the `.exe`. Before
starting the new version for the first time, either extract it over the old folder or copy
the old `data\` folder next to the new `WattLoom.exe`. On first start it is moved to
`%APPDATA%\WattLoom\data` once (the old folder is kept as `data.migrated-<date>`).

### From source (Linux/macOS)

Python ≥ 3.11 and Node.js ≥ 20 – see [DEVELOPMENT.md](documentation/DEVELOPMENT.md).

### Import your data

1. Strava → Settings → My Account → Download your data → download the ZIP.
2. Put the ZIP in the `download/` folder (see above for Docker/Windows).
3. On first start, the setup wizard guides you through the import. Later imports and single
   FIT/TCX/GPX files are available on the **Import** page.

**Testing without Strava data:** Want to try out WattLoom without an export? Switch to a realistic sample dataset under **Settings → Demo mode**. Your own data stays untouched and is back as soon as you switch it off.

---

## Security note

WattLoom Cycling is a **single-user application for local use**: no authentication, no user
management. That's a deliberate design choice, as long as you follow this rule:

- **Never expose it to the open internet** – don't forward port 8000 (or 5173) publicly.
- For remote access, use a **VPN** (e.g. WireGuard, Tailscale) into your own LAN.
- Inside your own trusted LAN, it's fine to make it reachable for your own devices.

---

## Documentation

| Document | For |
|----------|-----|
| [Calculations](documentation/CALCULATIONS.md) | How power, training load, scores and records are computed |
| [Development](documentation/DEVELOPMENT.md) | Running from source, tests, builds, releases |
| [Architecture](documentation/ARCHITECTURE.md) | Project structure, database schema, tech stack |
| API reference | Built in: **http://localhost:8000/docs** while the backend runs |
| [Contributing](CONTRIBUTING.md) | Bug reports, feature requests, pull requests |
| [Changelog](CHANGELOG.md) | Release history |

---

## Support

WattLoom Cycling is free and open source, developed and maintained in my spare time. If it's useful to
you, a contribution is welcome — but never required. No feature will ever be paywalled.

[![Buy Me a Coffee](https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png)](https://buymeacoffee.com/saschalerst)

---

## License

**AGPL-3.0** – genuinely open source. Redistribution and modification are permitted; if you make
a modified version available to others (including as a hosted service), you must also make the
source of your changes available under AGPL-3.0. See [LICENSE](LICENSE). Copyright (c) 2026
Ashikaga1974.
