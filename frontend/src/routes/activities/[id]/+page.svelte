<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/stores';
	import { api, type ActivityDetail, type Lap, type TrackPoint, type ActivityZones } from '$lib/api';
	import ZoneBars from '$lib/ZoneBars.svelte';
	import { SPEED_COLOR_BUCKETS } from '$lib/config';
	import { tzStore, fmtDateLong, fmtTime } from '$lib/tz.svelte';
	import ElevationProfile from '$lib/ElevationProfile.svelte';
	import HRProfile from '$lib/HRProfile.svelte';
	import SpeedProfile from '$lib/SpeedProfile.svelte';
	import CombinedProfile from '$lib/CombinedProfile.svelte';

	let activity = $state<ActivityDetail | null>(null);
	let laps = $state<Lap[]>([]);
	let trackPoints = $state<TrackPoint[]>([]);
	let mediaFiles = $state<string[]>([]);
	let zones = $state<ActivityZones | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);

	let mapContainer: HTMLDivElement;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let mapInstance: any = null;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let leaflet: any = null;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let hoverMarker: any = null;

	const id = $derived(Number($page.params.id));

	async function loadData() {
		loading = true;
		error = null;
		try {
			const act = await api.activity(id);
			activity = act;

			const promises: Promise<unknown>[] = [api.activityLaps(id), api.activityMedia(id)];
			if (act.has_track) promises.push(api.activityTrack(id));

			const results = await Promise.all(promises);
			laps = results[0] as Lap[];
			mediaFiles = (results[1] as { files: string[] }).files;
			if (act.has_track) trackPoints = (results[2] as { points: TrackPoint[] }).points;

			// Zonen asynchron nachladen (nicht blockierend)
			api.activityZones(id).then(z => zones = z).catch(() => {});
		} catch (e) {
			error = e instanceof Error ? e.message : 'Fehler beim Laden';
		} finally {
			loading = false;
		}
	}

	async function initMap() {
		if (!mapContainer || trackPoints.length === 0) return;

		leaflet = (await import('leaflet')).default;
		const L = leaflet;
		await import('leaflet/dist/leaflet.css');

		if (mapInstance) { mapInstance.remove(); mapInstance = null; }

		mapInstance = L.map(mapContainer);
		L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
			attribution: '© OpenStreetMap',
			maxZoom: 19,
		}).addTo(mapInstance);

		const validPts = trackPoints.filter(p => p.lat != null && p.lon != null);
		if (validPts.length === 0) return;

		const allLatLngs = validPts.map(p => [p.lat, p.lon] as [number, number]);
		const speeds = validPts.map(p => (p.speed_ms ?? 0) * 3.6);
		const validSpeeds = speeds.filter(s => s > 0);
		const hasSpeed = validSpeeds.length > 10;

		if (!hasSpeed) {
			const poly = L.polyline(allLatLngs, { color: '#fc4c02', weight: 3, opacity: 0.9 });
			poly.addTo(mapInstance);
			mapInstance.fitBounds(poly.getBounds(), { padding: [20, 20] });
			return;
		}

		const minSpd = Math.min(...validSpeeds);
		const maxSpd = Math.max(...validSpeeds);

		function speedColor(kmh: number): string {
			const t = maxSpd > minSpd ? Math.max(0, Math.min(1, (kmh - minSpd) / (maxSpd - minSpd))) : 0;
			const hue = Math.round(240 - t * 240); // blau=langsam, rot=schnell
			return `hsl(${hue},80%,55%)`;
		}

		function bucket(kmh: number): number {
			if (maxSpd <= minSpd) return 0;
			return Math.floor(Math.max(0, Math.min(0.9999, (kmh - minSpd) / (maxSpd - minSpd))) * SPEED_COLOR_BUCKETS);
		}

		// Aufeinanderfolgende Punkte gleichen Buckets zu einer Polyline zusammenfassen
		let segStart = 0;
		let curBucket = bucket(speeds[0]);
		for (let i = 1; i < validPts.length; i++) {
			const b = bucket(speeds[i]);
			if (b !== curBucket) {
				L.polyline(allLatLngs.slice(segStart, i + 1), {
					color: speedColor(speeds[segStart]), weight: 4, opacity: 0.9,
				}).addTo(mapInstance);
				segStart = i;
				curBucket = b;
			}
		}
		L.polyline(allLatLngs.slice(segStart), {
			color: speedColor(speeds[segStart]), weight: 4, opacity: 0.9,
		}).addTo(mapInstance);

		mapInstance.fitBounds(L.polyline(allLatLngs).getBounds(), { padding: [20, 20] });

		// Legende
		const legend = (L.control as any)({ position: 'bottomright' });
		legend.onAdd = () => {
			const div = L.DomUtil.create('div');
			div.style.cssText = 'background:rgba(17,24,39,0.85);padding:7px 10px;border-radius:8px;font-size:11px;color:#d1d5db;border:1px solid rgba(255,255,255,0.08);pointer-events:none';
			div.innerHTML = `
				<div style="margin-bottom:4px;font-weight:600">Geschwindigkeit</div>
				<div style="display:flex;align-items:center;gap:6px">
					<span>${minSpd.toFixed(0)}</span>
					<div style="height:7px;width:80px;background:linear-gradient(to right,hsl(240,80%,55%),hsl(120,80%,55%),hsl(60,80%,55%),hsl(0,80%,55%));border-radius:4px"></div>
					<span>${maxSpd.toFixed(0)} km/h</span>
				</div>`;
			return div;
		};
		legend.addTo(mapInstance);
	}

	function highlightPoint(idx: number | null) {
		if (hoverMarker) { hoverMarker.remove(); hoverMarker = null; }
		if (idx == null || !mapInstance || !leaflet || idx >= trackPoints.length) return;
		const p = trackPoints[idx];
		hoverMarker = leaflet.circleMarker([p.lat, p.lon], {
			radius: 8,
			color: '#fff',
			weight: 2,
			fillColor: '#fc4c02',
			fillOpacity: 1,
		}).addTo(mapInstance);
	}

	onMount(async () => {
		await loadData();
	});

	// Karte erst initialisieren wenn trackPoints geladen und Container im DOM
	$effect(() => {
		if (!loading && trackPoints.length > 0 && mapContainer) {
			initMap();
		}
	});

	onDestroy(() => {
		if (mapInstance) { mapInstance.remove(); mapInstance = null; }
	});

	function hm(s: number) {
		const h = Math.floor(s / 3600);
		const m = Math.floor((s % 3600) / 60);
		const sec = s % 60;
		return h > 0 ? `${h}h ${m}m` : `${m}m ${sec}s`;
	}
	function date(iso: string) { return fmtDateLong(iso, tzStore.offset); }
	function time(iso: string) { return fmtTime(iso, tzStore.offset); }
