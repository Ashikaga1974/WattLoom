<script lang="ts">
	import { onMount } from 'svelte';
	import { api, type ActivityStats, type Bike, type Activity, type WeeklyStats, type MonthlyStats } from '$lib/api';
	import Sparkline from '$lib/Sparkline.svelte';
	import { SPARKLINE_WEEKS } from '$lib/config';

	let stats = $state<ActivityStats | null>(null);
	let bikes = $state<Bike[]>([]);
	let recentActivities = $state<Activity[]>([]);
	let sparkData = $state<(WeeklyStats | MonthlyStats)[]>([]);
	let sparkLabels = $state<string[]>([]);
	let selectedYear = $state<string | undefined>(undefined);
	let loading = $state(true);
	let error = $state<string | null>(null);

	const MONTHS = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];

	async function load() {
		loading = true;
		error = null;
		try {
			const sparkPromise = selectedYear
				? api.monthlyStats(Number(selectedYear))
				: api.weeklyStats(SPARKLINE_WEEKS);

			const [s, b, ar, sp] = await Promise.all([
				api.activityStats(selectedYear ? Number(selectedYear) : undefined),
				api.bikes(),
				api.activities({ limit: 5, year: selectedYear ? Number(selectedYear) : undefined }),
				sparkPromise,
			]);
			stats = s;
			bikes = b;
			recentActivities = ar.items;
			sparkData = sp;

			if (selectedYear) {
				sparkLabels = MONTHS;
			} else {
				sparkLabels = (sp as WeeklyStats[]).map(w =>
					w.weeks_ago === 0 ? 'Akt. Woche' : `vor ${w.weeks_ago}W`
				);
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'Unbekannter Fehler';
		} finally {
			loading = false;
		}
	}

	onMount(load);

	function hm(s: number) {
		const h = Math.floor(s / 3600);
		const m = Math.floor((s % 3600) / 60);
		return `${h}h ${m}m`;
	}
	function fmtMoving(s: number): string {
		if (s === 0) return '0m';
		const h = Math.floor(s / 3600);
		const m = Math.floor((s % 3600) / 60);
		return h > 0 ? `${h}h ${m}m` : `${m}m`;
	}
	function date(iso: string) {
		return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
	}
</script>

<div class="space-y-6">
	<!-- Header mit Jahresfilter -->
	<div class="flex items-center justify-between">
		<h1 class="text-2xl font-bold">Dashboard</h1>
		<select
			bind:value={selectedYear}
			onchange={load}
			class="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-orange-500"
		>
			<option value={undefined}>Alle Jahre</option>
			{#if stats}
				{#each stats.available_years as y}
					<option value={y}>{y}</option>
				{/each}
			{/if}
		</select>
	</div>

	{#if error}
		<div class="rounded bg-red-900/50 border border-red-700 p-4 text-red-300 text-sm">
			Backend nicht erreichbar: {error}
		</div>
	{/if}

	{#if loading}
		<div class="grid grid-cols-2 md:grid-cols-4 gap-4">
			{#each Array(4) as _}
				<div class="rounded-xl bg-gray-800/50 animate-pulse h-24"></div>
			{/each}
		</div>
	{:else if !stats || stats.total_rides === 0}
		<div class="rounded-xl bg-gray-800/40 border border-gray-800 p-8 text-center space-y-3">
			<p class="text-gray-400">Keine Daten vorhanden.</p>
			<a href="/settings" class="inline-block text-sm text-orange-400 hover:underline">
				→ Einstellungen öffnen und Import starten
			</a>
		</div>
	{:else if stats}
		<!-- Statistik-Kacheln -->
		<div class="grid grid-cols-2 md:grid-cols-4 gap-4">
			<div class="rounded-xl bg-gray-800 p-4 flex flex-col gap-2">
				<p class="text-xs text-gray-400 uppercase tracking-wider">Aktivitäten</p>
				<p class="text-3xl font-bold">{stats.total_rides}</p>
				{#if sparkData.length > 0}
					<Sparkline values={sparkData.map(w => w.count)} labels={sparkLabels}
						formatValue={v => `${Math.round(v)} Rides`} />
				{/if}
			</div>
			<div class="rounded-xl bg-gray-800 p-4 flex flex-col gap-2">
				<p class="text-xs text-gray-400 uppercase tracking-wider">Distanz</p>
				<p class="text-3xl font-bold">
					{Math.round(stats.total_km).toLocaleString('de-DE')}
					<span class="text-base font-normal text-gray-400">km</span>
				</p>
				{#if sparkData.length > 0}
					<Sparkline values={sparkData.map(w => w.distance_km)} labels={sparkLabels}
						formatValue={v => `${v.toFixed(0)} km`} />
				{/if}
			</div>
			<div class="rounded-xl bg-gray-800 p-4 flex flex-col gap-2">
				<p class="text-xs text-gray-400 uppercase tracking-wider">Fahrzeit</p>
				<p class="text-3xl font-bold">{hm(stats.total_moving_s)}</p>
				{#if sparkData.length > 0}
					<Sparkline values={sparkData.map(w => w.moving_s)} labels={sparkLabels}
						formatValue={fmtMoving} />
				{/if}
			</div>
			<div class="rounded-xl bg-gray-800 p-4 flex flex-col gap-2">
				<p class="text-xs text-gray-400 uppercase tracking-wider">Höhenmeter</p>
				<p class="text-3xl font-bold">
					{Math.round(stats.total_elevation_m).toLocaleString('de-DE')}
					<span class="text-base font-normal text-gray-400">m</span>
				</p>
				{#if sparkData.length > 0}
					<Sparkline values={sparkData.map(w => w.elevation_m)} labels={sparkLabels}
						formatValue={v => `${Math.round(v)} m`} />
				{/if}
			</div>
		</div>

		<!-- Durchschnittswerte -->
		<div class="grid grid-cols-2 md:grid-cols-3 gap-4">
			<div class="rounded-xl bg-gray-800/60 p-4">
				<p class="text-xs text-gray-400 uppercase tracking-wider">⌀ Distanz</p>
				<p class="text-xl font-semibold mt-1">{stats.avg_km.toFixed(1)} km</p>
			</div>
			<div class="rounded-xl bg-gray-800/60 p-4">
				<p class="text-xs text-gray-400 uppercase tracking-wider">⌀ Geschwindigkeit</p>
				<p class="text-xl font-semibold mt-1">{stats.avg_speed_kmh.toFixed(1)} km/h</p>
			</div>
			{#if stats.avg_hr}
				<div class="rounded-xl bg-gray-800/60 p-4">
					<p class="text-xs text-gray-400 uppercase tracking-wider">⌀ Herzfrequenz</p>
					<p class="text-xl font-semibold mt-1">{Math.round(stats.avg_hr)} bpm</p>
				</div>
			{:else if stats.avg_power_w}
				<div class="rounded-xl bg-gray-800/60 p-4">
					<p class="text-xs text-gray-400 uppercase tracking-wider">⌀ Leistung</p>
					<p class="text-xl font-semibold mt-1">{Math.round(stats.avg_power_w)} W</p>
				</div>
			{/if}
		</div>
	{/if}

	<div class="grid md:grid-cols-2 gap-6">
		<!-- Bikes -->
		<section>
			<h2 class="text-lg font-semibold mb-3">Bikes</h2>
			{#if loading}
				<div class="space-y-2">
					{#each Array(2) as _}
						<div class="h-12 bg-gray-800/50 animate-pulse rounded-lg"></div>
					{/each}
				</div>
			{:else}
				<div class="space-y-2">
					{#each bikes as bike}
						<a href="/bikes" class="flex items-center justify-between rounded-lg bg-gray-800 px-4 py-3 hover:bg-gray-700 transition-colors">
							<div>
								<span class="font-medium">{bike.name}</span>
								{#if bike.brand && bike.model && `${bike.brand} ${bike.model}` !== bike.name}
									<span class="text-xs text-gray-400 ml-2">{bike.brand} {bike.model}</span>
								{/if}
							</div>
							<span class="text-sm text-orange-400">{bike.ride_count} Rides</span>
						</a>
					{/each}
					{#if bikes.length === 0}
						<p class="text-sm text-gray-500">Keine Bikes gefunden.</p>
					{/if}
				</div>
			{/if}
		</section>

		<!-- Letzte Aktivitäten -->
		<section>
			<h2 class="text-lg font-semibold mb-3">Letzte Aktivitäten</h2>
			{#if loading}
				<div class="space-y-2">
					{#each Array(5) as _}
						<div class="h-12 bg-gray-800/50 animate-pulse rounded-lg"></div>
					{/each}
				</div>
			{:else}
				<div class="space-y-2">
					{#each recentActivities as act}
						<a href="/activities/{act.id}" class="flex items-center justify-between rounded-lg bg-gray-800 px-4 py-3 hover:bg-gray-700 transition-colors">
							<div class="min-w-0">
								<p class="font-medium truncate">{act.name}</p>
								<p class="text-xs text-gray-400">{date(act.start_date)}</p>
							</div>
							<div class="text-right shrink-0 ml-3 text-sm text-gray-300">
								<p>{act.distance_m ? (act.distance_m / 1000).toFixed(1) : '-'} km</p>
								{#if act.avg_speed_ms}
									<p class="text-xs text-gray-400">{(act.avg_speed_ms * 3.6).toFixed(1)} km/h</p>
								{/if}
							</div>
						</a>
					{/each}
					{#if recentActivities.length === 0}
						<p class="text-sm text-gray-500">Keine Aktivitäten gefunden.</p>
					{/if}
				</div>
				<a href="/activities" class="block mt-3 text-sm text-orange-400 hover:underline">Alle Aktivitäten →</a>
			{/if}
		</section>
	</div>
</div>
