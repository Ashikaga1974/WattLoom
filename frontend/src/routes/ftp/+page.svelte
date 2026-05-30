<script lang="ts">
	import { onMount } from 'svelte';
	import { api } from '$lib/api';
	import PageHeader from '$lib/PageHeader.svelte';

	interface TrendPt  { label: string; best_w: number; }

	let trend       = $state<TrendPt[]>([]);
	let currentFtp  = $state<number | null>(null);
	let bestEver    = $state<{ w: number; date: string } | null>(null);
	let loading     = $state(true);
	let error       = $state<string | null>(null);
	let weightKg    = $state<number | null>(null);
	let birthYear   = $state<number | null>(null);
	let ftpManual   = $state<number | null>(null);

	onMount(async () => {
		try {
			const [res, cfg] = await Promise.all([api.ftp(), api.getSettings()]);
			trend      = res.trend;
			currentFtp = res.current_ftp;
			bestEver   = res.best_ever;
			weightKg   = cfg.weight_kg;
			birthYear  = cfg.birth_year;
			ftpManual  = cfg.ftp_manual;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Fehler';
		} finally {
			loading = false;
		}
	});

	// Primärer FTP-Wert: manuell wenn vorhanden, sonst berechnet
	const primaryFtp = $derived(ftpManual ?? currentFtp);

	function wkg(watts: number): string {
		if (!weightKg) return '';
		return (watts / weightKg).toFixed(2) + ' w/kg';
	}

	function vo2max(watts: number): string {
		if (!weightKg) return '';
		const v = (watts / weightKg) * 10.8 + 7;
		return v.toFixed(1);
	}

	function vo2maxCategory(v: number): string {
		// Grobe Kategorien nach Cooper-Norm
		if (v >= 55) return 'Exzellent';
		if (v >= 46) return 'Sehr gut';
		if (v >= 38) return 'Gut';
		if (v >= 30) return 'Befriedigend';
		return 'Verbesserungswürdig';
	}

	// ── Trend-Chart ────────────────────────────────────────────────────────────
	const TW = 700, TH = 220;
	const TP = { top: 24, right: 20, bottom: 44, left: 52 };
	const tcW = TW - TP.left - TP.right;
	const tcH = TH - TP.top  - TP.bottom;

	const tMin = $derived(trend.length ? Math.floor(Math.min(...trend.map(p => p.best_w)) / 20) * 20 - 10 : 80);
	const tMax = $derived(trend.length ? Math.ceil( Math.max(...trend.map(p => p.best_w)) / 20) * 20 + 10 : 160);
	const tRange = $derived(tMax - tMin);

	function txOf(i: number) { return TP.left + (i / (trend.length - 1)) * tcW; }
	function tyOf(w: number) { return TP.top + tcH - ((w - tMin) / tRange) * tcH; }

	const tPolyline = $derived(
		trend.map((p, i) => `${txOf(i).toFixed(1)},${tyOf(p.best_w).toFixed(1)}`).join(' ')
	);

	const yTicks = $derived(
		(() => {
			const t: number[] = [];
			for (let v = Math.ceil(tMin / 20) * 20; v <= tMax; v += 20) t.push(v);
			return t;
		})()
	);

	// X-Labels: nur jedes 2. Quarter beschriften um Überlappung zu vermeiden
	function shortLabel(lbl: string) {
		// "2023-Q2" → "Q2'23"
		const [y, q] = lbl.split('-');
		return `${q}'${y.slice(2)}`;
	}

</script>

<svelte:head>
	<title>FTP-Analyse – MyBiking</title>
</svelte:head>

