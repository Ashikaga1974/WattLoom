<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { api, type Activity, type Bike } from '$lib/api';
	import { tzStore, fmtDate } from '$lib/tz.svelte';

	const PAGE_SIZE = 25;

	let activities = $state<Activity[]>([]);
	let total = $state(0);
	let offset = $state(0);
	let loading = $state(true);
	let error = $state<string | null>(null);

	// Filter – initialer Wert aus URL-Param ?bike=...
	let filterYear = $state<string>('');
	let filterBike = $state<string>($page.url.searchParams.get('bike') ?? '');
	let filterHasTrack = $state<boolean>(false);

	let availableYears = $state<string[]>([]);
	let bikes = $state<Bike[]>([]);

	async function loadMeta() {
		const [s, b] = await Promise.all([api.activityStats(), api.bikes()]);
		availableYears = s.available_years;
		bikes = b;
	}

	async function load(resetOffset = false) {
		if (resetOffset) offset = 0;
		loading = true;
		error = null;
		try {
			const res = await api.activities({
				limit: PAGE_SIZE,
				offset,
				year: filterYear || undefined,
				bike_id: filterBike || undefined,
				has_track: filterHasTrack ? true : undefined,
			});
			activities = res.items;
			total = res.total;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Unbekannter Fehler';
		} finally {
			loading = false;
		}
	}

	onMount(async () => {
		await loadMeta();
		await load();
	});

	function prevPage() {
		offset = Math.max(0, offset - PAGE_SIZE);
		load();
	}
	function nextPage() {
		offset = offset + PAGE_SIZE;
		load();
	}

	const totalPages = $derived(Math.ceil(total / PAGE_SIZE));
	const currentPage = $derived(Math.floor(offset / PAGE_SIZE) + 1);

	function hm(s: number) {
		const h = Math.floor(s / 3600);
		const m = Math.floor((s % 3600) / 60);
		return h > 0 ? `${h}h ${m}m` : `${m}m`;
	}
	function date(iso: string) { return fmtDate(iso, tzStore.offset); }
</script>

<div class="space-y-4">
	<h1 class="text-2xl font-bold">Aktivitäten</h1>

	<!-- Filter-Leiste -->
	<div class="flex flex-wrap gap-3 items-center bg-gray-900 rounded-lg px-4 py-3">
		<select
			bind:value={filterYear}
			onchange={() => load(true)}
			class="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-orange-500"
		>
			<option value="">Alle Jahre</option>
			{#each availableYears as y}
				<option value={y}>{y}</option>
			{/each}
		</select>

		<select
			bind:value={filterBike}
			onchange={() => load(true)}
			class="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-orange-500"
		>
			<option value="">Alle Bikes</option>
			{#each bikes as bike}
				<option value={bike.id}>{bike.name}</option>
			{/each}
		</select>

		<label class="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
			<input
				type="checkbox"
				bind:checked={filterHasTrack}
				onchange={() => load(true)}
				class="accent-orange-400"
			/>
			Nur mit Track
		</label>

		<span class="ml-auto text-sm text-gray-400">{total.toLocaleString('de-DE')} Aktivitäten</span>
	</div>

	{#if error}
		<div class="rounded bg-red-900/50 border border-red-700 p-4 text-red-300 text-sm">{error}</div>
	{/if}

	<!-- Tabelle -->
	<div class="rounded-xl overflow-hidden border border-gray-800">
		<table class="w-full text-sm">
			<thead class="bg-gray-800/80 text-gray-400 uppercase text-xs tracking-wider">
				<tr>
					<th class="text-left px-4 py-3">Datum</th>
					<th class="text-left px-4 py-3">Name</th>
					<th class="text-right px-4 py-3">Distanz</th>
					<th class="text-right px-4 py-3">Zeit</th>
					<th class="text-right px-4 py-3">km/h</th>
					<th class="text-right px-4 py-3 hidden md:table-cell">Hm</th>
					<th class="text-right px-4 py-3 hidden md:table-cell">HR</th>
					<th class="text-right px-4 py-3 hidden lg:table-cell">Watt</th>
				</tr>
			</thead>
			<tbody>
				{#if loading}
					{#each Array(PAGE_SIZE) as _, i}
						<tr class="border-t border-gray-800/50">
							<td colspan="8" class="px-4 py-3">
								<div class="h-4 bg-gray-800 animate-pulse rounded" style="width: {60 + (i % 5) * 8}%"></div>
							</td>
						</tr>
					{/each}
				{:else}
					{#each activities as act}
						<tr
							class="border-t border-gray-800/50 hover:bg-gray-800/40 transition-colors cursor-pointer"
							onclick={() => window.location.href = `/activities/${act.id}`}
						>
							<td class="px-4 py-3 text-gray-400 whitespace-nowrap">{date(act.start_date)}</td>
							<td class="px-4 py-3 max-w-xs">
								<span class="truncate block">{act.name}</span>
								{#if act.bike_id}
									<span class="text-xs text-gray-500">{bikes.find(b => b.id === act.bike_id)?.name ?? act.bike_id}</span>
								{/if}
							</td>
							<td class="px-4 py-3 text-right tabular-nums">
								{act.distance_m ? (act.distance_m / 1000).toFixed(1) : '-'} km
							</td>
							<td class="px-4 py-3 text-right tabular-nums text-gray-300">
								{hm(act.moving_time_s)}
							</td>
							<td class="px-4 py-3 text-right tabular-nums">
								{act.avg_speed_ms ? (act.avg_speed_ms * 3.6).toFixed(1) : '-'}
							</td>
							<td class="px-4 py-3 text-right tabular-nums text-gray-300 hidden md:table-cell">
								{act.elevation_gain_m ? Math.round(act.elevation_gain_m) : '-'}
							</td>
							<td class="px-4 py-3 text-right tabular-nums text-gray-300 hidden md:table-cell">
								{act.avg_hr ? Math.round(act.avg_hr) : '-'}
							</td>
							<td class="px-4 py-3 text-right tabular-nums text-gray-300 hidden lg:table-cell">
								{act.avg_power_w ? Math.round(act.avg_power_w) : '-'}
							</td>
						</tr>
					{/each}
					{#if activities.length === 0}
						<tr>
							<td colspan="8" class="px-4 py-8 text-center text-gray-500">Keine Aktivitäten gefunden.</td>
						</tr>
					{/if}
				{/if}
			</tbody>
		</table>
	</div>

	<!-- Pagination -->
	{#if totalPages > 1}
		<div class="flex items-center justify-between text-sm">
			<button
				onclick={prevPage}
				disabled={offset === 0}
				class="px-4 py-2 rounded bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
			>
				← Zurück
			</button>
			<span class="text-gray-400">Seite {currentPage} / {totalPages}</span>
			<button
				onclick={nextPage}
				disabled={offset + PAGE_SIZE >= total}
				class="px-4 py-2 rounded bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
			>
				Weiter →
			</button>
		</div>
	{/if}
</div>
