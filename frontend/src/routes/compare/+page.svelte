<script lang="ts">
	import { onMount } from 'svelte';
	import { api, type Activity } from '$lib/api';

	// Verfügbare Jahre und Auswahl
	let availableYears = $state<number[]>([]);
	let selectedYears = $state<number[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);

	// Pro Jahr: km pro Kalenderwoche (1–53)
	type WeekMap = Map<number, number>;
	let yearData = $state<Map<number, WeekMap>>(new Map());

	// Farben pro Jahr (neuestes Jahr zuerst, orange hervorgehoben)
	const PALETTE = ['#fc4c02', '#60a5fa', '#4ade80', '#c084fc', '#f472b6', '#facc15'];

	function yearColor(year: number): string {
		const idx = selectedYears.indexOf(year);
		return PALETTE[idx % PALETTE.length];
	}

	function isoWeek(dateStr: string): number {
		const d = new Date(dateStr);
		// ISO-Woche: Donnerstag der Woche bestimmt das Jahr
		const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
		const dayOfWeek = tmp.getUTCDay() || 7;
		tmp.setUTCDate(tmp.getUTCDate() + 4 - dayOfWeek);
		const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
		return Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
	}

	function groupByWeek(acts: Activity[]): WeekMap {
		const map: WeekMap = new Map();
		for (const a of acts) {
			const w = isoWeek(a.start_date);
			map.set(w, (map.get(w) ?? 0) + a.distance_m / 1000);
		}
		return map;
	}

	async function loadYear(year: number) {
		if (yearData.has(year)) return;
		const res = await api.activities({ limit: 500, year });
		yearData = new Map(yearData).set(year, groupByWeek(res.items));
	}

	async function toggleYear(year: number) {
		if (selectedYears.includes(year)) {
			selectedYears = selectedYears.filter(y => y !== year);
		} else {
			selectedYears = [...selectedYears, year].sort((a, b) => b - a);
			await loadYear(year);
		}
	}

	onMount(async () => {
		try {
			const stats = await api.activityStats();
			// 1990 ausfiltern (offensichtlicher Ausreißer)
			availableYears = stats.available_years
				.map(Number)
				.filter(y => y > 2000)
				.sort((a, b) => b - a);

			// Standard: aktuelles und vorjähriges Jahr
			const defaults = availableYears.slice(0, 2);
			selectedYears = [...defaults].sort((a, b) => b - a);
			await Promise.all(defaults.map(loadYear));
		} catch (e) {
			error = e instanceof Error ? e.message : 'Fehler beim Laden';
		} finally {
			loading = false;
		}
	});

	// SVG-Parameter
	const W = 1000;
	const H = 260;
	const PAD = { top: 16, right: 20, bottom: 36, left: 48 };
	const chartW = W - PAD.left - PAD.right;
	const chartH = H - PAD.top - PAD.bottom;
	const WEEKS = 52;

	// Max km/Woche über alle sichtbaren Jahre
	const maxKm = $derived(() => {
		let m = 0;
		for (const year of selectedYears) {
			const map = yearData.get(year);
			if (!map) continue;
			for (const v of map.values()) if (v > m) m = v;
		}
		return Math.ceil(m / 50) * 50 || 100;
	});

	function xOf(week: number) {
		return PAD.left + ((week - 1) / (WEEKS - 1)) * chartW;
	}
	function yOf(km: number) {
		return PAD.top + chartH - (km / maxKm()) * chartH;
	}

	// Polyline-Punkte für ein Jahr
	function polylinePoints(year: number): string {
		const map = yearData.get(year);
		if (!map) return '';
		const pts: string[] = [];
		for (let w = 1; w <= WEEKS; w++) {
			const km = map.get(w) ?? 0;
			pts.push(`${xOf(w).toFixed(1)},${yOf(km).toFixed(1)}`);
		}
		return pts.join(' ');
	}

	// Gefüllter Area-Pfad für ein Jahr
	function areaPath(year: number): string {
		const map = yearData.get(year);
		if (!map) return '';
		const line: string[] = [];
		for (let w = 1; w <= WEEKS; w++) {
			const km = map.get(w) ?? 0;
			line.push(`${xOf(w).toFixed(1)},${yOf(km).toFixed(1)}`);
		}
		const bottom = (PAD.top + chartH).toFixed(1);
		return `M${line.join('L')}L${xOf(WEEKS)},${bottom}L${xOf(1)},${bottom}Z`;
	}

	// Y-Achsen-Ticks
	const yTicks = $derived(() => {
		const m = maxKm();
		const step = m <= 200 ? 50 : 100;
		const ticks: number[] = [];
		for (let v = 0; v <= m; v += step) ticks.push(v);
		return ticks;
	});

	// Monatslabels auf X-Achse (Woche 1, 5, 9, …)
	const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
	const monthTicks = $derived(() =>
		MONTHS.map((label, i) => ({
			label,
			x: xOf(Math.round(i * (WEEKS / 12)) + 1),
		}))
	);

	// Summen-Stats pro Jahr
	function yearStats(year: number) {
		const map = yearData.get(year);
		if (!map) return { totalKm: 0, weeks: 0, avgKm: 0 };
		let totalKm = 0;
		let weeks = 0;
		for (const v of map.values()) { totalKm += v; if (v > 0) weeks++; }
		return { totalKm: Math.round(totalKm), weeks, avgKm: weeks ? Math.round(totalKm / weeks) : 0 };
	}
