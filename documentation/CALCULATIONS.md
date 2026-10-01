# Calculations

WattLoom derives many values from your recorded data. Some of them look like measurements but
are **models or heuristics**. This page explains how each value is computed, so you can judge
how much to trust it.

The in-app page **Calculations** (`/calculations`) shows the same formulas together with your
current parameter values.

Parameters marked ⚙️ can be changed in **Settings**.

---

## Estimated power

*Source: `backend/importer/power_estimator.py`*

Without a power meter, power is estimated from the GPS track using a physical model:

```
P = P_roll + P_gravity + P_aero
  = m·g·Crr·v  +  m·g·gradient·v  +  ½·ρ·CdA·v³
```

| Input | Value |
|-------|-------|
| `m` | rider weight ⚙️ + bike weight ⚙️ (default 8 kg) |
| `Crr` | rolling resistance ⚙️ (default 0.004, road tyres on asphalt) |
| `CdA` | drag area ⚙️ (default 0.32 m², drops position) |
| `v` | speed per track point |
| `gradient` | from altitude (smoothed over 7 points) and horizontal distance, capped at ±40 % |
| `ρ` | air density from altitude and temperature (barometric formula; temperature from the weather data, otherwise 15 °C) |

Details:

- Negative power (descents, coasting) is clamped to 0.
- Points below 0.5 m/s count as standstill.
- **Average power** is time-weighted over moving phases only – stops don't pull it down.
- **Normalized Power (NP)** follows Coggan: 30-second rolling average, then
  `(mean(rolling⁴))^¼`. Standstill counts as 0 W here, and only complete 30 s windows are used.
- At least 20 track points are required. Without altitude data, gradient is 0 and 200 m is
  assumed for air density.

> ⚠️ **This is an estimate, not a measurement.** The model does **not** know wind (only your
> forward speed), acceleration, or your real CdA/Crr. GPS altitude noise directly affects the
> gradient term. Accuracy varies with conditions and cannot be expressed as a fixed percentage.
> Do not treat it as equivalent to a power meter.

---

## Heart rate basics

*Source: `backend/api/analytics/_shared.py`, `backend/api/zones.py`*

- **HRmax**: the highest `max_hr` ever recorded in your activities. Only if there is none, the
  configured value ⚙️ (default 185) is used.
- **Threshold HR** = `threshold_hr_pct` ⚙️ × HRmax (default 0.85).

### HR zones

Share of HRmax:

| Zone | Name | Range |
|------|------|-------|
| 1 | Recovery | < 60 % |
| 2 | Endurance | 60–70 % |
| 3 | Tempo | 70–80 % |
| 4 | Threshold | 80–90 % |
| 5 | VO2max | ≥ 90 % |

Time in zone is summed from the gaps between track points; gaps longer than 10 s (GPS dropouts,
pauses) are ignored.

The **training distribution** page groups zones into *easy* (1+2), *moderate* (3) and
*hard* (4+5) and compares the result against the 80/20 rule of thumb.

### Beta-blocker correction (optional)

Beta blockers dampen the heart-rate response under load, so measured HR underestimates the
real effort. If enabled ⚙️, a fixed correction is added:

```
corrected_hr = hr + correction_pct × HRmax        (default correction_pct = 8 %)
```

An optional "valid from" date ⚙️ prevents applying it to rides before medication started.

This is a **self-calibrated value, not a medical formula** – there is no general way to derive
the real effect without lab testing. It affects HR zones, training distribution, hrTSS/PMC and
the fitness fingerprint. Aerobic efficiency is deliberately **not** corrected, because it is a
measured ratio.

---

## Training load (hrTSS) and PMC

*Source: `backend/api/analytics/pmc.py`*

Training stress per activity, based on heart rate:

```
IF    = avg_hr / threshold_hr          (avg_hr optionally corrected, see above)
hrTSS = duration_h × IF² × 100
```

- Duration = moving time (fallback: elapsed time).
- Without HR data: `duration_h × 50` (assumes moderate intensity).
- Workouts (strength, running, …) are included with the same formula.

Daily hrTSS values feed the **Performance Management Chart**:

| Metric | Formula |
|--------|---------|
| **CTL** (fitness) | exponential moving average over `ctl_days` ⚙️ (default 42), `k = 2 / (N + 1)` |
| **ATL** (fatigue) | exponential moving average over `atl_days` ⚙️ (default 7) |
| **TSB** (form) | `CTL − ATL` – positive = fresh, negative = tired |

```
CTL_today = CTL_yesterday + k × (TSS_today − CTL_yesterday)
```

### Recovery time (heuristic)

```
recovery_h = base_h × (hrTSS / 100) × IF^exponent       (defaults: base_h = 6, exponent = 2)
```

Capped at 72 h, rounded to half hours. This is a rough rule of thumb derived from training
load – **not** an HRV or physiological measurement.

---

## Aerobic efficiency

```
efficiency = avg_speed_kmh / avg_hr × 100
```

