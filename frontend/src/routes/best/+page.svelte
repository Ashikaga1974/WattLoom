<script lang="ts">
	import { onMount } from 'svelte';
	import { api, type Activity, type BestByDistanceBucket } from '$lib/api';
	import PageHeader from '$lib/PageHeader.svelte';

	interface Category {
		key: string;
		label: string;
		unit: string;
		format: (a: Activity) => string;
		items: Activity[];
	}

	let categories = $state<Category[]>([
		{
			key: 'distance_m',
			label: 'Längste Rides',
			unit: 'km',
			format: (a) => (a.distance_m / 1000).toFixed(1) + ' km',
			items: [],
		},
		{
			key: 'elevation_gain_m',
			label: 'Meiste Höhenmeter',
			unit: 'm',
			format: (a) => (a.elevation_gain_m ? Math.round(a.elevation_gain_m) + ' m' : '-'),
			items: [],
		},
		{
			key: 'moving_time_s',
			label: 'Längste Fahrzeit',
			unit: 'h',
			format: (a) => {
				const h = Math.floor(a.moving_time_s / 3600);
				const m = Math.floor((a.moving_time_s % 3600) / 60);
				return `${h}h ${m}m`;
			},
			items: [],
		},
		{
			key: 'avg_speed_ms',
			label: 'Schnellste Rides',
			unit: 'km/h',
			format: (a) => (a.avg_speed_ms ? (a.avg_speed_ms * 3.6).toFixed(1) + ' km/h' : '-'),
			items: [],
		},
		{
			key: 'avg_power_w',
			label: 'Höchste Leistung',
			unit: 'W',
			format: (a) => (a.avg_power_w ? Math.round(a.avg_power_w) + ' W' : '-'),
			items: [],
		},
		{
			key: 'calories',
			label: 'Meiste Kalorien',
			unit: 'kcal',
			format: (a) => (a.calories ? Math.round(a.calories) + ' kcal' : '-'),
			items: [],
		},
	]);

	let loading    = $state(true);
	let error      = $state<string | null>(null);
	let distBuckets = $state<BestByDistanceBucket[]>([]);
	let hoveredBucket = $state<number | null>(null);

	onMount(async () => {
		try {
			const [catResults, distResult] = await Promise.all([
				Promise.all(categories.map(c => api.topActivities(c.key, 5))),
				api.bestByDistance(),
			]);
			categories   = categories.map((c, i) => ({ ...c, items: catResults[i].items }));
			distBuckets  = distResult.buckets;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Fehler beim Laden';
		} finally {
			loading = false;
		}
	});

	// --- Chart-Geometrie ---
	const CW = 960, CH = 200, PAD = { t: 20, r: 32, b: 48, l: 52 };
	const innerW = CW - PAD.l - PAD.r;
	const innerH = CH - PAD.t - PAD.b;

	const chartData = $derived(() => {
		const valid = distBuckets.filter(b => b.best_speed_kmh !== null);
		if (valid.length < 2) return null;
		const speeds = valid.map(b => b.best_speed_kmh as number);
		const minS   = Math.floor(Math.min(...speeds)) - 1;
		const maxS   = Math.ceil(Math.max(...speeds)) + 1;
		const n      = distBuckets.length;
		const stepX  = innerW / (n - 1);

		const pts = distBuckets.map((b, i) => ({
			x:  PAD.l + i * stepX,
			y:  b.best_speed_kmh !== null
				? PAD.t + innerH - ((b.best_speed_kmh - minS) / (maxS - minS)) * innerH
				: null,
			b,
		}));

		// Bezier-Pfad durch gültige Punkte
		const valid2 = pts.filter(p => p.y !== null) as { x: number; y: number; b: BestByDistanceBucket }[];
		let path = '';
		if (valid2.length >= 2) {
			path = `M ${valid2[0].x} ${valid2[0].y}`;
			for (let i = 1; i < valid2.length; i++) {
				const p0 = valid2[i - 1], p1 = valid2[i];
				const cx = (p0.x + p1.x) / 2;
				path += ` C ${cx} ${p0.y} ${cx} ${p1.y} ${p1.x} ${p1.y}`;
			}
		}

		// Y-Achse Ticks
		const yTicks = [];
		const step = (maxS - minS) <= 6 ? 1 : 2;
		for (let v = Math.ceil(minS / step) * step; v <= maxS; v += step) {
			yTicks.push({ v, y: PAD.t + innerH - ((v - minS) / (maxS - minS)) * innerH });
		}

		return { pts, valid2, path, minS, maxS, yTicks, stepX };
	});

	function fmtTime(s: number | null): string {
		if (s === null) return '–';
		const h = Math.floor(s / 3600);
		const m = Math.floor((s % 3600) / 60);
		const sec = s % 60;
		if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
		return `${m}:${String(sec).padStart(2, '0')}`;
	}

	function fmtDate(d: string | null): string {
		if (!d) return '';
		return new Date(d + 'Z').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
	}

	function date(iso: string) {
		return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
	}

	// Rang-Farben
	const rankColors = ['text-yellow-400', 'text-gray-300', 'text-amber-600', 'text-gray-500', 'text-gray-500'];
	const rankSymbols = ['🥇', '🥈', '🥉', '4.', '5.'];
