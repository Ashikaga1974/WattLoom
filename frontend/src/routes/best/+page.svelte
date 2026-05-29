<script lang="ts">
	import { onMount } from 'svelte';
	import { api, type Activity } from '$lib/api';

	interface Category {
		key: string;
		label: string;
		unit: string;
		format: (a: Activity) => string;
		items: Activity[];
	}

	let categories = $state<Category[]>([
		{
			key: 'distance_m',
			label: 'Längste Rides',
			unit: 'km',
			format: (a) => (a.distance_m / 1000).toFixed(1) + ' km',
			items: [],
		},
		{
			key: 'elevation_gain_m',
			label: 'Meiste Höhenmeter',
			unit: 'm',
			format: (a) => (a.elevation_gain_m ? Math.round(a.elevation_gain_m) + ' m' : '-'),
			items: [],
		},
		{
			key: 'moving_time_s',
			label: 'Längste Fahrzeit',
			unit: 'h',
			format: (a) => {
				const h = Math.floor(a.moving_time_s / 3600);
				const m = Math.floor((a.moving_time_s % 3600) / 60);
				return `${h}h ${m}m`;
			},
			items: [],
		},
		{
			key: 'avg_speed_ms',
			label: 'Schnellste Rides',
			unit: 'km/h',
			format: (a) => (a.avg_speed_ms ? (a.avg_speed_ms * 3.6).toFixed(1) + ' km/h' : '-'),
			items: [],
		},
		{
			key: 'avg_power_w',
			label: 'Höchste Leistung',
			unit: 'W',
			format: (a) => (a.avg_power_w ? Math.round(a.avg_power_w) + ' W' : '-'),
			items: [],
		},
		{
			key: 'calories',
			label: 'Meiste Kalorien',
			unit: 'kcal',
			format: (a) => (a.calories ? Math.round(a.calories) + ' kcal' : '-'),
			items: [],
		},
	]);

	let loading = $state(true);
	let error = $state<string | null>(null);

	onMount(async () => {
		try {
			const results = await Promise.all(
				categories.map(c => api.topActivities(c.key, 5))
			);
			categories = categories.map((c, i) => ({ ...c, items: results[i].items }));
		} catch (e) {
			error = e instanceof Error ? e.message : 'Fehler beim Laden';
		} finally {
			loading = false;
		}
	});

	function date(iso: string) {
		return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
	}

	// Rang-Farben
	const rankColors = ['text-yellow-400', 'text-gray-300', 'text-amber-600', 'text-gray-500', 'text-gray-500'];
	const rankSymbols = ['🥇', '🥈', '🥉', '4.', '5.'];
</script>

<svelte:head>
	<title>Best of – MyBiking</title>
</svelte:head>

<div class="space-y-8">
	<h1 class="text-2xl font-bold">Best of – Persönliche Rekorde</h1>

	{#if error}
		<div class="rounded bg-red-900/50 border border-red-700 p-4 text-red-300 text-sm">{error}</div>
	{/if}

	{#if loading}
		<div class="grid md:grid-cols-2 gap-6">
			{#each Array(6) as _}
				<div class="h-48 bg-gray-800/50 animate-pulse rounded-xl"></div>
			{/each}
		</div>
	{:else}
		<div class="grid md:grid-cols-2 gap-6">
			{#each categories as cat}
				<section class="rounded-xl bg-gray-800/40 border border-gray-800 overflow-hidden">
					<div class="px-4 py-3 bg-gray-800/60 border-b border-gray-700">
						<h2 class="font-semibold text-gray-100">{cat.label}</h2>
					</div>
					<ol class="divide-y divide-gray-800/50">
						{#each cat.items as act, i}
							<li>
								<a
									href="/activities/{act.id}"
									class="flex items-center gap-3 px-4 py-3 hover:bg-gray-700/40 transition-colors"
								>
									<span class="text-lg w-7 shrink-0 text-center">{rankSymbols[i]}</span>
									<div class="min-w-0 flex-1">
										<p class="font-medium truncate text-sm">{act.name}</p>
										<p class="text-xs text-gray-500">{date(act.start_date)}</p>
									</div>
									<span class="shrink-0 text-sm font-semibold {rankColors[i]}">
										{cat.format(act)}
									</span>
								</a>
							</li>
						{:else}
							<li class="px-4 py-3 text-sm text-gray-500">Keine Daten.</li>
						{/each}
					</ol>
				</section>
			{/each}
		</div>
	{/if}
</div>
