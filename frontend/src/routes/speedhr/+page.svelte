<script lang="ts">
	import { onMount } from 'svelte';
	import { api } from '$lib/api';

	const PALETTE = ['#fc4c02', '#60a5fa', '#4ade80', '#c084fc', '#f472b6', '#facc15'];

	interface Point { year: number; speed_kmh: number; hr: number; dist_km: number; }

	let allPoints = $state<Point[]>([]);
	let loading   = $state(true);
	let error     = $state<string | null>(null);
	let activeYears = $state(new Set<number>());
	let hovered   = $state<Point | null>(null);

	onMount(async () => {
		try {
			const res = await api.speedHr();
			allPoints   = res.points.filter(p => p.year >= 2000);
			activeYears = new Set(allPoints.map(p => p.year));
		} catch (e) {
			error = e instanceof Error ? e.message : 'Fehler';
		} finally {
			loading = false;
		}
	});

	const years   = $derived([...new Set(allPoints.map(p => p.year))].sort());
	const visible = $derived(allPoints.filter(p => activeYears.has(p.year)));

	function yearColor(year: number): string {
		return PALETTE[years.indexOf(year) % PALETTE.length];
	}

	function toggleYear(year: number) {
		const next = new Set(activeYears);
		if (next.has(year)) { if (next.size > 1) next.delete(year); }
		else next.add(year);
		activeYears = next;
	}

	// Achsen-Grenzen
	const minS = $derived(visible.length ? Math.floor(Math.min(...visible.map(p => p.speed_kmh)) / 5) * 5 - 1 : 10);
	const maxS = $derived(visible.length ? Math.ceil( Math.max(...visible.map(p => p.speed_kmh)) / 5) * 5 + 1 : 30);
	const minH = $derived(visible.length ? Math.floor(Math.min(...visible.map(p => p.hr)) / 10) * 10 - 5 : 90);
	const maxH = $derived(visible.length ? Math.ceil( Math.max(...visible.map(p => p.hr)) / 10) * 10 + 5 : 160);

	// SVG
	const W = 700, H = 340;
	const PAD = { top: 20, right: 140, bottom: 48, left: 52 };
	const cW  = W - PAD.left - PAD.right;
	const cH  = H - PAD.top  - PAD.bottom;

	function xOf(s: number) { return PAD.left + ((s - minS) / (maxS - minS)) * cW; }
	function yOf(h: number) { return PAD.top  + cH - ((h - minH) / (maxH - minH)) * cH; }

	const xTicks = $derived(
		(() => {
			const t: number[] = [];
			for (let v = Math.ceil(minS / 5) * 5; v <= maxS; v += 5) t.push(v);
			return t;
		})()
	);
	const yTicks = $derived(
		(() => {
			const t: number[] = [];
			for (let v = Math.ceil(minH / 10) * 10; v <= maxH; v += 10) t.push(v);
			return t;
		})()
	);

	// Schwerpunkte pro Jahr
	const centroids = $derived(
		years
			.filter(y => activeYears.has(y))
			.map(y => {
				const pts = visible.filter(p => p.year === y);
				const avgS = pts.reduce((s, p) => s + p.speed_kmh, 0) / pts.length;
				const avgH = pts.reduce((s, p) => s + p.hr, 0) / pts.length;
				return { year: y, speed_kmh: avgS, hr: avgH, count: pts.length };
			})
	);
</script>

<svelte:head>
	<title>Speed–HR Scatter – MyBiking</title>
</svelte:head>