Aggregated per month (only months with at least 2 rides with HR data). Higher = more speed per
heartbeat. Speed also depends on route, wind and temperature, so read it as a long-term trend,
not per ride.

---

## Fitness fingerprint (score 0–100)

*Source: `backend/api/analytics/pmc.py` → `fitness_fingerprint()`*

| Component | Points | Rule |
|-----------|--------|------|
| Fitness (CTL) | 0–35 | linear, CTL 80 or higher = 35 |
| Aerobic efficiency | 0–25 | percentile of your recent efficiency (average of the last 3 months) within **your own** history |
| Form (TSB) | 0–20 | 20 at TSB 5–20, 16 at 20–30, 14 at 0–5, 10 above 30, 9 at −10–0, 4 at −20…−10, otherwise 0 |
| Consistency | 0–20 | active weeks (≥ 1 ride) out of the last 8 weeks × 2.5 |

The UI shows the score and its change versus the same month one year earlier. The API
still returns a `level` field (Beginner < 30 ≤ Active < 45 ≤ Enthusiast < 60 ≤ Advanced < 75 ≤
Amateur < 90 ≤ Elite), but it is no longer displayed, because such labels read like an objective
rating.

The score is a **personal index** for tracking your own development. The thresholds are
WattLoom's own choice, not a scientific standard, and the efficiency part is relative to your
own history – scores are not comparable between riders.

---

## Best efforts

*Source: `backend/api/analytics/best_by_distance.py`*

For each target distance (5, 10, 15 … 70 km), WattLoom searches all rides for the fastest
**continuous segment** of exactly that length (sliding window over cumulative distance and time),
similar to Strava's best efforts.

GPS jumps are filtered: the distance gained per track-point step is capped at
`max_plausible_speed_ms` ⚙️ (default 25 m/s = 90 km/h). Otherwise a single signal loss could
produce an unrealistic record.

New personal records are detected by comparing best efforts before and after each import.

---

## Similar rides (route comparison)

*Source: `backend/api/activities.py`, `backend/utils.py` → `path_match_fraction()`*

1. **Prefilter**: start point within 2 km and total distance within ±3 %.
2. **Track matching**: every 2 km along the route, check whether both rides pass within
   `path_match_radius_km` ⚙️ (default 0.5 km) of each other.
3. A candidate is kept only with **≥ 85 %** matching marks **and** no more than one miss in a
   row – a single miss is tolerated as GPS noise, a longer run means a different route section.

---

## Custom segments

*Source: `backend/segment_matching.py`*

A segment is a section you mark on one of your rides. Every ride with a track is checked
against it using the same distance-mark principle as the route comparison:

- The effort starts at the track point **nearest** to the segment start.
- Standstill at the start and in the last 50 m before the end is excluded.
- **Elapsed time** (default, like Strava): stops in the middle of the segment count.
- **Moving time** (toggle on the segment pages): stops are subtracted. A stop is a standstill
  of at least 5 s in a row – shorter "zero-distance" steps are ignored, because some sensors
  update the distance only every 2–3 s while still riding.
- Direction matters – riding the same road the other way does not match.
- Power per effort uses the estimated power model above.

---

## What changed? (period comparison)

*Source: `backend/api/analytics/period_comparison.py` → `period_comparison()`*

Compares the last 30, 90 or 365 days with either the same days one year earlier (default,
because cycling is strongly seasonal) or the same number of days right before. Rides only.

| Metric | Rule |
|--------|------|
| Avg speed | total distance / total moving time – long rides weigh more than short ones |
| Avg HR | time-weighted, rides with HR only |
| Efficiency | speed of the rides with HR / avg HR × 100 – no beta-blocker correction (measured value) |
| Active weeks | ISO weeks with at least one ride |
| Fitness (CTL) | CTL from the PMC on the last day of each window |
| Best efforts | fastest 10/20/30/50 km segment, only within the rides of that window |

Statements appear only if both windows have at least 5 rides (HR statements: 5 rides with HR)
and the change exceeds a fixed threshold:

| Statement | Threshold |
|-----------|-----------|
| More / less volume | distance ±10 % |
| Faster / slower | avg speed ±0.5 km/h; "at a similar heart rate" if avg HR differs by ≤ 3 bpm |
| Efficiency up / down | ±3 % (skipped if "faster/slower at a similar heart rate" already says it) |
| Best efforts | ±1 % per distance, only distances with a value in both windows |
| Fitness | CTL ±3 |
| Consistency | active weeks ±2 |

Speed and efficiency also reflect route choice, wind and weather – the comparison shows a
tendency over many rides, not a cause.

---

## Year-end forecast

```
forecast_km = (km_so_far / day_of_year) × 365
```

A simple linear projection – assumes you keep riding at your average pace so far this year.

---

## Monthly overview (12-month average)

```
avg_12m(month) = (km of this month + km of the 11 months before) / 12
```

Before the 12th month the chart shows the average of all months so far as a dashed line – it
does not yet contain every season exactly once, so it does not fully even out the seasons. Months without rides count as 0 km (the backend fills
gaps between the first and the last month with data).

