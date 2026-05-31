<script lang="ts">
	import { onMount } from 'svelte';
	import { api } from '$lib/api';
	import PageHeader from '$lib/PageHeader.svelte';

	interface CurveData {
		durations_s: number[];
		labels: string[];
		best_hr: number[];
	}

	// Kontext je Zeitfenster
	const CONTEXT = [
		{ short: 'Maximalsprint',    long: 'Kürzestes Fenster — erfasst anaerobe Spitzen (Berg-Sprint, Attacke). Kaum trainierbar, stark genetisch.' },
		{ short: 'Hartes Intervall', long: 'VO₂max-Bereich. Mit hochintensiven Intervallen (4×5 min) gezielt trainierbar.' },
		{ short: 'Intensiv',         long: 'Langes Intervall oder kurze Tempofahrt. Grenzbereich zwischen anaerob und aerob.' },
		{ short: '≈ Schwellen-HR',   long: 'Der wichtigste Wert: entspricht ungefähr der Laktatschwellen-HF. Liegt typischerweise bei ~85–92 % HRmax.' },
		{ short: 'Dauerleistung',    long: 'Aerober Bereich. Wie gut hältst du hohe HF über eine Stunde? Zeigt die aerobe Basis.' },
	];

	let data      = $state<CurveData | null>(null);
	let loading   = $state(true);
	let error     = $state<string | null>(null);
	let filterYear    = $state<string>('');
	let availableYears = $state<string[]>([]);
	let hoveredIdx = $state<number | null>(null);

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
			data = { durations_s: res.durations_s, labels: res.labels, best_hr: res.best_hr };
		} catch (e) {
			error = e instanceof Error ? e.message : 'Fehler beim Laden';
		} finally {
			loading = false;
		}
	}

	// --- Abgeleitete Werte ---
	// Index des 20-min-Fensters (1200s)
	const thresholdIdx = $derived(data ? data.durations_s.findIndex(d => d === 1200) : -1);
	const thresholdHR  = $derived(thresholdIdx >= 0 && data ? data.best_hr[thresholdIdx] : null);

	// Kurvensteilheit: Abfall von 1min zu 60min in %
	const dropPct = $derived(() => {
		if (!data || data.best_hr.length < 2) return null;
		const first = data.best_hr[0];
		const last  = data.best_hr[data.best_hr.length - 1];
		return first > 0 ? Math.round((1 - last / first) * 100) : null;
	});

	// --- Chart-Geometrie ---
	const W = 960, H = 220;
	const PAD = { top: 24, right: 32, bottom: 48, left: 52 };
	const cW  = W - PAD.left - PAD.right;
	const cH  = H - PAD.top - PAD.bottom;

	const minHR  = $derived(data ? Math.floor(Math.min(...data.best_hr) / 5) * 5 - 5 : 100);
	const maxHR  = $derived(data ? Math.ceil(Math.max(...data.best_hr) / 5) * 5 + 5  : 180);
	const hrRange = $derived(maxHR - minHR);

	function xOf(i: number, n: number) { return PAD.left + (i / (n - 1)) * cW; }
	function yOf(hr: number)            { return PAD.top + cH - ((hr - minHR) / hrRange) * cH; }

	const points = $derived(
		data ? data.best_hr.map((hr, i) => ({
			x: xOf(i, data!.best_hr.length),
			y: yOf(hr),
			hr,
			label: data!.labels[i],
			ctx: CONTEXT[i],
			isThreshold: i === thresholdIdx,
		})) : []
	);

	const areaPath = $derived(() => {
		if (!points.length) return '';
		const base = (PAD.top + cH).toFixed(1);
		const line = points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('L');
		return `M${points[0].x.toFixed(1)},${base}L${line}L${points[points.length - 1].x.toFixed(1)},${base}Z`;
	});

	const polyline = $derived(points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '));

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
		title="HR-Kurve"
		subtitle="Beste Herzfrequenz je Zeitfenster — gleitendes Maximum über alle Aktivitäten"
		years={availableYears}
		bind:selectedYear={filterYear}
		onchange={loadCurve}
	/>

	<!-- Erklär-Box -->
	<div class="rounded-xl border border-blue-900/40 bg-blue-950/20 px-4 py-3 text-sm text-blue-200 space-y-1">
		<p class="font-medium text-blue-300">Was zeigt diese Kurve?</p>
		<p class="text-blue-200/80">
			Für jedes Zeitfenster (1 min bis 60 min) sucht der Algorithmus in allen deinen Rides den höchsten
			Durchschnittswert der Herzfrequenz über genau so viele aufeinanderfolgende Sekunden.
			Das Ergebnis zeigt, wie hoch deine HF bei verschiedenen Belastungsdauern maximal war —
			ähnlich einer Power-Kurve, aber ohne Leistungsmesser.
		</p>
	</div>

	{#if error}
		<div class="rounded bg-red-900/50 border border-red-700 p-4 text-red-300 text-sm">{error}</div>
	{/if}

	{#if loading}
		<div class="h-32 bg-gray-800/50 animate-pulse rounded-xl"></div>
		<div class="h-56 bg-gray-800/50 animate-pulse rounded-xl"></div>
	{:else if data}

		<!-- Kacheln -->
		<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
			{#each points as p, i}
				<button
					type="button"
					onclick={() => hoveredIdx = hoveredIdx === i ? null : i}
					class="rounded-xl border text-left px-4 py-3 transition-colors
						{p.isThreshold
							? 'border-orange-500/60 bg-orange-500/10'
							: hoveredIdx === i
								? 'border-red-500/40 bg-red-500/10'
								: 'border-gray-800 bg-gray-800/40 hover:border-gray-700'}"
				>
					<p class="text-[10px] uppercase tracking-wide
						{p.isThreshold ? 'text-orange-400' : 'text-gray-500'}">
						{p.label}
					</p>
					<p class="text-2xl font-bold mt-0.5
						{p.isThreshold ? 'text-orange-400' : 'text-red-400'}">
						{p.hr.toFixed(0)}
					</p>
					<p class="text-[10px] text-gray-500 mt-0.5">bpm</p>
					<p class="text-[11px] mt-2
						{p.isThreshold ? 'text-orange-300' : 'text-gray-400'}">
						{p.ctx.short}
					</p>
				</button>
			{/each}
		</div>

		<!-- Erklärtext der angeklickten Kachel -->
		{#if hoveredIdx !== null}
			<div class="rounded-lg border border-gray-700 bg-gray-800/60 px-4 py-3 text-sm text-gray-300">
				<span class="font-medium text-white">{points[hoveredIdx].label} — {points[hoveredIdx].ctx.short}:</span>
				{points[hoveredIdx].ctx.long}
			</div>
		{/if}

		<!-- Chart -->
		<div class="rounded-xl border border-gray-800 bg-gray-800/40 px-4 pt-4 pb-2">
			<svg viewBox="0 0 {W} {H}" width="100%" class="block">
				<defs>
					<linearGradient id="hrGrad" x1="0" y1="0" x2="0" y2="1">
						<stop offset="0%"   stop-color="#f87171" stop-opacity="0.35"/>
						<stop offset="100%" stop-color="#f87171" stop-opacity="0"/>
					</linearGradient>
				</defs>

				<!-- Gitternetz -->
				{#each yTicks() as v}
					<line x1={PAD.left} y1={yOf(v)} x2={W - PAD.right} y2={yOf(v)} stroke="#374151" stroke-width="1"/>
					<text x={PAD.left - 8} y={yOf(v) + 4} font-size="11" fill="#6b7280" text-anchor="end">{v}</text>
				{/each}

				<!-- Schwellen-HR Markierung -->
				{#if thresholdHR !== null}
					<line
						x1={PAD.left} y1={yOf(thresholdHR)}
						x2={W - PAD.right} y2={yOf(thresholdHR)}
						stroke="#f97316" stroke-width="1" stroke-dasharray="4,4" opacity="0.5"
					/>
					<text x={PAD.left + 6} y={yOf(thresholdHR) - 4} font-size="10" fill="#f97316" opacity="0.8">
						Schwellen-HR
					</text>
				{/if}

				<!-- Baseline -->
				<line x1={PAD.left} y1={PAD.top + cH} x2={W - PAD.right} y2={PAD.top + cH} stroke="#4b5563" stroke-width="1"/>

				<!-- Fläche + Kurve -->
				<path d={areaPath()} fill="url(#hrGrad)"/>
				<polyline points={polyline} fill="none" stroke="#f87171" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>

				<!-- Punkte + Labels -->
				{#each points as p, i}
					<circle
						cx={p.x} cy={p.y} r={p.isThreshold ? 7 : 5}
						fill={p.isThreshold ? '#f97316' : '#f87171'}
						stroke={p.isThreshold ? '#f97316' : '#1f2937'}
						stroke-width="2"
					/>
					<text x={p.x} y={p.y - 12} font-size="11" fill={p.isThreshold ? '#f97316' : '#fca5a5'} text-anchor="middle" font-weight="600">
						{p.hr.toFixed(0)}
					</text>
					<text x={p.x} y={PAD.top + cH + 16} font-size="11" fill="#6b7280" text-anchor="middle">
						{p.label}
					</text>
					<text x={p.x} y={PAD.top + cH + 30} font-size="9" fill="#4b5563" text-anchor="middle">
						{p.ctx.short}
					</text>
				{/each}

				<!-- Y-Achsen-Label -->
				<text
					x={PAD.left - 38} y={PAD.top + cH / 2}
					font-size="11" fill="#6b7280" text-anchor="middle"
					transform="rotate(-90, {PAD.left - 38}, {PAD.top + cH / 2})"
				>bpm</text>
			</svg>
		</div>

		<!-- Interpretation -->
		<div class="grid sm:grid-cols-2 gap-4">

			<!-- Schwellen-HR -->
			{#if thresholdHR !== null}
				<div class="rounded-xl border border-orange-500/30 bg-orange-500/5 px-4 py-3 space-y-1">
					<p class="text-xs text-orange-400 font-medium uppercase tracking-wide">Geschätzte Schwellen-HR</p>
					<p class="text-3xl font-bold text-orange-400">{thresholdHR.toFixed(0)} <span class="text-base font-normal text-orange-300">bpm</span></p>
					<p class="text-xs text-gray-400">
						Entspricht deinem 20-min-Bestwert. Die Laktatschwelle liegt typischerweise
						bei 85–92 % HRmax und markiert den Übergang von aerobem zu anaerobem Stoffwechsel.
					</p>
				</div>
			{/if}

			<!-- Kurvensteilheit -->
			{#if dropPct() !== null}
				{@const drop = dropPct()!}
				<div class="rounded-xl border border-gray-800 bg-gray-800/40 px-4 py-3 space-y-1">
					<p class="text-xs text-gray-500 font-medium uppercase tracking-wide">Kurvensteilheit (1 min → 60 min)</p>
					<p class="text-3xl font-bold {drop <= 5 ? 'text-emerald-400' : drop <= 10 ? 'text-yellow-400' : 'text-red-400'}">
						−{drop} <span class="text-base font-normal text-gray-400">%</span>
					</p>
					<p class="text-xs text-gray-400">
						{#if drop <= 5}
							Sehr flach — starke aerobe Basis, du hältst hohe HF auch über lange Dauer.
						{:else if drop <= 10}
							Moderat — gute Balance zwischen Ausdauer und Intensität.
						{:else}
							Steil — große Spitze über kurz, aber HF fällt über längere Dauer stark ab. Mehr Grundlagentraining hilft.
						{/if}
					</p>
				</div>
			{/if}
		</div>

		<!-- Hinweis zur Methode -->
		<p class="text-xs text-gray-700">
			Berechnung: gleitendes Maximum der Sekunden-HR über alle FIT-Tracks. Nur Aktivitäten mit HR-Daten fließen ein.
			Kurze Fenster können durch kurze Sprints verzerrt sein — der 20-min-Wert ist am aussagekräftigsten.
		</p>
	{/if}
</div>
