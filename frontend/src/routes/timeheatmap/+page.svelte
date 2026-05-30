<script lang="ts">
	import { onMount } from 'svelte';
	import { api } from '$lib/api';
	import { tzStore, effectiveTzOffset } from '$lib/tz.svelte';

	const DAYS_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
	const DAYS_FULL  = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

	let cells = $state<{ weekday: number; hour: number; count: number }[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let filterYear = $state<string>('');
	let availableYears = $state<string[]>([]);
	let hovered = $state<{ wd: number; h: number } | null>(null);

	onMount(async () => {
		try {
			const stats = await api.activityStats();
			availableYears = stats.available_years.filter(y => Number(y) >= 2000);
			await loadData();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Fehler';
			loading = false;
		}
	});

	async function loadData() {
		loading = true;
		error = null;
		try {
			const res = await api.timeHeatmap(filterYear ? Number(filterYear) : undefined, effectiveTzOffset(tzStore.offset));
			cells = res.cells;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Fehler beim Laden';
		} finally {
			loading = false;
		}
	}

	// 7×24 lookup grid
	const grid = $derived(
		(() => {
			const g: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0));
			for (const c of cells) g[c.weekday][c.hour] = c.count;
			return g;
		})()
	);

	const maxCount   = $derived(cells.length ? Math.max(...cells.map(c => c.count)) : 1);
	const totalCount = $derived(cells.reduce((s, c) => s + c.count, 0));

	// Lieblingstag: Wochentag mit den meisten Starts
	const peakDay = $derived(() => {
		const sums = Array(7).fill(0);
		for (const c of cells) sums[c.weekday] += c.count;
		return DAYS_FULL[sums.indexOf(Math.max(...sums))];
	});

	// Lieblingsstunde: Stunde mit den meisten Starts
	const peakHour = $derived(() => {
		const sums = Array(24).fill(0);
		for (const c of cells) sums[c.hour] += c.count;
		const h = sums.indexOf(Math.max(...sums));
		return `${String(h).padStart(2, '0')}:00`;
	});

	function cellColor(count: number): string {
		if (count === 0) return 'var(--t-surface2)';
		const t = count / maxCount;
		if (t <= 0.15) return '#431407';
		if (t <= 0.35) return '#7c2d12';
		if (t <= 0.55) return '#c2410c';
		if (t <= 0.75) return '#ea580c';
		return '#fc4c02';
	}

	// SVG Layout
	const CW = 26, CH = 32;
	const PL = 44, PT = 28;
	const W = PL + 24 * CW + 8;
	const H = PT + 7 * CH + 20;

	const hoveredCount = $derived(hovered ? (grid[hovered.wd]?.[hovered.h] ?? 0) : 0);
</script>

<svelte:head>
	<title>Tageszeit-Heatmap – MyBiking</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex flex-wrap items-center justify-between gap-4">
		<div>
			<h1 class="text-2xl font-bold">Tageszeit-Heatmap</h1>
			<p class="text-xs text-gray-500 mt-0.5">Wann fährst du? · Aktivitätsstarts nach Wochentag und Uhrzeit</p>
		</div>
		<select
			bind:value={filterYear}
			onchange={loadData}
			class="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-orange-500"
		>
			<option value="">Alle Jahre</option>
			{#each availableYears as y}
				<option value={y}>{y}</option>
			{/each}
		</select>
	</div>

	{#if error}
		<div class="rounded bg-red-900/50 border border-red-700 p-4 text-red-300 text-sm">{error}</div>
	{/if}

	{#if loading}
		<div class="h-64 bg-gray-800/50 animate-pulse rounded-xl"></div>
	{:else if cells.length}
		<!-- Kennzahlen -->
		<div class="flex flex-wrap gap-3">
			<div class="rounded-xl bg-gray-800 px-4 py-3 text-center min-w-28">
				<p class="text-xs text-gray-400">Aktivitäten</p>
				<p class="text-xl font-bold text-orange-400 mt-0.5">{totalCount}</p>
			</div>
			<div class="rounded-xl bg-gray-800 px-4 py-3 text-center min-w-28">
				<p class="text-xs text-gray-400">Lieblingstag</p>
				<p class="text-lg font-bold text-orange-400 mt-0.5">{peakDay()}</p>
			</div>
			<div class="rounded-xl bg-gray-800 px-4 py-3 text-center min-w-28">
				<p class="text-xs text-gray-400">Lieblingszeit</p>
				<p class="text-xl font-bold text-orange-400 mt-0.5">{peakHour()}</p>
			</div>
		</div>

		<!-- Heatmap -->
		<div class="rounded-xl bg-gray-800/40 border border-gray-800 p-4 relative">
			<!-- Tooltip -->
			{#if hovered}
				<div class="absolute top-4 right-4 rounded-lg bg-gray-900 border border-gray-700 px-3 py-2 text-sm pointer-events-none z-10">
					<p class="font-semibold text-gray-200">{DAYS_FULL[hovered.wd]} · {String(hovered.h).padStart(2,'0')}:00–{String(hovered.h+1).padStart(2,'0')}:00</p>
					<p class="text-orange-400 mt-0.5">{hoveredCount} {hoveredCount === 1 ? 'Aktivität' : 'Aktivitäten'}</p>
				</div>
			{/if}

			<svg viewBox="0 0 {W} {H}" class="w-full" style="height: {H}px">
				<!-- Stunden-Labels (alle 3h) -->
				{#each Array(9) as _, i}
					{@const h = i * 3}
					<text
						x={PL + h * CW + CW / 2} y={PT - 8}
						font-size="11" fill="var(--chart-text)" text-anchor="middle"
					>{String(h).padStart(2,'0')}:00</text>
				{/each}

				<!-- Wochentag-Labels + Zellen -->
				{#each DAYS_SHORT as day, wd}
					<text
						x={PL - 8} y={PT + wd * CH + CH / 2 + 4}
						font-size="12" fill="var(--chart-muted)" text-anchor="end"
					>{day}</text>

					{#each Array(24) as _, h}
						{@const count = grid[wd][h]}
						<rect
							x={PL + h * CW + 1} y={PT + wd * CH + 1}
							width={CW - 2} height={CH - 2}
							rx="3"
							fill={cellColor(count)}
							stroke={hovered?.wd === wd && hovered?.h === h ? '#fc4c02' : 'none'}
							stroke-width="1.5"
							role="presentation"
							onmouseenter={() => hovered = { wd, h }}
							onmouseleave={() => hovered = null}
							style="cursor: default"
						/>
					{/each}
				{/each}
			</svg>
		</div>

		<!-- Legende -->
		<div class="flex items-center gap-2 text-xs text-gray-500">
			<span>wenig</span>
			{#each ['var(--t-surface2)','#431407','#7c2d12','#c2410c','#ea580c','#fc4c02'] as col}
				<span class="w-5 h-4 rounded-sm inline-block" style="background:{col}"></span>
			{/each}
			<span>viel</span>
		</div>
	{/if}
</div>
