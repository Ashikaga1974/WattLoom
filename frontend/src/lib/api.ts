import { TRACK_SIMPLIFY_M } from './config';

const BASE = 'http://localhost:8000';

export interface Activity {
  id: number;
  name: string;
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

export interface Bike {
  id: string;
  name: string;
  brand: string | null;
  model: string | null;
  description: string | null;
  retired: number;
  ride_count: number;
}

export interface ZoneInfo {
  zone: number;
  label: string;
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
  name: string;
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
  name: string;
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
  name: string;
  start_date: string;
  distance_m: number;
  moving_time_s: number;
  avg_speed_ms: number | null;
  avg_hr: number | null;
  elevation_gain_m: number | null;
  start_distance_km: number;
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
  date: string | null;
  actual_distance_km: number | null;
}

export interface RouteClusterRide {
  id: number;
  name: string;
  date: string;
  moving_time_s: number;
  distance_m: number;
  avg_speed_ms: number | null;
  avg_hr: number | null;
}

export interface RouteCluster {
  ride_count: number;
  avg_distance_m: number;
  best_time_s: number;
  best_time_id: number;
  best_time_date: string;
  avg_time_s: number;
  last_ridden: string;
  avg_speed_ms: number | null;
  avg_hr: number | null;
  representative_id: number;
  center_lat: number;
  center_lon: number;
  trend_slope: number;
  rides: RouteClusterRide[];
}

export interface RouteClustersResponse {
  clusters: RouteCluster[];
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

export interface FatigueRide {
  activity_id: number;
  activity_name: string;
  date: string;
  dist_km: number;
  fatigue_pct: number;
  spd_h1_kmh: number;
  spd_h2_kmh: number;
  wind_ms: number | null;
  wind_deg: number | null;
  headwind_ms: number | null;
  weather_temp_c: number | null;
  weather_precip_mm: number | null;
}

export interface FatigueRideDetail {
  fatigue_pct: number;
  activity_id: number;
  activity_name: string;
  date: string;
  dist_km: number;
  spd_h1_kmh: number;
  spd_h2_kmh: number;
}

export interface FatigueData {
  stats: {
    rides_analyzed: number;
    avg_fatigue_pct: number | null;
    steigerung_count: number;
    ermuedung_count: number;
  };
  best_steigerung: FatigueRideDetail | null;
  worst_ermuedung: FatigueRideDetail | null;
  distribution: { bucket: number; count: number }[];
  monthly: { month: string; avg_fatigue_pct: number; rides: number; neg_split_pct: number }[];
  rides: FatigueRide[];
  by_distance: { label: string; avg_fatigue_pct: number | null; rides: number }[];
}

export interface FatigueTrackData {
  stats: {
    rides_analyzed: number;
    avg_fatigue_pct: number | null;
    steigerung_count: number;
    ermuedung_count: number;
  };
  best_steigerung: FatigueRideDetail | null;
  worst_ermuedung: FatigueRideDetail | null;
  distribution: { bucket: number; count: number }[];
  rides: FatigueRide[];
}

export interface SpeedTrendRide {
  id: number;
  name: string;
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
  best_ride: { id: number; name: string; date: string; distance_km: number; moving_time_s: number } | null;
  most_elevation_ride: { id: number; name: string; date: string; elevation_m: number; distance_km: number } | null;
  fastest_ride: { id: number; name: string; date: string; avg_speed_kmh: number; distance_km: number } | null;
  best_month: { month: number; distance_km: number; rides: number } | null;
  best_week: { week_start: string; distance_km: number; rides: number } | null;
  longest_streak: { days: number; from: string; to: string } | null;
  rides_by_weekday: number[];
  rides_by_hour: number[];
  favorite_bike: { id: string; name: string; rides: number; distance_km: number } | null;
  monthly_km: number[];
}

export interface Settings {
  weight_kg: number | null;
  birth_year: number | null;
  tz_offset: number | null;
  bezier_tension: number;
  sparkline_weeks: number;
  speed_color_buckets: number;
  track_simplify_m: number;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`API ${path} → ${res.status}`);
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

