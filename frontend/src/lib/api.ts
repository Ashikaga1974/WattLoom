const BASE = 'http://localhost:8000';

export interface Activity {
  id: number;
  name: string | null;
  activity_type: string;
  start_date: string;
  distance_m: number;
  moving_time_s: number;
  elevation_gain_m: number | null;
  avg_speed_ms: number | null;
  avg_hr: number | null;
  avg_power_w: number | null;
  avg_cadence: number | null;
  calories: number | null;
  bike_id: string | null;
  has_track: number;
  manual: number;
  smart_device: string | null;
  est_avg_power_w: number | null;
  est_norm_power_w: number | null;
}

export interface SingleImportResult {
  activity_id: number;
  name: string | null;
  is_ride: boolean;
  sport_type: string;
  start_date_local: string;
}

export interface ActivitiesResponse {
  total: number;
  limit: number;
  offset: number;
  items: Activity[];
}

export interface ActivityStats {
  total_rides: number;
  total_km: number;
  total_moving_s: number;
  total_elevation_m: number;
  avg_km: number;
  avg_speed_kmh: number;
  avg_hr: number | null;
  avg_power_w: number | null;
  total_calories: number | null;
  available_years: string[];
}

export interface ActivityDetail extends Activity {
  sport_type: string;
  start_date_local: string;
  elapsed_time_s: number;
  elevation_loss_m: number | null;
  max_speed_ms: number | null;
  max_hr: number | null;
  avg_temp_c: number | null;
  max_power_w: number | null;
  commute: number;
  trainer: number;
  weather_temp_c: number | null;
  weather_wind_ms: number | null;
  weather_wind_deg: number | null;
  weather_precip_mm: number | null;
  est_avg_power_w: number | null;
  est_norm_power_w: number | null;
}

export interface WeatherStatus {
  running: boolean;
  total: number;
  done: number;
  skipped: number;
  errors: number;
  total_activities: number;
  with_weather: number;
  without_weather: number;
}

export interface Lap {
  id: number;
  lap_number: number;
  start_time: string;
  total_time_s: number;
  distance_m: number;
  avg_speed_ms: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  avg_power_w: number | null;
  avg_cadence: number | null;
  elevation_gain_m: number | null;
}

export interface TrackPoint {
  lat: number;
  lon: number;
  altitude_m: number | null;
  distance_m: number | null;
  speed_ms: number | null;
  hr: number | null;
}

export interface TrackResponse {
  points: TrackPoint[];
}

export interface WeeklyStats {
  weeks_ago: number;
  count: number;
  distance_km: number;
  moving_s: number;
  elevation_m: number;
}

export interface MonthlyStats {
  month: number;
  count: number;
  distance_km: number;
  moving_s: number;
  elevation_m: number;
}

export interface BikeComponent {
  id: number;
  bike_id: string;
  type: string;
  purchase_url: string | null;
  purchase_name: string | null;
  km_threshold: number | null;
  km_at_service: number;
  km_since_service: number;
  pct_used: number | null;
  added_at: string | null;
  retired_at: string | null;
  purchase_item_id: number | null;
  uninstalled_km: number | null;
  estimated_service_date: string | null;
}

export interface DeletedComponent {
  id: number;
  bike_id: string;
  type: string;
  km_threshold: number | null;
  km_at_service: number;
  km_since_service: number;
  added_at: string | null;
  retired_at: string | null;
  uninstalled_km: number | null;
  purchase_item_id: number | null;
  deleted_at: string;
  purchase_name: string | null;
  shop: string | null;
  url: string | null;
  price: number | null;
}

export interface Bike {
  id: string;
  name: string;
  brand: string | null;
  model: string | null;
  description: string | null;
  retired: number;
  ride_count: number;
  current_km: number;
  image_filename: string | null;
  components: BikeComponent[];
}

export interface PurchaseReturn {
  id: number;
  purchase_id: number;
  bike_id: string | null;
  component_type: string | null;
  km_ridden: number | null;
  returned_at: string | null;
}

export interface Purchase {
  id: number;
  name: string;
  shop: string | null;
  url: string | null;
  price: number | null;
  order_date: string | null;
  delivery_date: string | null;
  quantity: number;
  notes: string | null;
  component_type: string | null;
  storage_location_id: number | null;
  storage_location_name: string | null;
  returns: PurchaseReturn[];
  installed_count: number;
}

