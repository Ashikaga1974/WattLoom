<script lang="ts">
	import { onMount } from 'svelte';
	import { api } from '$lib/api';

	interface DayEntry {
		date: string;
		load: number;   // km an diesem Tag
		ctl: number;    // 42-Tage-EMA (Fitness)
		atl: number;    // 7-Tage-EMA (Fatigue)
		form: number;   // CTL - ATL
	}

	let allDays = $state<DayEntry[]>([]);
	let viewDays = $state<DayEntry[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let showAll = $state(false);

	onMount(async () => {
		try {
			// Alle Aktivitäten auf einmal (kein Jahresfilter)
			const res = await api.activities({ limit: 500 });

			// Aktivitäten nach Datum summieren (Ausreißer < 2000 weg)
			const byDate = new Map<string, number>();
			for (const act of res.items) {
				if (new Date(act.start_date).getFullYear() < 2000) continue;
				const d = act.start_date.slice(0, 10);
				byDate.set(d, (byDate.get(d) ?? 0) + act.distance_m / 1000);
			}

			// Frühestes Datum ermitteln
			const dates = [...byDate.keys()].sort();
			if (!dates.length) { loading = false; return; }

			// Lückenlosen Datumsbereich aufbauen
			const start = new Date(dates[0]);
			const today = new Date();
			today.setHours(0, 0, 0, 0);

			// EMA-Konstanten (klassische Formel: k = 2/(N+1))
			const K_CTL = 2 / (42 + 1);
			const K_ATL = 2 / (7 + 1);

			let ctl = 0, atl = 0;
			const entries: DayEntry[] = [];
			const cursor = new Date(start);

			while (cursor <= today) {
				const d = cursor.toISOString().slice(0, 10);
				const load = byDate.get(d) ?? 0;
				ctl = ctl + K_CTL * (load - ctl);
				atl = atl + K_ATL * (load - atl);
				entries.push({ date: d, load, ctl, atl, form: ctl - atl });
				cursor.setDate(cursor.getDate() + 1);
			}

			allDays = entries;
			updateView();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Fehler';
		} finally {
			loading = false;
		}
	});

	function updateView() {
		viewDays = showAll ? allDays : allDays.slice(-180); // ~6 Monate
	}
	$effect(() => { if (allDays.length) updateView(); });

	// SVG-Setup
	const W = 1000, H = 260;
	const PAD = { top: 16, right: 16, bottom: 32, left: 44 };
	const cW = W - PAD.left - PAD.right;
	const cH = H - PAD.top - PAD.bottom;

	// Y-Achse: symmetrisch um 0 für Form, mit etwas Puffer für CTL/ATL
	const maxVal = $derived(
		viewDays.length
			? Math.ceil(Math.max(...viewDays.map(d => d.ctl), ...viewDays.map(d => d.atl)) / 5 + 1) * 5
			: 50
	);
	const minVal = $derived(
		viewDays.length
			? Math.floor(Math.min(...viewDays.map(d => d.form)) / 5 - 1) * 5
			: -20
	);
	const yRange = $derived(maxVal - minVal);

	function xOf(i: number) { return PAD.left + (i / Math.max(viewDays.length - 1, 1)) * cW; }
	function yOf(v: number) { return PAD.top + cH - ((v - minVal) / yRange) * cH; }
	function y0() { return yOf(0); }

	// Polyline-String für eine Kurve
	function line(key: 'ctl' | 'atl' | 'form'): string {
		return viewDays.map((d, i) => `${xOf(i).toFixed(1)},${yOf(d[key]).toFixed(1)}`).join(' ');
	}

	// Form-Fläche: positiv = grün, negativ = rot – als zwei getrennte Pfade
	const formAreaPos = $derived(() => {
		if (!viewDays.length) return '';
		const zero = y0();
		const pts = viewDays.map((d, i) => ({
			x: xOf(i),
			y: yOf(Math.max(d.form, 0)),
		}));
		return `M${pts[0].x},${zero}` +
			pts.map(p => `L${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('') +
			`L${pts[pts.length - 1].x},${zero}Z`;
	});
	const formAreaNeg = $derived(() => {
		if (!viewDays.length) return '';
		const zero = y0();
		const pts = viewDays.map((d, i) => ({
			x: xOf(i),
			y: yOf(Math.min(d.form, 0)),
		}));
		return `M${pts[0].x},${zero}` +
			pts.map(p => `L${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('') +
			`L${pts[pts.length - 1].x},${zero}Z`;
	});

	// Y-Achse Ticks
	const yTicks = $derived(() => {
		const ticks: number[] = [];
		const step = yRange > 100 ? 20 : 10;
		for (let v = Math.ceil(minVal / step) * step; v <= maxVal; v += step) {
			ticks.push(v);
		}
		return ticks;
	});

	// X-Achse: Monatslabels
	const MONTHS = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
	const xLabels = $derived(() => {
		const labels: { x: number; label: string }[] = [];
		let lastMonth = -1;
		viewDays.forEach((d, i) => {
			const mo = new Date(d.date).getMonth();
			const yr = new Date(d.date).getFullYear();
			if (mo !== lastMonth) {
				// Bei mehr als 1 Jahr: nur jeden 2. Monat
				if (viewDays.length > 365 && mo % 2 !== 0) { lastMonth = mo; return; }
				labels.push({ x: xOf(i), label: mo === 0 ? `${MONTHS[mo]} ${yr}` : MONTHS[mo] });
				lastMonth = mo;
			}
		});
		return labels;
	});

	// Aktuelle Werte
	const current = $derived(viewDays[viewDays.length - 1]);
</script>

<svelte:head>
	<title>Form & Fitness – MyBiking</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex flex-wrap items-center justify-between gap-4">
		<div>
			<h1 class="text-2xl font-bold">Form & Fitness</h1>
			<p class="text-xs text-gray-500 mt-0.5">CTL/ATL-Modell · Trainingsbelastung = km/Tag</p>
		</div>
		<button
			onclick={() => { showAll = !showAll; }}
			class="px-3 py-1.5 rounded-full text-sm border transition-colors"
			class:border-orange-500={showAll}
			class:text-orange-400={showAll}
			class:border-gray-700={!showAll}
			class:text-gray-400={!showAll}
		>
			{showAll ? 'Letzte 6 Monate' : 'Alle Jahre'}
		</button>
	</div>

	{#if error}
		<div class="rounded bg-red-900/50 border border-red-700 p-4 text-red-300 text-sm">{error}</div>
	{/if}

	{#if loading}
		<div class="h-64 bg-gray-800/50 animate-pulse rounded-xl"></div>
	{:else if current}
		<!-- Aktuelle Werte -->
		<div class="grid grid-cols-3 gap-4">
			<div class="rounded-xl bg-gray-800/60 p-4 border border-blue-900/40">
				<p class="text-xs text-blue-400 uppercase tracking-wider">Fitness (CTL)</p>
				<p class="text-2xl font-bold mt-1 text-blue-300">{current.ctl.toFixed(1)}</p>
				<p class="text-xs text-gray-500 mt-0.5">42-Tage-Schnitt</p>
			</div>
			<div class="rounded-xl bg-gray-800/60 p-4 border border-orange-900/40">
				<p class="text-xs text-orange-400 uppercase tracking-wider">Fatigue (ATL)</p>
				<p class="text-2xl font-bold mt-1 text-orange-300">{current.atl.toFixed(1)}</p>
				<p class="text-xs text-gray-500 mt-0.5">7-Tage-Schnitt</p>
			</div>
			<div class="rounded-xl p-4 border {current.form >= 0 ? 'bg-green-900/20 border-green-900/40' : 'bg-red-900/20 border-red-900/40'}">
				<p class="text-xs uppercase tracking-wider {current.form >= 0 ? 'text-green-400' : 'text-red-400'}">Form (TSB)</p>
				<p class="text-2xl font-bold mt-1 {current.form >= 0 ? 'text-green-300' : 'text-red-300'}">
					{current.form >= 0 ? '+' : ''}{current.form.toFixed(1)}
				</p>
				<p class="text-xs text-gray-500 mt-0.5">{current.form >= 0 ? 'Frisch' : 'Müde'}</p>
			</div>
		</div>

		<!-- Chart -->
		<div class="rounded-xl bg-gray-800/40 border border-gray-800 p-4">
			<!-- Legende -->
			<div class="flex items-center gap-5 mb-3 text-xs">
				<span class="flex items-center gap-1.5"><span class="inline-block w-6 h-0.5 bg-blue-400"></span> Fitness (CTL)</span>
				<span class="flex items-center gap-1.5"><span class="inline-block w-6 h-0.5 bg-orange-400"></span> Fatigue (ATL)</span>
				<span class="flex items-center gap-1.5">
					<span class="inline-block w-3 h-3 bg-green-500/40 rounded-sm"></span>
					<span class="inline-block w-3 h-3 bg-red-500/40 rounded-sm"></span>
					Form
				</span>
			</div>

			<svg viewBox="0 0 {W} {H}" class="w-full" style="height: 260px">
				<!-- Gitternetz & Y-Labels -->
				{#each yTicks() as v}
					<line
						x1={PAD.left} y1={yOf(v).toFixed(1)}
						x2={W - PAD.right} y2={yOf(v).toFixed(1)}
						stroke="var(--chart-line)"
						stroke-width={v === 0 ? 1.5 : 0.8}
					/>
					<text x={PAD.left - 6} y={yOf(v) + 4} font-size="11" fill="var(--chart-text)" text-anchor="end">{v}</text>
				{/each}

				<!-- X-Labels -->
				{#each xLabels() as { x, label }}
					<text x={x} y={H - 8} font-size="10" fill="var(--chart-text)" text-anchor="middle">{label}</text>
					<line x1={x} y1={PAD.top} x2={x} y2={PAD.top + cH} stroke="var(--chart-line)" stroke-width="0.5"/>
				{/each}

				<!-- Form-Flächen -->
				<path d={formAreaPos()} fill="#22c55e" opacity="0.25"/>
				<path d={formAreaNeg()} fill="#ef4444" opacity="0.25"/>

				<!-- ATL-Linie (unter CTL) -->
				<polyline points={line('atl')} fill="none" stroke="#fc4c02" stroke-width="1.5" stroke-linejoin="round"/>

				<!-- CTL-Linie (Hauptlinie, oben) -->
				<polyline points={line('ctl')} fill="none" stroke="#60a5fa" stroke-width="2" stroke-linejoin="round"/>

				<!-- Form-Linie -->
				<polyline points={line('form')} fill="none" stroke="#ffffff" stroke-width="1" stroke-linejoin="round" opacity="0.4"/>
			</svg>
		</div>

		<!-- Interpretation -->
		<div class="grid md:grid-cols-3 gap-3 text-sm text-gray-400">
			<div class="rounded-lg bg-gray-800/40 p-3">
				<p class="text-blue-400 font-medium mb-1">CTL steigt</p>
				<p>Trainingsvolumen baut sich auf → Fitness wächst</p>
			</div>
			<div class="rounded-lg bg-gray-800/40 p-3">
				<p class="text-orange-400 font-medium mb-1">ATL &gt; CTL</p>
				<p>Akute Belastung übersteigt Fitness → Form negativ</p>
			</div>
			<div class="rounded-lg bg-gray-800/40 p-3">
				<p class="text-green-400 font-medium mb-1">Form positiv</p>
				<p>Tapering oder Pause → frisch für Rennen/Tour</p>
			</div>
		</div>
	{/if}
</div>