</script>

<svelte:head>
	<title>{activity?.name ?? 'Aktivität'} – MyBiking</title>
</svelte:head>

{#if error}
	<div class="rounded bg-red-900/50 border border-red-700 p-4 text-red-300 text-sm">{error}</div>
{:else if loading}
	<div class="space-y-4">
		<div class="h-8 w-64 bg-gray-800 animate-pulse rounded"></div>
		<div class="h-64 bg-gray-800 animate-pulse rounded-xl"></div>
	</div>
{:else if activity}
	<div class="space-y-6">
		<!-- Header -->
		<div>
			<div class="flex items-center justify-between">
				<a href="/activities" class="text-sm text-gray-500 hover:text-orange-400 transition-colors">← Aktivitäten</a>
				{#if activity.has_track}
					<a href="/strecken?ref={activity.id}"
						class="text-xs px-3 py-1 bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors"
					>Ähnliche vergleichen</a>
				{/if}
			</div>
			<h1 class="text-2xl font-bold mt-1">{activity.name}</h1>
			<p class="text-gray-400 text-sm mt-0.5">{date(activity.start_date_local)} · {time(activity.start_date_local)} Uhr</p>
		</div>

		<!-- Karte -->
		{#if activity.has_track}
			<div bind:this={mapContainer} class="h-80 rounded-xl overflow-hidden border border-gray-800 z-0"></div>
		{/if}

		<!-- Profile -->
		{#if trackPoints.length > 1}
			<div class="rounded-xl bg-gray-800/60 p-4 space-y-4">
				<ElevationProfile points={trackPoints} totalDistanceM={activity.distance_m} onhover={highlightPoint} />
				{#if trackPoints.some(p => p.speed_ms && p.speed_ms > 0)}
					<div class="border-t border-gray-700/50 pt-4">
						<SpeedProfile points={trackPoints} totalDistanceM={activity.distance_m} onhover={highlightPoint} />
					</div>
				{/if}
				{#if trackPoints.some(p => p.hr && p.hr > 0)}
					<div class="border-t border-gray-700/50 pt-4">
						<HRProfile points={trackPoints} totalDistanceM={activity.distance_m} onhover={highlightPoint} />
					</div>
				{/if}
				<div class="border-t border-gray-700/50 pt-4">
					<CombinedProfile points={trackPoints} totalDistanceM={activity.distance_m} onhover={highlightPoint} />
				</div>
			</div>
		{/if}

		<!-- Zonen -->
		{#if zones && (zones.has_hr || zones.has_power)}
			<div class="rounded-xl bg-gray-800/60 p-4">
				<h2 class="text-sm font-semibold text-gray-300 mb-4">Zeit in Zonen</h2>
				<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
					{#if zones.has_hr}
						<ZoneBars zones={zones.hr_zones} title="Herzfrequenz" unit="bpm" />
					{/if}
					{#if zones.has_power}
						<ZoneBars zones={zones.power_zones} title="Leistung" unit="W" />
					{/if}
				</div>
				<p class="text-xs text-gray-500 mt-3">
					{#if zones.hr_max}HRmax {zones.hr_max} bpm{/if}
					{#if zones.hr_max && zones.ftp} · {/if}
					{#if zones.ftp}FTP {zones.ftp} W{/if}
				</p>
			</div>
		{/if}

		<!-- Hauptstats -->
		<div class="grid grid-cols-2 md:grid-cols-4 gap-4">
			<div class="rounded-xl bg-gray-800 p-4">
				<p class="text-xs text-gray-400 uppercase tracking-wider">Distanz</p>
				<p class="text-2xl font-bold mt-1">{(activity.distance_m / 1000).toFixed(2)} <span class="text-sm font-normal text-gray-400">km</span></p>
			</div>
			<div class="rounded-xl bg-gray-800 p-4">
				<p class="text-xs text-gray-400 uppercase tracking-wider">Fahrzeit</p>
				<p class="text-2xl font-bold mt-1">{hm(activity.moving_time_s)}</p>
			</div>
			<div class="rounded-xl bg-gray-800 p-4">
				<p class="text-xs text-gray-400 uppercase tracking-wider">⌀ Geschw.</p>
				<p class="text-2xl font-bold mt-1">
					{activity.avg_speed_ms ? (activity.avg_speed_ms * 3.6).toFixed(1) : '-'}
					<span class="text-sm font-normal text-gray-400">km/h</span>
				</p>
			</div>
			<div class="rounded-xl bg-gray-800 p-4">
				<p class="text-xs text-gray-400 uppercase tracking-wider">Höhenmeter</p>
				<p class="text-2xl font-bold mt-1">
					{activity.elevation_gain_m ? Math.round(activity.elevation_gain_m) : '-'}
					<span class="text-sm font-normal text-gray-400">m</span>
				</p>
			</div>
		</div>

		<!-- Sekundärstats -->
		<div class="grid grid-cols-2 md:grid-cols-4 gap-4">
			{#if activity.avg_hr}
				<div class="rounded-xl bg-gray-800/60 p-4">
					<p class="text-xs text-gray-400 uppercase tracking-wider">⌀ Herzfreq.</p>
					<p class="text-xl font-semibold mt-1">{Math.round(activity.avg_hr)} <span class="text-xs text-gray-400">bpm</span></p>
					{#if activity.max_hr}
						<p class="text-xs text-gray-500 mt-0.5">max {activity.max_hr} bpm</p>
					{/if}
				</div>
			{/if}
			{#if activity.avg_power_w}
				<div class="rounded-xl bg-gray-800/60 p-4">
					<p class="text-xs text-gray-400 uppercase tracking-wider">⌀ Leistung</p>
					<p class="text-xl font-semibold mt-1">{Math.round(activity.avg_power_w)} <span class="text-xs text-gray-400">W</span></p>
				</div>
			{/if}
			{#if activity.max_speed_ms}
				<div class="rounded-xl bg-gray-800/60 p-4">
					<p class="text-xs text-gray-400 uppercase tracking-wider">Max. Geschw.</p>
					<p class="text-xl font-semibold mt-1">{(activity.max_speed_ms * 3.6).toFixed(1)} <span class="text-xs text-gray-400">km/h</span></p>
				</div>
			{/if}
			{#if activity.calories}
				<div class="rounded-xl bg-gray-800/60 p-4">
					<p class="text-xs text-gray-400 uppercase tracking-wider">Kalorien</p>
					<p class="text-xl font-semibold mt-1">{Math.round(activity.calories)} <span class="text-xs text-gray-400">kcal</span></p>
				</div>
			{/if}
		</div>

		<!-- Fotos -->
		{#if mediaFiles.length > 0}
			<section>
				<h2 class="text-lg font-semibold mb-3">Fotos <span class="text-sm font-normal text-gray-400">({mediaFiles.length})</span></h2>
				<div class="grid grid-cols-2 md:grid-cols-3 gap-3">
					{#each mediaFiles as file}
						<a href={api.mediaUrl(file)} target="_blank" rel="noopener">
							<img
								src={api.mediaUrl(file)}
								alt={file}
								class="rounded-xl object-cover w-full aspect-square hover:opacity-90 transition-opacity border border-gray-800"
							/>
						</a>
					{/each}
				</div>
			</section>
		{/if}

		<!-- Laps -->
		{#if laps.length > 0}
			<section>
				<h2 class="text-lg font-semibold mb-3">Laps <span class="text-sm font-normal text-gray-400">({laps.length})</span></h2>
				<div class="rounded-xl overflow-hidden border border-gray-800">
					<table class="w-full text-sm">
						<thead class="bg-gray-800/80 text-gray-400 uppercase text-xs tracking-wider">
							<tr>
								<th class="text-right px-4 py-2">#</th>
								<th class="text-right px-4 py-2">Distanz</th>
								<th class="text-right px-4 py-2">Zeit</th>
								<th class="text-right px-4 py-2">km/h</th>
								<th class="text-right px-4 py-2 hidden md:table-cell">HR</th>
								<th class="text-right px-4 py-2 hidden md:table-cell">Hm</th>
							</tr>
						</thead>
						<tbody>
							{#each laps as lap, i}
								<tr class="border-t border-gray-800/50 {i % 2 === 0 ? '' : 'bg-gray-800/20'}">
									<td class="px-4 py-2 text-right text-gray-500">{lap.lap_number + 1}</td>
									<td class="px-4 py-2 text-right tabular-nums">{(lap.distance_m / 1000).toFixed(2)} km</td>
									<td class="px-4 py-2 text-right tabular-nums text-gray-300">{hm(lap.total_time_s)}</td>
									<td class="px-4 py-2 text-right tabular-nums">{lap.avg_speed_ms ? (lap.avg_speed_ms * 3.6).toFixed(1) : '-'}</td>
									<td class="px-4 py-2 text-right tabular-nums text-gray-300 hidden md:table-cell">{lap.avg_hr ? Math.round(lap.avg_hr) : '-'}</td>
									<td class="px-4 py-2 text-right tabular-nums text-gray-300 hidden md:table-cell">{lap.elevation_gain_m ? Math.round(lap.elevation_gain_m) : '-'}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</section>
		{/if}
	</div>
{/if}