</script>

<svelte:head>
	<title>Jahresvergleich – MyBiking</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex flex-wrap items-center justify-between gap-4">
		<h1 class="text-2xl font-bold">Jahresvergleich – km/Woche</h1>

		<!-- Jahr-Toggles -->
		<div class="flex flex-wrap gap-2">
			{#each availableYears as year}
				{@const active = selectedYears.includes(year)}
				<button
					onclick={() => toggleYear(year)}
					class="px-3 py-1.5 rounded-full text-sm font-medium border transition-all"
					style={active
						? `background: ${yearColor(year)}22; border-color: ${yearColor(year)}; color: ${yearColor(year)}`
						: 'background: transparent; border-color: var(--chart-line); color: var(--chart-text)'}
				>
					{year}
				</button>
			{/each}
		</div>
	</div>

	{#if error}
		<div class="rounded bg-red-900/50 border border-red-700 p-4 text-red-300 text-sm">{error}</div>
	{/if}

	{#if loading}
		<div class="h-64 bg-gray-800/50 animate-pulse rounded-xl"></div>
	{:else}
		<!-- Chart -->
		<div class="rounded-xl bg-gray-800/40 border border-gray-800 p-4">
			<svg viewBox="0 0 {W} {H}" class="w-full" style="height: 260px">
				<!-- Gitternetz -->
				{#each yTicks() as v}
					<line
						x1={PAD.left} y1={yOf(v).toFixed(1)}
						x2={W - PAD.right} y2={yOf(v).toFixed(1)}
						stroke="var(--chart-line)" stroke-width="1"
					/>
					<text x={PAD.left - 6} y={yOf(v) + 4} font-size="11" fill="var(--chart-text)" text-anchor="end">
						{v}
					</text>
				{/each}

				<!-- X-Achse Monatslabels -->
				{#each monthTicks() as { label, x }}
					<text x={x} y={H - 8} font-size="11" fill="var(--chart-text)" text-anchor="middle">{label}</text>
					<line x1={x} y1={PAD.top} x2={x} y2={PAD.top + chartH} stroke="var(--chart-line)" stroke-width="0.5" />
				{/each}

				<!-- Basis-Linie -->
				<line
					x1={PAD.left} y1={PAD.top + chartH}
					x2={W - PAD.right} y2={PAD.top + chartH}
					stroke="var(--chart-line)" stroke-width="1"
				/>

				<!-- Flächen (zuerst, damit Linien darüber liegen) -->
				{#each [...selectedYears].reverse() as year}
					{@const color = yearColor(year)}
					<path d={areaPath(year)} fill={color} opacity="0.08" />
				{/each}

				<!-- Linien -->
				{#each selectedYears as year}
					{@const color = yearColor(year)}
					<polyline
						points={polylinePoints(year)}
						fill="none"
						stroke={color}
						stroke-width="1.8"
						stroke-linejoin="round"
						stroke-linecap="round"
					/>
				{/each}
			</svg>
		</div>

		<!-- Statistik-Tabelle pro Jahr -->
		<div class="grid grid-cols-2 md:grid-cols-4 gap-3">
			{#each selectedYears as year}
				{@const s = yearStats(year)}
				{@const color = yearColor(year)}
				<div class="rounded-xl p-4 border" style="border-color: {color}44; background: {color}11">
					<p class="text-sm font-semibold" style="color: {color}">{year}</p>
					<p class="text-2xl font-bold mt-1">{s.totalKm.toLocaleString('de-DE')} <span class="text-xs font-normal text-gray-400">km</span></p>
					<p class="text-xs text-gray-500 mt-0.5">{s.weeks} aktive Wochen · ⌀ {s.avgKm} km/W</p>
				</div>
			{/each}
		</div>
	{/if}
</div>