  activityTrack: (id: number, simplify = TRACK_SIMPLIFY_M) =>
    get<TrackResponse>(`/activities/${id}/track${buildQuery({ simplify, fields: 'lat,lon,altitude_m,distance_m,speed_ms,hr' })}`),

  bikes: () =>
    get<Bike[]>('/bikes'),

  bike: (id: string) =>
    get<Bike>(`/bikes/${id}`),

  heatmap: (simplify = 20, year?: number) =>
    get<{ count: number; points: [number, number][] }>(`/tracks/heatmap${buildQuery({ simplify, year })}`),

  hrCurve: (year?: number) =>
    get<{ durations_s: number[]; labels: string[]; best_hr: number[] }>(`/analytics/hr-curve${buildQuery({ year })}`),

  timeHeatmap: (year?: number, tz_offset?: number) =>
    get<{ cells: { weekday: number; hour: number; count: number }[] }>(`/analytics/time-heatmap${buildQuery({ year, tz_offset })}`),

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
        return r.json() as Promise<{ ok: boolean; message?: string }>;
      }),

  bikeCompare: (): Promise<BikeCompareData> => get('/bikes/compare'),

  wrapped: (year?: number, tz_offset?: number): Promise<WrappedData> =>
    get(`/analytics/wrapped${buildQuery({ year, tz_offset })}`),

  weeklyVolume: (weeks = 52): Promise<WeeklyVolume[]> =>
    get(`/analytics/weekly-volume${buildQuery({ weeks })}`),

  routeClusters: (min_rides = 3): Promise<RouteClustersResponse> =>
    get(`/analytics/route-clusters${buildQuery({ min_rides })}`),

  bestByDistance: (): Promise<{ buckets: BestByDistanceBucket[] }> =>
    get('/analytics/best-by-distance'),

  otherActivities: (year?: number): Promise<OtherActivity[]> =>
    get(`/activities/other${buildQuery({ year })}`),

  workout: (id: number): Promise<WorkoutDetail> =>
    get(`/activities/other/${id}`),

  cadence: (year?: number): Promise<CadenceData> =>
    get(`/analytics/cadence${buildQuery({ year })}`),

  fatigueIndex: (year?: number): Promise<FatigueData> =>
    get(`/analytics/fatigue-index${buildQuery({ year })}`),

  fatigueIndexTrack: (activityIds: number[]): Promise<FatigueTrackData> =>
    get(`/analytics/fatigue-index-track?activity_ids=${activityIds.join(',')}`),

  updateActivityPower: (id: number, avg_power_w: number | null): Promise<{ ok: boolean; activity_id: number; avg_power_w: number | null }> =>
    fetch(`${BASE}/activities/${id}/power`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ avg_power_w }),
    }).then(r => {
      if (!r.ok) return r.json().then(j => { throw new Error(j.detail ?? `Fehler ${r.status}`); });
      return r.json();
    }),

  deleteActivity: (id: number): Promise<{ ok: boolean; deleted_id: number }> =>
    fetch(`${BASE}/activities/${id}`, { method: 'DELETE' }).then(r => {
      if (!r.ok) return r.json().then(j => { throw new Error(j.detail ?? `Fehler ${r.status}`); });
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

  importFitFile: (file: File, bikeId?: string): Promise<{ activity_id: number; name: string; is_ride: boolean }> => {
    const form = new FormData();
    form.append('file', file);
    if (bikeId) form.append('bike_id', bikeId);
    return fetch(`${BASE}/import/fit-file`, { method: 'POST', body: form }).then(r => {
      if (!r.ok) return r.json().then(j => { throw new Error(j.detail ?? `Fehler ${r.status}`); });
      return r.json() as Promise<{ activity_id: number; name: string; is_ride: boolean }>;
    });
  },
};
