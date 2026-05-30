<script lang="ts">
	import { onMount } from 'svelte';
	import { api } from '$lib/api';

	const YEAR_COLORS: Record<number, string> = {};
	const PALETTE = ['#60a5fa', '#4ade80', '#fb923c', '#c084fc', '#facc15', '#f472b6'];

	interface Point { year: number; month: string; speed_kmh: number; hr: number; dist_km: number; }
	interface MonthAgg { month: string; label: string; avgSpeed: number; avgHr: number; eff: number; count: number; year: number; }
	interface YearAgg  { year: number; avgSpeed: number; avgHr: number; eff: number; count: number; }

	let allPoints = $state<Point[]>([]);
	let loading   = $state(true);
	let error     = $state<string | null>(null);
	let hoverIdx  = $state<number | null>(null);
	let tooltipX  = $state(0);
	let tooltipY  = $state(0);

	onMount(async () => {
		try {
			const res = await api.speedHr();
			allPoints = res.points.filter(p => p.year >= 2020);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Fehler';
		} finally {
			loading = false;
		}
	});

	const years = $derived([...new Set(allPoints.map(p => p.year))].sort());

	function yearColor(year: number): string {
		if (!YEAR_COLORS[year]) YEAR_COLORS[year] = PALETTE[years.indexOf(year) % PALETTE.length];
		return YEAR_COLORS[year];
	}

	// Monatliche Aggregation – mindestens 2 Rides
	const monthly = $derived((): MonthAgg[] => {
		const groups: Record<string, Point[]> = {};
		allPoints.forEach(p => { (groups[p.month] ??= []).push(p); });
		return Object.entries(groups)
			.filter(([, pts]) => pts.length >= 2)
			.map(([month, pts]) => {
				const avgSpeed = pts.reduce((s, p) => s + p.speed_kmh, 0) / pts.length;
				const avgHr    = pts.reduce((s, p) => s + p.hr,       0) / pts.length;
				const [y, m]   = month.split('-');
				const label    = new Date(Number(y), Number(m) - 1, 1)
					.toLocaleDateString('de-DE', { month: 'short', year: '2-digit' });
				return { month, label, avgSpeed, avgHr, eff: avgSpeed / avgHr * 100, count: pts.length, year: Number(y) };
			})
			.sort((a, b) => a.month.localeCompare(b.month));
	});

	// Jahreszusammenfassung
	const yearlyAgg = $derived((): YearAgg[] =>
		years.map(y => {
			const pts = allPoints.filter(p => p.year === y);
			const avgSpeed = pts.reduce((s, p) => s + p.speed_kmh, 0) / pts.length;
			const avgHr    = pts.reduce((s, p) => s + p.hr,       0) / pts.length;
			return { year: y, avgSpeed, avgHr, eff: avgSpeed / avgHr * 100, count: pts.length };
		})
	);

	// Headline: letztes vs. vorletztes volles Jahr
	const insight = $derived((): string => {
		const agg = yearlyAgg();
		if (agg.length < 2) return '';
		const cur  = agg[agg.length - 1];
		const prev = agg[agg.length - 2];
		const dS   = cur.avgSpeed - prev.avgSpeed;
		const dH   = cur.avgHr    - prev.avgHr;
		const dE   = cur.eff      - prev.eff;
		const sDir = dS >= 0.2 ? `${dS.toFixed(1)} km/h schneller` : dS <= -0.2 ? `${Math.abs(dS).toFixed(1)} km/h langsamer` : 'gleich schnell';
		const hDir = dH <= -1  ? `bei ${Math.abs(dH).toFixed(0)} bpm niedrigerem Puls` :
		             dH >=  1  ? `bei ${dH.toFixed(0)} bpm höherem Puls` : 'bei ähnlichem Puls';
		if (dE >= 0.5)  return `${cur.year} fährst du im Schnitt ${sDir} ${hDir} als ${prev.year} – deine aerobe Effizienz steigt.`;
		if (dE <= -0.5) return `${cur.year} bist du ${sDir} ${hDir} als ${prev.year} – die Effizienz ist leicht gesunken.`;
		return `${cur.year} und ${prev.year} liegen dicht beieinander – stabile Effizienz auf gutem Niveau.`;
	});

	// Effizienz-Chart
	const W = 900, H = 220;
	const PAD = { top: 20, right: 20, bottom: 40, left: 44 };
	const cW = W - PAD.left - PAD.right;
	const cH = H - PAD.top  - PAD.bottom;

	const effMin = $derived(() => {
		const m = monthly();
		return m.length ? Math.floor(Math.min(...m.map(x => x.eff)) - 1) : 14;
	});
	const effMax = $derived(() => {
		const m = monthly();
		return m.length ? Math.ceil( Math.max(...m.map(x => x.eff)) + 1) : 22;
	});

	function xOf(i: number, n: number) { return PAD.left + (i / Math.max(n - 1, 1)) * cW; }
	function yOf(v: number) { return PAD.top + cH - ((v - effMin()) / (effMax() - effMin())) * cH; }

	// X-Labels: erster Monat pro Jahr
	const xLabels = $derived(() => {
		const m = monthly();
		const labels: { x: number; label: string; year: number }[] = [];
		let lastYear = -1;
		m.forEach((d, i) => {
			if (d.year !== lastYear) {
				labels.push({ x: xOf(i, m.length), label: String(d.year), year: d.year });
				lastYear = d.year;
			}
		});
		return labels;
	});

	// Y-Ticks
	const yTicks = $derived(() => {
		const ticks: number[] = [];
		const step = (effMax() - effMin()) > 6 ? 2 : 1;
		for (let v = Math.ceil(effMin()); v <= effMax(); v += step) ticks.push(v);
		return ticks;
	});

	// Glatte SVG-Linie
	function linePath(points: { x: number; y: number }[]): string {
		if (!points.length) return '';
		let d = `M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
		for (let i = 1; i < points.length; i++) {
			const prev = points[i - 1], cur = points[i];
			const cpx = (prev.x + cur.x) / 2;
			d += ` C${cpx.toFixed(1)},${prev.y.toFixed(1)} ${cpx.toFixed(1)},${cur.y.toFixed(1)} ${cur.x.toFixed(1)},${cur.y.toFixed(1)}`;
		}
		return d;
	}

	// Area unter der Linie (für Füllung)
	function areaPath(points: { x: number; y: number }[], baseY: number): string {
		if (!points.length) return '';
		const line = linePath(points);
		const last = points[points.length - 1];
		const first = points[0];
		return `${line} L${last.x.toFixed(1)},${baseY.toFixed(1)} L${first.x.toFixed(1)},${baseY.toFixed(1)} Z`;
	}

	const chartPoints = $derived(() => {
		const m = monthly();
		return m.map((d, i) => ({ x: xOf(i, m.length), y: yOf(d.eff) }));
	});
</script>

<svelte:head>
	<title>Aerobe Effizienz – MyBiking</title>
</svelte:head>

<div class="space-y-6">

	<!-- Header -->
	<div>
		<h1 class="text-2xl font-bold">Aerobe Effizienz</h1>
		<p class="text-sm text-gray-400 mt-1">
			Wie viel Geschwindigkeit bekommst du pro Herzschlag? Steigt die Kurve → du wirst fitter.
		</p>
	</div>

	{#if error}
		<div class="rounded bg-red-900/50 border border-red-700 p-4 text-red-300 text-sm">{error}</div>
	{/if}

	{#if loading}
		<div class="h-64 bg-gray-800/50 animate-pulse rounded-xl"></div>
	{:else if allPoints.length}

		<!-- Insight-Banner -->
		{#if insight()}
			<div class="rounded-xl bg-orange-900/20 border border-orange-700/30 px-5 py-3">
				<p class="text-sm text-orange-200">{insight()}</p>
			</div>
		{/if}

		<!-- Effizienz-Chart -->
		<div class="rounded-xl bg-gray-800/40 border border-gray-800 p-5">
			<div class="flex items-center justify-between mb-1">
				<p class="text-xs font-semibold text-gray-400 uppercase tracking-wide">Effizienz pro Monat</p>
				<p class="text-xs text-gray-600">= Ø km/h ÷ Ø bpm × 100 · mindestens 2 Rides</p>
			</div>

			<div
				class="relative"
				onmousemove={(e) => {
					const m = monthly();
					if (!m.length) return;
					const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
					const svgX = (e.clientX - rect.left) / rect.width * W;
					const raw  = (svgX - PAD.left) / cW * (m.length - 1);
					hoverIdx = Math.max(0, Math.min(m.length - 1, Math.round(raw)));
					tooltipX = e.clientX;
					tooltipY = e.clientY;
				}}
				onmouseleave={() => hoverIdx = null}
				role="img"
				aria-label="Effizienz-Verlauf"
			>
				<svg viewBox="0 0 {W} {H}" class="w-full" style="height:{H}px">

					<!-- Y-Gitternetz -->
					{#each yTicks() as v}
						<line x1={PAD.left} y1={yOf(v).toFixed(1)} x2={W - PAD.right} y2={yOf(v).toFixed(1)}
							stroke="var(--chart-line)" stroke-width={v === Math.round(effMin() + (effMax() - effMin()) / 2) ? 0 : 0.7}/>
						<text x={PAD.left - 6} y={yOf(v) + 4} font-size="11" fill="var(--chart-text)" text-anchor="end">{v}</text>
					{/each}

					<!-- Jahreszonen (farbiger Hintergrund) -->
					{#each xLabels() as lbl, li}
						{@const nextX = li + 1 < xLabels().length ? xLabels()[li + 1].x : W - PAD.right}
						<rect x={lbl.x} y={PAD.top} width={nextX - lbl.x} height={cH}
							fill={yearColor(lbl.year)} fill-opacity="0.04"/>
						<line x1={lbl.x} y1={PAD.top} x2={lbl.x} y2={PAD.top + cH}
							stroke={yearColor(lbl.year)} stroke-width="1" stroke-opacity="0.25"/>
						<text x={lbl.x + 6} y={PAD.top + 13} font-size="11" font-weight="600"
							fill={yearColor(lbl.year)} fill-opacity="0.7">{lbl.label}</text>
					{/each}

					<!-- Area-Füllung -->
					<path d={areaPath(chartPoints(), PAD.top + cH)} fill="url(#effGrad)" opacity="0.35"/>
					<defs>
						<linearGradient id="effGrad" x1="0" y1="0" x2="0" y2="1">
							<stop offset="0%"   stop-color="#fb923c" stop-opacity="0.6"/>
							<stop offset="100%" stop-color="#fb923c" stop-opacity="0"/>
						</linearGradient>
					</defs>

					<!-- Haupt-Linie -->
					<path d={linePath(chartPoints())} fill="none" stroke="#fb923c" stroke-width="2.5" stroke-linejoin="round"/>

					<!-- Datenpunkte (nur sichtbar bei Hover-Nähe) -->
					{#each monthly() as d, i}
						{@const cx = xOf(i, monthly().length)}
						{@const cy = yOf(d.eff)}
						{@const active = hoverIdx === i}
						<circle cx={cx} cy={cy} r={active ? 5 : 3}
							fill={active ? '#fb923c' : yearColor(d.year)}
							fill-opacity={active ? 1 : 0.5}
							stroke={active ? '#fff' : 'none'} stroke-width="1.5"/>
					{/each}

					<!-- Hover: vertikale Linie -->
					{#if hoverIdx !== null}
						{@const m = monthly()}
						{@const cx = xOf(hoverIdx, m.length)}
						<line x1={cx} y1={PAD.top} x2={cx} y2={PAD.top + cH}
							stroke="white" stroke-width="1" opacity="0.2"/>
					{/if}

					<!-- X-Achse Baseline -->
					<line x1={PAD.left} y1={PAD.top + cH} x2={W - PAD.right} y2={PAD.top + cH}
						stroke="var(--chart-line)" stroke-width="1"/>

					<!-- X-Labels unten -->
					{#each xLabels() as lbl}
						<text x={lbl.x} y={H - 8} font-size="11" fill={yearColor(lbl.year)} text-anchor="middle"
							font-weight="600">{lbl.label}</text>
					{/each}

					<!-- Y-Achsen-Label -->
					<text x={12} y={PAD.top + cH / 2} font-size="10" fill="var(--chart-muted)"
						text-anchor="middle" transform="rotate(-90, 12, {PAD.top + cH / 2})">Effizienz</text>
				</svg>
			</div>
		</div>

		<!-- Jahreskarten -->
		<div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
			{#each yearlyAgg() as s, i}
				{@const col = yearColor(s.year)}
				{@const prev = i > 0 ? yearlyAgg()[i - 1] : null}
				{@const dS = prev ? s.avgSpeed - prev.avgSpeed : null}
				{@const dH = prev ? s.avgHr    - prev.avgHr    : null}
				{@const dE = prev ? s.eff       - prev.eff      : null}
				<div class="rounded-xl p-4 border" style="border-color:{col}33; background:{col}0d">
					<div class="flex items-center justify-between mb-3">
						<span class="text-sm font-bold" style="color:{col}">{s.year}</span>
						<span class="text-xs text-gray-500">{s.count} Rides</span>
					</div>

					<div class="space-y-2 text-sm">
						<div class="flex justify-between items-baseline">
							<span class="text-gray-500 text-xs">Ø Speed</span>
							<span class="font-semibold text-gray-100">{s.avgSpeed.toFixed(1)}
								<span class="text-xs font-normal text-gray-500">km/h</span>
								{#if dS !== null}
									<span class="text-xs {Math.abs(dS) < 0.2 ? 'text-gray-600' : dS > 0 ? 'text-green-400' : 'text-red-400'}">
										{dS > 0 ? '+' : ''}{dS.toFixed(1)}
									</span>
								{/if}
							</span>
						</div>
						<div class="flex justify-between items-baseline">
							<span class="text-gray-500 text-xs">Ø HR</span>
							<span class="font-semibold text-gray-100">{s.avgHr.toFixed(0)}
								<span class="text-xs font-normal text-gray-500">bpm</span>
								{#if dH !== null}
									<span class="text-xs {Math.abs(dH) < 0.5 ? 'text-gray-600' : dH < 0 ? 'text-green-400' : 'text-orange-400'}">
										{dH > 0 ? '+' : ''}{dH.toFixed(1)}
									</span>
								{/if}
							</span>
						</div>
						<div class="border-t border-gray-700/50 pt-2 flex justify-between items-baseline">
							<span class="text-gray-500 text-xs">Effizienz</span>
							<span class="font-bold" style="color:{col}">{s.eff.toFixed(1)}
								{#if dE !== null}
									<span class="text-xs font-normal {Math.abs(dE) < 0.2 ? 'text-gray-600' : dE > 0 ? 'text-green-400' : 'text-red-400'}">
										{dE > 0 ? '+' : ''}{dE.toFixed(1)}
									</span>
								{/if}
							</span>
						</div>
					</div>
				</div>
			{/each}
		</div>

		<!-- Kurze Erklärung -->
		<div class="rounded-xl bg-gray-800/30 border border-gray-700/40 px-5 py-4 text-sm text-gray-400 space-y-1">
			<p class="text-gray-300 font-medium">Was ist die Effizienz-Zahl?</p>
			<p>
				<span class="font-mono text-xs bg-gray-900 px-1.5 py-0.5 rounded text-orange-300">Effizienz = Ø km/h ÷ Ø bpm × 100</span>
				– je höher, desto mehr Geschwindigkeit bekommst du pro Herzschlag.
			</p>
			<p>Ein Anstieg bedeutet: dein Herz-Kreislauf-System wird ökonomischer.
			Die Kurve kann trotz weniger Training steigen (bessere Erholung, leichtere Strecken) –
			deshalb immer zusammen mit den Volumen-Daten betrachten.</p>
		</div>

	{:else if !loading}
		<p class="text-gray-500 text-sm">Keine Daten mit HR + Geschwindigkeit gefunden.</p>
	{/if}
</div>

<!-- Hover-Tooltip -->
{#if hoverIdx !== null}
	{@const d = monthly()[hoverIdx]}
	{#if d}
		<div
			class="fixed z-50 pointer-events-none rounded-lg bg-gray-900/95 border border-gray-700 px-3 py-2.5 text-xs shadow-xl"
			style="left:{tooltipX + 14}px; top:{tooltipY - 80}px; min-width:160px"
		>
			<p class="font-semibold text-gray-200 mb-2">{d.label} · {d.count} Rides</p>
			<div class="space-y-1">
				<div class="flex justify-between gap-4">
					<span class="text-gray-500">Ø Speed</span>
					<span class="text-gray-200 font-mono">{d.avgSpeed.toFixed(1)} km/h</span>
				</div>
				<div class="flex justify-between gap-4">
					<span class="text-gray-500">Ø HR</span>
					<span class="text-gray-200 font-mono">{d.avgHr.toFixed(0)} bpm</span>
				</div>
				<div class="flex justify-between gap-4 pt-1.5 border-t border-gray-700/50">
					<span class="text-orange-400">Effizienz</span>
					<span class="text-orange-300 font-mono font-bold">{d.eff.toFixed(2)}</span>
				</div>
			</div>
		</div>
	{/if}
{/if}
