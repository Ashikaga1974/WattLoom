<script lang="ts">
	import { onMount } from 'svelte';
	import { api, type CadenceData, type CadenceZone } from '$lib/api';
	import PageHeader from '$lib/PageHeader.svelte';
	import { smoothLine, smoothArea } from '$lib/chart-utils';

	// --- State ---
	let data           = $state<CadenceData | null>(null);
	let loading        = $state(true);
	let error          = $state<string | null>(null);
	let filterYear     = $state<string>('');
	let availableYears = $state<string[]>([]);

	// Polar-Chart-Hover: welcher Distribution-Balken ist aktiv
	let hoveredCadence = $state<number | null>(null);

	// Monatsverlauf-Hover
	let hoveredMonth = $state<number | null>(null);
	let tooltipX     = $state(0);
	let tooltipY     = $state(0);

	// --- Laden ---
	onMount(async () => {
		try {
			const stats = await api.activityStats();
			availableYears = stats.available_years.filter(y => Number(y) >= 2000);
			await load();
		} catch (e) {
			error   = e instanceof Error ? e.message : 'Fehler';
			loading = false;
		}
	});

	async function load() {
		loading = true;
		error   = null;
		try {
			data = await api.cadence(filterYear ? Number(filterYear) : undefined);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Fehler beim Laden';
		} finally {
			loading = false;
		}
	}

	// --- Zonen-Farben ---
	const ZONE_COLORS: Record<string, string> = {
		'Schleppen': '#6b7280',
		'Niedrig':   '#60a5fa',
		'Moderat':   '#34d399',
		'Optimal':   '#fbbf24',
		'Hoch':      '#f97316',
		'Sprint':    '#ef4444',
	};

	const ZONE_DESC: Record<string, string> = {
		'Schleppen': 'Zu langsam, schweres Gear',
		'Niedrig':   'Kraftbetont, ermüdend',
		'Moderat':   'Solide Grundlage',
		'Optimal':   'Pedalrhythmus-Sweetspot',
		'Hoch':      'Spinning, effizient',
		'Sprint':    'Max-Sprint',
	};

	// Farbe für einen cadence-Wert bestimmen
	function cadenceColor(c: number): string {
		if (c < 60)  return '#6b7280';
		if (c < 70)  return '#60a5fa';
		if (c < 80)  return '#34d399';
		if (c < 90)  return '#fbbf24';
		if (c < 100) return '#f97316';
		return '#ef4444';
	}

	// --- Abgeleitete Werte ---

	// Lieblingszone = Zone mit höchstem count
	const favoriteZone = $derived(
		data ? data.zones.reduce((best, z) => z.count > best.count ? z : best, data.zones[0]) : null
	);

	// Datenpunkte formatieren: "264 Tsd."
	const totalPointsFmt = $derived(() => {
		if (!data) return '';
		const n = data.stats.total_points;
		if (n >= 1000) return `${Math.round(n / 1000)} Tsd.`;
		return String(n);
	});

	// Gesamte Punkte für Zonen-Prozentwerte
	const totalZoneCount = $derived(data ? data.zones.reduce((s, z) => s + z.count, 0) : 0);

	// --- Polar Chart ---
	const CX = 250, CY = 250;
	const R_INNER  = 80;   // Innenkreis-Radius
	const R_OUTER  = 210;  // Referenzkreis
	const BAR_MAX  = 130;  // max. Balkenlänge in px

	// 91 Cadence-Werte: 40–130
	const CADENCE_MIN = 40;
	const CADENCE_MAX = 130;
	const CADENCE_COUNT = CADENCE_MAX - CADENCE_MIN + 1; // 91

	// Winkelberechnung: cadence 40 = oben (270°=−90°), 130 = unten (90°)
	// → 360° / 91 Schritte
	const DEG_PER_STEP = 360 / CADENCE_COUNT;
	const BAR_WIDTH_DEG = 2.8;

	function cadenceAngleDeg(cadence: number): number {
		// cadence 40 → -90°, wächst im Uhrzeigersinn
		return -90 + (cadence - CADENCE_MIN) * DEG_PER_STEP;
	}

	// Konvertiert Grad in Bogenmaß
	function deg2rad(d: number): number {
		return (d * Math.PI) / 180;
	}

	// Berechnet einen Punkt auf einem Kreis
	function polar(angle_deg: number, r: number): [number, number] {
		const a = deg2rad(angle_deg);
		return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
	}

	// SVG-Pfad für einen radialen Balken (wie ein schmales Tortenstück)
	function barPath(cadence: number, count: number, maxCount: number): string {
		const length = R_INNER + (count / maxCount) * BAR_MAX;
		const angleMid  = cadenceAngleDeg(cadence);
		const angleStart = angleMid - BAR_WIDTH_DEG / 2;
		const angleEnd   = angleMid + BAR_WIDTH_DEG / 2;

		const [x1i, y1i] = polar(angleStart, R_INNER);
		const [x1o, y1o] = polar(angleStart, length);
		const [x2o, y2o] = polar(angleEnd, length);
		const [x2i, y2i] = polar(angleEnd, R_INNER);

		return `M${x1i.toFixed(1)},${y1i.toFixed(1)}L${x1o.toFixed(1)},${y1o.toFixed(1)}A${length.toFixed(1)},${length.toFixed(1)} 0 0,1 ${x2o.toFixed(1)},${y2o.toFixed(1)}L${x2i.toFixed(1)},${y2i.toFixed(1)}A${R_INNER},${R_INNER} 0 0,0 ${x1i.toFixed(1)},${y1i.toFixed(1)}Z`;
	}

	// Zone-Ring-Segment (Radius 70)
	function zoneArcPath(zone: CadenceZone, totalZones: number): string {
		const R = 70;
		const R2 = 76;
		// Mapping zone.min/max auf Winkel
		const startCad = Math.max(zone.min, CADENCE_MIN);
		const endCad   = Math.min(zone.max, CADENCE_MAX);
		if (startCad > endCad) return '';

		const aStart = cadenceAngleDeg(startCad) - DEG_PER_STEP / 2;
		const aEnd   = cadenceAngleDeg(endCad)   + DEG_PER_STEP / 2;

		const [x1, y1] = polar(aStart, R);
		const [x2, y2] = polar(aEnd,   R);
		const [x3, y3] = polar(aEnd,   R2);
		const [x4, y4] = polar(aStart, R2);

		// Bestimme ob großer Bogen (> 180°)
		const sweep = ((aEnd - aStart) > 180) ? 1 : 0;

		return `M${x1.toFixed(1)},${y1.toFixed(1)}A${R},${R} 0 ${sweep},1 ${x2.toFixed(1)},${y2.toFixed(1)}L${x3.toFixed(1)},${y3.toFixed(1)}A${R2},${R2} 0 ${sweep},0 ${x4.toFixed(1)},${y4.toFixed(1)}Z`;
	}

	// Polar-Chart-Tooltiptext
	const hoveredBar = $derived(() => {
		if (!data || hoveredCadence === null) return null;
		const pt = data.distribution.find(d => d.cadence === hoveredCadence);
		return pt ?? null;
	});

	// Innenkreis-Text: entweder Hover-Info oder Ø-Wert
	const innerLabel1 = $derived(() => {
		const bar = hoveredBar();
		if (bar) return `${bar.cadence} rpm`;
		return data ? `Ø ${data.stats.avg_cadence.toFixed(1)}` : '';
	});
	const innerLabel2 = $derived(() => {
		const bar = hoveredBar();
		if (bar) return `${bar.count.toLocaleString('de')}×`;
		return 'rpm';
	});

	// Maximaler count für Balkenskalierung
	const maxDistCount = $derived(
		data ? Math.max(...data.distribution.map(d => d.count)) : 1
	);

	// --- Monatsverlauf-Chart ---
	const MW = 800, MH = 180;
	const MPAD = { top: 20, right: 20, bottom: 40, left: 52 };
	const mcW = MW - MPAD.left - MPAD.right;
	const mcH = MH - MPAD.top  - MPAD.bottom;

	const CADENCE_Y_MIN = 70;
	const CADENCE_Y_MAX = 95;
	const cadenceYRange = CADENCE_Y_MAX - CADENCE_Y_MIN;

	const monthlyPoints = $derived(() => {
		if (!data || !data.monthly.length) return [];
		return data.monthly.map((m, i) => ({
			x: MPAD.left + (i / Math.max(data!.monthly.length - 1, 1)) * mcW,
			y: MPAD.top  + mcH - ((Math.min(Math.max(m.avg_cadence, CADENCE_Y_MIN), CADENCE_Y_MAX) - CADENCE_Y_MIN) / cadenceYRange) * mcH,
			month: m.month,
			avg: m.avg_cadence,
			rides: m.rides,
		}));
	});

	const monthlyAreaPath = $derived(() => {
		const pts = monthlyPoints();
		if (pts.length < 2) return '';
		return smoothArea(pts.map(p => [p.x, p.y] as [number, number]), MPAD.top + mcH);
	});

	const monthlyLinePath = $derived(() => {
		const pts = monthlyPoints();
		if (pts.length < 2) return '';
		return smoothLine(pts.map(p => [p.x, p.y] as [number, number]));
	});

	const avgCadenceY = $derived(() => {
		if (!data) return MPAD.top + mcH / 2;
		const c = Math.min(Math.max(data.stats.avg_cadence, CADENCE_Y_MIN), CADENCE_Y_MAX);
		return MPAD.top + mcH - ((c - CADENCE_Y_MIN) / cadenceYRange) * mcH;
	});

	// --- Effizienz-Sweetspot ---
	const sweetspotIdx = $derived(() => {
		if (!data || !data.efficiency.length) return -1;
		let best = -1;
		let bestRatio = -Infinity;
		data.efficiency.forEach((e, i) => {
			if (e.avg_hr > 0) {
				const ratio = e.avg_speed_kmh / e.avg_hr;
				if (ratio > bestRatio) { bestRatio = ratio; best = i; }
			}
		});
		return best;
	});
