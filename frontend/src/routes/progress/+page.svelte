<script lang="ts">
	import { onMount } from 'svelte';
	import { api } from '$lib/api';

	const PALETTE = ['#fc4c02', '#60a5fa', '#4ade80', '#c084fc', '#f472b6', '#facc15'];
	const MONTHS   = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
	const MONTH_DOYS = [1, 32, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];

	type Pts = [number, number][];

	let yearData  = $state<Record<string, Pts>>({});
	let loading   = $state(true);
	let error     = $state<string | null>(null);
	let crossDoy  = $state<number | null>(null);

	const currentYear = String(new Date().getFullYear());
	const todayDoy = (() => {
		const n = new Date();
		return Math.floor((n.getTime() - new Date(n.getFullYear(), 0, 0).getTime()) / 86_400_000);
	})();

	onMount(async () => {
		try {
			const [progress, monthly] = await Promise.all([api.yearProgress(), api.monthlyAll()]);
			yearData = progress.years;
			monthlyAllData = monthly;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Fehler';
		} finally {
			loading = false;
		}
	});

	const years = $derived(Object.keys(yearData).sort());

	function color(y: string) { return PALETTE[years.indexOf(y) % PALETTE.length]; }

	const maxKm = $derived(
		Math.max(...Object.values(yearData).map(pts => pts.at(-1)?.[1] ?? 0), 500)
	);

	// SVG
	const W = 700, H = 320;
	const PAD = { top: 20, right: 118, bottom: 38, left: 56 };
	const cW  = W - PAD.left - PAD.right;
	const cH  = H - PAD.top  - PAD.bottom;

	function xD(doy: number) { return PAD.left + ((doy - 1) / 365) * cW; }
	function yK(km: number)  { return PAD.top + cH - (km / maxKm) * cH; }

	const yTicks = $derived(
		(() => {
			const step = maxKm > 6000 ? 2000 : maxKm > 3000 ? 1000 : maxKm > 1500 ? 500 : 250;
			const t: number[] = [];
			for (let v = 0; v <= maxKm + step; v += step) t.push(v);
			return t;
		})()
	);

	function polyline(pts: Pts): string {
		const all: [number, number][] = [[1, 0], ...pts];
		return all.map(([d, k]) => `${xD(d).toFixed(1)},${yK(k).toFixed(1)}`).join(' ');
	}

	// Letzter bekannter km-Wert eines Jahres bis zu einem doy
	function kmAt(pts: Pts, doy: number): number | null {
		let v: number | null = null;
		for (const [d, k] of pts) {
			if (d <= doy) v = k;
			else break;
		}
		return v;
	}

	// Maus → crosshairDoy
	function onMove(e: MouseEvent) {
		const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
		const svgX = (e.clientX - rect.left) * (W / rect.width);
		const doy = Math.round((svgX - PAD.left) / cW * 365) + 1;
		crossDoy = doy >= 1 && doy <= 366 ? doy : null;
	}

	function doyLabel(doy: number): string {
		const d = new Date(2024, 0, doy);
		return d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
	}

	// Jahresprognose für aktuelles Jahr
	const projection = $derived(() => {
		const cur = yearData[currentYear];
		if (!cur || cur.length === 0) return null;
		const kmToday = kmAt(cur, todayDoy) ?? 0;
		if (kmToday <= 0 || todayDoy <= 1) return null;
		const dailyRate  = kmToday / todayDoy;
		const projEnd    = Math.round(dailyRate * 365);
		const prevYear   = String(Number(currentYear) - 1);
		const prevEnd    = yearData[prevYear]?.at(-1)?.[1] ?? null;
		const pMaxKm     = Math.ceil(Math.max(projEnd, prevEnd ?? 0) / 500) * 500 + 500;
		const pStep      = pMaxKm > 6000 ? 2000 : pMaxKm > 3000 ? 1000 : 500;
		const pTicks: number[] = [];
		for (let v = 0; v <= pMaxKm; v += pStep) pTicks.push(v);
		return {
			kmToday,
			dailyRate,
			projEnd,
			remainingDays: 365 - todayDoy,
			remainingKm:   Math.round(projEnd - kmToday),
			prevEnd,
			pMaxKm,
			pTicks,
		};
	});

	// Bar-Chart: km pro Jahr
	const BH = 210;
	const BPAD = { top: 32, right: 20, bottom: 36, left: 56 } as const;
	const BcW  = W  - BPAD.left - BPAD.right;
	const BcH  = BH - BPAD.top  - BPAD.bottom;
	const BAR_GAP = 8;

	const yearBars = $derived(
		years.map(y => ({
			y,
			actual: y === currentYear
				? (kmAt(yearData[y], todayDoy) ?? 0)
				: (yearData[y]?.at(-1)?.[1] ?? 0),
		}))
	);

	const barMaxKm = $derived((() => {
		const p   = projection();
		const mx  = Math.max(...yearBars.map(b => b.actual), p?.projEnd ?? 0, 500);
		const step = mx > 6000 ? 2000 : mx > 3000 ? 1000 : 500;
		return Math.ceil(mx / step) * step + step / 2;
	})());

	const barTicks = $derived((() => {
		const step = barMaxKm > 6000 ? 2000 : barMaxKm > 3000 ? 1000 : 500;
		const t: number[] = [];
		for (let v = 0; v <= barMaxKm; v += step) t.push(v);
		return t;
	})());

	const bW = $derived(BcW / Math.max(years.length, 1) - BAR_GAP);
	function xBar(i: number) { return BPAD.left + i * (BcW / Math.max(years.length, 1)) + BAR_GAP / 2; }
	function yBar(km: number) { return BPAD.top + BcH - (km / barMaxKm) * BcH; }

	// Monatliche km über alle Jahre (Gesamtverlauf)
	let monthlyAllData = $state<{ year: number; month: number; distance_km: number }[]>([]);

	const LH = 240;
	const LPAD = { top: 20, right: 20, bottom: 36, left: 56 } as const;
	const LcW  = W  - LPAD.left - LPAD.right;
	const LcH  = LH - LPAD.top  - LPAD.bottom;

	const lMaxKm = $derived((() => {
		const mx = Math.max(...monthlyAllData.map(d => d.distance_km), 100);
		const step = mx > 1000 ? 500 : mx > 500 ? 200 : 100;
		return Math.ceil(mx / step) * step + step / 2;
	})());

	const lTicks = $derived((() => {
		const step = lMaxKm > 1000 ? 500 : lMaxKm > 500 ? 200 : 100;
		const t: number[] = [];
		for (let v = 0; v <= lMaxKm; v += step) t.push(v);
		return t;
	})());

	// X-Position: Index in monthlyAllData
	function xL(i: number) { return LPAD.left + (i / Math.max(monthlyAllData.length - 1, 1)) * LcW; }
	function yL(km: number) { return LPAD.top + LcH - (km / lMaxKm) * LcH; }

	// Jahresgrenzen für X-Achse-Labels
	const yearBoundaries = $derived(
		years.map(y => {
			const idx = monthlyAllData.findIndex(d => String(d.year) === y);
			return idx >= 0 ? { y, x: xL(idx) } : null;
		}).filter(v => v !== null) as { y: string; x: number }[]
	);

	// Aktuelles Jahr im Vergleich zum Vorjahr am gleichen Tag
	const vsLastYear = $derived(() => {
		const prevYear = String(Number(currentYear) - 1);
		const cur  = yearData[currentYear];
		const prev = yearData[prevYear];
		if (!cur || !prev) return null;
		const curKm  = kmAt(cur, todayDoy) ?? 0;
		const prevKm = kmAt(prev, todayDoy) ?? 0;
		return { curKm, prevKm, diff: curKm - prevKm };
	});