export interface StorageLocation {
  id: number;
  name: string;
}

export interface Language {
  code: string;
  name: string;
  available: boolean;
}

export interface ZoneInfo {
  zone: number;
  code: string;
  color: string;
  min_bpm?: number;
  max_bpm?: number;
  min_w?: number;
  max_w?: number;
  seconds: number;
  pct: number;
}

export interface ActivityZones {
  hr_zones: ZoneInfo[];
  power_zones: ZoneInfo[];
  hr_max: number | null;
  has_hr: boolean;
  has_power: boolean;
}

export interface PmcOtherActivity {
  sport_type: string;
  moving_time_s: number;
}

export interface PmcDay {
  date: string;
  tss: number;
  ctl: number;
  atl: number;
  tsb: number;
  rides?: number;
  other?: PmcOtherActivity[];
}

export interface WeeklyVolume {
  week_start: string;
  weeks_ago: number;
  ride_minutes: number;
  workout_minutes: number;
  weight_training_minutes: number;
}

export interface OtherActivity {
  id: number;
  name: string | null;
  date: string;
  sport_type: string;
  moving_time_s: number;
  calories: number | null;
  avg_hr: number | null;
  max_hr: number | null;
}

export interface WorkoutHistoryEntry {
  id: number;
  start_date_local: string;
  moving_time_s: number;
  calories: number | null;
  avg_hr: number | null;
  max_hr: number | null;
}

export interface WorkoutDetail {
  id: number;
  name: string | null;
  sport_type: string;
  start_date_local: string;
  moving_time_s: number;
  elapsed_time_s: number;
  avg_hr: number | null;
  max_hr: number | null;
  calories: number | null;
  history: WorkoutHistoryEntry[];
  avg_moving_time_s: number | null;
  avg_calories: number | null;
  history_count: number;
}

export interface PmcResponse {
  days: PmcDay[];
  peak_ctl: { value: number; date: string } | null;
  current: PmcDay | null;
  max_hr: number;
  threshold_hr: number;
}

export interface SimilarActivity {
  id: number;
  name: string | null;
  start_date: string;
  distance_m: number;
  moving_time_s: number;
  avg_speed_ms: number | null;
  avg_hr: number | null;
  elevation_gain_m: number | null;
  start_distance_km: number;
  path_match_pct: number | null;
  weather_temp_c: number | null;
  weather_wind_ms: number | null;
}

export interface SimilarActivitiesResponse {
  reference_id: number;
  similar: SimilarActivity[];
}

export interface BestByDistanceBucket {
  distance_km: number;
  best_speed_kmh: number | null;
  best_time_s: number | null;
  activity_id: number | null;
  activity_name: string | null;
  smart_device: string | null;
  date: string | null;
  actual_distance_km: number | null;
}

export interface PrEvent {
  id: number;
  distance_km: number;
  best_time_s: number;
  best_speed_kmh: number | null;
  activity_id: number;
  activity_name: string | null;
  previous_time_s: number;
  created_at: string;
}


export interface CadenceStats {
  rides_with_cadence: number;
  total_points: number;
  avg_cadence: number;
  max_cadence: number;
  mode_cadence: number;
}

export interface CadenceDistributionPoint {
  cadence: number;
  count: number;
}

export interface CadenceMonthly {
  month: string;
  avg_cadence: number;
  rides: number;
}

export interface CadenceZone {
  name: string;
  min: number;
  max: number;
  count: number;
}

export interface CadenceEfficiency {
  cadence_mid: number;
  avg_speed_kmh: number;
  avg_hr: number;
  count: number;
}

export interface CadenceData {
  stats: CadenceStats;
  distribution: CadenceDistributionPoint[];
  monthly: CadenceMonthly[];
  zones: CadenceZone[];
  efficiency: CadenceEfficiency[];
}

export interface SpeedTrendRide {
  id: number;
  name: string | null;
  date: string;
  speed_kmh: number;
  dist_km: number;
  elevation_m: number;
  bike_id: string | null;
  year: number;
}

export interface SpeedTrendYear {
  year: number;
  avg_kmh: number;
  best_kmh: number;
  median_kmh: number;
  rides: number;
  delta_kmh: number | null;
}

export interface SpeedTrendMonth {
  month: string;
  avg_kmh: number;
  rides: number;
}

