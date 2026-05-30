<script lang="ts">
	import { onMount } from 'svelte';
	import { api, type PmcDay, type PmcResponse, type WeeklyVolume } from '$lib/api';

	let data = $state<PmcResponse | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let viewMode = $state<'90' | '180' | 'all'>('90');
	let viewDays = $state<PmcDay[]>([]);
	let hoverIdx = $state<number | null>(null);
	let tooltipX = $state(0);
	let tooltipY = $state(0);
	let svgWrapper = $state<HTMLDivElement | null>(null);

	// Wöchentliches Volumen
	let weeklyVolumeData = $state<WeeklyVolume[]>([]);
	let volMode = $state<'12' | '26' | '52'>('26');

	onMount(async () => {
		try {
			const [pmcRes, volRes] = await Promise.all([api.pmc(), api.weeklyVolume(52)]);
			data = pmcRes;
			weeklyVolumeData = volRes;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Fehler';
		} finally {
			loading = false;
		}
	});

	$effect(() => {
		if (!data?.days.length) { viewDays = []; return; }
		const all = data.days;
		viewDays = viewMode === '90'  ? all.slice(-90)
		         : viewMode === '180' ? all.slice(-180)
		         : [...all];
	});

	// TSB-Zone → Farbe + Label (hex für SVG-Elemente)
	function tsbZone(tsb: number) {
		if (tsb > 25)  return { label: 'Sehr frisch',    text: 'text-sky-300',    hex: '#7dd3fc', bg: 'bg-sky-900/20',    border: 'border-sky-700/40'    };
		if (tsb > 5)   return { label: 'Wettkampfform',  text: 'text-green-400',  hex: '#4ade80', bg: 'bg-green-900/20',  border: 'border-green-700/40'  };
		if (tsb > -10) return { label: 'Normal',         text: 'text-yellow-400', hex: '#facc15', bg: 'bg-yellow-900/20', border: 'border-yellow-700/40' };
		if (tsb > -25) return { label: 'Trainingsblock', text: 'text-orange-400', hex: '#fb923c', bg: 'bg-orange-900/20', border: 'border-orange-700/40' };
		return               { label: 'Überbelastet',   text: 'text-red-400',    hex: '#f87171', bg: 'bg-red-900/20',    border: 'border-red-700/40'    };
	}

	// Ramp Rate: Ø CTL-Anstieg pro Woche über die letzten 4 Wochen
	const rampRate = $derived(
		data?.days && data.days.length >= 29
			? (data.days[data.days.length - 1].ctl - data.days[data.days.length - 29].ctl) / 4
			: null
	);

	// Einzeiliges Fazit oben auf der Seite
	const formSummary = $derived((): string => {
		if (!data?.current) return '';
		const { tsb, ctl } = data.current;
		const ramp = rampRate ?? 0;
		const peak = data.peak_ctl;

		let state: string;
		if      (tsb > 25)  state = 'Du bist sehr frisch – wenig Müdigkeit, idealer Zeitpunkt für einen harten oder langen Ride.';
		else if (tsb > 5)   state = 'Gute Form: ausgeruht genug für intensive Einheiten oder einen Wettkampf.';
		else if (tsb > -10) state = 'Normaler Trainingszustand – leicht ermüdet, aber voll belastbar.';
		else if (tsb > -25) state = 'Du steckst im Trainingsblock und bist müde. In 1–2 Wochen eine Erholungswoche einplanen.';
		else                state = 'Deutlich überbelastet – Ruhe bringt jetzt mehr als weiteres hartes Training.';

		let context = '';
		if      (ramp >=  5) context = `Fitness steigt sehr schnell (+${ramp.toFixed(1)} CTL/Woche) – bald Erholungswoche einplanen.`;
		else if (ramp >=  2) context = `Fitness steigt gerade (+${ramp.toFixed(1)} CTL/Woche) – guter Aufbau.`;
		else if (ramp <= -5) context = `Fitness fällt spürbar (${ramp.toFixed(1)}/Woche) – mehr regelmäßige Einheiten würden helfen.`;
		else if (ramp <= -2) context = `Fitness geht leicht zurück (${ramp.toFixed(1)}/Woche).`;
		else if (peak && ctl >= peak.value * 0.95) context = `Du bist nahe an deiner Bestform (${ctl.toFixed(0)} / ${peak.value.toFixed(0)} CTL).`;
		else if (peak && ctl <= peak.value * 0.6)  context = `Fitness liegt bei ${Math.round(ctl / peak.value * 100)} % deines Bestwerts (${peak.value.toFixed(0)} CTL) – noch viel Potenzial.`;

		return context ? `${state} ${context}` : state;
	});

	function rampZone(r: number) {
		const abs = Math.abs(r);
		if (abs < 5)  return { text: 'text-green-400',  bg: 'bg-green-900/20',  border: 'border-green-700/40',  suffix: 'moderat'        };
		if (abs < 10) return { text: 'text-yellow-400', bg: 'bg-yellow-900/20', border: 'border-yellow-700/40', suffix: 'Aufbauphase'    };
		return               { text: 'text-red-400',    bg: 'bg-red-900/20',    border: 'border-red-700/40',    suffix: '⚠ zu schnell'   };
	}

	// Chart-Dimensionen
	const W = 1000, H = 280;
	const PAD = { top: 20, right: 24, bottom: 36, left: 48 };
	const cW = W - PAD.left - PAD.right;
	const cH = H - PAD.top - PAD.bottom;

	const maxVal = $derived(
		viewDays.length
			? Math.ceil(viewDays.reduce((m, d) => Math.max(m, d.ctl, d.atl, data?.peak_ctl?.value ?? 0), 0) / 10 + 1) * 10
			: 100
	);
	const minVal = $derived(
		viewDays.length
			? Math.floor(viewDays.reduce((m, d) => Math.min(m, d.tsb), 0) / 10 - 1) * 10
			: -30
	);
	const yRange = $derived(maxVal - minVal);

	function xOf(i: number) { return PAD.left + (i / Math.max(viewDays.length - 1, 1)) * cW; }
	function yOf(v: number) { return PAD.top + cH - ((v - minVal) / yRange) * cH; }

	// SVG-Pfade
	const tsbAreaPos = $derived(() => {
		if (!viewDays.length) return '';
		const z = yOf(0), n = viewDays.length;
		return `M${xOf(0).toFixed(1)},${z.toFixed(1)}`
			+ viewDays.map((d, i) => `L${xOf(i).toFixed(1)},${yOf(Math.max(d.tsb, 0)).toFixed(1)}`).join('')
			+ `L${xOf(n - 1).toFixed(1)},${z.toFixed(1)}Z`;
	});

	const tsbAreaNeg = $derived(() => {
		if (!viewDays.length) return '';
		const z = yOf(0), n = viewDays.length;
		return `M${xOf(0).toFixed(1)},${z.toFixed(1)}`
			+ viewDays.map((d, i) => `L${xOf(i).toFixed(1)},${yOf(Math.min(d.tsb, 0)).toFixed(1)}`).join('')
			+ `L${xOf(n - 1).toFixed(1)},${z.toFixed(1)}Z`;
	});

	function polyPts(key: 'ctl' | 'atl') {
		return viewDays.map((d, i) => `${xOf(i).toFixed(1)},${yOf(d[key]).toFixed(1)}`).join(' ');
	}

	// Trainingspausen: ≥5 aufeinanderfolgende Tage mit TSS = 0
	const pauses = $derived(() => {
		const result: { x1: number; x2: number }[] = [];
		let start: number | null = null;
		viewDays.forEach((d, i) => {
			if (d.tss === 0) {
				if (start === null) start = i;
			} else {
				if (start !== null && i - start >= 5) result.push({ x1: xOf(start), x2: xOf(i - 1) });
				start = null;
			}
		});
		if (start !== null && viewDays.length - start >= 5)
			result.push({ x1: xOf(start), x2: xOf(viewDays.length - 1) });
		return result;
	});

	// Y-Achse Ticks
	const yTicks = $derived(() => {
		const range = yRange;
		const step = range > 200 ? 40 : range > 100 ? 20 : 10;
		const ticks: number[] = [];
		for (let v = Math.ceil(minVal / step) * step; v <= maxVal; v += step) ticks.push(v);
		return ticks;
	});

	// X-Achse Monats-Labels
	const MONTHS = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
	const xLabels = $derived(() => {
		const labels: { x: number; label: string }[] = [];
		let lastMo = -1;
		const n = viewDays.length;
		viewDays.forEach((d, i) => {
			const mo = new Date(d.date).getMonth();
			const yr = new Date(d.date).getFullYear();
			if (mo !== lastMo) {
				if (n > 365 && mo % 2 !== 0) { lastMo = mo; return; }
				labels.push({ x: xOf(i), label: mo === 0 ? `${MONTHS[mo]} ${yr}` : MONTHS[mo] });
				lastMo = mo;
			}
		});
		return labels;
	});

	// Hover
	function onMouseMove(e: MouseEvent) {
		if (!svgWrapper || !viewDays.length) return;
		tooltipX = e.clientX;
		tooltipY = e.clientY;
		const rect = svgWrapper.getBoundingClientRect();
		const svgX = (e.clientX - rect.left) / rect.width * W;
		const raw = (svgX - PAD.left) / cW * (viewDays.length - 1);
		hoverIdx = Math.max(0, Math.min(viewDays.length - 1, Math.round(raw)));
	}

	const hoverDay = $derived(() =>
		hoverIdx !== null && viewDays.length ? viewDays[hoverIdx] : null
	);
	const hoverXPx = $derived(() =>
		hoverIdx !== null ? xOf(hoverIdx) : 0
	);

	// Datum formatieren
	function fmtDate(iso: string) {
		return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' });
	}
	function fmtDateLong(iso: string) {
		return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' });
	}

	// Wöchentliches Volumen – gefilterte Daten je nach volMode
	const volWeeks = $derived(() => {
		const n = volMode === '12' ? 12 : volMode === '26' ? 26 : 52;
		// API liefert älteste Woche zuerst – slice(-n) holt die neuesten n Wochen
		return [...weeklyVolumeData].slice(-n);
	});

	// Volumen-Chart-Dimensionen
	const VW = 1000, VH = 180;
	const VPAD = { top: 16, right: 16, bottom: 32, left: 52 };
	const vcW = VW - VPAD.left - VPAD.right;
	const vcH = VH - VPAD.top - VPAD.bottom;

	const volMaxMin = $derived(() => {
		const weeks = volWeeks();
		if (!weeks.length) return { maxMin: 120, step: 30 };
		const maxMin = weeks.reduce((m, w) =>
			Math.max(m, w.ride_minutes + w.workout_minutes + w.weight_training_minutes), 0);
		const rounded = Math.ceil(maxMin / 30 + 1) * 30;
		return { maxMin: rounded, step: rounded > 300 ? 60 : rounded > 150 ? 30 : 30 };
	});

	// X-Position für einen Balken im Volumen-Chart
	// Wir verteilen die Balken gleichmäßig über die gesamte Breite
	function volXOf(i: number, total: number) {
		return VPAD.left + (i / Math.max(total - 1, 1)) * vcW;
	}

	// Y-Position im Volumen-Chart
	function volYOf(minutes: number) {
		const { maxMin } = volMaxMin();
		return VPAD.top + vcH - (minutes / maxMin) * vcH;
	}

	// Balkenbreite: Abstand zwischen zwei Balken × 0.7
	function volBarW(total: number) {
		if (total <= 1) return vcW * 0.7;
		return (vcW / Math.max(total - 1, 1)) * 0.7;
	}

	// X-Achse Labels für Volumen-Chart: jeden 4. Monatswechsel beschriften
	const volXLabels = $derived(() => {
		const weeks = volWeeks();
		if (!weeks.length) return [];
		const labels: { x: number; label: string }[] = [];
		let lastMo = -1;
		let moCount = 0;
		weeks.forEach((w, i) => {
			const mo = new Date(w.week_start).getMonth();
			const yr = new Date(w.week_start).getFullYear();
			if (mo !== lastMo) {
				moCount++;
				// Jeden Monat beschriften, aber bei vielen Wochen nur jeden 2./4.
				const skip = weeks.length > 40 ? 2 : 1;
				if (moCount % skip === 0) {
					const x = volXOf(i, weeks.length);
					labels.push({ x, label: mo === 0 ? `${MONTHS[mo]} ${yr}` : MONTHS[mo] });
				}
				lastMo = mo;
			}
		});
		return labels;
	});

	// Y-Achse Ticks für Volumen-Chart
	const volYTicks = $derived(() => {
		const { maxMin, step } = volMaxMin();
		const ticks: number[] = [];
		for (let v = 0; v <= maxMin; v += step) ticks.push(v);
		return ticks;
	});
