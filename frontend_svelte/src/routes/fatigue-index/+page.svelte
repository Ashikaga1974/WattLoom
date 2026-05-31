<script lang="ts">
	import { onMount } from 'svelte';
	import { api, type FatigueData } from '$lib/api';
	import PageHeader from '$lib/PageHeader.svelte';

	let data           = $state<FatigueData | null>(null);
	let loading        = $state(true);
	let error          = $state<string | null>(null);
	let filterYear     = $state<string>('');
	let availableYears = $state<string[]>([]);

	// Tooltip-State für Histogramm
	let histoTooltip = $state<{ x: number; y: number; text: string } | null>(null);
	// Tooltip-State für Monatschart
	let monthTooltip = $state<{ x: number; y: number; data: FatigueData['monthly'][0] } | null>(null);

	onMount(async () => {
		try {
			const stats = await api.activityStats();
			availableYears = stats.available_years.filter(y => Number(y) >= 2000);
			await loadData();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Fehler';
			loading = false;
		}
	});

	async function loadData() {
		loading = true;
		error   = null;
		try {
			data = await api.fatigueIndex(filterYear ? Number(filterYear) : undefined);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Fehler beim Laden';
		} finally {
			loading = false;
		}
	}

	// --- Hilfsfunktionen ---

	function fmtDate(d: string | null | undefined): string {
		if (!d) return '';
		// Backend gibt ISO-Datum zurück, kein Timezone-Suffix nötig
		const s = d.length === 10 ? d : d.slice(0, 10);
		const [y, m, day] = s.split('-');
		return `${day}.${m}.${y}`;
	}

	function fmtPct(v: number): string {
		return (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
	}

	// Farbe je nach Fatigue-Wert
	function fatigueColor(v: number): string {
		if (v <= -10) return '#3b82f6';   // blau – starker Negativsplit
		if (v < 0)    return '#10b981';   // grün – leichter Negativsplit
		if (v < 5)    return '#22c55e';   // grün – fast neutral
		if (v < 10)   return '#f59e0b';   // amber – leichte Ermüdung
		if (v < 20)   return '#f97316';   // orange – mittlere Ermüdung
		return '#ef4444';                 // rot – starke Ermüdung
	}

	function fatigueTextClass(v: number): string {
		if (v <= -10) return 'text-blue-400';
		if (v < 0)    return 'text-emerald-400';
		if (v < 5)    return 'text-green-400';
		if (v < 10)   return 'text-amber-400';
		if (v < 20)   return 'text-orange-400';
		return 'text-red-400';
	}

	// --- Histogramm-Geometrie ---
	const HW = 900, HH = 220;
	const HPAD = { top: 20, right: 40, bottom: 48, left: 48 };
	const hInnerW = HW - HPAD.left - HPAD.right;
	const hInnerH = HH - HPAD.top - HPAD.bottom;

	// Bucket-Bereich: −55 bis +55
	const BUCKET_MIN = -55;
	const BUCKET_MAX =  50;
	const BUCKET_SPAN = BUCKET_MAX - BUCKET_MIN; // 105

	const histoData = $derived(() => {
		if (!data || !data.distribution.length) return null;

		// Alle Buckets von −55 bis 50 in 5er-Schritten
		const allBuckets: number[] = [];
		for (let b = BUCKET_MIN; b <= BUCKET_MAX; b += 5) allBuckets.push(b);

		const countMap = new Map(data.distribution.map(d => [d.bucket, d.count]));
		const maxCount = Math.max(...data.distribution.map(d => d.count), 1);

		const barW = hInnerW / allBuckets.length;

		const bars = allBuckets.map((bucket, i) => {
			const count = countMap.get(bucket) ?? 0;
			const h     = count > 0 ? (count / maxCount) * hInnerH * 0.92 : 0;
			const x     = HPAD.left + i * barW;
			const y     = HPAD.top + hInnerH - h;
			const color = fatigueColor(bucket + 2.5); // Mitte des Buckets
			return { bucket, count, x, y, h, color, barW };
		});

		// Nulllinie X-Position
		const zeroI   = allBuckets.indexOf(0);
		const zeroX   = HPAD.left + zeroI * barW;

		// Ø-Linie
		const avg     = data.stats.avg_fatigue_pct;
		const avgX    = avg !== null
			? HPAD.left + ((avg - BUCKET_MIN) / BUCKET_SPAN) * hInnerW
			: null;

		// Alle 10%-Schritte als X-Achsen-Ticks
		const xTicks: { v: number; x: number }[] = [];
		for (let v = -50; v <= 50; v += 10) {
			xTicks.push({ v, x: HPAD.left + ((v - BUCKET_MIN) / BUCKET_SPAN) * hInnerW });
		}

		return { bars, maxCount, barW, zeroX, avgX, xTicks, avg };
	});

	// --- Monatschart-Geometrie ---
	const MW = 900, MH = 180;
	const MPAD = { top: 20, right: 40, bottom: 40, left: 56 };
	const mInnerW = MW - MPAD.left - MPAD.right;
	const mInnerH = MH - MPAD.top - MPAD.bottom;

	const monthData = $derived(() => {
		if (!data || !data.monthly.length) return null;

		const monthly = data.monthly;
		const vals    = monthly.map(m => m.avg_fatigue_pct);
		const absMax  = Math.max(Math.abs(Math.min(...vals)), Math.abs(Math.max(...vals)), 5);
		const range   = absMax * 2;

		const n = monthly.length;
		const barW = mInnerW / n;

		// Nulllinie Y
		const zeroY = MPAD.top + mInnerH / 2;

		const bars = monthly.map((m, i) => {
			const v    = m.avg_fatigue_pct;
			const h    = Math.abs(v) / absMax * (mInnerH / 2) * 0.9;
			const x    = MPAD.left + i * barW + barW * 0.1;
			const bW   = barW * 0.8;
			const y    = v >= 0 ? zeroY - h : zeroY;
			const color = v < 0 ? '#3b82f6' : (v < 10 ? '#f59e0b' : '#ef4444');
			return { ...m, x, y, bW, h, color, i };
		});

		// X-Labels: nur jeden 3. Monat
		const labels = monthly.map((m, i) => ({
			i,
			label: m.month.slice(0, 7),
			x: MPAD.left + i * barW + barW / 2,
			show: i % 3 === 0,
		}));

		// Y-Ticks: 0, ±absMax/2, ±absMax
		const yTicks = [-absMax, -absMax / 2, 0, absMax / 2, absMax].map(v => ({
			v: Math.round(v),
			y: zeroY - (v / absMax) * (mInnerH / 2),
		}));

		return { bars, labels, zeroY, yTicks, absMax };
	});

	// --- Split-Kachel-Hilfsfunktion ---
	// Breite der Speed-Balken relativ zueinander (H1 vs H2)
	function splitBarWidths(h1: number, h2: number): { w1: number; w2: number } {
		const total = h1 + h2;
		if (total === 0) return { w1: 50, w2: 50 };
		return {
			w1: Math.round((h1 / total) * 100),
			w2: Math.round((h2 / total) * 100),
		};
	}

	// --- Tabellen-Daten: letzte 30 Rides ---
	const tableRides = $derived(data ? data.rides.slice(0, 30) : []);
</script>

<svelte:head>
	<title>Ermüdungsindex – MyBiking</title>
</svelte:head>

<div class="space-y-6">

	<PageHeader
		title="Ermüdungsindex"
		subtitle="Vergleich der Geschwindigkeit erste vs. zweite Hälfte je Ride"
		years={availableYears}
		bind:selectedYear={filterYear}
		onchange={loadData}
	/>

	{#if error}
		<div class="rounded bg-red-900/50 border border-red-700 p-4 text-red-300 text-sm">{error}</div>
	{/if}

	{#if loading}
		<div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
			{#each Array(4) as _}
				<div class="h-24 bg-gray-800/50 animate-pulse rounded-xl"></div>
			{/each}
		</div>
		<div class="h-56 bg-gray-800/50 animate-pulse rounded-xl"></div>
		<div class="h-40 bg-gray-800/50 animate-pulse rounded-xl"></div>

	{:else if data && data.stats.rides_analyzed > 0}

		<!-- 1. Stats-Leiste -->
		<div class="grid grid-cols-2 sm:grid-cols-4 gap-3">

			<!-- Ø Ermüdung -->
			<div class="rounded-xl border border-gray-800 bg-gray-800/40 px-4 py-3 space-y-1">
				<p class="text-[10px] uppercase tracking-wide text-gray-500">Ø Ermüdung</p>
				{#if data.stats.avg_fatigue_pct !== null}
					{@const v = data.stats.avg_fatigue_pct}
					<p class="text-2xl font-bold {fatigueTextClass(v)}">{fmtPct(v)}</p>
					<p class="text-[10px] text-gray-600">
						{v < 0 ? 'Im Schnitt Negativsplit' : v < 5 ? 'Fast kein Ermüdungseffekt' : 'Durchschnittliche Ermüdung'}
					</p>
				{:else}
					<p class="text-2xl font-bold text-gray-600">–</p>
				{/if}
			</div>

			<!-- Negativsplits -->
			<div class="rounded-xl border border-gray-800 bg-gray-800/40 px-4 py-3 space-y-1">
				<p class="text-[10px] uppercase tracking-wide text-gray-500">Negativsplits</p>
				<p class="text-2xl font-bold text-blue-400">{data.stats.negative_split_count}</p>
				<p class="text-[10px] text-gray-600">von {data.stats.rides_analyzed} Rides</p>
				<!-- Mini-Fortschrittsbalken -->
				<div class="h-1.5 bg-gray-700 rounded-full overflow-hidden mt-1">
					<div
						class="h-full bg-blue-500 rounded-full transition-all"
						style="width: {Math.round(data.stats.negative_split_count / data.stats.rides_analyzed * 100)}%"
					></div>
				</div>
			</div>

			<!-- Bester Negativsplit -->
			{#if data.best_negative}
				{@const bn = data.best_negative}
				<a href="/activities/{bn.activity_id}"
					class="rounded-xl border border-blue-900/40 bg-blue-950/20 px-4 py-3 space-y-1 hover:border-blue-700/60 transition-colors group"
				>
					<p class="text-[10px] uppercase tracking-wide text-blue-500">Bester Negativsplit</p>
					<p class="text-2xl font-bold text-blue-400">{fmtPct(bn.fatigue_pct)}</p>
					<p class="text-[10px] text-blue-300/70 truncate group-hover:text-blue-300 transition-colors">
						{bn.activity_name} · {fmtDate(bn.date)}
					</p>
				</a>
			{:else}
				<div class="rounded-xl border border-gray-800 bg-gray-800/40 px-4 py-3">
					<p class="text-[10px] uppercase tracking-wide text-gray-500">Bester Negativsplit</p>
					<p class="text-2xl font-bold text-gray-600">–</p>
				</div>
			{/if}

			<!-- Größte Ermüdung -->
			{#if data.worst_fatigue}
				{@const wf = data.worst_fatigue}
				<a href="/activities/{wf.activity_id}"
					class="rounded-xl border border-red-900/40 bg-red-950/20 px-4 py-3 space-y-1 hover:border-red-700/60 transition-colors group"
				>
					<p class="text-[10px] uppercase tracking-wide text-red-500">Größte Ermüdung</p>
					<p class="text-2xl font-bold text-red-400">+{wf.fatigue_pct.toFixed(1)}%</p>
					<p class="text-[10px] text-red-300/70 truncate group-hover:text-red-300 transition-colors">
						{wf.activity_name} · {fmtDate(wf.date)}
					</p>
				</a>
			{:else}
				<div class="rounded-xl border border-gray-800 bg-gray-800/40 px-4 py-3">
					<p class="text-[10px] uppercase tracking-wide text-gray-500">Größte Ermüdung</p>
					<p class="text-2xl font-bold text-gray-600">–</p>
				</div>
			{/if}

		</div>


		<!-- 2. Histogramm: DER WOW-EFFEKT -->
		{#if data.distribution.length > 0}
			{@const hd = histoData()}
			{#if hd}
			<div class="rounded-xl border border-gray-800 bg-gray-800/40 overflow-hidden">
				<div class="px-4 py-3 bg-gray-800/60 border-b border-gray-700">
					<h2 class="font-semibold text-gray-100">Verteilung des Ermüdungsindex</h2>
					<p class="text-xs text-gray-500 mt-0.5">
						Anzahl Rides je Ermüdungs-Bucket (5%-Schritte) — blau = Negativsplit, rot = Ermüdung
					</p>
				</div>
				<div class="px-4 pt-4 pb-2 relative">
					<svg viewBox="0 0 {HW} {HH}" width="100%" class="block overflow-visible">
						<defs>
							<!-- Farbverlauf-Linien als Gradient-Demo – nicht verwendet, Balken sind direkt gefärbt -->
						</defs>

						<!-- Gitternetz horizontal -->
						{#each [0.25, 0.5, 0.75, 1.0] as frac}
							<line
								x1={HPAD.left} y1={HPAD.top + hInnerH * (1 - frac)}
								x2={HW - HPAD.right} y2={HPAD.top + hInnerH * (1 - frac)}
								stroke="#1f2937" stroke-width="1"
							/>
						{/each}

						<!-- Balken -->
						{#each hd.bars as bar}
							{#if bar.h > 0}
								<!-- svelte-ignore a11y_no_static_element_interactions -->
								<rect
									x={bar.x + 1}
									y={bar.y}
									width={Math.max(bar.barW - 2, 1)}
									height={bar.h}
									fill={bar.color}
									opacity="0.85"
									rx="2"
									style="cursor: pointer; transition: opacity 0.1s"
									onmouseenter={(e) => {
										const lo = bar.bucket;
										const hi = bar.bucket + 5;
										histoTooltip = {
											x: bar.x + bar.barW / 2,
											y: bar.y,
											text: `${lo >= 0 ? '+' : ''}${lo}% bis ${hi >= 0 ? '+' : ''}${hi}%: ${bar.count} Ride${bar.count !== 1 ? 's' : ''}`
										};
									}}
									onmouseleave={() => { histoTooltip = null; }}
								/>
							{/if}
						{/each}

						<!-- Nulllinie: dick, weiß gestrichelt -->
						<line
							x1={hd.zeroX} y1={HPAD.top}
							x2={hd.zeroX} y2={HPAD.top + hInnerH}
							stroke="#e5e7eb" stroke-width="2" stroke-dasharray="6,4" opacity="0.6"
						/>
						<text
							x={hd.zeroX + 4}
							y={HPAD.top + 13}
							font-size="10" fill="#e5e7eb" opacity="0.7"
						>0 – Perfektes Pacing</text>

						<!-- Ø-Linie: dünn orange -->
						{#if hd.avgX !== null && hd.avg !== null}
							<line
								x1={hd.avgX} y1={HPAD.top}
								x2={hd.avgX} y2={HPAD.top + hInnerH}
								stroke="#f97316" stroke-width="1.5" stroke-dasharray="4,3" opacity="0.8"
							/>
							<text
								x={hd.avgX + 4}
								y={HPAD.top + hInnerH - 6}
								font-size="9" fill="#f97316" opacity="0.9"
							>Ø {fmtPct(hd.avg)}</text>
						{/if}

						<!-- X-Achse -->
						<line
							x1={HPAD.left} y1={HPAD.top + hInnerH}
							x2={HW - HPAD.right} y2={HPAD.top + hInnerH}
							stroke="#374151" stroke-width="1"
						/>

						<!-- X-Ticks -->
						{#each hd.xTicks as tick}
							<line
								x1={tick.x} y1={HPAD.top + hInnerH}
								x2={tick.x} y2={HPAD.top + hInnerH + 4}
								stroke="#4b5563" stroke-width="1"
							/>
							<text
								x={tick.x} y={HPAD.top + hInnerH + 16}
								font-size="10" fill="#6b7280" text-anchor="middle"
							>{tick.v >= 0 ? '+' : ''}{tick.v}%</text>
						{/each}

						<!-- Tooltip -->
						{#if histoTooltip}
							{@const tx = histoTooltip.x > HW - 200 ? histoTooltip.x - 180 : histoTooltip.x + 8}
							{@const ty = Math.max(HPAD.top + 4, histoTooltip.y - 30)}
							<rect x={tx} y={ty} width="172" height="26" rx="5" fill="#111827" stroke="#374151" stroke-width="1" />
							<text x={tx + 8} y={ty + 17} font-size="10" fill="#f3f4f6">{histoTooltip.text}</text>
						{/if}

					</svg>

					<!-- Achsenbeschriftung unter Chart -->
					<div class="flex justify-between text-[10px] text-gray-600 px-12 mt-1">
						<span>← Negativsplit (schneller)</span>
						<span>Ermüdung (langsamer) →</span>
					</div>
				</div>
			</div>
			{/if}
		{/if}


		<!-- 3. Zwei Kacheln: Bester Negativsplit / Größte Ermüdung -->
		{#if data.best_negative && data.worst_fatigue}
			<div class="grid sm:grid-cols-2 gap-4">

				<!-- Bester Negativsplit -->
				{#if data.best_negative}
					{@const bn = data.best_negative}
					{@const bnW = splitBarWidths(bn.spd_h1_kmh, bn.spd_h2_kmh)}
					<div class="rounded-xl border border-blue-900/40 bg-blue-950/20 px-5 py-4 space-y-3">
						<div class="flex items-start justify-between gap-2">
							<div class="min-w-0">
								<p class="text-xs text-blue-400 uppercase tracking-wide font-medium">Bester Negativsplit</p>
								<p class="text-sm font-semibold text-gray-200 truncate mt-0.5">{bn.activity_name}</p>
								<p class="text-xs text-gray-500">{fmtDate(bn.date)} · {bn.dist_km} km</p>
							</div>
							<span class="shrink-0 text-lg font-bold text-blue-400 tabular-nums">
								{fmtPct(bn.fatigue_pct)}
							</span>
						</div>

						<!-- Halbzeit-Grafik -->
						<div class="space-y-2">
							<div>
								<div class="flex justify-between text-[10px] text-gray-500 mb-0.5">
									<span>1. Hälfte</span>
									<span class="font-semibold text-gray-300">{bn.spd_h1_kmh} km/h</span>
								</div>
								<div class="h-3 bg-gray-700 rounded overflow-hidden">
									<div
										class="h-full rounded transition-all"
										style="width: {bnW.w1}%; background: #6366f1;"
									></div>
								</div>
							</div>
							<div>
								<div class="flex justify-between text-[10px] text-gray-500 mb-0.5">
									<span>2. Hälfte</span>
									<span class="font-semibold text-blue-300">{bn.spd_h2_kmh} km/h</span>
								</div>
								<div class="h-3 bg-gray-700 rounded overflow-hidden">
									<div
										class="h-full rounded transition-all"
										style="width: {bnW.w2}%; background: #3b82f6;"
									></div>
								</div>
							</div>
						</div>

						<a href="/activities/{bn.activity_id}"
							class="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
						>
							Zur Aktivität
							<svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
						</a>
					</div>
				{/if}

				<!-- Größte Ermüdung -->
				{#if data.worst_fatigue}
					{@const wf = data.worst_fatigue}
					{@const wfW = splitBarWidths(wf.spd_h1_kmh, wf.spd_h2_kmh)}
					<div class="rounded-xl border border-red-900/40 bg-red-950/20 px-5 py-4 space-y-3">
						<div class="flex items-start justify-between gap-2">
							<div class="min-w-0">
								<p class="text-xs text-red-400 uppercase tracking-wide font-medium">Größte Ermüdung</p>
								<p class="text-sm font-semibold text-gray-200 truncate mt-0.5">{wf.activity_name}</p>
								<p class="text-xs text-gray-500">{fmtDate(wf.date)} · {wf.dist_km} km</p>
							</div>
							<span class="shrink-0 text-lg font-bold text-red-400 tabular-nums">
								+{wf.fatigue_pct.toFixed(1)}%
							</span>
						</div>

						<!-- Halbzeit-Grafik -->
						<div class="space-y-2">
							<div>
								<div class="flex justify-between text-[10px] text-gray-500 mb-0.5">
									<span>1. Hälfte</span>
									<span class="font-semibold text-orange-300">{wf.spd_h1_kmh} km/h</span>
								</div>
								<div class="h-3 bg-gray-700 rounded overflow-hidden">
									<div
										class="h-full rounded transition-all"
										style="width: {wfW.w1}%; background: #f97316;"
									></div>
								</div>
							</div>
							<div>
								<div class="flex justify-between text-[10px] text-gray-500 mb-0.5">
									<span>2. Hälfte</span>
									<span class="font-semibold text-red-300">{wf.spd_h2_kmh} km/h</span>
								</div>
								<div class="h-3 bg-gray-700 rounded overflow-hidden">
									<div
										class="h-full rounded transition-all"
										style="width: {wfW.w2}%; background: #ef4444;"
									></div>
								</div>
							</div>
						</div>

						<a href="/activities/{wf.activity_id}"
							class="inline-flex items-center gap-1 text-xs text-red-400 hover:text-red-300 transition-colors"
						>
							Zur Aktivität
							<svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
						</a>
					</div>
				{/if}

			</div>
		{/if}


		<!-- 4. Monatstrend -->
		{#if data.monthly.length > 0}
			{@const md = monthData()}
			{#if md}
			<div class="rounded-xl border border-gray-800 bg-gray-800/40 overflow-hidden">
				<div class="px-4 py-3 bg-gray-800/60 border-b border-gray-700">
					<h2 class="font-semibold text-gray-100">Monatlicher Trend</h2>
					<p class="text-xs text-gray-500 mt-0.5">
						Ø Ermüdungsindex je Monat — blau = Negativsplit, orange/rot = Ermüdung
					</p>
				</div>
				<div class="px-4 pt-4 pb-2 relative">
					<svg viewBox="0 0 {MW} {MH}" width="100%" class="block overflow-visible">

						<!-- Y-Ticks + Gitternetz -->
						{#each md.yTicks as tick}
							<line
								x1={MPAD.left} y1={tick.y}
								x2={MW - MPAD.right} y2={tick.y}
								stroke={tick.v === 0 ? '#4b5563' : '#1f2937'}
								stroke-width={tick.v === 0 ? 1.5 : 1}
							/>
							<text
								x={MPAD.left - 6} y={tick.y + 4}
								font-size="10" fill="#6b7280" text-anchor="end"
							>{tick.v >= 0 ? '+' : ''}{tick.v}%</text>
						{/each}

						<!-- Balken -->
						{#each md.bars as bar}
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<rect
								x={bar.x}
								y={bar.y}
								width={bar.bW}
								height={Math.max(bar.h, 1)}
								fill={bar.color}
								opacity="0.8"
								rx="2"
								style="cursor: pointer; transition: opacity 0.1s"
								onmouseenter={() => {
									const bx = bar.x + bar.bW / 2;
									const by = bar.avg_fatigue_pct >= 0 ? bar.y : bar.y + bar.h;
									monthTooltip = { x: bx, y: by, data: bar };
								}}
								onmouseleave={() => { monthTooltip = null; }}
							/>
						{/each}

						<!-- Nulllinie prominent -->
						<line
							x1={MPAD.left} y1={md.zeroY}
							x2={MW - MPAD.right} y2={md.zeroY}
							stroke="#6b7280" stroke-width="1.5"
						/>

						<!-- X-Labels (jeden 3. Monat) -->
						{#each md.labels as lb}
							{#if lb.show}
								<text
									x={lb.x} y={MH - MPAD.bottom + 14}
									font-size="9" fill="#6b7280" text-anchor="middle"
								>{lb.label}</text>
							{/if}
						{/each}

						<!-- Tooltip -->
						{#if monthTooltip}
							{@const mt = monthTooltip}
							{@const tx = mt.x > MW - 170 ? mt.x - 162 : mt.x + 8}
							{@const ty = Math.max(MPAD.top + 4, mt.y - 60)}
							<rect x={tx} y={ty} width="154" height="56" rx="5" fill="#111827" stroke="#374151" stroke-width="1" />
							<text x={tx + 8} y={ty + 15} font-size="10" font-weight="600" fill="#f3f4f6">{mt.data.month}</text>
							<text x={tx + 8} y={ty + 29} font-size="10" fill={mt.data.avg_fatigue_pct < 0 ? '#60a5fa' : '#f97316'}>
								Ø {fmtPct(mt.data.avg_fatigue_pct)}
							</text>
							<text x={tx + 8} y={ty + 43} font-size="9" fill="#6b7280">
								{mt.data.rides} Ride{mt.data.rides !== 1 ? 's' : ''} · {mt.data.neg_split_pct.toFixed(0)} % Neg.splits
							</text>
						{/if}

					</svg>
				</div>
			</div>
			{/if}
		{/if}


		<!-- 5. Distanz-Kacheln -->
		{#if data.by_distance.length > 0}
			<div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
				{#each data.by_distance as bucket}
					{@const v = bucket.avg_fatigue_pct}
					<div class="rounded-xl border border-gray-800 bg-gray-800/40 px-4 py-3 text-center space-y-1">
						<p class="text-[10px] uppercase tracking-wide text-gray-500">{bucket.label}</p>
						{#if v !== null}
							<p class="text-2xl font-bold {fatigueTextClass(v)}">{fmtPct(v)}</p>
						{:else}
							<p class="text-2xl font-bold text-gray-600">–</p>
						{/if}
						<p class="text-[10px] text-gray-600">{bucket.rides} Ride{bucket.rides !== 1 ? 's' : ''}</p>
						{#if v !== null}
							<!-- Mini-Farbbalken -->
							<div class="h-1 rounded-full mt-1" style="background: {fatigueColor(v)}; opacity: 0.7;"></div>
						{/if}
					</div>
				{/each}
			</div>
		{/if}


		<!-- 6. Ride-Tabelle -->
		{#if tableRides.length > 0}
			<div class="rounded-xl border border-gray-800 bg-gray-800/40 overflow-hidden">
				<div class="px-4 py-3 bg-gray-800/60 border-b border-gray-700">
					<h2 class="font-semibold text-gray-100">Letzte {tableRides.length} Rides</h2>
					<p class="text-xs text-gray-500 mt-0.5">Sortiert nach Datum — neueste zuerst</p>
				</div>
				<div class="overflow-x-auto">
					<table class="w-full text-xs">
						<thead>
							<tr class="text-left text-gray-600 uppercase tracking-wide border-b border-gray-800">
								<th class="px-4 py-2 font-medium">Datum</th>
								<th class="px-4 py-2 font-medium">Name</th>
								<th class="px-4 py-2 font-medium text-right">Dist.</th>
								<th class="px-4 py-2 font-medium text-right">H1</th>
								<th class="px-4 py-2 font-medium text-right">H2</th>
								<th class="px-4 py-2 font-medium">Index</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-gray-800/50">
							{#each tableRides as ride}
								{@const v = ride.fatigue_pct}
								{@const barPct = Math.min(Math.abs(v) / 30 * 100, 100)}
								<tr class="hover:bg-white/5 transition-colors">
									<td class="px-4 py-2 text-gray-600 whitespace-nowrap">{fmtDate(ride.date)}</td>
									<td class="px-4 py-2 max-w-[200px]">
										<a href="/activities/{ride.activity_id}"
											class="text-gray-300 hover:text-orange-400 transition-colors truncate block"
										>{ride.activity_name}</a>
									</td>
									<td class="px-4 py-2 text-right text-gray-500">{ride.dist_km} km</td>
									<td class="px-4 py-2 text-right text-gray-400">{ride.spd_h1_kmh}</td>
									<td class="px-4 py-2 text-right text-gray-400">{ride.spd_h2_kmh}</td>
									<td class="px-4 py-2 min-w-[120px]">
										<div class="flex items-center gap-2">
											<!-- Farbbalken -->
											<div class="flex-1 h-2 bg-gray-700 rounded overflow-hidden">
												<div
													class="h-full rounded"
													style="width: {barPct}%; background: {fatigueColor(v)};"
												></div>
											</div>
											<!-- Wert -->
											<span class="shrink-0 font-semibold tabular-nums {fatigueTextClass(v)}">
												{fmtPct(v)}
											</span>
										</div>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>
		{/if}

	{:else if !loading}
		<div class="rounded-xl border border-gray-800 bg-gray-800/40 px-6 py-10 text-center text-gray-500 text-sm">
			Keine auswertbaren Rides gefunden.
			{#if filterYear}Für {filterYear} liegen keine Tracks mit ausreichend Datenpunkten vor.{/if}
		</div>
	{/if}

</div>
