<script lang="ts">
	import { onMount } from 'svelte';
	import { api, type BikeCompareData, type BikeCompareSummary } from '$lib/api';

	let data = $state<BikeCompareData | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);

	// Farben pro Bike-Index
	const BIKE_COLORS = ['#3b82f6', '#f97316'];

	function bikeColor(idx: number): string {
		return BIKE_COLORS[idx % BIKE_COLORS.length];
	}

	onMount(async () => {
		try {
			data = await api.bikeCompare();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Fehler beim Laden';
		} finally {
			loading = false;
		}
	});

	// --- Histogramm-Bins ---
	// Grenzen: 0,10,20,30,40,50,60,70,80,90,100,∞
	const BINS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
	const BIN_LABELS = ['0–10', '10–20', '20–30', '30–40', '40–50', '50–60', '60–70', '70–80', '80–90', '90–100', '100+'];

	function buildHistogram(dists: number[]): number[] {
		const counts = new Array(BINS.length).fill(0);
		for (const d of dists) {
			const idx = BINS.findIndex((b, i) => d >= b && (i === BINS.length - 1 || d < BINS[i + 1]));
			if (idx >= 0) counts[idx]++;
		}
		return counts;
	}

	// 1990-Fehldaten und andere unrealistische Jahre rausfiltern
	const filteredYearly = $derived(data?.yearly.filter(y => parseInt(y.year) >= 2000) ?? []);

	// Berechnete Histogramme
	const histograms = $derived(
		data ? Object.fromEntries(
			data.summary.map(b => [b.id, buildHistogram(data!.distances[b.id] ?? [])])
		) : {}
	);

	// --- SVG-Hilfsfunktionen ---

	// Gruppiertes Balkendiagramm: Aktivitäten pro Jahr
	const BAR_W = 900;
	const BAR_H = 240;
	const BAR_PAD = { top: 16, right: 16, bottom: 40, left: 48 };
	const barChartW = BAR_W - BAR_PAD.left - BAR_PAD.right;
	const barChartH = BAR_H - BAR_PAD.top - BAR_PAD.bottom;

	const yearlyChartData = $derived(() => {
		if (!filteredYearly.length) return { years: [], maxRides: 0 };
		const years = filteredYearly.map(y => y.year);
		const bikeIds = data!.summary.map(b => b.id);
		let maxRides = 0;
		for (const y of filteredYearly) {
			for (const bid of bikeIds) {
				const r = y.bikes[bid]?.rides ?? 0;
				if (r > maxRides) maxRides = r;
			}
		}
		return { years, bikeIds, maxRides: Math.ceil(maxRides / 10) * 10 || 10 };
	});

	function barGroupX(yearIdx: number, totalYears: number): number {
		const groupW = barChartW / totalYears;
		return BAR_PAD.left + yearIdx * groupW;
	}

	function barX(yearIdx: number, bikeIdx: number, numBikes: number, totalYears: number): number {
		const groupW = barChartW / totalYears;
		const margin = groupW * 0.1;
		const availW = groupW - margin * 2;
		const barW = availW / numBikes;
		return BAR_PAD.left + yearIdx * groupW + margin + bikeIdx * barW;
	}

	function barW(totalYears: number, numBikes: number): number {
		const groupW = barChartW / totalYears;
		const margin = groupW * 0.1;
		return (groupW - margin * 2) / numBikes - 1;
	}

	function barY(rides: number, maxRides: number): number {
		return BAR_PAD.top + barChartH - (rides / maxRides) * barChartH;
	}

	function barHeight(rides: number, maxRides: number): number {
		return (rides / maxRides) * barChartH;
	}

	// Y-Achse Ticks für Balkendiagramm
	function yTicks(maxVal: number, steps = 5): number[] {
		const step = Math.ceil(maxVal / steps / 5) * 5 || 5;
		const ticks: number[] = [];
		for (let v = 0; v <= maxVal; v += step) ticks.push(v);
		return ticks;
	}

	// --- Liniendiagramm: Ø Geschwindigkeit über Jahre ---
	const LINE_W = 900;
	const LINE_H = 220;
	const LINE_PAD = { top: 16, right: 16, bottom: 36, left: 52 };
	const lineChartW = LINE_W - LINE_PAD.left - LINE_PAD.right;
	const lineChartH = LINE_H - LINE_PAD.top - LINE_PAD.bottom;

	const speedChartData = $derived(() => {
		if (!filteredYearly.length) return { years: [], bikeIds: [], minSpeed: 0, maxSpeed: 0 };
		const bikeIds = data!.summary.map(b => b.id);
		const allSpeeds = filteredYearly.flatMap(y =>
			bikeIds.map(bid => y.bikes[bid]?.avg_speed_kmh ?? null).filter(v => v !== null) as number[]
		);
		const minSpeed = Math.floor(Math.min(...allSpeeds) - 1);
		const maxSpeed = Math.ceil(Math.max(...allSpeeds) + 1);
		const years = filteredYearly.map(y => y.year);
		return { years, bikeIds, minSpeed, maxSpeed };
	});

	function lineX(yearIdx: number, totalYears: number): number {
		if (totalYears <= 1) return LINE_PAD.left + lineChartW / 2;
		return LINE_PAD.left + (yearIdx / (totalYears - 1)) * lineChartW;
	}

	function lineY(speed: number, minSpeed: number, maxSpeed: number): number {
		const range = maxSpeed - minSpeed || 1;
		return LINE_PAD.top + lineChartH - ((speed - minSpeed) / range) * lineChartH;
	}

	function speedPolyline(bikeId: string, years: string[], minSpeed: number, maxSpeed: number): string {
		if (!data) return '';
		const pts: string[] = [];
		years.forEach((yr, i) => {
			const speed = filteredYearly.find(y => y.year === yr)?.bikes[bikeId]?.avg_speed_kmh;
			if (speed == null) return;
			pts.push(`${lineX(i, years.length).toFixed(1)},${lineY(speed, minSpeed, maxSpeed).toFixed(1)}`);
		});
		return pts.join(' ');
	}

	// Y-Achse Ticks für Liniendiagramm
	function speedYTicks(minSpeed: number, maxSpeed: number): number[] {
		const range = maxSpeed - minSpeed;
		const step = range > 10 ? 2 : 1;
		const ticks: number[] = [];
		for (let v = Math.ceil(minSpeed); v <= maxSpeed; v += step) ticks.push(v);
		return ticks;
	}

	// --- Histogramm SVG ---
	const HIST_W = 900;
	const HIST_H = 220;
	const HIST_PAD = { top: 16, right: 16, bottom: 40, left: 52 };
	const histChartW = HIST_W - HIST_PAD.left - HIST_PAD.right;
	const histChartH = HIST_H - HIST_PAD.top - HIST_PAD.bottom;

	const histChartData = $derived(() => {
		if (!data?.summary.length) return { bikeIds: [], maxCount: 0 };
		const bikeIds = data.summary.map(b => b.id);
		let maxCount = 0;
		for (const bid of bikeIds) {
			const h = buildHistogram(data.distances[bid] ?? []);
			for (const c of h) if (c > maxCount) maxCount = c;
		}
		return { bikeIds, maxCount: Math.ceil(maxCount / 5) * 5 || 5 };
	});

	function histBarX(binIdx: number, bikeIdx: number, numBikes: number): number {
		const groupW = histChartW / BINS.length;
		const margin = groupW * 0.08;
		const availW = groupW - margin * 2;
		const bw = availW / numBikes;
		return HIST_PAD.left + binIdx * groupW + margin + bikeIdx * bw;
	}

	function histBarW(numBikes: number): number {
		const groupW = histChartW / BINS.length;
		const margin = groupW * 0.08;
		return (groupW - margin * 2) / numBikes - 1;
	}

	function histBarY(count: number, maxCount: number): number {
		return HIST_PAD.top + histChartH - (count / maxCount) * histChartH;
	}

	function histBarHeight(count: number, maxCount: number): number {
		return (count / maxCount) * histChartH;
	}

	function histGroupCenterX(binIdx: number): number {
		const groupW = histChartW / BINS.length;
		return HIST_PAD.left + binIdx * groupW + groupW / 2;
	}

	// --- Kennzahlen formatieren ---
	function fmtNum(n: number, decimals = 0): string {
		return n.toLocaleString('de-DE', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
	}
</script>

<svelte:head>
	<title>Bike-Vergleich – MyBiking</title>
</svelte:head>

<div class="space-y-8">
	<h1 class="text-2xl font-bold">Bike-Vergleich</h1>

	{#if error}
		<div class="rounded bg-red-900/50 border border-red-700 p-4 text-red-300 text-sm">{error}</div>
	{/if}

	{#if loading}
		<div class="space-y-4">
			<div class="h-40 bg-gray-800/50 animate-pulse rounded-xl"></div>
			<div class="h-64 bg-gray-800/50 animate-pulse rounded-xl"></div>
			<div class="h-56 bg-gray-800/50 animate-pulse rounded-xl"></div>
		</div>
	{:else if data?.summary.length}

		<!-- 1. Kennzahlen-Cards -->
		<section>
			<h2 class="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Kennzahlen</h2>
			<div class="overflow-x-auto">
				<table class="w-full text-sm">
					<thead>
						<tr class="border-b border-gray-700">
							<th class="text-left py-2 pr-4 text-gray-500 font-normal text-xs"></th>
							{#each data.summary as bike, i}
								<th class="text-right py-2 px-3 font-semibold" style="color: {bikeColor(i)}">
									{bike.name}
								</th>
							{/each}
						</tr>
					</thead>
					<tbody class="divide-y divide-gray-800">
						{#each [
							{ label: 'Rides',             key: 'rides',             fmt: (v: number) => fmtNum(v),    unit: '' },
							{ label: 'Gesamt km',         key: 'total_km',          fmt: (v: number) => fmtNum(v, 1), unit: ' km' },
							{ label: 'Gesamt Höhenmeter', key: 'total_elevation_m', fmt: (v: number) => fmtNum(v),    unit: ' m' },
							{ label: 'Gesamt Stunden',    key: 'total_hours',       fmt: (v: number) => fmtNum(v, 1), unit: ' h' },
							{ label: 'Ø Distanz',         key: 'avg_dist_km',       fmt: (v: number) => fmtNum(v, 1), unit: ' km' },
							{ label: 'Ø Geschwindigkeit', key: 'avg_speed_kmh',     fmt: (v: number) => fmtNum(v, 1), unit: ' km/h' },
							{ label: 'Ø Höhenmeter/Ride', key: 'avg_elevation_m',   fmt: (v: number) => fmtNum(v),    unit: ' m' },
						] as row}
							<tr class="hover:bg-gray-800/30 transition-colors">
								<td class="py-2.5 pr-4 text-gray-500 text-xs">{row.label}</td>
								{#each data.summary as bike, i}
									{@const val = (bike as Record<string, number>)[row.key]}
									<td class="text-right py-2.5 px-3 font-mono tabular-nums">
										<span style="color: {bikeColor(i)}">{row.fmt(val)}</span>
										<span class="text-gray-600 text-xs">{row.unit}</span>
									</td>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>

		<!-- 2. Aktivitäten pro Jahr (gruppierter Balken) -->
		{#if filteredYearly.length > 0}
			{@const ycd = yearlyChartData()}
			<section>
				<h2 class="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Aktivitäten pro Jahr</h2>
				<div class="rounded-xl bg-gray-800/40 border border-gray-800 p-4">
					<!-- Legende -->
					<div class="flex gap-5 mb-3 text-xs text-gray-400">
						{#each data.summary as bike, i}
							<span class="flex items-center gap-1.5">
								<span class="inline-block w-3 h-3 rounded-sm" style="background: {bikeColor(i)}"></span>
								{bike.name}
							</span>
						{/each}
					</div>
					<svg viewBox="0 0 {BAR_W} {BAR_H}" class="w-full" style="height: {BAR_H}px">
						<!-- Y-Gitternetz -->
						{#each yTicks(ycd.maxRides) as v}
							<line
								x1={BAR_PAD.left} y1={barY(v, ycd.maxRides).toFixed(1)}
								x2={BAR_W - BAR_PAD.right} y2={barY(v, ycd.maxRides).toFixed(1)}
								stroke="var(--chart-line, #374151)" stroke-width={v === 0 ? 1 : 0.7}
							/>
							<text x={BAR_PAD.left - 6} y={barY(v, ycd.maxRides) + 4}
								font-size="11" fill="var(--chart-text, #9ca3af)" text-anchor="end">{v}</text>
						{/each}

						<!-- Balken -->
						{#each filteredYearly as yearEntry, yi}
							{#each data.summary as bike, bi}
								{@const rides = yearEntry.bikes[bike.id]?.rides ?? 0}
								{@const bx = barX(yi, bi, data.summary.length, filteredYearly.length)}
								{@const bw = barW(filteredYearly.length, data.summary.length)}
								{@const by = barY(rides, ycd.maxRides)}
								{@const bh = barHeight(rides, ycd.maxRides)}
								{#if rides > 0}
									<rect
										x={bx.toFixed(1)} y={by.toFixed(1)}
										width={Math.max(bw, 2).toFixed(1)} height={bh.toFixed(1)}
										fill={bikeColor(bi)} opacity="0.85" rx="2"
									/>
								{/if}
							{/each}
							<!-- X-Label: Jahr -->
							<text
								x={barGroupX(yi, filteredYearly.length) + (barChartW / filteredYearly.length) / 2}
								y={BAR_H - 8}
								font-size="10" fill="var(--chart-text, #9ca3af)" text-anchor="middle"
							>{yearEntry.year}</text>
						{/each}

						<!-- Basis-Linie -->
						<line
							x1={BAR_PAD.left} y1={BAR_PAD.top + barChartH}
							x2={BAR_W - BAR_PAD.right} y2={BAR_PAD.top + barChartH}
							stroke="var(--chart-line, #374151)" stroke-width="1"
						/>
					</svg>
				</div>
			</section>
		{/if}

		<!-- 3. Ø Geschwindigkeit über Jahre (Liniendiagramm) -->
		{#if filteredYearly.length > 1}
			{@const scd = speedChartData()}
			<section>
				<h2 class="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Ø Geschwindigkeit über Jahre</h2>
				<div class="rounded-xl bg-gray-800/40 border border-gray-800 p-4">
					<!-- Legende -->
					<div class="flex gap-5 mb-3 text-xs text-gray-400">
						{#each data.summary as bike, i}
							<span class="flex items-center gap-1.5">
								<span class="inline-block w-6 h-0.5 rounded" style="background: {bikeColor(i)}"></span>
								{bike.name}
							</span>
						{/each}
					</div>
					<svg viewBox="0 0 {LINE_W} {LINE_H}" class="w-full" style="height: {LINE_H}px">
						<!-- Y-Gitternetz -->
						{#each speedYTicks(scd.minSpeed, scd.maxSpeed) as v}
							<line
								x1={LINE_PAD.left} y1={lineY(v, scd.minSpeed, scd.maxSpeed).toFixed(1)}
								x2={LINE_W - LINE_PAD.right} y2={lineY(v, scd.minSpeed, scd.maxSpeed).toFixed(1)}
								stroke="var(--chart-line, #374151)" stroke-width="0.7"
							/>
							<text x={LINE_PAD.left - 6} y={lineY(v, scd.minSpeed, scd.maxSpeed) + 4}
								font-size="11" fill="var(--chart-text, #9ca3af)" text-anchor="end">{v}</text>
						{/each}

						<!-- Y-Achsen-Label -->
						<text
							x={10} y={LINE_PAD.top + lineChartH / 2}
							font-size="10" fill="var(--chart-text, #9ca3af)" text-anchor="middle"
							transform="rotate(-90, 10, {LINE_PAD.top + lineChartH / 2})"
						>km/h</text>

						<!-- X-Jahres-Labels -->
						{#each scd.years as yr, i}
							<text
								x={lineX(i, scd.years.length)} y={LINE_H - 8}
								font-size="10" fill="var(--chart-text, #9ca3af)" text-anchor="middle"
							>{yr}</text>
						{/each}

						<!-- Basis-Linie -->
						<line
							x1={LINE_PAD.left} y1={LINE_PAD.top + lineChartH}
							x2={LINE_W - LINE_PAD.right} y2={LINE_PAD.top + lineChartH}
							stroke="var(--chart-line, #374151)" stroke-width="1"
						/>

						<!-- Linien pro Bike -->
						{#each data.summary as bike, i}
							{@const pts = speedPolyline(bike.id, scd.years, scd.minSpeed, scd.maxSpeed)}
							{#if pts}
								<polyline
									points={pts}
									fill="none"
									stroke={bikeColor(i)}
									stroke-width="2"
									stroke-linejoin="round"
									stroke-linecap="round"
								/>
							{/if}
							<!-- Datenpunkte -->
							{#each scd.years as yr, yi}
								{@const speed = filteredYearly.find(y => y.year === yr)?.bikes[bike.id]?.avg_speed_kmh}
								{#if speed != null}
									<circle
										cx={lineX(yi, scd.years.length).toFixed(1)}
										cy={lineY(speed, scd.minSpeed, scd.maxSpeed).toFixed(1)}
										r="3.5" fill={bikeColor(i)}
										stroke="var(--color-bg, #030712)" stroke-width="1.5"
									/>
								{/if}
							{/each}
						{/each}
					</svg>
				</div>
			</section>
		{/if}

		<!-- 4. Distanzverteilung (Histogramm) -->
		{#if Object.keys(data.distances).length > 0}
			{@const hcd = histChartData()}
			<section>
				<h2 class="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Distanzverteilung</h2>
				<div class="rounded-xl bg-gray-800/40 border border-gray-800 p-4">
					<!-- Legende -->
					<div class="flex gap-5 mb-3 text-xs text-gray-400">
						{#each data.summary as bike, i}
							<span class="flex items-center gap-1.5">
								<span class="inline-block w-3 h-3 rounded-sm" style="background: {bikeColor(i)}"></span>
								{bike.name}
							</span>
						{/each}
					</div>
					<svg viewBox="0 0 {HIST_W} {HIST_H}" class="w-full" style="height: {HIST_H}px">
						<!-- Y-Gitternetz -->
						{#each yTicks(hcd.maxCount) as v}
							<line
								x1={HIST_PAD.left} y1={histBarY(v, hcd.maxCount).toFixed(1)}
								x2={HIST_W - HIST_PAD.right} y2={histBarY(v, hcd.maxCount).toFixed(1)}
								stroke="var(--chart-line, #374151)" stroke-width={v === 0 ? 1 : 0.7}
							/>
							<text x={HIST_PAD.left - 6} y={histBarY(v, hcd.maxCount) + 4}
								font-size="11" fill="var(--chart-text, #9ca3af)" text-anchor="end">{v}</text>
						{/each}

						<!-- Balken -->
						{#each BINS as _, binIdx}
							{#each data.summary as bike, bi}
								{@const count = (histograms[bike.id] ?? [])[binIdx] ?? 0}
								{@const bx = histBarX(binIdx, bi, data.summary.length)}
								{@const bw = histBarW(data.summary.length)}
								{@const by = histBarY(count, hcd.maxCount)}
								{@const bh = histBarHeight(count, hcd.maxCount)}
								{#if count > 0}
									<rect
										x={bx.toFixed(1)} y={by.toFixed(1)}
										width={Math.max(bw, 2).toFixed(1)} height={bh.toFixed(1)}
										fill={bikeColor(bi)} opacity="0.85" rx="2"
									/>
								{/if}
							{/each}
							<!-- X-Label: Bin -->
							<text
								x={histGroupCenterX(binIdx)} y={HIST_H - 8}
								font-size="9" fill="var(--chart-text, #9ca3af)" text-anchor="middle"
							>{BIN_LABELS[binIdx]}</text>
						{/each}

						<!-- Basis-Linie -->
						<line
							x1={HIST_PAD.left} y1={HIST_PAD.top + histChartH}
							x2={HIST_W - HIST_PAD.right} y2={HIST_PAD.top + histChartH}
							stroke="var(--chart-line, #374151)" stroke-width="1"
						/>

						<!-- X-Achsen-Label -->
						<text
							x={HIST_PAD.left + histChartW / 2} y={HIST_H - 0}
							font-size="10" fill="var(--chart-text, #9ca3af)" text-anchor="middle"
						>Distanz (km)</text>
					</svg>
				</div>
			</section>
		{/if}

	{:else if !loading}
		<p class="text-gray-500 text-sm">Keine Bike-Daten vorhanden. Erst importieren.</p>
	{/if}
</div>
