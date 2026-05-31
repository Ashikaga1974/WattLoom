<script lang="ts">
	import { onMount } from 'svelte';
	import { api } from '$lib/api';

	const PALETTE = ['#fc4c02', '#60a5fa', '#4ade80', '#c084fc', '#f472b6', '#facc15'];

	interface Pt { temp_c: number; speed_kmh: number; hr: number; year: number; dist_km: number; }

	let pts     = $state<Pt[]>([]);
	let loading = $state(true);
	let error   = $state<string | null>(null);
	let hovS    = $state<Pt | null>(null);
	let hovH    = $state<Pt | null>(null);

	onMount(async () => {
		try {
			const res = await api.tempCorrelation();
			pts = res.points.filter(p => p.year >= 2000);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Fehler';
		} finally {
			loading = false;
		}
	});

	const years = $derived([...new Set(pts.map(p => p.year))].sort());
	function col(y: number) { return PALETTE[years.indexOf(y) % PALETTE.length]; }

	// Lineare Regression
	function linReg(xs: number[], ys: number[]) {
		const n = xs.length;
		if (n < 2) return null;
		const sx  = xs.reduce((a, v) => a + v, 0);
		const sy  = ys.reduce((a, v) => a + v, 0);
		const sxy = xs.reduce((a, v, i) => a + v * ys[i], 0);
		const sxx = xs.reduce((a, v) => a + v * v, 0);
		const denom = n * sxx - sx * sx;
		if (denom === 0) return null;
		const slope = (n * sxy - sx * sy) / denom;
		const intercept = (sy - slope * sx) / n;
		return { slope, intercept };
	}

	const regS = $derived(linReg(pts.map(p => p.temp_c), pts.map(p => p.speed_kmh)));
	const regH = $derived(linReg(pts.map(p => p.temp_c), pts.map(p => p.hr)));

	// Insight: Δ pro 10°C
	const insightSpeed = $derived(regS ? (regS.slope * 10).toFixed(1) : null);
	const insightHR    = $derived(regH ? (regH.slope * 10).toFixed(1) : null);

	// ── SVG Layout (geteilt für beide Charts) ──
	const W = 680, H = 260;
	const PAD = { top: 20, right: 20, bottom: 44, left: 52 };
	const cW = W - PAD.left - PAD.right;
	const cH = H - PAD.top - PAD.bottom;

	const tMin = $derived(pts.length ? Math.floor(Math.min(...pts.map(p => p.temp_c)) / 5) * 5 - 1 : 0);
	const tMax = $derived(pts.length ? Math.ceil( Math.max(...pts.map(p => p.temp_c)) / 5) * 5 + 1 : 40);

	function tx(t: number) { return PAD.left + ((t - tMin) / (tMax - tMin)) * cW; }

	// Speed chart
	const sMin = $derived(pts.length ? Math.floor(Math.min(...pts.map(p => p.speed_kmh)) / 5) * 5 - 1 : 10);
	const sMax = $derived(pts.length ? Math.ceil( Math.max(...pts.map(p => p.speed_kmh)) / 5) * 5 + 1 : 35);
	function sy(s: number) { return PAD.top + cH - ((s - sMin) / (sMax - sMin)) * cH; }

	// HR chart
	const hMin = $derived(pts.length ? Math.floor(Math.min(...pts.map(p => p.hr)) / 10) * 10 - 5 : 100);
	const hMax = $derived(pts.length ? Math.ceil( Math.max(...pts.map(p => p.hr)) / 10) * 10 + 5 : 160);
	function hy(h: number) { return PAD.top + cH - ((h - hMin) / (hMax - hMin)) * cH; }

	const tTicks = $derived(
		(() => { const t: number[] = []; for (let v = Math.ceil(tMin/5)*5; v <= tMax; v+=5) t.push(v); return t; })()
	);
	const sTicks = $derived(
		(() => { const t: number[] = []; for (let v = Math.ceil(sMin/5)*5; v <= sMax; v+=5) t.push(v); return t; })()
	);
	const hTicks = $derived(
		(() => { const t: number[] = []; for (let v = Math.ceil(hMin/10)*10; v <= hMax; v+=10) t.push(v); return t; })()
	);

	// Regressionslinie SVG-Koordinaten
	function regLine(reg: {slope: number; intercept: number} | null, yFn: (v: number) => number) {
		if (!reg) return '';
		const y1 = reg.slope * tMin + reg.intercept;
		const y2 = reg.slope * tMax + reg.intercept;
		return `${tx(tMin).toFixed(1)},${yFn(y1).toFixed(1)} ${tx(tMax).toFixed(1)},${yFn(y2).toFixed(1)}`;
	}

	// Mouse
	function onMoveS(e: MouseEvent) {
		const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
		const svgX = (e.clientX - rect.left) * (W / rect.width);
		const svgY = (e.clientY - rect.top)  * (H / rect.height);
		const t = tMin + ((svgX - PAD.left) / cW) * (tMax - tMin);
		// nächsten Punkt finden
		let best: Pt | null = null, bd = Infinity;
		for (const p of pts) {
			const dx = tx(p.temp_c) - svgX, dy = sy(p.speed_kmh) - svgY;
			const d = Math.sqrt(dx*dx + dy*dy);
			if (d < bd && d < 20) { bd = d; best = p; }
		}
		hovS = best;
	}
	function onMoveH(e: MouseEvent) {
		const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
		const svgX = (e.clientX - rect.left) * (W / rect.width);
		const svgY = (e.clientY - rect.top)  * (H / rect.height);
		let best: Pt | null = null, bd = Infinity;
		for (const p of pts) {
			const dx = tx(p.temp_c) - svgX, dy = hy(p.hr) - svgY;
			const d = Math.sqrt(dx*dx + dy*dy);
			if (d < bd && d < 20) { bd = d; best = p; }
		}
		hovH = best;
	}