</script>

<svelte:head>
	<title>Kadenz-Analyse – MyBiking</title>
</svelte:head>

<div class="space-y-6">
	<PageHeader
		title="Kadenz-Analyse"
		subtitle="Pedalfrequenz-Analyse aus {data?.stats.rides_with_cadence ?? '–'} Rides mit Kadenz-Daten"
		years={availableYears}
		bind:selectedYear={filterYear}
		onchange={load}
	/>

	{#if error}
		<div class="rounded bg-red-900/50 border border-red-700 p-4 text-red-300 text-sm">{error}</div>
	{/if}

	{#if loading}
		<div class="grid grid-cols-4 gap-3">
			{#each [1,2,3,4] as _}
				<div class="h-24 bg-gray-800/50 animate-pulse rounded-xl"></div>
			{/each}
		</div>
		<div class="h-[520px] bg-gray-800/50 animate-pulse rounded-xl"></div>
	{:else if data}

		<!-- ── Stats-Leiste ── -->
		<div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
			<!-- Ø Kadenz -->
			<div class="rounded-xl border border-gray-800 bg-gray-800/40 px-4 py-4">
				<p class="text-[10px] uppercase tracking-wide text-gray-500">Ø Kadenz</p>
				<p class="text-3xl font-bold text-amber-400 mt-1">{data.stats.avg_cadence.toFixed(1)}</p>
				<p class="text-xs text-gray-500 mt-0.5">rpm</p>
			</div>
			<!-- Max Kadenz -->
			<div class="rounded-xl border border-gray-800 bg-gray-800/40 px-4 py-4">
				<p class="text-[10px] uppercase tracking-wide text-gray-500">Max Kadenz</p>
				<p class="text-3xl font-bold text-red-400 mt-1">{data.stats.max_cadence}</p>
				<p class="text-xs text-gray-500 mt-0.5">rpm</p>
			</div>
			<!-- Lieblingszone -->
			{#if favoriteZone}
				<div class="rounded-xl border border-gray-800 bg-gray-800/40 px-4 py-4">
					<p class="text-[10px] uppercase tracking-wide text-gray-500">Lieblingszone</p>
					<p class="text-2xl font-bold mt-1" style="color: {ZONE_COLORS[favoriteZone.name] ?? '#fff'}">
						{favoriteZone.name}
					</p>
					<p class="text-xs text-gray-500 mt-0.5">{favoriteZone.min}–{favoriteZone.max} rpm</p>
				</div>
			{/if}
			<!-- Datenpunkte -->
			<div class="rounded-xl border border-gray-800 bg-gray-800/40 px-4 py-4">
				<p class="text-[10px] uppercase tracking-wide text-gray-500">Datenpunkte</p>
				<p class="text-3xl font-bold text-emerald-400 mt-1">{totalPointsFmt()}</p>
				<p class="text-xs text-gray-500 mt-0.5">Sekunden mit Kadenzdaten</p>
			</div>
		</div>

		<!-- ── Polar Chart + Zonen nebeneinander ── -->
		<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">

			<!-- Radiales Verteilungsdiagramm -->
			<div class="rounded-xl border border-gray-800 bg-gray-800/40 p-4">
				<h3 class="text-sm font-medium text-gray-300 mb-3">Kadenz-Verteilung</h3>
				<svg viewBox="0 0 500 500" width="100%" class="block mx-auto" style="max-height: 480px;">
					<defs>
						<!-- Gradient für den Innenkreis -->
						<radialGradient id="innerGrad" cx="50%" cy="50%">
							<stop offset="0%" stop-color="#1f2937" stop-opacity="1"/>
							<stop offset="100%" stop-color="#111827" stop-opacity="1"/>
						</radialGradient>
					</defs>

					<!-- Äußerer Referenz-Ring gestrichelt -->
					<circle cx={CX} cy={CY} r={R_OUTER}
						fill="none" stroke="#374151" stroke-width="1" stroke-dasharray="4,6"
					/>

					<!-- Zone-Ring (Radius 70–76) -->
					{#each data.zones as zone}
						{@const path = zoneArcPath(zone, data.zones.length)}
						{#if path}
							<path d={path} fill={ZONE_COLORS[zone.name] ?? '#6b7280'} opacity="0.7"/>
						{/if}
					{/each}

					<!-- Radiale Balken -->
					{#each data.distribution as dp}
						<path
							d={barPath(dp.cadence, dp.count, maxDistCount)}
							fill={cadenceColor(dp.cadence)}
							opacity={hoveredCadence === dp.cadence ? 1 : 0.75}
							stroke={hoveredCadence === dp.cadence ? '#fff' : 'none'}
							stroke-width="0.5"
							onmouseenter={() => hoveredCadence = dp.cadence}
							onmouseleave={() => hoveredCadence = null}
							style="cursor: pointer;"
						/>
					{/each}

					<!-- Innenkreis -->
					<circle cx={CX} cy={CY} r={R_INNER} fill="url(#innerGrad)" stroke="#374151" stroke-width="1.5"/>

					<!-- Innenkreis-Text -->
					{#if hoveredCadence !== null && hoveredBar()}
						{@const bar = hoveredBar()!}
						<text x={CX} y={CY - 10} font-size="16" font-weight="700"
							fill={cadenceColor(bar.cadence)} text-anchor="middle">{bar.cadence} rpm</text>
						<text x={CX} y={CY + 12} font-size="13" fill="#9ca3af" text-anchor="middle">
							{bar.count.toLocaleString('de')}×
						</text>
					{:else}
						<text x={CX} y={CY - 6} font-size="20" font-weight="700" fill="#fbbf24" text-anchor="middle">
							Ø {data.stats.avg_cadence.toFixed(1)}
						</text>
						<text x={CX} y={CY + 14} font-size="12" fill="#6b7280" text-anchor="middle">rpm</text>
					{/if}

					<!-- Winkel-Beschriftungen: 40 oben, 62 links, 85 unten, 108 rechts -->
					{#each ([
						{ cad: 40,  label: '40 rpm' },
						{ cad: 62,  label: '62' },
						{ cad: 85,  label: '85' },
						{ cad: 108, label: '108' },
					] as const) as lbl}
						{@const pos = polar(cadenceAngleDeg(lbl.cad), R_OUTER + 18)}
						<text x={pos[0].toFixed(1)} y={(pos[1] + 4).toFixed(1)}
							font-size="11" fill="#4b5563" text-anchor="middle">{lbl.label}</text>
					{/each}
				</svg>
			</div>

			<!-- Kadenz-Zonen -->
			<div class="rounded-xl border border-gray-800 bg-gray-800/40 p-4 flex flex-col justify-center">
				<h3 class="text-sm font-medium text-gray-300 mb-4">Kadenz-Zonen</h3>
				<div class="space-y-3">
					{#each data.zones as zone}
						{@const pct = totalZoneCount > 0 ? (zone.count / totalZoneCount * 100) : 0}
						{@const color = ZONE_COLORS[zone.name] ?? '#6b7280'}
						{@const desc  = ZONE_DESC[zone.name] ?? ''}
						<div>
							<div class="flex items-center justify-between mb-1">
								<div class="flex items-center gap-2">
									<span class="inline-block w-2.5 h-2.5 rounded-full shrink-0" style="background: {color}"></span>
									<span class="text-sm font-medium" style="color: {color}">{zone.name}</span>
									<span class="text-xs text-gray-500">{zone.min}–{zone.max === 999 ? '∞' : zone.max} rpm</span>
								</div>
								<span class="text-sm font-mono text-gray-300">{pct.toFixed(1)} %</span>
							</div>
							<!-- Balken -->
							<div class="h-2 rounded-full bg-gray-700 overflow-hidden">
								<div
									class="h-full rounded-full transition-all"
									style="width: {pct.toFixed(1)}%; background: {color};"
								></div>
							</div>
							<p class="text-xs text-gray-600 mt-0.5 pl-5">{desc}</p>
						</div>
					{/each}
				</div>
			</div>
		</div>

		<!-- ── Monatsverlauf ── -->
		{#if data.monthly.length >= 2}
			<div class="rounded-xl border border-gray-800 bg-gray-800/40 p-4">
				<h3 class="text-sm font-medium text-gray-300 mb-3">Monatlicher Kadenz-Verlauf</h3>
				<div class="relative">
					<svg viewBox="0 0 {MW} {MH}" width="100%" class="block overflow-visible">
						<defs>
							<linearGradient id="cadGrad" x1="0" y1="0" x2="0" y2="1">
								<stop offset="0%"   stop-color="#fbbf24" stop-opacity="0.3"/>
								<stop offset="100%" stop-color="#fbbf24" stop-opacity="0"/>
							</linearGradient>
						</defs>

						<!-- Y-Gitternetz -->
						{#each [70, 75, 80, 85, 90, 95] as v}
							{@const gy = MPAD.top + mcH - ((v - CADENCE_Y_MIN) / cadenceYRange) * mcH}
							<line x1={MPAD.left} y1={gy} x2={MW - MPAD.right} y2={gy}
								stroke="#374151" stroke-width="1"/>
							<text x={MPAD.left - 8} y={gy + 4} font-size="11" fill="#6b7280" text-anchor="end">{v}</text>
						{/each}

						<!-- Ø-Linie gestrichelt -->
						<line
							x1={MPAD.left} y1={avgCadenceY()}
							x2={MW - MPAD.right} y2={avgCadenceY()}
							stroke="#6b7280" stroke-width="1" stroke-dasharray="4,4"
						/>
						<text x={MW - MPAD.right + 4} y={avgCadenceY() + 4}
							font-size="10" fill="#6b7280">Ø</text>

						<!-- Baseline -->
						<line
							x1={MPAD.left} y1={MPAD.top + mcH}
							x2={MW - MPAD.right} y2={MPAD.top + mcH}
							stroke="#4b5563" stroke-width="1"
						/>

						<!-- Fläche + Linie -->
						<path d={monthlyAreaPath()} fill="url(#cadGrad)"/>
						<path d={monthlyLinePath()} fill="none" stroke="#fbbf24" stroke-width="2.5"
							stroke-linecap="round" stroke-linejoin="round"/>

						<!-- Monatspunkte -->
						{#each monthlyPoints() as pt, i}
							<circle
								cx={pt.x} cy={pt.y} r={hoveredMonth === i ? 6 : 4}
								fill={hoveredMonth === i ? '#fbbf24' : '#f59e0b'}
								stroke="#1f2937" stroke-width="2"
								style="cursor: pointer;"
								onmouseenter={(e) => {
									hoveredMonth = i;
									const rect = (e.currentTarget as SVGCircleElement).closest('svg')!.getBoundingClientRect();
									// Tooltip-Position relativ zum SVG (clientX/Y zum Div)
									tooltipX = e.clientX - rect.left + 12;
									tooltipY = e.clientY - rect.top  - 36;
								}}
								onmouseleave={() => hoveredMonth = null}
							/>
							<!-- X-Achsen-Label alle 3 Monate -->
							{#if i % 3 === 0}
								<text x={pt.x} y={MPAD.top + mcH + 16}
									font-size="10" fill="#6b7280" text-anchor="middle">
									{pt.month.slice(0, 7)}
								</text>
							{/if}
						{/each}

						<!-- Y-Achsen-Label -->
						<text
							x={MPAD.left - 36} y={MPAD.top + mcH / 2}
							font-size="11" fill="#6b7280" text-anchor="middle"
							transform="rotate(-90, {MPAD.left - 36}, {MPAD.top + mcH / 2})"
						>rpm</text>
					</svg>

					<!-- Hover-Tooltip -->
					{#if hoveredMonth !== null}
						{@const pt = monthlyPoints()[hoveredMonth]}
						<div
							class="absolute pointer-events-none z-10 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs shadow-lg"
							style="left: {tooltipX}px; top: {tooltipY}px;"
						>
							<p class="text-gray-400">{pt.month}</p>
							<p class="text-amber-400 font-bold text-sm">{pt.avg.toFixed(1)} rpm</p>
							<p class="text-gray-500">{pt.rides} Ride{pt.rides !== 1 ? 's' : ''}</p>
						</div>
					{/if}
				</div>
			</div>
		{/if}

		<!-- ── Effizienz-Kacheln ── -->
		{#if data.efficiency.length > 0}
			<div class="rounded-xl border border-gray-800 bg-gray-800/40 p-4">
				<h3 class="text-sm font-medium text-gray-300 mb-1">Kadenz-Effizienz</h3>
				<p class="text-xs text-gray-600 mb-4">
					Speed-zu-HR-Ratio je Kadenz-Bucket — höherer Wert = besser (mehr Speed, weniger Herzschlag)
				</p>
				<div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
					{#each data.efficiency as eff, i}
						{@const isSweetspot = i === sweetspotIdx()}
						{@const ratio = eff.avg_hr > 0 ? (eff.avg_speed_kmh / eff.avg_hr * 100).toFixed(2) : '–'}
						<div class="rounded-xl border px-3 py-3 text-center transition-colors
							{isSweetspot
								? 'border-amber-400/60 bg-amber-400/10'
								: 'border-gray-700 bg-gray-900/50 hover:border-gray-600'}"
						>
							{#if isSweetspot}
								<p class="text-[9px] text-amber-400 font-bold uppercase tracking-wide mb-1">★ Sweetspot</p>
							{/if}
							<p class="text-lg font-bold {isSweetspot ? 'text-amber-400' : 'text-gray-200'} leading-tight">
								{eff.cadence_mid}
							</p>
							<p class="text-[10px] text-gray-500 mb-2">rpm</p>
							<div class="space-y-0.5">
								<p class="text-xs text-emerald-400">{eff.avg_speed_kmh.toFixed(1)} <span class="text-gray-600">km/h</span></p>
								<p class="text-xs text-red-400">{Math.round(eff.avg_hr)} <span class="text-gray-600">bpm</span></p>
								<p class="text-[10px] text-gray-500">Ratio {ratio}</p>
							</div>
							{#if eff.count > 0}
								<p class="text-[9px] text-gray-700 mt-1">{eff.count.toLocaleString('de')} Punkte</p>
							{/if}
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Hinweis -->
		<p class="text-xs text-gray-700">
			Nur Aktivitäten mit Kadenz-Sensor fließen ein ({data.stats.rides_with_cadence} von insgesamt aufgezeichneten Rides).
			Nullwerte (keine Pedalumdrehung) sind aus der Verteilung ausgeblendet.
		</p>

	{/if}
</div>