</script>

<svelte:head>
	<title>Best of – MyBiking</title>
</svelte:head>

<div class="space-y-8">
	<PageHeader title="Best of – Persönliche Rekorde" />

	{#if error}
		<div class="rounded bg-red-900/50 border border-red-700 p-4 text-red-300 text-sm">{error}</div>
	{/if}

	<!-- Bestzeiten nach Distanz -->
	{#if loading}
		<div class="h-64 bg-gray-800/50 animate-pulse rounded-xl"></div>
	{:else if distBuckets.length > 0}
		{@const cd = chartData()}
		<section class="rounded-xl border border-gray-800 bg-gray-800/40 overflow-hidden">
			<div class="px-4 py-3 bg-gray-800/60 border-b border-gray-700">
				<h2 class="font-semibold text-gray-100">Bestzeiten nach Distanz</h2>
				<p class="text-xs text-gray-500 mt-0.5">Schnellste Fahrt je Distanzklasse (±20 %)</p>
			</div>

			{#if cd}
				<div class="px-4 pt-4 pb-2">
					<svg viewBox="0 0 {CW} {CH}" width="100%" class="block">

						<!-- Gitternetz -->
						{#each cd.yTicks as tick}
							<line
								x1={PAD.l} y1={tick.y} x2={CW - PAD.r} y2={tick.y}
								stroke="#374151" stroke-width="1"
							/>
							<text x={PAD.l - 6} y={tick.y + 4} text-anchor="end" font-size="10" fill="#6b7280">
								{tick.v}
							</text>
						{/each}

						<!-- X-Achse -->
						<line
							x1={PAD.l} y1={PAD.t + innerH} x2={CW - PAD.r} y2={PAD.t + innerH}
							stroke="#4b5563" stroke-width="1"
						/>

						<!-- Fläche unter der Kurve -->
						{#if cd.valid2.length >= 2}
							<path
								d="{cd.path} L {cd.valid2[cd.valid2.length - 1].x} {PAD.t + innerH} L {cd.valid2[0].x} {PAD.t + innerH} Z"
								fill="url(#distGrad)"
								opacity="0.4"
							/>
							<!-- Gradient -->
							<defs>
								<linearGradient id="distGrad" x1="0" y1="0" x2="0" y2="1">
									<stop offset="0%" stop-color="#f97316" stop-opacity="0.6" />
									<stop offset="100%" stop-color="#f97316" stop-opacity="0" />
								</linearGradient>
							</defs>
							<!-- Kurvenlinie -->
							<path d={cd.path} fill="none" stroke="#f97316" stroke-width="2.5" stroke-linejoin="round" />
						{/if}

						<!-- Datenpunkte + X-Labels -->
						{#each cd.pts as pt, i}
							<text
								x={pt.x}
								y={PAD.t + innerH + 16}
								text-anchor="middle"
								font-size="10"
								fill="#6b7280"
							>{pt.b.distance_km} km</text>

							{#if pt.y !== null}
								<!-- Hover-Zone -->
								<rect
									x={pt.x - cd.stepX / 2}
									y={PAD.t}
									width={cd.stepX}
									height={innerH}
									fill="transparent"
									onmouseenter={() => hoveredBucket = i}
									onmouseleave={() => hoveredBucket = null}
									style="cursor: pointer"
								/>

								<!-- Punkt -->
								<circle
									cx={pt.x} cy={pt.y} r={hoveredBucket === i ? 6 : 4}
									fill={hoveredBucket === i ? '#f97316' : '#1f2937'}
									stroke="#f97316"
									stroke-width="2"
									style="transition: r 0.15s"
								/>

								<!-- Speed-Label oben -->
								<text
									x={pt.x}
									y={pt.y - 10}
									text-anchor="middle"
									font-size="10"
									font-weight="600"
									fill={hoveredBucket === i ? '#f97316' : '#d1d5db'}
								>{pt.b.best_speed_kmh} km/h</text>

								<!-- Tooltip-Box bei Hover -->
								{#if hoveredBucket === i}
									{@const bx = pt.x > CW - 180 ? pt.x - 160 : pt.x + 10}
									{@const by = Math.max(PAD.t + 4, pt.y - 50)}
									<rect x={bx} y={by} width="155" height="56" rx="6" fill="#1f2937" stroke="#374151" />
									<text x={bx + 8} y={by + 15} font-size="10" font-weight="600" fill="#f97316">
										{pt.b.actual_distance_km} km · {fmtTime(pt.b.best_time_s)}
									</text>
									<text x={bx + 8} y={by + 29} font-size="9" fill="#9ca3af">
										{pt.b.activity_name ?? ''}
									</text>
									<text x={bx + 8} y={by + 43} font-size="9" fill="#6b7280">
										{fmtDate(pt.b.date)}
									</text>
								{/if}
							{:else}
								<!-- kein Datenpunkt -->
								<text x={pt.x} y={PAD.t + innerH - 8} text-anchor="middle" font-size="9" fill="#4b5563">–</text>
							{/if}
						{/each}

						<!-- Y-Achsen-Label -->
						<text
							x={PAD.l - 36} y={PAD.t + innerH / 2}
							text-anchor="middle" font-size="10" fill="#6b7280"
							transform="rotate(-90, {PAD.l - 36}, {PAD.t + innerH / 2})"
						>km/h</text>

					</svg>
				</div>

				<!-- Tabelle darunter -->
				<div class="border-t border-gray-800 overflow-x-auto">
					<table class="w-full text-xs">
						<thead>
							<tr class="text-left text-gray-600 uppercase tracking-wide border-b border-gray-800">
								<th class="px-4 py-2 font-medium">Distanz</th>
								<th class="px-4 py-2 font-medium">Bestzeit</th>
								<th class="px-4 py-2 font-medium">Speed</th>
								<th class="px-4 py-2 font-medium">Aktivität</th>
								<th class="px-4 py-2 font-medium">Datum</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-gray-800/50">
							{#each distBuckets as b}
								<tr class="hover:bg-white/5 transition-colors">
									<td class="px-4 py-2 font-semibold text-gray-300">{b.distance_km} km</td>
									{#if b.activity_id}
										<td class="px-4 py-2 font-mono text-amber-400 font-semibold">{fmtTime(b.best_time_s)}</td>
										<td class="px-4 py-2 text-gray-300">{b.best_speed_kmh} km/h</td>
										<td class="px-4 py-2">
											<a href="/activities/{b.activity_id}" class="text-gray-400 hover:text-orange-400 transition-colors truncate max-w-[200px] block">
												{b.activity_name}
											</a>
										</td>
										<td class="px-4 py-2 text-gray-600">{fmtDate(b.date)}</td>
									{:else}
										<td class="px-4 py-2 text-gray-700" colspan="4">Keine Fahrt in diesem Bereich</td>
									{/if}
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{:else}
				<p class="px-4 py-6 text-sm text-gray-600">Zu wenig Daten für den Chart.</p>
			{/if}
		</section>
	{/if}

	<!-- Rekord-Kategorien -->
	{#if loading}
		<div class="grid md:grid-cols-2 gap-6">
			{#each Array(6) as _}
				<div class="h-48 bg-gray-800/50 animate-pulse rounded-xl"></div>
			{/each}
		</div>
	{:else}
		<div class="grid md:grid-cols-2 gap-6">
			{#each categories as cat}
				<section class="rounded-xl bg-gray-800/40 border border-gray-800 overflow-hidden">
					<div class="px-4 py-3 bg-gray-800/60 border-b border-gray-700">
						<h2 class="font-semibold text-gray-100">{cat.label}</h2>
					</div>
					<ol class="divide-y divide-gray-800/50">
						{#each cat.items as act, i}
							<li>
								<a
									href="/activities/{act.id}"
									class="flex items-center gap-3 px-4 py-3 hover:bg-gray-700/40 transition-colors"
								>
									<span class="text-lg w-7 shrink-0 text-center">{rankSymbols[i]}</span>
									<div class="min-w-0 flex-1">
										<p class="font-medium truncate text-sm">{act.name}</p>
										<p class="text-xs text-gray-500">{date(act.start_date)}</p>
									</div>
									<span class="shrink-0 text-sm font-semibold {rankColors[i]}">
										{cat.format(act)}
									</span>
								</a>
							</li>
						{:else}
							<li class="px-4 py-3 text-sm text-gray-500">Keine Daten.</li>
						{/each}
					</ol>
				</section>
			{/each}
		</div>
	{/if}
</div>
