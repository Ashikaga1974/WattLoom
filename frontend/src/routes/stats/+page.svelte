<script lang="ts">
	import { onMount } from 'svelte';
	import { api, type Activity } from '$lib/api';
	import PageHeader from '$lib/PageHeader.svelte';

	let activities = $state<Activity[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let filterYear = $state<string>('');
	let availableYears = $state<string[]>([]);

	onMount(async () => {
		try {
			const [res, stats] = await Promise.all([
				api.activities({ limit: 500 }),
				api.activityStats(),
			]);
			activities = res.items;
			availableYears = stats.available_years.filter(y => Number(y) >= 2000);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Fehler beim Laden';
		} finally {
			loading = false;
		}
	});

	async function reload() {
		loading = true;
		try {
			const res = await api.activities({ limit: 500, year: filterYear || undefined });
			activities = res.items;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Fehler';
		} finally {
			loading = false;
		}
	}

	// SVG-Grundmaße
	const W = 500, H = 200;
	const PAD = { top: 12, right: 8, bottom: 30, left: 8 };
	const cW = W - PAD.left - PAD.right;
	const cH = H - PAD.top - PAD.bottom;

	interface Bucket { label: string; count: number; pct: number }

	function buildBuckets(values: number[], min: number, max: number, step: number): Bucket[] {
		const out: Bucket[] = [];
		for (let v = min; v < max; v += step) {
			const count = values.filter(x => x >= v && x < v + step).length;
			out.push({ label: String(v), count, pct: 0 });
		}
		const peak = Math.max(...out.map(b => b.count), 1);
		return out.map(b => ({ ...b, pct: b.count / peak }));
	}

	function avg(arr: number[]) { return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0; }
	function median(arr: number[]) {
		if (!arr.length) return 0;
		const s = [...arr].sort((a, b) => a - b);
		return s[Math.floor(s.length / 2)];
	}

	// SVG-Hilfsfunktionen (buckets, index → pixel)
	function bw(n: number) { return cW / n; }
	function barX(i: number, n: number) { return PAD.left + i * bw(n); }
	function barYTop(pct: number) { return PAD.top + cH - pct * cH; }
	function barHeight(pct: number) { return pct * cH; }
	function avgLineX(value: number, min: number, step: number, n: number) {
		return PAD.left + ((value - min) / step) * bw(n);
	}
	function baselineY() { return PAD.top + cH; }

	// Daten als $derived
	const speeds = $derived(
		activities.filter(a => a.avg_speed_ms != null).map(a => (a.avg_speed_ms as number) * 3.6)
	);
	const hrs = $derived(
		activities.filter(a => a.avg_hr != null).map(a => a.avg_hr as number)
	);
	const distances = $derived(activities.map(a => a.distance_m / 1000));

	const speedBuckets = $derived(buildBuckets(speeds, 10, 32, 1));
	const hrBuckets    = $derived(buildBuckets(hrs, 85, 165, 5));
	const distBuckets  = $derived(buildBuckets(distances, 0, 80, 5));

	const avgSpeed    = $derived(avg(speeds));
	const avgHr       = $derived(avg(hrs));
	const avgDistance = $derived(avg(distances));
</script>

<svelte:head>
	<title>Verteilungen – MyBiking</title>
</svelte:head>

<div class="space-y-6">
	<PageHeader title="Verteilungen" years={availableYears} bind:selectedYear={filterYear} onchange={reload} />

	{#if error}
		<div class="rounded bg-red-900/50 border border-red-700 p-4 text-red-300 text-sm">{error}</div>
	{/if}

	{#if loading}
		<div class="grid md:grid-cols-2 gap-6">
			<div class="h-56 bg-gray-800/50 animate-pulse rounded-xl"></div>
			<div class="h-56 bg-gray-800/50 animate-pulse rounded-xl"></div>
		</div>
	{:else}
		<div class="grid md:grid-cols-2 gap-6">

			<!-- Geschwindigkeit -->
			<div class="rounded-xl bg-gray-800/40 border border-gray-800 p-4">
				<div class="flex items-center justify-between mb-2">
					<h2 class="font-semibold">⌀ Geschwindigkeit</h2>
					<p class="text-xs text-gray-400">
						<span class="text-orange-400 font-semibold">{avgSpeed.toFixed(1)} km/h</span>
						· Median {median(speeds).toFixed(1)}
					</p>
				</div>
				<svg viewBox="0 0 {W} {H}" style="width:100%; height:190px">
					<line x1={PAD.left} y1={baselineY()} x2={W-PAD.right} y2={baselineY()} stroke="var(--chart-line)" stroke-width="1"/>
					{#each speedBuckets as b, i}
						<rect
							x={barX(i, speedBuckets.length) + 1}
							y={barYTop(b.pct)}
							width={bw(speedBuckets.length) - 2}
							height={barHeight(b.pct)}
							fill="#fc4c02" opacity={0.2 + b.pct * 0.75} rx="2"
						/>
						{#if i % 2 === 0}
							<text x={barX(i, speedBuckets.length) + bw(speedBuckets.length)/2} y={H-4}
								font-size="10" fill="var(--chart-text)" text-anchor="middle">{b.label}</text>
						{/if}
					{/each}
					<!-- Avg-Linie -->
					<line
						x1={avgLineX(avgSpeed, 10, 1, speedBuckets.length)}
						y1={PAD.top}
						x2={avgLineX(avgSpeed, 10, 1, speedBuckets.length)}
						y2={baselineY()}
						stroke="#fc4c02" stroke-width="1.5" stroke-dasharray="4,3"
					/>
					<text x={avgLineX(avgSpeed, 10, 1, speedBuckets.length)+3} y={PAD.top+11} font-size="10" fill="#fc4c02">⌀</text>
					<text x={W/2} y={H+2} font-size="10" fill="var(--chart-muted)" text-anchor="middle">km/h</text>
				</svg>
				<p class="text-xs text-gray-500 mt-1">{speeds.length} Rides</p>
			</div>

			<!-- Herzfrequenz -->
			<div class="rounded-xl bg-gray-800/40 border border-gray-800 p-4">
				<div class="flex items-center justify-between mb-2">
					<h2 class="font-semibold">⌀ Herzfrequenz</h2>
					<p class="text-xs text-gray-400">
						<span class="text-blue-400 font-semibold">{avgHr.toFixed(0)} bpm</span>
						· Median {median(hrs).toFixed(0)}
					</p>
				</div>
				<svg viewBox="0 0 {W} {H}" style="width:100%; height:190px">
					<line x1={PAD.left} y1={baselineY()} x2={W-PAD.right} y2={baselineY()} stroke="var(--chart-line)" stroke-width="1"/>
					{#each hrBuckets as b, i}
						<rect
							x={barX(i, hrBuckets.length) + 1}
							y={barYTop(b.pct)}
							width={bw(hrBuckets.length) - 2}
							height={barHeight(b.pct)}
							fill="#60a5fa" opacity={0.2 + b.pct * 0.75} rx="2"
						/>
						{#if i % 2 === 0}
							<text x={barX(i, hrBuckets.length) + bw(hrBuckets.length)/2} y={H-4}
								font-size="10" fill="var(--chart-text)" text-anchor="middle">{b.label}</text>
						{/if}
					{/each}
					<line
						x1={avgLineX(avgHr, 85, 5, hrBuckets.length)}
						y1={PAD.top}
						x2={avgLineX(avgHr, 85, 5, hrBuckets.length)}
						y2={baselineY()}
						stroke="#60a5fa" stroke-width="1.5" stroke-dasharray="4,3"
					/>
					<text x={avgLineX(avgHr, 85, 5, hrBuckets.length)+3} y={PAD.top+11} font-size="10" fill="#60a5fa">⌀</text>
					<text x={W/2} y={H+2} font-size="10" fill="var(--chart-muted)" text-anchor="middle">bpm</text>
				</svg>
				<p class="text-xs text-gray-500 mt-1">{hrs.length} Rides mit HR-Daten</p>
			</div>
		</div>

		<!-- Distanz -->
		<div class="rounded-xl bg-gray-800/40 border border-gray-800 p-4">
			<div class="flex items-center justify-between mb-2">
				<h2 class="font-semibold">Distanz-Verteilung</h2>
				<p class="text-xs text-gray-400">
					<span class="text-green-400 font-semibold">{avgDistance.toFixed(1)} km</span>
					Schnitt · Median {median(distances).toFixed(1)} km
				</p>
			</div>
			<svg viewBox="0 0 {W} {H}" style="width:100%; height:190px">
				<line x1={PAD.left} y1={baselineY()} x2={W-PAD.right} y2={baselineY()} stroke="var(--chart-line)" stroke-width="1"/>
				{#each distBuckets as b, i}
					<rect
						x={barX(i, distBuckets.length) + 0.5}
						y={barYTop(b.pct)}
						width={bw(distBuckets.length) - 1}
						height={barHeight(b.pct)}
						fill="#4ade80" opacity={0.2 + b.pct * 0.75} rx="2"
					/>
					{#if i % 2 === 0}
						<text x={barX(i, distBuckets.length) + bw(distBuckets.length)/2} y={H-4}
							font-size="10" fill="var(--chart-text)" text-anchor="middle">{b.label}</text>
					{/if}
				{/each}
				<line
					x1={avgLineX(avgDistance, 0, 5, distBuckets.length)}
					y1={PAD.top}
					x2={avgLineX(avgDistance, 0, 5, distBuckets.length)}
					y2={baselineY()}
					stroke="#4ade80" stroke-width="1.5" stroke-dasharray="4,3"
				/>
				<text x={avgLineX(avgDistance, 0, 5, distBuckets.length)+3} y={PAD.top+11} font-size="10" fill="#4ade80">⌀</text>
				<text x={W/2} y={H+2} font-size="10" fill="var(--chart-muted)" text-anchor="middle">km</text>
			</svg>
			<p class="text-xs text-gray-500 mt-1">{distances.length} Rides</p>
		</div>
	{/if}
</div>
