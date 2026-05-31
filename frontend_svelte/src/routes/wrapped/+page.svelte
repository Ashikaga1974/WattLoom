<script lang="ts">
	import { onMount } from 'svelte';
	import { api, type WrappedData } from '$lib/api';
	import { tzStore, fmtDate, effectiveTzOffset } from '$lib/tz.svelte';

	const MONTH_NAMES = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
	const WEEKDAY_NAMES = ['Mo','Di','Mi','Do','Fr','Sa','So'];

	function fmtTime(s: number): string {
		const h = Math.floor(s / 3600);
		const m = Math.floor((s % 3600) / 60);
		return h > 0 ? `${h}h ${m}min` : `${m}min`;
	}

	function fmtRideDate(dateStr: string): string { return fmtDate(dateStr, tzStore.offset); }

	function pctArrow(pct: number): string {
		return pct >= 0 ? `+${pct.toFixed(1)}%` : `${pct.toFixed(1)}%`;
	}

	let data = $state<WrappedData | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let selectedYear = $state<number | null>(null);

	async function load(year?: number) {
		loading = true;
		error = null;
		try {
			data = await api.wrapped(year, effectiveTzOffset(tzStore.offset));
			selectedYear = data.year;
		} catch (e) {
			error = 'Fehler beim Laden der Daten.';
		} finally {
			loading = false;
		}
	}

	onMount(() => load());

	// SVG-Dimensionen für Monatschart
	const chartW = 600;
	const chartH = 120;
	const barPad = 4;

	const barWidth = $derived(data ? (chartW / 12) - barPad : 0);

	const maxMonthlyKm = $derived(
		data ? Math.max(...data.monthly_km, 1) : 1
	);

	function barHeight(km: number): number {
		return (km / maxMonthlyKm) * (chartH - 24);
	}

	function barX(i: number): number {
		return i * (chartW / 12) + barPad / 2;
	}

	function barY(km: number): number {
		return chartH - 20 - barHeight(km);
	}

	// Wochentag-Minibalken
	const maxWeekday = $derived(
		data ? Math.max(...data.rides_by_weekday, 1) : 1
	);

	// Tageszeit-Minibalken
	const maxHour = $derived(
		data ? Math.max(...data.rides_by_hour, 1) : 1
	);
</script>

