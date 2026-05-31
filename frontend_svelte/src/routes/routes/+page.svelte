<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { api, type RouteCluster, type RouteClusterRide } from '$lib/api';
	import PageHeader from '$lib/PageHeader.svelte';

	// --- State ---
	let clusters   = $state<RouteCluster[]>([]);
	let loading    = $state(true);
	let error      = $state<string | null>(null);
	let sortMode   = $state<'rides' | 'last' | 'trend'>('rides');
	let expandedId = $state<number | null>(null);   // representative_id der geöffneten Karte

	// --- Leaflet (lazy) ---
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let leaflet: any = null;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let mapInstances: Record<number, any> = {};
	let mapContainers: Record<number, HTMLDivElement> = {};

	onMount(async () => {
		try {
			const res = await api.routeClusters(3);
			clusters = res.clusters;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Fehler beim Laden';
		} finally {
			loading = false;
		}
	});

	onDestroy(() => {
		for (const m of Object.values(mapInstances)) m.remove();
	});

	// --- Sortierung ---
	const sorted = $derived(() => {
		const c = [...clusters];
		if (sortMode === 'rides') return c.sort((a, b) => b.ride_count - a.ride_count);
		if (sortMode === 'last')  return c.sort((a, b) => b.last_ridden.localeCompare(a.last_ridden));
		if (sortMode === 'trend') return c.sort((a, b) => a.trend_slope - b.trend_slope); // schneller werdende zuerst
		return c;
	});

	// --- Karte ein-/ausklappen ---
	async function toggleMap(cluster: RouteCluster) {
		const repId = cluster.representative_id;
		if (expandedId === repId) {
			expandedId = null;
			return;
		}
		expandedId = repId;

		// Karte initialisieren – erst wenn Container im DOM ist
		await tick();
		const container = mapContainers[repId];
		if (!container || mapInstances[repId]) {
			if (mapInstances[repId]) mapInstances[repId].invalidateSize();
			return;
		}

		if (!leaflet) {
			leaflet = (await import('leaflet')).default;
			await import('leaflet/dist/leaflet.css');
		}
		const L = leaflet;
		const map = L.map(container, { zoomControl: false });
		L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
			attribution: '© OpenStreetMap',
			maxZoom: 18,
		}).addTo(map);
		mapInstances[repId] = map;

		try {
			const track = await api.activityTrack(repId, 20);
			const valid = track.points.filter(p => p.lat != null && p.lon != null);
			if (valid.length > 0) {
				const latlngs = valid.map(p => [p.lat, p.lon] as [number, number]);
				L.polyline(latlngs, { color: '#f97316', weight: 3, opacity: 0.9 }).addTo(map);
				map.fitBounds(L.polyline(latlngs).getBounds(), { padding: [16, 16] });
			}
		} catch { /* kein Track */ }
	}

	async function tick() {
		await new Promise(r => setTimeout(r, 50));
	}

	// --- Hilfsfunktionen ---
	function fmtTime(s: number): string {
		const h = Math.floor(s / 3600);
		const m = Math.floor((s % 3600) / 60);
		const sec = s % 60;
		if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
		return `${m}:${String(sec).padStart(2, '0')}`;
	}

	function fmtKm(m: number): string {
		return (m / 1000).toFixed(1);
	}

	function fmtSpeed(ms: number | null): string {
		return ms != null ? (ms * 3.6).toFixed(1) : '–';
	}

	function fmtDate(d: string): string {
		return new Date(d + 'Z').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
	}

	function relativeDate(d: string): string {
		const diff = Math.floor((Date.now() - new Date(d + 'Z').getTime()) / 86400000);
		if (diff === 0) return 'heute';
		if (diff === 1) return 'gestern';
		if (diff < 7) return `vor ${diff} Tagen`;
		if (diff < 30) return `vor ${Math.floor(diff / 7)} Wo.`;
		if (diff < 365) return `vor ${Math.floor(diff / 30)} Mon.`;
		return `vor ${Math.floor(diff / 365)} J.`;
	}

	function trendLabel(slope: number): string {
		if (Math.abs(slope) < 30) return 'stabil';
		const minPerRide = Math.abs(slope / 60);
		return `${minPerRide.toFixed(1)} min/Ride`;
	}

	function trendDir(slope: number): 'up' | 'down' | 'flat' {
		if (slope < -30) return 'up';    // schneller werdend
		if (slope > 30)  return 'down';  // langsamer werdend
		return 'flat';
	}

	// --- SVG-Zeitchart ---
	function buildChart(cluster: RouteCluster): { bars: { x: number; h: number; barW: number; isPR: boolean; ride: RouteClusterRide }[]; W: number; H: number; avgY: number } {
		const rides = cluster.rides;
		const W = Math.max(200, rides.length * 12);
		const H = 72;
		const times = rides.map(r => r.moving_time_s);
		const minT = Math.min(...times);
		const maxT = Math.max(...times);
		const range = maxT - minT || 1;
		const barW = Math.max(4, W / rides.length - 2);

		const avgNorm = range > 0 ? (cluster.avg_time_s - minT) / range : 0.5;
		const avgY = H - (10 + avgNorm * (H - 16));

		const bars = rides.map((ride, i) => {
			const norm = (ride.moving_time_s - minT) / range;
			const h = 10 + norm * (H - 16);
			return {
				x: i * (W / rides.length) + (W / rides.length - barW) / 2,
				h,
				barW,
				isPR: ride.id === cluster.best_time_id,
				ride,
			};
		});
		return { bars, W, H, avgY };
	}

	// --- Zusammenfassung ---
	const totalRidesInClusters = $derived(() => clusters.reduce((s, c) => s + c.ride_count, 0));