</script>

<svelte:head>
	<title>Jahresfortschritt – MyBiking</title>
</svelte:head>

<div class="space-y-6">
	<div>
		<h1 class="text-2xl font-bold">Jahresfortschritt</h1>
		<p class="text-xs text-gray-500 mt-0.5">Kumulierte Kilometer je Kalenderjahr · gestrichelt = heute</p>
	</div>

	{#if error}
		<div class="rounded bg-red-900/50 border border-red-700 p-4 text-red-300 text-sm">{error}</div>
	{/if}

	{#if loading}
		<div class="h-80 bg-gray-800/50 animate-pulse rounded-xl"></div>
	{:else if years.length}

		<!-- Vergleich aktuelles Jahr vs. Vorjahr -->
		{#if vsLastYear()}
			{@const v = vsLastYear()}
			<div class="flex flex-wrap gap-3">
				<div class="rounded-xl bg-gray-800 px-4 py-3 text-center min-w-36">
					<p class="text-xs text-gray-400">{currentYear} bis heute</p>
					<p class="text-xl font-bold text-orange-400 mt-0.5">{v!.curKm.toFixed(0)} km</p>
				</div>
				<div class="rounded-xl bg-gray-800 px-4 py-3 text-center min-w-36">
					<p class="text-xs text-gray-400">{Number(currentYear) - 1} bis heute</p>
					<p class="text-xl font-bold text-blue-400 mt-0.5">{v!.prevKm.toFixed(0)} km</p>
				</div>
				<div class="rounded-xl px-4 py-3 text-center min-w-36"
					style="background: {v!.diff >= 0 ? '#14532d33' : '#7f1d1d33'}; border: 1px solid {v!.diff >= 0 ? '#16a34a44' : '#dc262644'}">
					<p class="text-xs text-gray-400">Differenz</p>
					<p class="text-xl font-bold mt-0.5" style="color:{v!.diff >= 0 ? '#4ade80' : '#f87171'}">
						{v!.diff >= 0 ? '+' : ''}{v!.diff.toFixed(0)} km
					</p>
				</div>
			</div>
		{/if}

		<!-- Chart -->
		<div class="rounded-xl bg-gray-800/40 border border-gray-800 p-4 relative">
			<!-- Crosshair-Tooltip -->
			{#if crossDoy}
				<div class="absolute top-4 right-4 rounded-lg bg-gray-900 border border-gray-700 px-3 py-2 text-sm pointer-events-none z-10 min-w-36">
					<p class="text-gray-400 text-xs mb-1">{doyLabel(crossDoy)}</p>
					{#each years as y}
						{@const km = kmAt(yearData[y], crossDoy)}
						{#if km !== null}
							<p class="font-medium" style="color:{color(y)}">{y}: {km.toFixed(0)} km</p>
						{/if}
					{/each}
				</div>
			{/if}

			<svg viewBox="0 0 {W} {H}" class="w-full" style="height:{H}px"
				onmousemove={onMove} onmouseleave={() => crossDoy = null}
				role="presentation"
			>
				<!-- Y-Gitternetz + Labels -->
				{#each yTicks as v}
					<line x1={PAD.left} y1={yK(v).toFixed(1)} x2={W - PAD.right} y2={yK(v).toFixed(1)}
						stroke="var(--chart-line)" stroke-width="1"/>
					<text x={PAD.left - 8} y={yK(v) + 4} font-size="11" fill="var(--chart-text)" text-anchor="end">
						{v >= 1000 ? (v / 1000).toFixed(v % 1000 === 0 ? 0 : 1) + 'k' : v}
					</text>
				{/each}

				<!-- Monats-Labels + vertikale Trennlinien -->
				{#each MONTHS as m, i}
					<line x1={xD(MONTH_DOYS[i]).toFixed(1)} y1={PAD.top}
						x2={xD(MONTH_DOYS[i]).toFixed(1)} y2={PAD.top + cH}
						stroke="var(--t-bg)" stroke-width="1"/>
					<text x={xD(MONTH_DOYS[i] + 15)} y={PAD.top + cH + 16}
						font-size="11" fill="var(--chart-text)" text-anchor="middle">{m}</text>
				{/each}

				<!-- Achsen -->
				<line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + cH} stroke="var(--chart-line)" stroke-width="1"/>
				<line x1={PAD.left} y1={PAD.top + cH} x2={W - PAD.right} y2={PAD.top + cH} stroke="var(--chart-line)" stroke-width="1"/>

				<!-- Y-Achsenbeschriftung -->
				<text x={PAD.left - 42} y={PAD.top + cH / 2} font-size="11" fill="var(--chart-muted)" text-anchor="middle"
					transform="rotate(-90, {PAD.left - 42}, {PAD.top + cH / 2})">km</text>

				<!-- Linien je Jahr -->
				{#each years as y}
					<polyline
						points={polyline(yearData[y])}
						fill="none"
						stroke={color(y)}
						stroke-width={y === currentYear ? 2.5 : 1.8}
						stroke-opacity={y === currentYear ? 1 : 0.65}
						stroke-linejoin="round"
						stroke-linecap="round"
					/>
					<!-- Endpunkt-Dot + Label -->
					{@const lastPt = yearData[y].at(-1)}
					{#if lastPt}
						<circle cx={xD(lastPt[0]).toFixed(1)} cy={yK(lastPt[1]).toFixed(1)}
							r={y === currentYear ? 5 : 4}
							fill={color(y)} stroke="var(--t-bg)" stroke-width="1.5"/>
					{/if}
				{/each}

				<!-- Heute-Linie -->
				<line x1={xD(todayDoy).toFixed(1)} y1={PAD.top}
					x2={xD(todayDoy).toFixed(1)} y2={PAD.top + cH}
					stroke="var(--chart-muted)" stroke-width="1" stroke-dasharray="5,3"/>
				<text x={xD(todayDoy)} y={PAD.top - 6} font-size="10" fill="var(--chart-text)" text-anchor="middle">heute</text>

				<!-- Crosshair -->
				{#if crossDoy}
					<line x1={xD(crossDoy).toFixed(1)} y1={PAD.top}
						x2={xD(crossDoy).toFixed(1)} y2={PAD.top + cH}
						stroke="var(--chart-text)" stroke-width="1" stroke-dasharray="4,2" pointer-events="none"/>
				{/if}

				<!-- Legende rechts -->
				{#each years as y, i}
					<circle cx={W - PAD.right + 12} cy={PAD.top + i * 22 + 6} r="5"
						fill={color(y)} stroke="var(--t-bg)" stroke-width="1.5"/>
					<text x={W - PAD.right + 22} y={PAD.top + i * 22 + 10}
						font-size="12" fill={color(y)}>{y}</text>
				{/each}
			</svg>
		</div>

		<!-- km pro Jahr (Balkendiagramm) -->
		<div>
			<h2 class="text-lg font-semibold mb-3">km pro Jahr</h2>
			<div class="rounded-xl bg-gray-800/40 border border-gray-800 p-4">
				<svg viewBox="0 0 {W} {BH}" class="w-full" style="height:{BH}px" role="presentation">
					<!-- Y-Gitternetz -->
					{#each barTicks as v}
						<line x1={BPAD.left} y1={yBar(v).toFixed(1)} x2={W - BPAD.right} y2={yBar(v).toFixed(1)}
							stroke="var(--chart-line)" stroke-width="1"/>
						<text x={BPAD.left - 8} y={yBar(v) + 4} font-size="11" fill="var(--chart-text)" text-anchor="end">
							{v >= 1000 ? (v / 1000).toFixed(v % 1000 === 0 ? 0 : 1) + 'k' : v}
						</text>
					{/each}

					<!-- Achsen -->
					<line x1={BPAD.left} y1={BPAD.top} x2={BPAD.left} y2={BPAD.top + BcH} stroke="var(--chart-line)" stroke-width="1"/>
					<line x1={BPAD.left} y1={BPAD.top + BcH} x2={W - BPAD.right} y2={BPAD.top + BcH} stroke="var(--chart-line)" stroke-width="1"/>

					{#each yearBars as { y, actual }, i}
						{@const c      = color(y)}
						{@const isCurr = y === currentYear}
						{@const proj   = isCurr ? projection() : null}
						{@const top    = proj ? proj.projEnd : actual}
						{@const bx     = xBar(i)}
						{@const barBot = BPAD.top + BcH}

						<!-- Prognose-Verlängerung (gedimmt, nur aktuelles Jahr) -->
						{#if proj && proj.projEnd > actual}
							<rect x={bx.toFixed(1)} y={yBar(proj.projEnd).toFixed(1)}
								width={bW.toFixed(1)} height={(yBar(actual) - yBar(proj.projEnd)).toFixed(1)}
								fill={c} fill-opacity="0.2" rx="3"/>
						{/if}

						<!-- Hauptbalken -->
						<rect x={bx.toFixed(1)} y={yBar(actual).toFixed(1)}
							width={bW.toFixed(1)} height={(barBot - yBar(actual)).toFixed(1)}
							fill={c} fill-opacity={isCurr ? 1 : 0.65} rx="3"/>

						<!-- Wert-Label -->
						<text x={(bx + bW / 2).toFixed(1)} y={(yBar(top) - 5).toFixed(1)}
							font-size="11" fill={isCurr ? c : '#9ca3af'} text-anchor="middle"
							font-weight={isCurr ? '600' : 'normal'}>
							{#if isCurr && proj}
								{Math.round(actual).toLocaleString('de-DE')} / {proj.projEnd.toLocaleString('de-DE')}
							{:else}
								{Math.round(actual).toLocaleString('de-DE')}
							{/if}
						</text>

						<!-- Jahr-Label -->
						<text x={(bx + bW / 2).toFixed(1)} y={barBot + 20}
							font-size="12" fill={isCurr ? c : 'var(--chart-text)'} text-anchor="middle"
							font-weight={isCurr ? '600' : 'normal'}>{y}</text>
					{/each}
				</svg>
			</div>
		</div>

		<!-- Monatlicher Gesamtverlauf -->
		{#if monthlyAllData.length > 1}
			<div>
				<h2 class="text-lg font-semibold mb-3">Monatlicher Gesamtverlauf</h2>
				<div class="rounded-xl bg-gray-800/40 border border-gray-800 p-4">
					<svg viewBox="0 0 {W} {LH}" class="w-full" style="height:{LH}px" role="presentation">
						<!-- Y-Gitternetz -->
						{#each lTicks as v}
							<line x1={LPAD.left} y1={yL(v).toFixed(1)} x2={W - LPAD.right} y2={yL(v).toFixed(1)}
								stroke="var(--chart-line)" stroke-width="1"/>
							<text x={LPAD.left - 8} y={yL(v) + 4} font-size="11" fill="var(--chart-text)" text-anchor="end">
								{v >= 1000 ? (v / 1000).toFixed(v % 1000 === 0 ? 0 : 1) + 'k' : v}
							</text>
						{/each}

						<!-- Jahresgrenzen + Labels -->
						{#each yearBoundaries as { y, x }}
							<line x1={x.toFixed(1)} y1={LPAD.top} x2={x.toFixed(1)} y2={LPAD.top + LcH}
								stroke="var(--chart-line)" stroke-width="1"/>
							<text x={x} y={LPAD.top + LcH + 16} font-size="11" fill="var(--chart-muted)" text-anchor="middle">{y}</text>
						{/each}

						<!-- Achsen -->
						<line x1={LPAD.left} y1={LPAD.top} x2={LPAD.left} y2={LPAD.top + LcH} stroke="var(--chart-line)" stroke-width="1"/>
						<line x1={LPAD.left} y1={LPAD.top + LcH} x2={W - LPAD.right} y2={LPAD.top + LcH} stroke="var(--chart-line)" stroke-width="1"/>

						<!-- Fläche -->
						<path d="M{xL(0).toFixed(1)},{yL(monthlyAllData[0].distance_km).toFixed(1)}{monthlyAllData.slice(1).map((d, i) => `L${xL(i + 1).toFixed(1)},${yL(d.distance_km).toFixed(1)}`).join('')}L{xL(monthlyAllData.length - 1).toFixed(1)},{(LPAD.top + LcH).toFixed(1)}L{xL(0).toFixed(1)},{(LPAD.top + LcH).toFixed(1)}Z"
							fill="url(#monthGrad)" />

						<!-- Linie -->
						<polyline
							points={monthlyAllData.map((d, i) => `${xL(i).toFixed(1)},${yL(d.distance_km).toFixed(1)}`).join(' ')}
							fill="none" stroke="#fc4c02" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>

						<defs>
							<linearGradient id="monthGrad" x1="0" y1="0" x2="0" y2="1">
								<stop offset="0%"   stop-color="#fc4c02" stop-opacity="0.3"/>
								<stop offset="100%" stop-color="#fc4c02" stop-opacity="0.02"/>
							</linearGradient>
						</defs>
					</svg>
				</div>
			</div>
		{/if}

		<!-- Jahresprognose -->
		{#if projection()}
			{@const p = projection()!}
			{@const yP = (km: number) => PAD.top + cH - (km / p.pMaxKm) * cH}
			{@const prevYear = String(Number(currentYear) - 1)}

			<div>
				<h2 class="text-lg font-semibold mb-3">
					Jahresprognose {currentYear}
					<span class="text-xs font-normal text-gray-500 ml-2">auf Basis ⌀ {p.dailyRate.toFixed(1)} km/Tag</span>
				</h2>

				<!-- Stat-Kacheln -->
				<div class="flex flex-wrap gap-3 mb-4">
					<div class="rounded-xl bg-gray-800 px-4 py-3 text-center min-w-36">
						<p class="text-xs text-gray-400">Prognose Jahresende</p>
						<p class="text-xl font-bold text-orange-400 mt-0.5">{p.projEnd.toLocaleString('de-DE')} km</p>
					</div>
					<div class="rounded-xl bg-gray-800 px-4 py-3 text-center min-w-36">
						<p class="text-xs text-gray-400">Noch {p.remainingDays} Tage</p>
						<p class="text-xl font-bold mt-0.5">{p.remainingKm.toLocaleString('de-DE')} km offen</p>
					</div>
					{#if p.prevEnd !== null}
						{@const diff = p.projEnd - p.prevEnd}
						<div class="rounded-xl px-4 py-3 text-center min-w-36"
							style="background:{diff >= 0 ? '#14532d33' : '#7f1d1d33'}; border:1px solid {diff >= 0 ? '#16a34a44' : '#dc262644'}">
							<p class="text-xs text-gray-400">vs. {prevYear} ({Math.round(p.prevEnd).toLocaleString('de-DE')} km)</p>
							<p class="text-xl font-bold mt-0.5" style="color:{diff >= 0 ? '#4ade80' : '#f87171'}">
								{diff >= 0 ? '+' : ''}{Math.round(diff).toLocaleString('de-DE')} km
							</p>
						</div>
					{/if}
				</div>

				<!-- Prognose-Chart -->
				<div class="rounded-xl bg-gray-800/40 border border-gray-800 p-4">
					<svg viewBox="0 0 {W} {H}" class="w-full" style="height:{H}px" role="presentation">
						<!-- Gitternetz Y -->
						{#each p.pTicks as v}
							<line x1={PAD.left} y1={yP(v).toFixed(1)} x2={W - PAD.right} y2={yP(v).toFixed(1)}
								stroke="var(--chart-line)" stroke-width="1"/>
							<text x={PAD.left - 8} y={yP(v) + 4} font-size="11" fill="var(--chart-text)" text-anchor="end">
								{v >= 1000 ? (v / 1000).toFixed(v % 1000 === 0 ? 0 : 1) + 'k' : v}
							</text>
						{/each}

						<!-- Monatslinien + Labels -->
						{#each MONTHS as m, i}
							<line x1={xD(MONTH_DOYS[i]).toFixed(1)} y1={PAD.top}
								x2={xD(MONTH_DOYS[i]).toFixed(1)} y2={PAD.top + cH}
								stroke="var(--t-bg)" stroke-width="1"/>
							<text x={xD(MONTH_DOYS[i] + 15)} y={PAD.top + cH + 16}
								font-size="11" fill="var(--chart-text)" text-anchor="middle">{m}</text>
						{/each}

						<!-- Achsen -->
						<line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + cH} stroke="var(--chart-line)" stroke-width="1"/>
						<line x1={PAD.left} y1={PAD.top + cH} x2={W - PAD.right} y2={PAD.top + cH} stroke="var(--chart-line)" stroke-width="1"/>

						<!-- Vorjahr (gedimmt, als Referenz) -->
						{#if p.prevEnd !== null && yearData[prevYear]}
							<polyline
								points={[[1, 0], ...yearData[prevYear]].map(([d, k]) => `${xD(d).toFixed(1)},${yP(k).toFixed(1)}`).join(' ')}
								fill="none" stroke="#60a5fa" stroke-width="1.5" stroke-opacity="0.35" stroke-linejoin="round"/>
							<text x={W - PAD.right + 8} y={yP(p.prevEnd) + 4} font-size="11" fill="#60a5fa88">{prevYear}</text>
						{/if}

						<!-- Prognose-Fläche (heute → Jahresende) -->
						<path
							d="M{xD(todayDoy).toFixed(1)},{yP(p.kmToday).toFixed(1)}
							   L{xD(365).toFixed(1)},{yP(p.projEnd).toFixed(1)}
							   L{xD(365).toFixed(1)},{(PAD.top + cH).toFixed(1)}
							   L{xD(todayDoy).toFixed(1)},{(PAD.top + cH).toFixed(1)}Z"
							fill="#fc4c02" fill-opacity="0.08"/>

						<!-- Aktuelles Jahr – Ist-Linie -->
						<polyline
							points={[[1, 0], ...yearData[currentYear]].map(([d, k]) => `${xD(d).toFixed(1)},${yP(k).toFixed(1)}`).join(' ')}
							fill="none" stroke="#fc4c02" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>

						<!-- Prognose-Linie (gestrichelt) -->
						<line
							x1={xD(todayDoy).toFixed(1)} y1={yP(p.kmToday).toFixed(1)}
							x2={xD(365).toFixed(1)}      y2={yP(p.projEnd).toFixed(1)}
							stroke="#fc4c02" stroke-width="2" stroke-dasharray="6,4" stroke-opacity="0.7"/>

						<!-- Prognose-Endpunkt -->
						<circle cx={xD(365).toFixed(1)} cy={yP(p.projEnd).toFixed(1)}
							r="5" fill="#fc4c02" stroke="var(--t-bg)" stroke-width="1.5"/>
						<text x={W - PAD.right + 8} y={yP(p.projEnd) + 4} font-size="11" fill="#fc4c02" font-weight="600">
							{p.projEnd.toLocaleString('de-DE')}
						</text>

						<!-- Heute-Linie -->
						<line x1={xD(todayDoy).toFixed(1)} y1={PAD.top}
							x2={xD(todayDoy).toFixed(1)} y2={PAD.top + cH}
							stroke="var(--chart-muted)" stroke-width="1" stroke-dasharray="5,3"/>
						<text x={xD(todayDoy)} y={PAD.top - 6} font-size="10" fill="var(--chart-text)" text-anchor="middle">heute</text>
					</svg>
				</div>
			</div>
		{/if}
	{/if}
</div>
