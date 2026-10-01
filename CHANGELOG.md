# Changelog

## v1.2.0 – 2026-10-01

- "What changed?" on the progress tab: compares the last 30/90/365 days with the same days last year or the days before (volume, speed, HR, efficiency, fitness, best efforts) and highlights notable changes
- Monthly overview: 12-month average line, year markers and best month; empty months now count as 0 km, bogus pre-2000 dates are skipped
- Estimated power and HR-based training load are labelled as such
- Fitness score shows the change vs. last year instead of level labels; the trend states its 3-month period
- Faster zone distribution (cached like best efforts and heatmap)
- Docker binds to localhost by default. **If you access WattLoom from other devices in your LAN**, start it with `WATTLOOM_BIND=0.0.0.0 docker compose up --build`

## v1.1.1 – 2026-09-28

- App name extended to "WattLoom Cycling" (UI, onboarding, README, landing page)

## v1.1.0 – 2026-09-27

- Recovery time estimate after activities/workouts (rough heuristic based on hrTSS/IF, no HRV measurement)
- Yearly average temperature line in the weather history (/tempcorr)
- Lap-based cadence analysis + cadence chart on the activity detail page
- Dark mode toggle in settings
- GitHub Pages landing page
- Power estimate: time-based NP window logic instead of point count, avg_power_w time-weighted over moving phases (standstill excluded)
- Settings: domain validation (weight_kg, birth_year, hr_max, crr, cda, bike_kg)
- Toned down the accuracy claim for the power estimate, hardened the media endpoint

## v1.0.2 – 2026-09-13

Setup wizard, import page split out, has_media label

## v1.0.1 – 2026-09-12

- Fixed Wahoo FIT import (device detection, deleting activities with segments)
- New gradient chart (grade_pct) on the activity detail page
- Segment data (segment_efforts) extended with UUID/coordinates, fixed duration tracking for Wahoo devices

## v1.0.0 – 2026-09-10

First open-source release (Git tag `v1.0.0`).

- AGPL-3.0 license, security notice, basic contributing setup
- Docker packaging (multi-stage build, `docker-compose.yml`)
- README (DE+EN) updated, demo video/GIF added
- PR events are now only marked inactive when dismissed/superseded instead of being deleted (history is preserved)
- Version number visible in the sidebar footer, `scripts/bump_version.py` for future releases