<div class="space-y-6">
	<h1 class="text-2xl font-bold text-white">Jahresrückblick</h1>

	{#if loading}
		<p class="text-gray-400">Lade…</p>
	{:else if error}
		<p class="text-red-400">{error}</p>
	{:else if !data || data.totals.rides === 0}
		<p class="text-gray-400">Keine Daten für dieses Jahr.</p>
	{:else}

		<!-- Jahres-Selector -->
		<div class="flex gap-2 flex-wrap">
			{#each data.available_years as yr}
				<button
					onclick={() => load(yr)}
					class="px-3 py-1 rounded text-sm font-medium transition-colors"
					class:bg-orange-500={yr === selectedYear}
					class:text-white={yr === selectedYear}
					class:bg-gray-700={yr !== selectedYear}
					class:text-gray-300={yr !== selectedYear}
					class:hover:bg-gray-600={yr !== selectedYear}
				>{yr}</button>
			{/each}
		</div>

		<!-- Grid -->
		<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

			<!-- Gesamt-Stats (volle Breite) -->
			<div class="md:col-span-2 lg:col-span-3 bg-gray-800 rounded-xl p-5 border border-gray-700">
				<p class="text-xs text-gray-500 uppercase tracking-wide mb-3">Gesamt {data.year}</p>
				<div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
					<div>
						<p class="text-3xl font-bold text-white">{data.totals.rides}</p>
						<p class="text-sm text-gray-400">Fahrten
							{#if data.vs_prev_year !== null}
								<span class={data.vs_prev_year.rides_pct >= 0 ? 'text-green-400' : 'text-red-400'}>
									{pctArrow(data.vs_prev_year.rides_pct)}
								</span>
							{/if}
						</p>
					</div>
					<div>
						<p class="text-3xl font-bold text-white">{data.totals.distance_km.toFixed(0)}</p>
						<p class="text-sm text-gray-400">km
							{#if data.vs_prev_year !== null}
								<span class={data.vs_prev_year.distance_pct >= 0 ? 'text-green-400' : 'text-red-400'}>
									{pctArrow(data.vs_prev_year.distance_pct)}
								</span>
							{/if}
						</p>
					</div>
					<div>
						<p class="text-3xl font-bold text-white">{data.totals.moving_hours.toFixed(1)}</p>
						<p class="text-sm text-gray-400">Stunden</p>
					</div>
					<div>
						<p class="text-3xl font-bold text-white">{data.totals.elevation_m.toFixed(0)}</p>
						<p class="text-sm text-gray-400">Höhenmeter</p>
					</div>
				</div>
			</div>

			<!-- Längste Fahrt -->
			{#if data.best_ride}
				<div class="bg-gray-800 rounded-xl p-5 border border-gray-700">
					<p class="text-xs text-gray-500 uppercase tracking-wide mb-1">Längste Fahrt</p>
					<p class="text-3xl font-bold text-white">{data.best_ride.distance_km.toFixed(1)} km</p>
					<a href="/activities/{data.best_ride.id}" class="text-sm text-orange-400 hover:underline">{data.best_ride.name}</a>
					<p class="text-sm text-gray-400">{fmtRideDate(data.best_ride.date)} · {fmtTime(data.best_ride.moving_time_s)}</p>
				</div>
			{/if}

			<!-- Meiste Höhenmeter -->
			{#if data.most_elevation_ride}
				<div class="bg-gray-800 rounded-xl p-5 border border-gray-700">
					<p class="text-xs text-gray-500 uppercase tracking-wide mb-1">Meiste Höhenmeter</p>
					<p class="text-3xl font-bold text-white">{data.most_elevation_ride.elevation_m.toFixed(0)} m</p>
					<a href="/activities/{data.most_elevation_ride.id}" class="text-sm text-orange-400 hover:underline">{data.most_elevation_ride.name}</a>
					<p class="text-sm text-gray-400">{fmtRideDate(data.most_elevation_ride.date)} · {data.most_elevation_ride.distance_km.toFixed(1)} km</p>
				</div>
			{/if}

			<!-- Schnellste Fahrt -->
			{#if data.fastest_ride}
				<div class="bg-gray-800 rounded-xl p-5 border border-gray-700">
					<p class="text-xs text-gray-500 uppercase tracking-wide mb-1">Schnellste Fahrt</p>
					<p class="text-3xl font-bold text-white">{data.fastest_ride.avg_speed_kmh.toFixed(1)} km/h</p>
					<a href="/activities/{data.fastest_ride.id}" class="text-sm text-orange-400 hover:underline">{data.fastest_ride.name}</a>
					<p class="text-sm text-gray-400">{fmtRideDate(data.fastest_ride.date)} · {data.fastest_ride.distance_km.toFixed(1)} km</p>
				</div>
			{/if}

			<!-- Bester Monat -->
			{#if data.best_month}
				<div class="bg-gray-800 rounded-xl p-5 border border-gray-700">
					<p class="text-xs text-gray-500 uppercase tracking-wide mb-1">Bester Monat</p>
					<p class="text-3xl font-bold text-white">{MONTH_NAMES[data.best_month.month - 1]}</p>
					<p class="text-sm text-gray-400">{data.best_month.distance_km.toFixed(0)} km · {data.best_month.rides} Fahrten</p>
				</div>
			{/if}

			<!-- Beste Woche -->
			{#if data.best_week}
				<div class="bg-gray-800 rounded-xl p-5 border border-gray-700">
					<p class="text-xs text-gray-500 uppercase tracking-wide mb-1">Beste Woche</p>
					<p class="text-3xl font-bold text-white">{data.best_week.distance_km.toFixed(0)} km</p>
					<p class="text-sm text-gray-400">ab {fmtRideDate(data.best_week.week_start)} · {data.best_week.rides} Fahrten</p>
				</div>
			{/if}

			<!-- Längste Streak -->
			{#if data.longest_streak}
				<div class="bg-gray-800 rounded-xl p-5 border border-gray-700">
					<p class="text-xs text-gray-500 uppercase tracking-wide mb-1">Längste Streak</p>
					<p class="text-3xl font-bold text-white">{data.longest_streak.days} Tage</p>
					<p class="text-sm text-gray-400">{fmtRideDate(data.longest_streak.from)} – {fmtRideDate(data.longest_streak.to)}</p>
				</div>
			{/if}

			<!-- Lieblingsbike -->
			{#if data.favorite_bike}
				<div class="bg-gray-800 rounded-xl p-5 border border-gray-700">
					<p class="text-xs text-gray-500 uppercase tracking-wide mb-1">Lieblingsbike</p>
					<p class="text-3xl font-bold text-white truncate">{data.favorite_bike.name}</p>
					<p class="text-sm text-gray-400">{data.favorite_bike.rides} Fahrten · {data.favorite_bike.distance_km.toFixed(0)} km</p>
				</div>
			{/if}

			<!-- Wochentag-Verteilung -->
			<div class="bg-gray-800 rounded-xl p-5 border border-gray-700">
				<p class="text-xs text-gray-500 uppercase tracking-wide mb-3">Fahrten nach Wochentag</p>
				<div class="flex items-end gap-1 h-16">
					{#each data.rides_by_weekday as count, i}
						{@const h = Math.round((count / maxWeekday) * 48)}
						{@const isMax = count === maxWeekday}
						<div class="flex flex-col items-center flex-1 gap-1">
							<div
								class="w-full rounded-sm transition-all"
								style="height:{h}px; background:{isMax ? '#f97316' : '#3b82f6'}"
							></div>
							<span class="text-xs text-gray-500">{WEEKDAY_NAMES[i]}</span>
						</div>
					{/each}
				</div>
			</div>

			<!-- Tageszeit-Verteilung -->
			<div class="bg-gray-800 rounded-xl p-5 border border-gray-700">
				<p class="text-xs text-gray-500 uppercase tracking-wide mb-3">Fahrten nach Tageszeit</p>
				<div class="flex items-end gap-px h-14">
					{#each data.rides_by_hour as count, i}
						{@const h = Math.round((count / maxHour) * 40)}
						{@const isMax = count === maxHour}
						<div
							class="flex-1 rounded-sm"
							style="height:{Math.max(h, 2)}px; background:{isMax ? '#f97316' : '#3b82f6'}"
							title="{i}:00 – {count} Fahrten"
						></div>
					{/each}
				</div>
				<div class="flex justify-between mt-1">
					<span class="text-xs text-gray-500">0h</span>
					<span class="text-xs text-gray-500">6h</span>
					<span class="text-xs text-gray-500">12h</span>
					<span class="text-xs text-gray-500">18h</span>
					<span class="text-xs text-gray-500">24h</span>
				</div>
			</div>

		</div>

		<!-- Monatsverlauf -->
		<div class="bg-gray-800 rounded-xl p-5 border border-gray-700">
			<p class="text-xs text-gray-500 uppercase tracking-wide mb-3">Monatsverlauf {data.year}</p>
			<svg viewBox="0 0 {chartW} {chartH}" class="w-full" preserveAspectRatio="none" style="height:120px">
				{#each data.monthly_km as km, i}
					{@const isBest = data.best_month !== null && data.best_month.month === i + 1}
					<rect
						x={barX(i)}
						y={barY(km)}
						width={barWidth}
						height={barHeight(km)}
						fill={isBest ? '#f97316' : '#3b82f6'}
						rx="2"
					/>
					<text
						x={barX(i) + barWidth / 2}
						y={chartH - 4}
						text-anchor="middle"
						font-size="9"
						fill="#6b7280"
					>{MONTH_NAMES[i]}</text>
				{/each}
			</svg>
		</div>

	{/if}
</div>