</script>

<svelte:head><title>Temperatur-Korrelation – MyBiking</title></svelte:head>

<div class="space-y-6">
	<div>
		<h1 class="text-2xl font-bold">Temperatur-Korrelation</h1>
		<p class="text-xs text-gray-500 mt-0.5">
			Wie beeinflusst die Außentemperatur Geschwindigkeit und Herzfrequenz? · {pts.length} Aktivitäten mit Temperaturdaten
		</p>
	</div>

	{#if error}
		<div class="rounded bg-red-900/50 border border-red-700 p-4 text-red-300 text-sm">{error}</div>
	{/if}

	{#if loading}
		<div class="h-64 bg-gray-800/50 animate-pulse rounded-xl"></div>
	{:else if pts.length}

		<!-- Insights -->
		{#if insightSpeed !== null && insightHR !== null}
			<div class="flex flex-wrap gap-3">
				<div class="rounded-xl bg-gray-800 px-4 py-3 text-center min-w-44">
					<p class="text-xs text-gray-400">Ø Δ Speed pro +10 °C</p>
					<p class="text-xl font-bold mt-0.5"
						class:text-green-400={Number(insightSpeed) > 0}
						class:text-red-400={Number(insightSpeed) < 0}
						class:text-gray-400={Number(insightSpeed) === 0}>
						{Number(insightSpeed) > 0 ? '+' : ''}{insightSpeed} km/h
					</p>
				</div>
				<div class="rounded-xl bg-gray-800 px-4 py-3 text-center min-w-44">
					<p class="text-xs text-gray-400">Ø Δ HR pro +10 °C</p>
					<p class="text-xl font-bold mt-0.5"
						class:text-red-400={Number(insightHR) > 0}
						class:text-green-400={Number(insightHR) < 0}
						class:text-gray-400={Number(insightHR) === 0}>
						{Number(insightHR) > 0 ? '+' : ''}{insightHR} bpm
					</p>
				</div>
				<div class="rounded-xl bg-gray-800/50 border border-gray-700 px-4 py-3 text-xs text-gray-500 flex items-center max-w-sm">
					Regressionsgerade = gestrichelt · Punkte = einzelne Aktivitäten
				</div>
			</div>
		{/if}

		<!-- Chart 1: Temp vs Speed -->
		<div class="rounded-xl bg-gray-800/40 border border-gray-800 p-4 relative">
			<p class="text-sm font-medium text-gray-300 mb-2">Temperatur → Geschwindigkeit</p>
			{#if hovS}
				<div class="absolute top-10 right-4 rounded-lg bg-gray-900 border border-gray-700 px-3 py-2 text-sm pointer-events-none z-10">
					<p class="font-semibold" style="color:{col(hovS.year)}">{hovS.year}</p>
					<p class="text-gray-300">{hovS.temp_c.toFixed(1)} °C · {hovS.speed_kmh.toFixed(1)} km/h</p>
					<p class="text-gray-500 text-xs">{hovS.dist_km.toFixed(0)} km</p>
				</div>
			{/if}
			<svg viewBox="0 0 {W} {H}" class="w-full" style="height:{H}px"
				onmousemove={onMoveS} onmouseleave={() => hovS = null} role="presentation">

				{#each sTicks as v}
					<line x1={PAD.left} y1={sy(v).toFixed(1)} x2={W-PAD.right} y2={sy(v).toFixed(1)} stroke="var(--chart-line)" stroke-width="1"/>
					<text x={PAD.left-8} y={sy(v)+4} font-size="11" fill="var(--chart-text)" text-anchor="end">{v}</text>
				{/each}
				{#each tTicks as v}
					<line x1={tx(v).toFixed(1)} y1={PAD.top} x2={tx(v).toFixed(1)} y2={PAD.top+cH} stroke="var(--chart-line)" stroke-width="1"/>
					<text x={tx(v)} y={PAD.top+cH+16} font-size="11" fill="var(--chart-text)" text-anchor="middle">{v}°</text>
				{/each}
				<line x1={PAD.left} y1={PAD.top+cH} x2={W-PAD.right} y2={PAD.top+cH} stroke="var(--chart-line)" stroke-width="1"/>
				<line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top+cH} stroke="var(--chart-line)" stroke-width="1"/>
				<text x={PAD.left+cW/2} y={H-4} font-size="11" fill="var(--chart-muted)" text-anchor="middle">°C</text>
				<text x={PAD.left-40} y={PAD.top+cH/2} font-size="11" fill="var(--chart-muted)" text-anchor="middle"
					transform="rotate(-90,{PAD.left-40},{PAD.top+cH/2})">km/h</text>

				<!-- Regressionslinie -->
				{#if regS}
					<polyline points={regLine(regS, sy)} fill="none" stroke="var(--chart-muted)"
						stroke-width="1.5" stroke-dasharray="6,3" opacity="0.7"/>
				{/if}

				<!-- Punkte -->
				{#each pts as p}
					<circle cx={tx(p.temp_c).toFixed(1)} cy={sy(p.speed_kmh).toFixed(1)} r="5"
						fill={col(p.year)} fill-opacity="0.6"
						stroke={hovS === p ? '#fff' : col(p.year)} stroke-opacity={hovS === p ? 1 : 0.2}
						stroke-width={hovS === p ? 1.5 : 1}
						role="presentation"
						onmouseenter={() => hovS = p} onmouseleave={() => hovS = null}/>
				{/each}
			</svg>
		</div>

		<!-- Chart 2: Temp vs HR -->
		<div class="rounded-xl bg-gray-800/40 border border-gray-800 p-4 relative">
			<p class="text-sm font-medium text-gray-300 mb-2">Temperatur → Herzfrequenz</p>
			{#if hovH}
				<div class="absolute top-10 right-4 rounded-lg bg-gray-900 border border-gray-700 px-3 py-2 text-sm pointer-events-none z-10">
					<p class="font-semibold" style="color:{col(hovH.year)}">{hovH.year}</p>
					<p class="text-gray-300">{hovH.temp_c.toFixed(1)} °C · {hovH.hr.toFixed(0)} bpm</p>
					<p class="text-gray-500 text-xs">{hovH.dist_km.toFixed(0)} km</p>
				</div>
			{/if}
			<svg viewBox="0 0 {W} {H}" class="w-full" style="height:{H}px"
				onmousemove={onMoveH} onmouseleave={() => hovH = null} role="presentation">

				{#each hTicks as v}
					<line x1={PAD.left} y1={hy(v).toFixed(1)} x2={W-PAD.right} y2={hy(v).toFixed(1)} stroke="var(--chart-line)" stroke-width="1"/>
					<text x={PAD.left-8} y={hy(v)+4} font-size="11" fill="var(--chart-text)" text-anchor="end">{v}</text>
				{/each}
				{#each tTicks as v}
					<line x1={tx(v).toFixed(1)} y1={PAD.top} x2={tx(v).toFixed(1)} y2={PAD.top+cH} stroke="var(--chart-line)" stroke-width="1"/>
					<text x={tx(v)} y={PAD.top+cH+16} font-size="11" fill="var(--chart-text)" text-anchor="middle">{v}°</text>
				{/each}
				<line x1={PAD.left} y1={PAD.top+cH} x2={W-PAD.right} y2={PAD.top+cH} stroke="var(--chart-line)" stroke-width="1"/>
				<line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top+cH} stroke="var(--chart-line)" stroke-width="1"/>
				<text x={PAD.left+cW/2} y={H-4} font-size="11" fill="var(--chart-muted)" text-anchor="middle">°C</text>
				<text x={PAD.left-40} y={PAD.top+cH/2} font-size="11" fill="var(--chart-muted)" text-anchor="middle"
					transform="rotate(-90,{PAD.left-40},{PAD.top+cH/2})">bpm</text>

				<!-- Regressionslinie -->
				{#if regH}
					<polyline points={regLine(regH, hy)} fill="none" stroke="#f87171"
						stroke-width="1.5" stroke-dasharray="6,3" opacity="0.7"/>
				{/if}

				<!-- Punkte -->
				{#each pts as p}
					<circle cx={tx(p.temp_c).toFixed(1)} cy={hy(p.hr).toFixed(1)} r="5"
						fill={col(p.year)} fill-opacity="0.6"
						stroke={hovH === p ? '#fff' : col(p.year)} stroke-opacity={hovH === p ? 1 : 0.2}
						stroke-width={hovH === p ? 1.5 : 1}
						role="presentation"
						onmouseenter={() => hovH = p} onmouseleave={() => hovH = null}/>
				{/each}
			</svg>
		</div>

		<!-- Jahres-Legende -->
		<div class="flex flex-wrap gap-3">
			{#each years as y}
				<span class="flex items-center gap-1.5 text-xs text-gray-400">
					<span class="w-3 h-3 rounded-full inline-block" style="background:{col(y)}"></span>
					{y}
				</span>
			{/each}
		</div>
	{/if}
</div>