</script>

<svelte:head>
	<title>Form & Fitness – MyBiking</title>
</svelte:head>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div>
			<h1 class="text-2xl font-bold">Form & Fitness</h1>
			<p class="text-xs text-gray-500 mt-0.5">
				PMC · hrTSS = Dauer × (avg_HR / Schwellen-HR)² × 100
				{#if data}
					· HRmax {data.max_hr.toFixed(0)} bpm · Schwelle {data.threshold_hr.toFixed(0)} bpm
				{/if}
			</p>
		</div>
		<!-- Zeitraum-Toggle -->
		<div class="flex rounded-lg overflow-hidden border border-gray-700 text-sm">
			{#each [['90', '90 Tage'], ['180', '6 Monate'], ['all', 'Alles']] as [mode, label]}
				<button
					onclick={() => viewMode = mode as '90' | '180' | 'all'}
					class="px-3 py-1.5 transition-colors"
					class:bg-orange-600={viewMode === mode}
					class:text-white={viewMode === mode}
					class:text-gray-400={viewMode !== mode}
				>
					{label}
				</button>
			{/each}
		</div>
	</div>

	{#if error}
		<div class="rounded bg-red-900/50 border border-red-700 p-4 text-red-300 text-sm">{error}</div>
	{/if}

	{#if loading}
		<div class="h-72 bg-gray-800/50 animate-pulse rounded-xl"></div>
	{:else if data?.current}
		{@const cur = data.current}
		{@const zone = tsbZone(cur.tsb)}

		<!-- Formeinschätzung -->
		<div class="rounded-xl px-5 py-4 border {zone.bg} {zone.border}">
			<p class="text-xs text-gray-500 uppercase tracking-wide mb-1">Aktuelle Einschätzung</p>
			<p class="text-sm text-gray-200 leading-relaxed">{formSummary()}</p>
		</div>

		<!-- Stat-Cards -->
		<div class="grid grid-cols-2 md:grid-cols-4 gap-4">
			<!-- CTL -->
			<div class="rounded-xl bg-gray-800/60 p-4 border border-blue-900/40">
				<p class="text-xs text-blue-400 uppercase tracking-wider">Fitness (CTL)</p>
				<p class="text-3xl font-bold mt-1 text-blue-300">{cur.ctl.toFixed(1)}</p>
				<p class="text-xs text-gray-500 mt-0.5">42-Tage-EMA · hrTSS</p>
			</div>
			<!-- ATL -->
			<div class="rounded-xl bg-gray-800/60 p-4 border border-orange-900/40">
				<p class="text-xs text-orange-400 uppercase tracking-wider">Müdigkeit (ATL)</p>
				<p class="text-3xl font-bold mt-1 text-orange-300">{cur.atl.toFixed(1)}</p>
				<p class="text-xs text-gray-500 mt-0.5">7-Tage-EMA · hrTSS</p>
			</div>
			<!-- TSB / Form -->
			<div class="rounded-xl p-4 border {zone.bg} {zone.border}">
				<p class="text-xs uppercase tracking-wider {zone.text}">Form (TSB)</p>
				<p class="text-3xl font-bold mt-1 {zone.text}">
					{cur.tsb >= 0 ? '+' : ''}{cur.tsb.toFixed(1)}
				</p>
				<p class="text-xs text-gray-400 mt-0.5">{zone.label}</p>
			</div>
			<!-- Ramp Rate -->
			{#if rampRate !== null}
				{@const rz = rampZone(rampRate)}
				<div class="rounded-xl p-4 border {rz.bg} {rz.border}">
					<p class="text-xs uppercase tracking-wider {rz.text}">Aufbau / Woche</p>
					<p class="text-3xl font-bold mt-1 {rz.text}">
						{rampRate >= 0 ? '+' : ''}{rampRate.toFixed(1)}
					</p>
					<p class="text-xs text-gray-400 mt-0.5">{rz.suffix}</p>
				</div>
			{/if}
		</div>

		<!-- Peak CTL Info -->
		{#if data.peak_ctl}
			<p class="text-sm text-gray-500">
				Peak Fitness:
				<span class="text-blue-400 font-medium">{data.peak_ctl.value.toFixed(1)} CTL</span>
				am {fmtDateLong(data.peak_ctl.date)}
			</p>
		{/if}

		<!-- PMC-Chart -->
		<div class="rounded-xl bg-gray-800/40 border border-gray-800 p-4">
			<!-- Legende -->
			<div class="flex flex-wrap items-center gap-x-5 gap-y-1 mb-3 text-xs text-gray-400">
				<span class="flex items-center gap-1.5">
					<span class="inline-block w-6 h-0.5 rounded" style="background:#60a5fa"></span> Fitness (CTL)
				</span>
				<span class="flex items-center gap-1.5">
					<span class="inline-block w-6 h-0.5 rounded" style="background:#fb923c"></span> Müdigkeit (ATL)
				</span>
				<span class="flex items-center gap-1.5">
					<span class="inline-block w-3 h-3 rounded-sm bg-green-500/40"></span>
					<span class="inline-block w-3 h-3 rounded-sm bg-red-500/40"></span> Form (TSB)
				</span>
				{#if data.peak_ctl}
					<span class="flex items-center gap-1.5">
						<svg width="24" height="8"><line x1="0" y1="4" x2="24" y2="4" stroke="#93c5fd" stroke-width="1.5" stroke-dasharray="4 3"/></svg>
						Peak CTL
					</span>
				{/if}
				<span class="flex items-center gap-1.5">
					<span class="inline-block w-5 h-3 rounded-sm bg-white/5 border border-white/10"></span> Pause ≥5 Tage
				</span>
				<span class="flex items-center gap-1.5">
					<svg width="8" height="8"><circle cx="4" cy="4" r="3" fill="#a78bfa"/></svg> Workout
				</span>
				<span class="flex items-center gap-1.5">
					<svg width="8" height="8"><circle cx="4" cy="4" r="3" fill="#f59e0b"/></svg> Krafttraining
				</span>
			</div>

			<div
				bind:this={svgWrapper}
				class="relative"
				onmousemove={onMouseMove}
				onmouseleave={() => hoverIdx = null}
			>
				<svg viewBox="0 0 {W} {H}" class="w-full" style="height: 280px">
					<!-- Trainingspausen-Bänder -->
					{#each pauses() as p}
						<rect x={p.x1} y={PAD.top} width={Math.max(p.x2 - p.x1, 1)} height={cH}
							fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.06)" stroke-width="0.5"/>
					{/each}

					<!-- Y-Gitternetz + Labels -->
					{#each yTicks() as v}
						<line
							x1={PAD.left} y1={yOf(v).toFixed(1)}
							x2={W - PAD.right} y2={yOf(v).toFixed(1)}
							stroke="var(--chart-line)"
							stroke-width={v === 0 ? 1.5 : 0.7}
						/>
						<text x={PAD.left - 6} y={yOf(v) + 4} font-size="11" fill="var(--chart-text)" text-anchor="end">{v}</text>
					{/each}

					<!-- X-Achse Monats-Labels -->
					{#each xLabels() as { x, label }}
						<line x1={x} y1={PAD.top} x2={x} y2={PAD.top + cH} stroke="var(--chart-line)" stroke-width="0.5"/>
						<text x={x} y={H - 8} font-size="10" fill="var(--chart-text)" text-anchor="middle">{label}</text>
					{/each}

					<!-- TSB-Flächen (positiv grün, negativ rot) -->
					<path d={tsbAreaPos()} fill="#22c55e" opacity="0.18"/>
					<path d={tsbAreaNeg()} fill="#ef4444" opacity="0.18"/>

					<!-- ATL-Linie -->
					<polyline points={polyPts('atl')} fill="none" stroke="#fb923c" stroke-width="1.5" stroke-linejoin="round"/>
					<!-- CTL-Linie (obendrüber) -->
					<polyline points={polyPts('ctl')} fill="none" stroke="#60a5fa" stroke-width="2.5" stroke-linejoin="round"/>

					<!-- Peak-CTL Linie (gestrichelt) -->
					{#if data.peak_ctl}
						<line
							x1={PAD.left} y1={yOf(data.peak_ctl.value).toFixed(1)}
							x2={W - PAD.right} y2={yOf(data.peak_ctl.value).toFixed(1)}
							stroke="#93c5fd" stroke-width="1" stroke-dasharray="5 3" opacity="0.45"
						/>
						<text
							x={W - PAD.right - 3}
							y={yOf(data.peak_ctl.value) - 4}
							font-size="9" fill="#93c5fd" text-anchor="end" opacity="0.55"
						>Peak {data.peak_ctl.value.toFixed(0)}</text>
					{/if}

					<!-- Hover: vertikale Linie + Datenpunkte -->
					{#if hoverIdx !== null && hoverDay()}
						{@const hd = hoverDay()!}
						{@const hz = tsbZone(hd.tsb)}
						<line
							x1={hoverXPx()} y1={PAD.top}
							x2={hoverXPx()} y2={PAD.top + cH}
							stroke="white" stroke-width="1" opacity="0.25"
						/>
						<circle cx={hoverXPx()} cy={yOf(hd.ctl)} r="4" fill="#60a5fa" stroke="var(--bg-card,#1f2937)" stroke-width="1.5"/>
						<circle cx={hoverXPx()} cy={yOf(hd.atl)} r="4" fill="#fb923c" stroke="var(--bg-card,#1f2937)" stroke-width="1.5"/>
						<circle cx={hoverXPx()} cy={yOf(hd.tsb)} r="4" fill={hz.hex}  stroke="var(--bg-card,#1f2937)" stroke-width="1.5"/>
					{/if}

					<!-- Aktivitätstyp-Marker: Non-Ride-Tage als farbige Punkte am unteren Rand -->
					{#each viewDays as day, i}
						{#if day.other?.length}
							{#each day.other as o, j}
								<circle
									cx={xOf(i) + (day.other.length > 1 ? (j - (day.other.length - 1) / 2) * 5 : 0)}
									cy={PAD.top + cH + 10}
									r="3"
									fill={o.sport_type === 'Workout' ? '#a78bfa' : '#f59e0b'}
									opacity="0.85"
								/>
							{/each}
						{/if}
					{/each}

					<!-- Transparentes Rect für Maus-Events (muss zuletzt kommen) -->
					<rect x={PAD.left} y={PAD.top} width={cW} height={cH} fill="transparent"/>
				</svg>
			</div>
		</div>

		<!-- Wöchentliche Trainings-Zusammensetzung -->
		<section class="rounded-xl bg-gray-800/40 border border-gray-800 p-4">
			<div class="flex flex-wrap items-center justify-between gap-3 mb-3">
				<h2 class="text-sm font-semibold text-gray-300">Wöchentliche Trainings-Zusammensetzung</h2>
				<!-- Zeitraum-Toggle für Volumen -->
				<div class="flex rounded-lg overflow-hidden border border-gray-700 text-xs">
					{#each [['12', '12 Wo.'], ['26', '26 Wo.'], ['52', '52 Wo.']] as [mode, label]}
						<button
							onclick={() => volMode = mode as '12' | '26' | '52'}
							class="px-3 py-1.5 transition-colors"
							class:bg-orange-600={volMode === mode}
							class:text-white={volMode === mode}
							class:text-gray-400={volMode !== mode}
						>
							{label}
						</button>
					{/each}
				</div>
			</div>

			<!-- Legende -->
			<div class="flex flex-wrap items-center gap-x-5 gap-y-1 mb-3 text-xs text-gray-400">
				<span class="flex items-center gap-1.5">
					<span class="inline-block w-3 h-3 rounded-sm" style="background:#60a5fa"></span> Radfahren
				</span>
				<span class="flex items-center gap-1.5">
					<span class="inline-block w-3 h-3 rounded-sm" style="background:#a78bfa"></span> Workout
				</span>
				<span class="flex items-center gap-1.5">
					<span class="inline-block w-3 h-3 rounded-sm" style="background:#f59e0b"></span> Krafttraining
				</span>
			</div>

			{#if weeklyVolumeData.length}
				{@const weeks = volWeeks()}
				{@const total = weeks.length}
				{@const bW = total > 1 ? Math.max(2, (vcW / (total - 1)) * 0.65) : vcW * 0.65}
				<svg viewBox="0 0 {VW} {VH}" class="w-full" style="height: 180px">
					<!-- Y-Gitternetz + Labels -->
					{#each volYTicks() as v}
						<line
							x1={VPAD.left} y1={volYOf(v).toFixed(1)}
							x2={VW - VPAD.right} y2={volYOf(v).toFixed(1)}
							stroke="var(--chart-line)" stroke-width="0.7"
						/>
						<text x={VPAD.left - 4} y={volYOf(v) + 4} font-size="10" fill="var(--chart-text)" text-anchor="end">{v}</text>
					{/each}

					<!-- X-Achse Labels -->
					{#each volXLabels() as { x, label }}
						<line x1={x} y1={VPAD.top} x2={x} y2={VPAD.top + vcH} stroke="var(--chart-line)" stroke-width="0.5"/>
						<text x={x} y={VH - 6} font-size="10" fill="var(--chart-text)" text-anchor="middle">{label}</text>
					{/each}

					<!-- Gestapelte Balken -->
					{#each weeks as w, i}
						{@const totalMin = w.ride_minutes + w.workout_minutes + w.weight_training_minutes}
						{#if totalMin > 0}
							{@const cx = volXOf(i, total)}
							{@const x0 = cx - bW / 2}
							{@const baseY = VPAD.top + vcH}
							<!-- Radfahren (blau) -->
							{#if w.ride_minutes > 0}
								{@const barH = (w.ride_minutes / volMaxMin().maxMin) * vcH}
								<rect
									x={x0} y={baseY - barH}
									width={bW} height={barH}
									fill="#60a5fa" opacity="0.75" rx="1"
								/>
							{/if}
							<!-- Workout (lila, obendrauf) -->
							{#if w.workout_minutes > 0}
								{@const rideH = (w.ride_minutes / volMaxMin().maxMin) * vcH}
								{@const barH = (w.workout_minutes / volMaxMin().maxMin) * vcH}
								<rect
									x={x0} y={baseY - rideH - barH}
									width={bW} height={barH}
									fill="#a78bfa" opacity="0.75" rx="1"
								/>
							{/if}
							<!-- Krafttraining (grau, ganz oben) -->
							{#if w.weight_training_minutes > 0}
								{@const rideH = (w.ride_minutes / volMaxMin().maxMin) * vcH}
								{@const wkH = (w.workout_minutes / volMaxMin().maxMin) * vcH}
								{@const barH = (w.weight_training_minutes / volMaxMin().maxMin) * vcH}
								<rect
									x={x0} y={baseY - rideH - wkH - barH}
									width={bW} height={barH}
									fill="#f59e0b" opacity="0.75" rx="1"
								/>
							{/if}
						{/if}
					{/each}
				</svg>
			{:else}
				<p class="text-xs text-gray-500">Keine Daten.</p>
			{/if}
		</section>

		<!-- TSB-Zonen-Erklärung -->
		<div class="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
			{#each [
				{ range: 'TSB > +25',     label: 'Sehr frisch',    sub: 'Evtl. zu wenig Training',  color: 'text-sky-300'    },
				{ range: '+5 – +25',      label: 'Wettkampfform',  sub: 'Optimal für Rennen/Tour',  color: 'text-green-400'  },
				{ range: '−10 – +5',      label: 'Normal',         sub: 'Ruhige Trainingsphase',    color: 'text-yellow-400' },
				{ range: '−25 – −10',     label: 'Trainingsblock', sub: 'Belastung akkumuliert',    color: 'text-orange-400' },
				{ range: 'TSB < −25',     label: 'Überbelastet',   sub: 'Verletzungsrisiko',        color: 'text-red-400'    },
			] as z}
				<div class="rounded-lg bg-gray-800/40 p-2.5">
					<p class="font-mono text-gray-500">{z.range}</p>
					<p class="font-medium {z.color} mt-0.5">{z.label}</p>
					<p class="text-gray-500 mt-0.5">{z.sub}</p>
				</div>
			{/each}
		</div>
		<!-- Lesehilfe -->
		<div class="rounded-xl bg-gray-800/30 border border-gray-700/50 p-5 space-y-4 text-sm">
			<h2 class="font-semibold text-gray-200">Was sagen mir diese Zahlen?</h2>

			<!-- Analogie -->
			<div class="grid md:grid-cols-3 gap-3">
				<div class="rounded-lg bg-blue-900/20 border border-blue-800/30 p-3">
					<p class="text-blue-400 font-medium mb-1">Fitness (CTL) = Konditionskonto</p>
					<p class="text-gray-400">
						Stell dir CTL wie ein Sparguthaben vor: Regelmäßiges Training zahlt ein,
						Pausen heben ab. Der Wert steigt langsam (Wochen) und fällt auch langsam.
						Dein aktueller Stand: <span class="text-blue-300 font-mono">{cur.ctl.toFixed(1)}</span>
						{#if data?.peak_ctl}
							– dein Höchststand war
							<span class="text-blue-300 font-mono">{data.peak_ctl.value.toFixed(1)}</span>
							({fmtDateLong(data.peak_ctl.date)}).
						{/if}
					</p>
				</div>
				<div class="rounded-lg bg-orange-900/20 border border-orange-800/30 p-3">
					<p class="text-orange-400 font-medium mb-1">Müdigkeit (ATL) = kurzfristige Schulden</p>
					<p class="text-gray-400">
						ATL zeigt, wie viel du in den letzten 7 Tagen gefordert hast.
						Intensives Training treibt ihn hoch, Ruhetage senken ihn schnell.
						Dein aktueller Stand: <span class="text-orange-300 font-mono">{cur.atl.toFixed(1)}</span>.
						{#if cur.atl < cur.ctl * 0.6}
							Du bist gerade deutlich ausgeruht.
						{:else if cur.atl > cur.ctl * 1.2}
							Du hast zuletzt mehr trainiert als dein Langzeitschnitt – der Körper ist gefordert.
						{:else}
							Das liegt im normalen Bereich.
						{/if}
					</p>
				</div>
				<div class="rounded-lg {zone.bg} border {zone.border} p-3">
					<p class="{zone.text} font-medium mb-1">Form (TSB) = verfügbares Guthaben</p>
					<p class="text-gray-400">
						TSB = Fitness minus Müdigkeit. Positiv heißt frisch, negativ heißt müde.
						Dein Wert heute:
						<span class="{zone.text} font-mono font-bold">{cur.tsb >= 0 ? '+' : ''}{cur.tsb.toFixed(1)}</span>
						→ <span class="{zone.text}">{zone.label}</span>.
					</p>
				</div>
			</div>

			<!-- Personalisierter Tipp -->
			<div class="rounded-lg bg-gray-700/30 border border-gray-600/30 p-4">
				<p class="text-gray-300 font-medium mb-1">Was bedeutet das konkret für dich heute?</p>
				<p class="text-gray-400">
					{#if cur.tsb > 25}
						Du bist sehr frisch – fast zu ausgeruht. Ein langer oder intensiver Ride wäre jetzt ideal,
						um deine Fitness wieder aufzubauen. Danach steigt ATL und TSB sinkt in den grünen Bereich.
					{:else if cur.tsb > 5}
						Gute Tagesform. Heute wäre ein guter Moment für einen harten Intervall-Tag,
						einen längeren Ride oder sogar einen Wettkampf. Dein Körper ist erholt und bereit.
					{:else if cur.tsb > -10}
						Du bist im normalen Trainingszustand – leicht müde, aber nicht überlastet.
						Genau hier passiert die Anpassung: Weitermachen lohnt sich, aber ein Ruhetag pro Woche ist wichtig.
					{:else if cur.tsb > -25}
						Du steckst in einem Trainingsblock und bist entsprechend müde. Das ist in Ordnung
						– aber plane in den nächsten 1–2 Wochen bewusst eine Erholungswoche ein,
						damit sich die Fitness auch festigt.
					{:else}
						Du bist deutlich überbelastet. Weitere intensive Einheiten bringen jetzt weniger als Ruhe.
						2–3 lockere oder freie Tage sind aktuell sinnvoller als hartes Training.
					{/if}
					{#if data?.peak_ctl && cur.ctl < data.peak_ctl.value * 0.75}
						{' '}Deine Fitness liegt noch deutlich unter deinem Bestwert von {data.peak_ctl.value.toFixed(0)} CTL –
						mit regelmäßigem Aufbau ist das erreichbar.
					{:else if data?.peak_ctl && cur.ctl >= data.peak_ctl.value * 0.95}
						{' '}Du bist fast auf deiner bisher besten Fitness – top!
					{/if}
				</p>
			</div>

			<!-- Mini-Glossar -->
			<details class="text-xs text-gray-500 cursor-pointer">
				<summary class="hover:text-gray-300 transition-colors">Abkürzungen erklärt</summary>
				<dl class="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
					<div><dt class="inline font-mono text-gray-400">CTL </dt><dd class="inline">Chronic Training Load – 42-Tage-Durchschnitt des täglichen Trainingsstresses</dd></div>
					<div><dt class="inline font-mono text-gray-400">ATL </dt><dd class="inline">Acute Training Load – 7-Tage-Durchschnitt, reagiert schnell auf Belastung und Ruhe</dd></div>
					<div><dt class="inline font-mono text-gray-400">TSB </dt><dd class="inline">Training Stress Balance – CTL minus ATL, zeigt ob du frisch oder müde bist</dd></div>
					<div><dt class="inline font-mono text-gray-400">TSS </dt><dd class="inline">Training Stress Score – Belastungspunkte einer einzelnen Einheit (hier HR-basiert berechnet)</dd></div>
					<div><dt class="inline font-mono text-gray-400">hrTSS </dt><dd class="inline">HR-basiertes TSS: Dauer × (Ø-Herzfrequenz / Schwellen-HR)² × 100</dd></div>
					<div><dt class="inline font-mono text-gray-400">EMA </dt><dd class="inline">Exponentieller Gleitender Mittelwert – neuere Tage zählen mehr als ältere</dd></div>
				</dl>
			</details>
		</div>

	{:else if !loading}
		<p class="text-gray-500 text-sm">Keine Daten. Erst importieren.</p>
	{/if}
</div>

<!-- Hover-Tooltip (fixed, außerhalb SVG) -->
{#if hoverDay()}
	{@const hd = hoverDay()!}
	{@const z = tsbZone(hd.tsb)}
	<div
		class="fixed z-50 pointer-events-none rounded-lg bg-gray-900/95 border border-gray-700 p-3 text-xs shadow-xl"
		style="left: {tooltipX + 14}px; top: {tooltipY - 70}px; min-width: 148px"
	>
		<p class="font-medium text-gray-200 mb-2">{fmtDate(hd.date)}</p>
		<div class="space-y-1">
			<div class="flex justify-between gap-4">
				<span style="color: #60a5fa">CTL</span>
				<span class="font-mono" style="color: #60a5fa">{hd.ctl.toFixed(1)}</span>
			</div>
			<div class="flex justify-between gap-4">
				<span style="color: #fb923c">ATL</span>
				<span class="font-mono" style="color: #fb923c">{hd.atl.toFixed(1)}</span>
			</div>
			<div class="flex justify-between gap-4">
				<span class={z.text}>TSB</span>
				<span class="font-mono {z.text}">{hd.tsb >= 0 ? '+' : ''}{hd.tsb.toFixed(1)}</span>
			</div>
			{#if hd.tss > 0}
				<div class="flex justify-between gap-4 pt-1.5 border-t border-gray-700/60">
					<span class="text-gray-500">TSS</span>
					<span class="text-gray-300 font-mono">{hd.tss.toFixed(0)}</span>
				</div>
			{/if}
			{#if hd.other?.length}
				<div class="pt-1.5 border-t border-gray-700/60 space-y-0.5">
					{#each hd.other as o}
						<div class="flex justify-between gap-4">
							<span style="color: {o.sport_type === 'Workout' ? '#a78bfa' : '#f59e0b'}">
								{o.sport_type === 'Weight Training' ? 'Kraft' : o.sport_type}
							</span>
							<span class="text-gray-300 font-mono">{Math.round(o.moving_time_s / 60)} min</span>
						</div>
					{/each}
				</div>
			{/if}
		</div>
		<p class="mt-2 text-gray-500 text-[10px]">{z.label}</p>
	</div>
{/if}
