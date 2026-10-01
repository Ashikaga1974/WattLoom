# Changelog

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