export interface SpeedTrendData {
  rides: SpeedTrendRide[];
  rolling: { date: string; rolling_kmh: number }[];
  by_year: SpeedTrendYear[];
  monthly_heatmap: SpeedTrendMonth[];
  stats: {
    total_rides: number;
    overall_avg_kmh: number;
    best_kmh: number;
    best_ride_id: number | null;
    best_ride_name: string | null;
    best_ride_date: string | null;
    first_date: string;
    last_date: string;
  };
}

export interface BikeCompareSummary {
  id: string;
  name: string;
  rides: number;
  total_km: number;
  total_elevation_m: number;
  total_hours: number;
  avg_dist_km: number;
  avg_speed_kmh: number;
  avg_elevation_m: number;
  total_cost: number;
  cost_per_100km: number | null;
}

export interface BikeCompareYearly {
  year: string;
  bikes: Record<string, { rides: number; avg_speed_kmh: number }>;
}

export interface BikeCompareData {
  summary: BikeCompareSummary[];
  yearly: BikeCompareYearly[];
  distances: Record<string, number[]>;
}

export interface WrappedData {
  year: number;
  available_years: number[];
  totals: {
    rides: number;
    distance_km: number;
    moving_hours: number;
    elevation_m: number;
    calories: number;
  };
  vs_prev_year: { rides_pct: number; distance_pct: number } | null;
  best_ride: { id: number; name: string | null; date: string; distance_km: number; moving_time_s: number } | null;
  most_elevation_ride: { id: number; name: string | null; date: string; elevation_m: number; distance_km: number } | null;
  fastest_ride: { id: number; name: string | null; date: string; avg_speed_kmh: number; distance_km: number } | null;
  best_month: { month: number; distance_km: number; rides: number } | null;
  best_week: { week_start: string; distance_km: number; rides: number } | null;
  longest_streak: { days: number; from: string; to: string } | null;
  rides_by_weekday: number[];
  rides_by_hour: number[];
  favorite_bike: { id: string; name: string; rides: number; distance_km: number } | null;
  monthly_km: number[];
}

export interface Settings {
  language: string;
  weight_kg: number | null;
  birth_year: number | null;
  tz_offset: number | null;
  hr_max: number;
  bezier_tension: number;
  sparkline_weeks: number;
  speed_color_buckets: number;
  track_simplify_m: number;
  yearly_km_goal: number | null;
  weekly_hours_goal: number | null;
  default_bike_id: string;
  crr: number;
  cda: number;
  bike_kg: number;
  threshold_hr_pct: number;
  ctl_days: number;
  atl_days: number;
  max_plausible_speed_ms: number;
  wear_warning_pct: number;
  path_match_radius_km: number;
  comparison_simplify: number;
  block_hours: number;
  volume_trend_weeks: number;
  chart_height_mini: number;
  chart_height_compact: number;
  chart_height: number;
  chart_height_dense: number;
  comparison_colors: string;
}

export interface FitnessComponent {
  score: number;
  max: number;
  value: number | null;
  percentile?: number | null;
  label: string;
}

export interface FitnessFingerprint {
  score: number;
  level: string;
  components: {
    ctl: FitnessComponent;
    efficiency: FitnessComponent;
    form: FitnessComponent;
    consistency: FitnessComponent;
  };
  trend: 'up' | 'down' | 'neutral';
  insight_parts: string[];
  history: { month: string; score: number; level: string }[];
}

