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
	has_track: number;
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
	ftp: number | null;
	has_hr: boolean;
	has_power: boolean;
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

async function get<T>(path: string): Promise<T> {
	const res = await fetch(`${BASE}${path}`);
	if (!res.ok) throw new Error(`API ${path} → ${res.status}`);
	return res.json();
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

	activityLaps: (id: number) =>
		get<Lap[]>(`/activities/${id}/laps`),

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

	timeHeatmap: (year?: number) =>
		get<{ cells: { weekday: number; hour: number; count: number }[] }>(`/analytics/time-heatmap${buildQuery({ year })}`),

	speedHr: () =>
		get<{ points: { year: number; speed_kmh: number; hr: number; dist_km: number }[] }>('/analytics/speed-hr'),

	yearProgress: () =>
		get<{ years: Record<string, [number, number][]> }>('/analytics/year-progress'),

	getSettings: () =>
		get<{ weight_kg: number | null; birth_year: number | null; ftp_manual: number | null }>('/settings'),

	saveSettings: (settings: { weight_kg?: number | null; birth_year?: number | null; ftp_manual?: number | null }) =>
		fetch(`${BASE}/settings`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(settings),
		}).then(r => { if (!r.ok) throw new Error(`API /settings → ${r.status}`); return r.json() as Promise<{ weight_kg: number | null; birth_year: number | null; ftp_manual: number | null }>; }),

	tempCorrelation: () =>
		get<{ points: { temp_c: number; speed_kmh: number; hr: number; year: number; dist_km: number }[] }>('/analytics/temp-correlation'),

	ftp: () =>
		get<{
			trend:       { label: string; best_w: number }[];
			profile:     { label: string; best_w: number; count: number }[];
			current_ftp: number | null;
			best_ever:   { w: number; date: string } | null;
		}>('/analytics/ftp'),

	startImport: () =>
		fetch(`${BASE}/import/start`, { method: 'POST' })
			.then(r => { if (!r.ok) throw new Error(`API /import/start → ${r.status}`); return r.json() as Promise<{ status: string; message?: string }>; }),

	importStatus: () =>
		get<{ status: string; log: string[]; zip_name: string | null }>('/import/status'),

	resetDb: () =>
		fetch(`${BASE}/import/reset`, { method: 'POST' })
			.then(r => { if (!r.ok) throw new Error(`API /import/reset → ${r.status}`); return r.json() as Promise<{ ok: boolean; message?: string }>; }),
};