<div class="space-y-6">
	<div>
		<h1 class="text-2xl font-bold">Speed–HR Scatter</h1>
		<p class="text-xs text-gray-500 mt-0.5">
			Ø Geschwindigkeit vs. Ø Herzfrequenz je Aktivität · Kreuz = Jahresmittel
		</p>
	</div>

	{#if error}
		<div class="rounded bg-red-900/50 border border-red-700 p-4 text-red-300 text-sm">{error}</div>
	{/if}

	{#if loading}
		<div class="h-80 bg-gray-800/50 animate-pulse rounded-xl"></div>
	{:else if allPoints.length}
		<!-- Jahres-Toggle -->
		<div class="flex flex-wrap gap-2">
			{#each years as y}
				<button
					onclick={() => toggleYear(y)}
					class="rounded-full px-3 py-1 text-sm font-medium transition-opacity"
					style="background:{yearColor(y)}22; color:{yearColor(y)}; border:1px solid {yearColor(y)}55; opacity:{activeYears.has(y) ? 1 : 0.35}"
				>{y}</button>
			{/each}
		</div>

		<!-- Chart -->
		<div class="rounded-xl bg-gray-800/40 border border-gray-800 p-4 relative">
			<!-- Hover-Tooltip -->
			{#if hovered}
				<div class="absolute top-4 right-4 rounded-lg bg-gray-900 border border-gray-700 px-3 py-2 text-sm pointer-events-none z-10">
					<p class="font-semibold" style="color:{yearColor(hovered.year)}">{hovered.year}</p>
					<p class="text-gray-300 mt-0.5">{hovered.speed_kmh.toFixed(1)} km/h · {hovered.hr.toFixed(0)} bpm</p>
					<p class="text-gray-500 text-xs">{hovered.dist_km.toFixed(0)} km</p>
				</div>
			{/if}

			<svg viewBox="0 0 {W} {H}" class="w-full" style="height:{H}px">
				<!-- Gitternetz Y -->
				{#each yTicks as v}
					<line
						x1={PAD.left} y1={yOf(v).toFixed(1)}
						x2={W - PAD.right} y2={yOf(v).toFixed(1)}
						stroke="var(--chart-line)" stroke-width="1"
					/>
					<text x={PAD.left - 8} y={yOf(v) + 4} font-size="11" fill="var(--chart-text)" text-anchor="end">{v}</text>
				{/each}

				<!-- Gitternetz X -->
				{#each xTicks as v}
					<line
						x1={xOf(v).toFixed(1)} y1={PAD.top}
						x2={xOf(v).toFixed(1)} y2={PAD.top + cH}
						stroke="var(--chart-line)" stroke-width="1"
					/>
					<text x={xOf(v)} y={PAD.top + cH + 16} font-size="11" fill="var(--chart-text)" text-anchor="middle">{v}</text>
				{/each}

				<!-- Achsen -->
				<line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + cH} stroke="var(--chart-line)" stroke-width="1"/>
				<line x1={PAD.left} y1={PAD.top + cH} x2={W - PAD.right} y2={PAD.top + cH} stroke="var(--chart-line)" stroke-width="1"/>

				<!-- Achsenbeschriftungen -->
				<text x={PAD.left + cW / 2} y={H - 4} font-size="11" fill="var(--chart-muted)" text-anchor="middle">km/h</text>
				<text
					x={PAD.left - 38} y={PAD.top + cH / 2}
					font-size="11" fill="var(--chart-muted)" text-anchor="middle"
					transform="rotate(-90, {PAD.left - 38}, {PAD.top + cH / 2})"
				>bpm</text>

				<!-- Datenpunkte -->
				{#each visible as p}
					<circle
						cx={xOf(p.speed_kmh).toFixed(1)} cy={yOf(p.hr).toFixed(1)}
						r="5"
						fill={yearColor(p.year)} fill-opacity="0.55"
						stroke={hovered === p ? '#fff' : yearColor(p.year)} stroke-opacity={hovered === p ? 0.9 : 0.2} stroke-width="1"
						style="cursor:default"
						role="presentation"
						onmouseenter={() => hovered = p}
						onmouseleave={() => hovered = null}
					/>
				{/each}

				<!-- Schwerpunkt-Kreuz pro Jahr -->
				{#each centroids as c}
					{@const cx = xOf(c.speed_kmh)}
					{@const cy = yOf(c.hr)}
					{@const col = yearColor(c.year)}
					<line x1={cx - 8} y1={cy} x2={cx + 8} y2={cy} stroke={col} stroke-width="2.5"/>
					<line x1={cx} y1={cy - 8} x2={cx} y2={cy + 8} stroke={col} stroke-width="2.5"/>
					<circle cx={cx} cy={cy} r="4" fill={col} stroke="var(--t-bg)" stroke-width="1.5"/>
				{/each}

				<!-- Legende rechts -->
				{#each years as y, i}
					{@const col = yearColor(y)}
					{@const lx = W - PAD.right + 12}
					{@const ly = PAD.top + i * 22}
					<circle cx={lx + 6} cy={ly + 6} r="5" fill={col} fill-opacity={activeYears.has(y) ? 0.7 : 0.2}/>
					<text x={lx + 16} y={ly + 10} font-size="12" fill={activeYears.has(y) ? col : 'var(--chart-muted)'}>{y}</text>
				{/each}
			</svg>
		</div>

		<p class="text-xs text-gray-600">
			Jeder Punkt ist eine Aktivität. Das Kreuz markiert den Jahresmittelwert.
			Bewegt sich das Kreuz nach rechts (höhere Geschwindigkeit bei gleicher HR) → Fitnesszuwachs.
		</p>
	{/if}
</div>