// HTTPException.detail ist inzwischen teils ein reiner String (nicht umgestellte Endpunkte),
// teils {code, message} (siehe backend/api/errors.py) – hier vereinheitlicht extrahiert,
// damit new Error(...) nie "[object Object]" als Message bekommt.
function errorMessage(detail: unknown, status: number): string {
  if (typeof detail === 'string') return detail;
  if (detail && typeof detail === 'object' && 'message' in detail) {
    return String((detail as { message: unknown }).message);
  }
  return `Fehler ${status}`;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`API ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) return res.json().then(j => { throw new Error(errorMessage(j.detail, res.status)); });
  return res.json() as Promise<T>;
}

export function buildQuery(params: Record<string, string | number | boolean | null | undefined>): string {
  const q = Object.entries(params)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join('&');
  return q ? `?${q}` : '';
}

export const api = {
  activities: (params?: Record<string, string | number | boolean | null | undefined>) =>
    get<ActivitiesResponse>(`/activities${buildQuery(params ?? {})}`),

  topActivities: (sort_by: string, limit = 5) =>
    get<ActivitiesResponse>(`/activities${buildQuery({ sort_by, sort_dir: 'desc', limit })}`),

  activityStats: (year?: number) =>
    get<ActivityStats>(`/activities/stats${buildQuery({ year })}`),

  weeklyStats: (weeks = 8) =>
    get<WeeklyStats[]>(`/activities/weekly${buildQuery({ weeks })}`),

  monthlyStats: (year: number) =>
    get<MonthlyStats[]>(`/activities/monthly${buildQuery({ year })}`),

  monthlyAll: () =>
    get<{ year: number; month: number; distance_km: number; count: number }[]>('/activities/monthly-all'),

  activity: (id: number) =>
    get<ActivityDetail>(`/activities/${id}`),

  activityMedia: (id: number) =>
    get<{ files: string[] }>(`/activities/${id}/media`),

  activityZones: (id: number) =>
    get<ActivityZones>(`/activities/${id}/zones`),

  similarActivities: (id: number, limit = 10) =>
    get<SimilarActivitiesResponse>(`/activities/${id}/similar${buildQuery({ limit })}`),

  mediaUrl: (filename: string) => `${BASE}/media/${filename}`,

  activityTrack: (id: number, simplify: number) =>
    get<TrackResponse>(`/activities/${id}/track${buildQuery({ simplify, fields: 'lat,lon,altitude_m,distance_m,speed_ms,hr' })}`),

  bikes: () =>
    get<Bike[]>('/bikes'),

  bike: (id: string) =>
    get<Bike>(`/bikes/${id}`),

  heatmap: (simplify: number, year?: number) =>
    get<{ count: number; points: [number, number][] }>(`/tracks/heatmap${buildQuery({ simplify, year })}`),

  hrCurve: (year?: number) =>
    get<{ durations_s: number[]; labels: string[]; best_hr: number[] }>(`/analytics/hr-curve${buildQuery({ year })}`),

  timeHeatmap: (year?: number, tz_offset?: number) =>
    get<{ cells: {
      weekday: number; hour: number;
      ride_count: number; ride_minutes: number;
      workout_count: number; workout_minutes: number;
    }[] }>(`/analytics/time-heatmap${buildQuery({ year, tz_offset })}`),

  speedHr: () =>
    get<{ points: { year: number; month: string; speed_kmh: number; hr: number; dist_km: number }[] }>('/analytics/speed-hr'),

  yearProgress: () =>
    get<{ years: Record<string, [number, number][]> }>('/analytics/year-progress'),

  getSettings: () =>
    get<Settings>('/settings'),

  saveSettings: (settings: Partial<Settings>) =>
    fetch(`${BASE}/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    }).then(r => {
      if (!r.ok) throw new Error(`API /settings → ${r.status}`);
      return r.json() as Promise<Settings>;
    }),

  tempCorrelation: () =>
    get<{ points: { temp_c: number; speed_kmh: number; hr: number; year: number; dist_km: number }[] }>('/analytics/temp-correlation'),

  windImpact: () =>
    get<{ points: { wind_ms: number; speed_kmh: number; hr: number; dist_km: number }[] }>('/analytics/wind-impact'),

  calories: (year?: number | null) =>
    get<{
      total_kcal: number;
      total_kcal_workouts: number;
      rides: number;
      workouts: number;
      avg_kcal: number;
      avg_kcal_workouts: number | null;
      kcal_per_hour: number | null;
      monthly: { month: string; kcal: number; kcal_workouts: number; rides: number; workouts: number; avg_kcal: number }[];
      yearly: { year: string; kcal: number; kcal_workouts: number; rides: number; workouts: number; avg_kcal: number }[];
    }>(`/analytics/calories${year ? `?year=${year}` : ''}`),

  pmc: () =>
    get<PmcResponse>('/analytics/pmc'),

  startImport: () =>
    fetch(`${BASE}/import/start`, { method: 'POST' })
      .then(r => {
        if (!r.ok) throw new Error(`API /import/start → ${r.status}`);
        return r.json() as Promise<{ status: string; message?: string }>;
      }),

  importStatus: () =>
    get<{ status: string; log: string[]; zip_name: string | null }>('/import/status'),

  resetDb: () =>
    fetch(`${BASE}/import/reset`, { method: 'POST' })
      .then(r => {
        if (!r.ok) throw new Error(`API /import/reset → ${r.status}`);
        return r.json() as Promise<{ ok: boolean; message?: string; backup?: string }>;
      }),

  bikeCompare: (): Promise<BikeCompareData> => get('/bikes/compare'),

  wrapped: (year?: number, tz_offset?: number): Promise<WrappedData> =>
    get(`/analytics/wrapped${buildQuery({ year, tz_offset })}`),

  weeklyVolume: (weeks = 52): Promise<WeeklyVolume[]> =>
    get(`/analytics/weekly-volume${buildQuery({ weeks })}`),

  bestByDistance: (): Promise<{ buckets: BestByDistanceBucket[] }> =>
    get('/analytics/best-by-distance'),

  prEvents: (): Promise<PrEvent[]> => get('/analytics/pr-events'),

  dismissPrEvent: (id: number) =>
    fetch(`${BASE}/analytics/pr-events/${id}`, { method: 'DELETE' }).then(r => {
      if (!r.ok) throw new Error(`API /analytics/pr-events/${id} → ${r.status}`);
      return r.json() as Promise<{ ok: boolean }>;
    }),

  otherActivities: (year?: number): Promise<OtherActivity[]> =>
    get(`/activities/other${buildQuery({ year })}`),

  workout: (id: number): Promise<WorkoutDetail> =>
    get(`/activities/other/${id}`),

  cadence: (year?: number): Promise<CadenceData> =>
    get(`/analytics/cadence${buildQuery({ year })}`),

  updateActivityPower: (id: number, avg_power_w: number | null): Promise<{ ok: boolean; activity_id: number; avg_power_w: number | null }> =>
    fetch(`${BASE}/activities/${id}/power`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ avg_power_w }),
    }).then(r => {
      if (!r.ok) return r.json().then(j => { throw new Error(errorMessage(j.detail, r.status)); });
      return r.json();
    }),

  deleteActivity: (id: number): Promise<{ ok: boolean; deleted_id: number }> =>
    fetch(`${BASE}/activities/${id}`, { method: 'DELETE' }).then(r => {
      if (!r.ok) return r.json().then(j => { throw new Error(errorMessage(j.detail, r.status)); });
      return r.json() as Promise<{ ok: boolean; deleted_id: number }>;
    }),

  weatherStatus: (): Promise<WeatherStatus> =>
    get('/weather/status'),

  weatherFetchAll: (): Promise<{ ok: boolean; message?: string }> =>
    fetch(`${BASE}/weather/fetch-all`, { method: 'POST' }).then(r => {
      if (!r.ok) throw new Error(`API /weather/fetch-all → ${r.status}`);
      return r.json() as Promise<{ ok: boolean; message?: string }>;
    }),

  speedTrend: (): Promise<SpeedTrendData> =>
    get('/analytics/speed-trend'),

  weekendWeekday: (year?: number) =>
    get<{
      weekday: {
        rides: number; avg_km: number; avg_kmh: number;
        avg_elevation_m: number; avg_hr: number | null;
        total_km: number; avg_duration_min: number; avg_calories: number | null;
      };
      weekend: {
        rides: number; avg_km: number; avg_kmh: number;
        avg_elevation_m: number; avg_hr: number | null;
        total_km: number; avg_duration_min: number; avg_calories: number | null;
      };
      by_weekday: { weekday_idx: number; rides: number; avg_km: number; avg_kmh: number }[];
      monthly: { month: string; weekend_km: number; weekday_km: number; weekend_rides: number; weekday_rides: number }[];
    }>(`/analytics/weekend-weekday${buildQuery({ year })}`),

  fitnessFingerprint: (): Promise<FitnessFingerprint> =>
    get('/analytics/fitness-fingerprint'),

  importFitFile: (file: File, bikeId?: string): Promise<SingleImportResult> => {
    const form = new FormData();
    form.append('file', file);
    if (bikeId) form.append('bike_id', bikeId);
    return fetch(`${BASE}/import/fit-file`, { method: 'POST', body: form }).then(r => {
      if (!r.ok) return r.json().then(j => { throw new Error(errorMessage(j.detail, r.status)); });
      return r.json() as Promise<SingleImportResult>;
    });
  },

  importTcxFile: (file: File, bikeId?: string): Promise<SingleImportResult> => {
    const form = new FormData();
    form.append('file', file);
    if (bikeId) form.append('bike_id', bikeId);
    return fetch(`${BASE}/import/tcx-file`, { method: 'POST', body: form }).then(r => {
      if (!r.ok) return r.json().then(j => { throw new Error(errorMessage(j.detail, r.status)); });
      return r.json() as Promise<SingleImportResult>;
    });
  },

  importGpxFile: (file: File, bikeId?: string): Promise<SingleImportResult> => {
    const form = new FormData();
    form.append('file', file);
    if (bikeId) form.append('bike_id', bikeId);
    return fetch(`${BASE}/import/gpx-file`, { method: 'POST', body: form }).then(r => {
      if (!r.ok) return r.json().then(j => { throw new Error(errorMessage(j.detail, r.status)); });
      return r.json() as Promise<SingleImportResult>;
    });
  },

  recalculatePower: (): Promise<{ ok: boolean; message: string }> =>
    fetch(`${BASE}/import/recalculate-power`, { method: 'POST' })
      .then(r => { if (!r.ok) throw new Error(`Fehler ${r.status}`); return r.json(); }),

  appSyncStatus: (): Promise<{ last_synced_at: string | null; last_status: string | null; last_message: string | null }> =>
    get('/app-sync/status'),

  appSyncRun: (): Promise<{ ok: boolean; message: string; ran_at: string }> =>
    fetch(`${BASE}/app-sync/run`, { method: 'POST' })
      .then(r => { if (!r.ok) throw new Error(`Fehler ${r.status}`); return r.json(); }),

  updateBike: (bikeId: string, name: string): Promise<{ ok: boolean }> =>
    fetch(`${BASE}/bikes/${bikeId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
      .then(r => { if (!r.ok) throw new Error(`Fehler ${r.status}`); return r.json(); }),

  addBikeComponent: (bikeId: string, data: { type: string; km_threshold: number; installed_at?: string; purchase_id?: number; return_id?: number }) =>
    post<{ ok: boolean }>(`/bikes/${bikeId}/components`, data),

  updateBikeComponent: (bikeId: string, compId: number, data: { type: string; km_threshold: number; installed_at?: string }) =>
    fetch(`${BASE}/bikes/${bikeId}/components/${compId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      .then(r => { if (!r.ok) throw new Error(`Fehler ${r.status}`); return r.json(); }),

  uninstallBikeComponent: (bikeId: string, compId: number, kmRidden: number, purchaseId?: number): Promise<{ ok: boolean }> =>
    fetch(`${BASE}/bikes/${bikeId}/components/${compId}/uninstall`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ km_ridden: kmRidden, purchase_id: purchaseId }) })
      .then(r => { if (!r.ok) throw new Error(`Fehler ${r.status}`); return r.json(); }),

  returnComponentToStock: (bikeId: string, compId: number, purchaseId: number): Promise<{ ok: boolean }> =>
    fetch(`${BASE}/bikes/${bikeId}/components/${compId}/return-to-stock`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ purchase_id: purchaseId }) })
      .then(r => { if (!r.ok) throw new Error(`Fehler ${r.status}`); return r.json(); }),

  linkComponentPurchase: (bikeId: string, compId: number, purchaseId: number): Promise<{ ok: boolean }> =>
    fetch(`${BASE}/bikes/${bikeId}/components/${compId}/link-purchase`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ purchase_id: purchaseId }) })
      .then(r => { if (!r.ok) throw new Error(`Fehler ${r.status}`); return r.json(); }),

  resetBikeComponent: (bikeId: string, compId: number): Promise<{ ok: boolean }> =>
    fetch(`${BASE}/bikes/${bikeId}/components/${compId}/reset`, { method: 'PUT' })
      .then(r => { if (!r.ok) throw new Error(`Fehler ${r.status}`); return r.json(); }),

  deleteBikeComponent: (bikeId: string, compId: number): Promise<{ ok: boolean }> =>
    fetch(`${BASE}/bikes/${bikeId}/components/${compId}`, { method: 'DELETE' })
      .then(r => { if (!r.ok) throw new Error(`Fehler ${r.status}`); return r.json(); }),

  toggleBikeRetired: (bikeId: string): Promise<{ ok: boolean; retired: number }> =>
    fetch(`${BASE}/bikes/${bikeId}/toggle-retired`, { method: 'PUT' })
      .then(r => { if (!r.ok) throw new Error(`Fehler ${r.status}`); return r.json(); }),

  deletedComponents: (): Promise<DeletedComponent[]> => get<DeletedComponent[]>('/bikes/deleted-components'),

  uploadBikeImage: (bikeId: string, file: File): Promise<{ ok: boolean; filename: string }> => {
    const form = new FormData();
    form.append('file', file);
    return fetch(`${BASE}/bikes/${bikeId}/image`, { method: 'POST', body: form })
      .then(r => { if (!r.ok) return r.json().then(j => { throw new Error(errorMessage(j.detail, r.status)); }); return r.json(); });
  },

  bikeImageUrl: (bikeId: string) => `${BASE}/bikes/${bikeId}/image`,

  listPurchases: (): Promise<Purchase[]> =>
    fetch(`${BASE}/purchases`).then(r => { if (!r.ok) throw new Error(`Fehler ${r.status}`); return r.json(); }),

  addPurchase: (data: Omit<Purchase, 'id' | 'returns' | 'installed_count' | 'storage_location_name'>): Promise<Purchase> =>
    fetch(`${BASE}/purchases`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      .then(r => { if (!r.ok) throw new Error(`Fehler ${r.status}`); return r.json(); }),

  updatePurchase: (id: number, data: Omit<Purchase, 'id' | 'returns' | 'installed_count' | 'quantity' | 'storage_location_name'>): Promise<Purchase> =>
    fetch(`${BASE}/purchases/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      .then(r => { if (!r.ok) throw new Error(`Fehler ${r.status}`); return r.json(); }),

  adjustPurchaseQuantity: (id: number, delta: number): Promise<{ ok: boolean; quantity: number }> =>
    fetch(`${BASE}/purchases/${id}/adjust`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ delta }) })
      .then(r => { if (!r.ok) throw new Error(`Fehler ${r.status}`); return r.json(); }),

  deletePurchase: (id: number): Promise<void> =>
    fetch(`${BASE}/purchases/${id}`, { method: 'DELETE' }).then(r => {
      if (!r.ok && r.status !== 204) return r.json().then(j => { throw new Error(errorMessage(j.detail, r.status)); });
    }),

  listStorageLocations: (): Promise<StorageLocation[]> =>
    fetch(`${BASE}/storage-locations`).then(r => { if (!r.ok) throw new Error(`Fehler ${r.status}`); return r.json(); }),

  addStorageLocation: (name: string): Promise<StorageLocation> =>
    fetch(`${BASE}/storage-locations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
      .then(r => { if (!r.ok) return r.json().then(j => { throw new Error(errorMessage(j.detail, r.status)); }); return r.json(); }),

  renameStorageLocation: (id: number, name: string): Promise<StorageLocation> =>
    fetch(`${BASE}/storage-locations/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
      .then(r => { if (!r.ok) return r.json().then(j => { throw new Error(errorMessage(j.detail, r.status)); }); return r.json(); }),

  deleteStorageLocation: (id: number): Promise<void> =>
    fetch(`${BASE}/storage-locations/${id}`, { method: 'DELETE' }).then(r => {
      if (!r.ok && r.status !== 204) return r.json().then(j => { throw new Error(errorMessage(j.detail, r.status)); });
    }),

  getLanguages: (): Promise<Language[]> =>
    fetch(`${BASE}/translations/languages`).then(r => { if (!r.ok) throw new Error(`Fehler ${r.status}`); return r.json(); }),

  exportTranslations: (lang: string): Promise<Record<string, Record<string, unknown>>> =>
    fetch(`${BASE}/translations/export?lang=${lang}`).then(r => { if (!r.ok) throw new Error(`Fehler ${r.status}`); return r.json(); }),

  importTranslations: (lang: string, translations: Record<string, Record<string, unknown>>): Promise<void> =>
    fetch(`${BASE}/translations/import`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lang, translations }) })
      .then(r => { if (!r.ok) return r.json().then(j => { throw new Error(errorMessage(j.detail, r.status)); }); }),
};
