<script lang="ts">
	import { onMount } from 'svelte';
	import { api } from '$lib/api';
	import PageHeader from '$lib/PageHeader.svelte';

	interface CurveData {
		labels: string[];
		best_hr: number[];
	}

	let data = $state<CurveData | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let filterYear = $state<string>('');
	let availableYears = $state<string[]>([]);

	onMount(async () => {
		try {
			const stats = await api.activityStats();
			availableYears = stats.available_years.filter(y => Number(y) >= 2000);
			await loadCurve();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Fehler';
			loading = false;
		}
	});

	async function loadCurve() {
		loading = true;
		error = null;
		try {
			const res = await api.hrCurve(filterYear ? Number(filterYear) : undefined);
			data = { labels: res.labels, best_hr: res.best_hr };
		} catch (e) {
			error = e instanceof Error ? e.message : 'Fehler beim Laden';
		} finally {
			loading = false;
		}
	}

	// SVG
	const W = 700, H = 280;
	const PAD = { top: 20, right: 30, bottom: 48, left: 52 };
	const cW = W - PAD.left - PAD.right;
	const cH = H - PAD.top - PAD.bottom;

	const minHR = $derived(data ? Math.floor(Math.min(...data.best_hr) / 5) * 5 - 5 : 100);
	const maxHR = $derived(data ? Math.ceil(Math.max(...data.best_hr) / 5) * 5 + 5 : 180);
	const hrRange = $derived(maxHR - minHR);

	function xOf(i: number, n: number) { return PAD.left + (i / (n - 1)) * cW; }
	function yOf(hr: number) { return PAD.top + cH - ((hr - minHR) / hrRange) * cH; }

	const points = $derived(
		data ? data.best_hr.map((hr, i) => ({ x: xOf(i, data!.best_hr.length), y: yOf(hr), hr, label: data!.labels[i] })) : []
	);

	const polyline = $derived(points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '));

	// Gefüllte Fläche unter der Kurve
	const areaPath = $derived(() => {
		if (!points.length) return '';
		const baseline = (PAD.top + cH).toFixed(1);
		const line = points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('L');
		return `M${points[0].x.toFixed(1)},${baseline}L${line}L${points[points.length-1].x.toFixed(1)},${baseline}Z`;
	});

	const yTicks = $derived(() => {
		const ticks: number[] = [];
		for (let v = minHR; v <= maxHR; v += 10) ticks.push(v);
		return ticks;
	});
</script>

<svelte:head>
	<title>HR-Kurve – MyBiking</title>
</svelte:head>

<div class="space-y-6">
	<PageHeader
		title="Best-HR-Kurve"
		subtitle="Beste Durchschnitts-Herzfrequenz je Zeitfenster · gleitendes Maximum über alle Aktivitäten"
		years={availableYears}
		bind:selectedYear={filterYear}
		onchange={loadCurve}
	/>

	{#if error}
		<div class="rounded bg-red-900/50 border border-red-700 p-4 text-red-300 text-sm">{error}</div>
	{/if}

	{#if loading}
		<div class="h-72 bg-gray-800/50 animate-pulse rounded-xl"></div>
	{:else if data}
		<!-- Kennzahl-Chips -->
		<div class="flex flex-wrap gap-3">
			{#each points as p}
				<div class="rounded-xl bg-gray-800 px-4 py-3 text-center min-w-24">
					<p class="text-xs text-gray-400">{p.label}</p>
					<p class="text-xl font-bold text-red-400 mt-0.5">{p.hr.toFixed(0)}</p>
					<p class="text-xs text-gray-500">bpm</p>
				</div>
			{/each}
		</div>

		<!-- Chart -->
		<div class="rounded-xl bg-gray-800/40 border border-gray-800 p-4">
			<svg viewBox="0 0 {W} {H}" class="w-full" style="height: 280px">
				<defs>
					<linearGradient id="hrGrad" x1="0" y1="0" x2="0" y2="1">
						<stop offset="0%"   stop-color="#f87171" stop-opacity="0.4"/>
						<stop offset="100%" stop-color="#f87171" stop-opacity="0.02"/>
					</linearGradient>
				</defs>

				<!-- Gitternetz -->
				{#each yTicks() as v}
					<line
						x1={PAD.left} y1={yOf(v).toFixed(1)}
						x2={W - PAD.right} y2={yOf(v).toFixed(1)}
						stroke="var(--chart-line)" stroke-width="1"
					/>
					<text x={PAD.left - 8} y={yOf(v) + 4} font-size="12" fill="var(--chart-text)" text-anchor="end">{v}</text>
				{/each}

				<!-- Baseline -->
				<line x1={PAD.left} y1={PAD.top + cH} x2={W - PAD.right} y2={PAD.top + cH} stroke="var(--chart-line)" stroke-width="1"/>

				<!-- Fläche -->
				<path d={areaPath()} fill="url(#hrGrad)"/>

				<!-- Kurve -->
				<polyline points={polyline} fill="none" stroke="#f87171" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>

				<!-- Datenpunkte + Labels -->
				{#each points as p}
					<circle cx={p.x.toFixed(1)} cy={p.y.toFixed(1)} r="5" fill="#f87171" stroke="var(--chart-line)" stroke-width="1.5"/>
					<text x={p.x.toFixed(1)} y={p.y - 10} font-size="12" fill="#f87171" text-anchor="middle" font-weight="600">
						{p.hr.toFixed(0)}
					</text>
					<text x={p.x.toFixed(1)} y={PAD.top + cH + 18} font-size="12" fill="var(--chart-text)" text-anchor="middle">
						{p.label}
					</text>
				{/each}

				<!-- Y-Achsenbeschriftung -->
				<text
					x={PAD.left - 38} y={PAD.top + cH / 2}
					font-size="11" fill="var(--chart-muted)" text-anchor="middle"
					transform="rotate(-90, {PAD.left - 38}, {PAD.top + cH / 2})"
				>bpm</text>
			</svg>
		</div>

		<!-- Hinweis -->
		<p class="text-xs text-gray-600">
			Berechnet als gleitendes Maximum der Durchschnitts-HR über konsekutive Punkte im FIT-Track.
			Kurze Fenster (1 min) sind für Intervallspitzen, lange Fenster (60 min) für Dauerleistung aussagekräftig.
		</p>
	{/if}
</div>