<div class="space-y-6">
	<PageHeader
		title="FTP-Analyse"
		subtitle="HR-korrigierte Schätzung · avg_power × 0,90 ÷ (avg_hr / HRmax) · exakte FTP per 20-min-Test in Einstellungen hinterlegen"
	/>

	{#if error}
		<div class="rounded bg-red-900/50 border border-red-700 p-4 text-red-300 text-sm">{error}</div>
	{/if}

	{#if loading}
		<div class="h-64 bg-gray-800/50 animate-pulse rounded-xl"></div>
	{:else}
		<!-- Kennzahlen -->
		<div class="flex flex-wrap gap-3">
			<!-- Primäre FTP: manuell wenn gesetzt, sonst geschätzt -->
			<div class="rounded-xl bg-gray-800 px-4 py-3 text-center min-w-36">
				{#if ftpManual}
					<p class="text-xs text-gray-400">FTP (manuell)</p>
					<p class="text-2xl font-bold text-orange-400 mt-0.5">
						{ftpManual} <span class="text-base font-normal text-gray-500">W</span>
					</p>
					{#if weightKg}
						<p class="text-xs text-orange-300/70 mt-0.5">{wkg(ftpManual)}</p>
					{/if}
				{:else}
					<p class="text-xs text-gray-400">Geschätzt (90 Tage)</p>
					<p class="text-2xl font-bold text-orange-400 mt-0.5">
						{currentFtp != null ? currentFtp.toFixed(0) : '–'} <span class="text-base font-normal text-gray-500">W</span>
					</p>
					{#if currentFtp && weightKg}
						<p class="text-xs text-orange-300/70 mt-0.5">{wkg(currentFtp)}</p>
					{/if}
				{/if}
			</div>

			<!-- VO2max-Schätzung -->
			{#if primaryFtp && weightKg}
				{@const v = parseFloat(vo2max(primaryFtp))}
				{@const ageYrs = birthYear ? new Date().getFullYear() - birthYear : null}
				<div class="rounded-xl bg-gray-800 px-4 py-3 text-center min-w-36">
					<p class="text-xs text-gray-400">VO2max (Schätzung{ageYrs ? `, ${ageYrs} J.` : ''})</p>
					<p class="text-2xl font-bold text-sky-400 mt-0.5">
						{v.toFixed(1)} <span class="text-base font-normal text-gray-500">ml/kg/min</span>
					</p>
					<p class="text-xs text-sky-300/70 mt-0.5">{vo2maxCategory(v)}</p>
				</div>
			{/if}

			{#if bestEver}
				<div class="rounded-xl bg-gray-800 px-4 py-3 text-center min-w-36">
					<p class="text-xs text-gray-400">Bestes Ø je (45–75 min)</p>
					<p class="text-2xl font-bold text-yellow-400 mt-0.5">
						{bestEver.w.toFixed(0)} <span class="text-base font-normal text-gray-500">W</span>
					</p>
					{#if weightKg}
						<p class="text-xs text-yellow-300/70 mt-0.5">{wkg(bestEver.w)}</p>
					{/if}
					<p class="text-xs text-gray-500 mt-0.5">{new Date(bestEver.date).toLocaleDateString('de-DE', { day:'numeric', month:'short', year:'numeric' })}</p>
				</div>
			{/if}

			<!-- Hinweise -->
			{#if !weightKg || !ftpManual}
				<a href="/settings"
					class="rounded-xl bg-gray-800/50 border border-gray-700 px-4 py-3 max-w-xs text-xs text-gray-500 flex items-start gap-2 hover:border-orange-700 transition-colors">
					<span class="mt-0.5">⚙</span>
					<span>
						{#if !ftpManual && !weightKg}
							FTP und Gewicht in Einstellungen hinterlegen
						{:else if !ftpManual}
							Eigene FTP in Einstellungen hinterlegen (20-min-Test × 0,95)
						{:else}
							Gewicht für w/kg hinterlegen
						{/if}
					</span>
				</a>
			{/if}
			{#if ftpManual && currentFtp}
				<div class="rounded-xl bg-gray-800/50 border border-gray-700 px-4 py-3 max-w-xs text-xs text-gray-500">
					HR-korrigierte Schätzung (90 Tage): ~{currentFtp.toFixed(0)} W
					<span class="text-gray-600 block mt-0.5">avg_power × 0,90 ÷ (avg_hr / HRmax)</span>
				</div>
			{/if}
		</div>

		<!-- FTP-Trend -->
		{#if trend.length}
			<div class="rounded-xl bg-gray-800/40 border border-gray-800 p-4">
				<p class="text-sm font-medium text-gray-300 mb-3">Trend (quartalsweise)</p>
				<svg viewBox="0 0 {TW} {TH}" class="w-full" style="height:{TH}px">
					<!-- Gitternetz Y -->
					{#each yTicks as v}
						<line x1={TP.left} y1={tyOf(v).toFixed(1)}
							x2={TW - TP.right} y2={tyOf(v).toFixed(1)}
							stroke="var(--chart-line)" stroke-width="1"/>
						<text x={TP.left - 8} y={tyOf(v) + 4} font-size="11" fill="var(--chart-text)" text-anchor="end">{v}</text>
					{/each}

					<!-- Achsen -->
					<line x1={TP.left} y1={TP.top} x2={TP.left} y2={TP.top + tcH} stroke="var(--chart-line)" stroke-width="1"/>
					<line x1={TP.left} y1={TP.top + tcH} x2={TW - TP.right} y2={TP.top + tcH} stroke="var(--chart-line)" stroke-width="1"/>

					<!-- Y-Label -->
					<text x={TP.left - 40} y={TP.top + tcH / 2} font-size="11" fill="var(--chart-muted)" text-anchor="middle"
						transform="rotate(-90, {TP.left - 40}, {TP.top + tcH / 2})">Watt</text>

					<!-- Best-ever Linie -->
					{#if bestEver}
						<line x1={TP.left} y1={tyOf(bestEver.w).toFixed(1)}
							x2={TW - TP.right} y2={tyOf(bestEver.w).toFixed(1)}
							stroke="#facc15" stroke-width="1" stroke-dasharray="6,3" stroke-opacity="0.4"/>
					{/if}

					<!-- Fläche unter Kurve -->
					{#if trend.length > 1}
						<path
							d={`M${txOf(0).toFixed(1)},${(TP.top + tcH).toFixed(1)}L${trend.map((p,i) => `${txOf(i).toFixed(1)},${tyOf(p.best_w).toFixed(1)}`).join('L')}L${txOf(trend.length-1).toFixed(1)},${(TP.top + tcH).toFixed(1)}Z`}
							fill="#fc4c02" fill-opacity="0.08"
						/>
					{/if}

					<!-- Linie -->
					<polyline points={tPolyline} fill="none" stroke="#fc4c02" stroke-width="2.5"
						stroke-linejoin="round" stroke-linecap="round"/>

					<!-- Punkte + X-Labels -->
					{#each trend as p, i}
						<circle cx={txOf(i).toFixed(1)} cy={tyOf(p.best_w).toFixed(1)}
							r="4" fill="#fc4c02" stroke="var(--t-bg)" stroke-width="1.5"/>
						{#if i % 2 === 0 || i === trend.length - 1}
							<text x={txOf(i)} y={TP.top + tcH + 16} font-size="10" fill="var(--chart-text)" text-anchor="middle">
								{shortLabel(p.label)}
							</text>
						{/if}
					{/each}

					<!-- Wert über dem Peak-Punkt -->
					{#if bestEver}
						{@const peakIdx = trend.findIndex(p => p.best_w === bestEver!.w)}
						{#if peakIdx >= 0}
							<text x={txOf(peakIdx)} y={tyOf(bestEver.w) - 10}
								font-size="11" fill="#facc15" text-anchor="middle" font-weight="600">
								{bestEver.w.toFixed(0)} W
							</text>
						{/if}
					{/if}
				</svg>
			</div>
		{/if}

	{/if}
</div>