</script>

<div class="max-w-5xl mx-auto space-y-6">

	<PageHeader title="Top-Strecken" subtitle="Deine Lieblingsrouten automatisch erkannt" />

	{#if loading}
		<div class="flex items-center justify-center py-20 text-gray-500">
			<span class="inline-block w-5 h-5 rounded-full border-2 border-orange-400 border-t-transparent animate-spin mr-3"></span>
			Analysiere Rides …
		</div>

	{:else if error}
		<div class="text-red-400 py-10 text-center">{error}</div>

	{:else if clusters.length === 0}
		<div class="text-center py-20 text-gray-500">
			<p class="text-lg">Keine Cluster gefunden.</p>
			<p class="text-sm mt-1">Mindestens 3 Rides auf derselben Strecke nötig.</p>
		</div>

	{:else}

		<!-- Zusammenfassung + Sortierung -->
		<div class="flex items-center justify-between">
			<p class="text-sm text-gray-400">
				<span class="text-white font-semibold">{clusters.length}</span> Lieblingsrouten ·
				<span class="text-white font-semibold">{totalRidesInClusters()}</span> Rides
			</p>
			<div class="flex gap-1">
				{#each [
					{ key: 'rides', label: 'Häufigkeit' },
					{ key: 'last',  label: 'Letzte Fahrt' },
					{ key: 'trend', label: 'Tendenz' },
				] as opt}
					<button
						type="button"
						onclick={() => { sortMode = opt.key as typeof sortMode; }}
						class="px-3 py-1 text-xs rounded-full border transition-colors
							{sortMode === opt.key
								? 'border-orange-500 text-orange-400 bg-orange-500/10'
								: 'border-gray-700 text-gray-500 hover:text-gray-300 hover:border-gray-600'}"
					>{opt.label}</button>
				{/each}
			</div>
		</div>

		<!-- Cluster-Karten -->
		<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
			{#each sorted() as cluster (cluster.representative_id)}
				{@const isExpanded = expandedId === cluster.representative_id}
				{@const chart = buildChart(cluster)}
				{@const dir = trendDir(cluster.trend_slope)}

				<div class="rounded-xl border border-gray-800 bg-[var(--t-surface)] overflow-hidden hover:border-gray-700 transition-colors">

					<!-- Header -->
					<div class="px-4 pt-4 pb-3 flex items-start justify-between gap-3">
						<div class="flex items-center gap-3 min-w-0">
							<!-- Distanz-Badge -->
							<span class="shrink-0 px-2.5 py-1 rounded-full bg-orange-500/15 text-orange-400 text-sm font-bold tabular-nums">
								~{fmtKm(cluster.avg_distance_m)} km
							</span>
							<!-- Ride-Count -->
							<span class="text-xs text-gray-400">
								<span class="text-white font-semibold">{cluster.ride_count}</span> Rides
							</span>
						</div>

						<!-- Trend-Indikator -->
						<div class="flex items-center gap-1 text-xs shrink-0
							{dir === 'up'   ? 'text-emerald-400'
							: dir === 'down' ? 'text-red-400'
							:                 'text-gray-500'}"
						>
							{#if dir === 'up'}
								<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M5 12l7-7 7 7"/><path d="M12 19V5"/></svg>
								schneller
							{:else if dir === 'down'}
								<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M19 12l-7 7-7-7"/><path d="M12 5v14"/></svg>
								langsamer
							{:else}
								<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M5 12h14"/></svg>
								stabil
							{/if}
							{#if dir !== 'flat'}
								<span class="text-gray-600">· {trendLabel(cluster.trend_slope)}</span>
							{/if}
						</div>
					</div>

					<!-- Zeit-Chart -->
					<div class="px-4 pb-3">
						<p class="text-[10px] text-gray-600 uppercase tracking-wide mb-1.5">Zeiten (chronologisch)</p>
						<div class="overflow-x-auto">
							<svg width={chart.W} height={chart.H} class="block">
								<!-- Durchschnittslinie -->
								<line x1="0" y1={chart.avgY} x2={chart.W} y2={chart.avgY} stroke="#6b7280" stroke-width="1" stroke-dasharray="3,3" />

								{#each chart.bars as bar}
									<rect
										x={bar.x}
										y={chart.H - bar.h}
										width={bar.barW}
										height={bar.h}
										rx="2"
										fill={bar.isPR ? '#f59e0b' : '#374151'}
										opacity={bar.isPR ? 1 : 0.7}
									/>
									{#if bar.isPR}
										<text x={bar.x + bar.barW / 2} y={chart.H - bar.h - 4} text-anchor="middle" font-size="8" fill="#f59e0b">★</text>
									{/if}
								{/each}
							</svg>
						</div>
					</div>

					<!-- Stats-Grid -->
					<div class="grid grid-cols-2 sm:grid-cols-4 gap-0 border-t border-gray-800 divide-x divide-gray-800">
						<div class="px-3 py-2.5">
							<p class="text-[10px] text-gray-600 uppercase tracking-wide">Bestzeit</p>
							<p class="text-sm font-bold text-amber-400 tabular-nums">{fmtTime(cluster.best_time_s)}</p>
							<p class="text-[10px] text-gray-600 mt-0.5">{fmtDate(cluster.best_time_date)}</p>
						</div>
						<div class="px-3 py-2.5">
							<p class="text-[10px] text-gray-600 uppercase tracking-wide">Ø Zeit</p>
							<p class="text-sm font-semibold text-gray-200 tabular-nums">{fmtTime(cluster.avg_time_s)}</p>
							<p class="text-[10px] text-gray-600 mt-0.5">
								{#if cluster.avg_time_s > cluster.best_time_s}
									+{fmtTime(cluster.avg_time_s - cluster.best_time_s)} vs. PR
								{/if}
							</p>
						</div>
						<div class="px-3 py-2.5">
							<p class="text-[10px] text-gray-600 uppercase tracking-wide">Letzte Fahrt</p>
							<p class="text-sm font-semibold text-gray-200">{relativeDate(cluster.last_ridden)}</p>
							<p class="text-[10px] text-gray-600 mt-0.5">{fmtDate(cluster.last_ridden)}</p>
						</div>
						<div class="px-3 py-2.5">
							<p class="text-[10px] text-gray-600 uppercase tracking-wide">Ø Speed</p>
							<p class="text-sm font-semibold text-gray-200 tabular-nums">{fmtSpeed(cluster.avg_speed_ms)} km/h</p>
							{#if cluster.avg_hr}
								<p class="text-[10px] text-gray-600 mt-0.5">{Math.round(cluster.avg_hr)} bpm</p>
							{/if}
						</div>
					</div>

					<!-- Footer: Karte + Link -->
					<div class="px-4 py-2.5 border-t border-gray-800 flex items-center gap-3">
						<button
							type="button"
							onclick={() => toggleMap(cluster)}
							class="text-xs text-gray-400 hover:text-orange-400 transition-colors flex items-center gap-1.5"
						>
							{#if isExpanded}
								<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M19 9l-7 7-7-7"/></svg>
								Karte ausblenden
							{:else}
								<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>
								Karte anzeigen
							{/if}
						</button>
						<span class="text-gray-800">|</span>
						<a
							href="/strecken?ref={cluster.representative_id}"
							class="text-xs text-gray-400 hover:text-orange-400 transition-colors flex items-center gap-1"
						>
							Streckenvergleich
							<svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
						</a>
					</div>

					<!-- Karte (aufklappbar) -->
					{#if isExpanded}
						<div
							bind:this={mapContainers[cluster.representative_id]}
							class="h-56 border-t border-gray-800 z-0"
						></div>
					{/if}

					<!-- Ride-Liste (kompakt, letzte 5) -->
					{#if isExpanded}
						<div class="border-t border-gray-800 px-4 py-3 space-y-1">
							<p class="text-[10px] text-gray-600 uppercase tracking-wide mb-2">Letzte Fahrten</p>
							{#each cluster.rides.slice(-5).reverse() as ride}
								<a
									href="/activities/{ride.id}"
									class="flex items-center justify-between text-xs py-1 hover:text-orange-400 transition-colors group"
								>
									<span class="flex items-center gap-2">
										{#if ride.id === cluster.best_time_id}
											<span class="text-amber-400">★</span>
										{:else}
											<span class="w-3"></span>
										{/if}
										<span class="text-gray-400 group-hover:text-orange-300">{fmtDate(ride.date)}</span>
									</span>
									<span class="flex items-center gap-3 tabular-nums">
										<span class="text-gray-200 font-medium">{fmtTime(ride.moving_time_s)}</span>
										{#if ride.avg_speed_ms}
											<span class="text-gray-600">{fmtSpeed(ride.avg_speed_ms)} km/h</span>
										{/if}
									</span>
								</a>
							{/each}
							{#if cluster.rides.length > 5}
								<p class="text-[10px] text-gray-700 text-center pt-1">+ {cluster.rides.length - 5} weitere</p>
							{/if}
						</div>
					{/if}

				</div>
			{/each}
		</div>
	{/if}
</div>
