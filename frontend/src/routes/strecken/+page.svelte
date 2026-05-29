<script lang="ts">
	import { onDestroy } from 'svelte';
	import { page } from '$app/stores';
	import { api, type ActivityDetail, type SimilarActivity, type TrackPoint } from '$lib/api';
	import { COMPARISON_COLORS, COMPARISON_SIMPLIFY } from '$lib/config';
	import ComparisonChart from '$lib/ComparisonChart.svelte';

	// --- Typen ---
	interface TrackEntry {
		id: number;
		label: string;
		color: string;
		points: TrackPoint[];
	}

	// --- State ---
	const refId = $derived(
		$page.url.searchParams.get('ref') ? Number($page.url.searchParams.get('ref')) : null
	);

	let refActivity = $state<ActivityDetail | null>(null);
	let similarList  = $state<SimilarActivity[]>([]);
	let selectedIds  = $state<number[]>([]);
	let tracksData   = $state<Record<number, TrackPoint[]>>({});
	let loading      = $state(false);
	let error        = $state<string | null>(null);
	let loadingIds   = $state(new Set<number>());

	// --- Leaflet ---
	let mapContainer = $state<HTMLDivElement | undefined>(undefined);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let mapInstance: any = null;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let leaflet: any = null;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let polylineMap: Record<number, any> = {};
	let lastMapContainer: HTMLDivElement | undefined = undefined;

	// --- Laden beim Wechsel der Referenz-ID ---
	$effect(() => {
		const id = refId;
		if (!id) return;
		loadReference(id);
	});

	async function loadReference(id: number) {
		loading = true;
		error = null;
		refActivity = null;
		similarList = [];
		selectedIds = [];
		tracksData = {};
		// Karte-State zurücksetzen – mapContainer wird durch DOM-Unmount ohnehin neu gesetzt
		if (mapInstance) { mapInstance.remove(); mapInstance = null; }
		polylineMap = {};
		try {
			const [act, similar] = await Promise.all([
				api.activity(id),
				api.similarActivities(id, 20),
			]);
			refActivity = act;
			similarList = similar.similar;
			if (act.has_track) {
				const track = await api.activityTrack(id, COMPARISON_SIMPLIFY);
				tracksData = { [id]: track.points };
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'Fehler beim Laden';
		} finally {
			loading = false;
		}
	}

	async function toggleSelect(id: number) {
		if (selectedIds.includes(id)) {
			selectedIds = selectedIds.filter(s => s !== id);
			const copy = { ...tracksData };
			delete copy[id];
			tracksData = copy;
		} else {
			if (selectedIds.length >= 4) return;
			selectedIds = [...selectedIds, id];
			// Track nur laden wenn noch nicht im Cache
			if (!tracksData[id]) {
				loadingIds = new Set([...loadingIds, id]);
				try {
					const track = await api.activityTrack(id, COMPARISON_SIMPLIFY);
					tracksData = { ...tracksData, [id]: track.points };
				} catch { /* Track nicht verfügbar */ }
				finally {
					loadingIds = new Set([...loadingIds].filter(x => x !== id));
				}
			}
		}
	}

	// --- Aufbereitete Chart-Daten ---
	const chartTracks = $derived(() => {
		const result: TrackEntry[] = [];
		if (refActivity && tracksData[refActivity.id]) {
			result.push({
				id:     refActivity.id,
				label:  refActivity.name,
				color:  COMPARISON_COLORS[0],
				points: tracksData[refActivity.id],
			});
		}
		selectedIds.forEach((id, i) => {
			if (tracksData[id]) {
				const act = similarList.find(a => a.id === id);
				result.push({
					id,
					label:  act?.name ?? `#${id}`,
					color:  COMPARISON_COLORS[(i + 1) % COMPARISON_COLORS.length],
					points: tracksData[id],
				});
			}
		});
		return result;
	});

	// --- Karte synchronisieren (persistent – kein Rebuild bei neuen Tracks) ---
	$effect(() => {
		const tracks = chartTracks();
		// Container-Wechsel erkennen (z.B. nach Re-Mount durch Referenz-Wechsel)
		if (mapContainer !== lastMapContainer) {
			if (mapInstance) { mapInstance.remove(); mapInstance = null; }
			polylineMap = {};
			lastMapContainer = mapContainer;
		}
		if (!mapContainer || tracks.length === 0) return;
		syncMapPolylines(tracks);
	});

	async function syncMapPolylines(tracks: TrackEntry[]) {
		if (!leaflet) {
			leaflet = (await import('leaflet')).default;
			await import('leaflet/dist/leaflet.css');
		}
		const L = leaflet;

		// Map einmalig erstellen – Tiles werden nicht neu geladen
		if (!mapInstance) {
			mapInstance = L.map(mapContainer);
			L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
				attribution: '© OpenStreetMap',
				maxZoom: 18,
			}).addTo(mapInstance);
		}

		// Veraltete Polylines entfernen
		const newIds = new Set(tracks.map(t => t.id));
		for (const idStr of Object.keys(polylineMap)) {
			const numId = Number(idStr);
			if (!newIds.has(numId)) {
				polylineMap[numId].remove();
				delete polylineMap[numId];
			}
		}

		// Neue Polylines hinzufügen (bereits vorhandene bleiben unverändert)
		const allLatLngs: [number, number][] = [];
		for (const track of tracks) {
			const valid = track.points.filter(p => p.lat != null && p.lon != null);
			if (valid.length === 0) continue;
			const latlngs = valid.map(p => [p.lat, p.lon] as [number, number]);
			allLatLngs.push(...latlngs);
			if (!polylineMap[track.id]) {
				polylineMap[track.id] = L.polyline(latlngs, { color: track.color, weight: 3, opacity: 0.85 }).addTo(mapInstance);
			}
		}

		// Bounds anpassen – nur Pan/Zoom, keine Tile-Requests
		if (allLatLngs.length > 0) {
			mapInstance.fitBounds(L.polyline(allLatLngs).getBounds(), { padding: [20, 20] });
		}
	}

	onDestroy(() => {
		if (mapInstance) { mapInstance.remove(); mapInstance = null; }
	});

	// --- Hilfsfunktionen ---
	function fmtKm(m: number): string {
		return (m / 1000).toFixed(1) + ' km';
	}
	function fmtSpeed(ms: number | null): string {
		if (ms == null) return '–';
		return (ms * 3.6).toFixed(1) + ' km/h';
	}
	function fmtTime(s: number): string {
		const h = Math.floor(s / 3600);
		const m = Math.floor((s % 3600) / 60);
		return h > 0 ? `${h}:${String(m).padStart(2, '0')} h` : `${m} min`;
	}
	function fmtDate(d: string): string {
		return new Date(d).toLocaleDateString('de-DE', {
			day: '2-digit', month: '2-digit', year: 'numeric',
		});
	}
	function fmtHr(hr: number | null): string {
		return hr != null ? Math.round(hr) + ' bpm' : '–';
	}
	function fmtElev(m: number | null): string {
		return m != null ? Math.round(m) + ' m' : '–';
	}
</script>

<div class="max-w-7xl mx-auto px-4 py-6 space-y-6">
	<!-- Titel -->
	<div>
		<h1 class="text-2xl font-bold">Streckenvergleich</h1>
		{#if refActivity}
			<p class="text-gray-400 text-sm mt-0.5">Referenz: {refActivity.name} · {fmtDate(refActivity.start_date)}</p>
		{/if}
	</div>

	<!-- Leer-Zustand -->
	{#if !refId && !loading}
		<div class="text-center py-16 text-gray-500">
			<p class="text-lg">Keine Aktivität ausgewählt.</p>
			<p class="text-sm mt-2">
				Öffne eine Aktivität und klicke auf
				<span class="text-orange-400 font-medium">Ähnliche vergleichen</span>.
			</p>
		</div>

	{:else if loading}
		<div class="text-center py-16 text-gray-500">Lade …</div>

	{:else if error}
		<div class="text-red-400 py-8 text-center">{error}</div>

	{:else if refActivity}
		<div class="grid grid-cols-1 lg:grid-cols-3 gap-6">

			<!-- === Linke Spalte: Auswahlliste === -->
			<div class="space-y-4">
				<!-- Referenz-Aktivität -->
				<div class="rounded-xl border border-orange-500/40 bg-[var(--t-surface)] p-3">
					<div class="flex items-center gap-2 mb-1">
						<span
							class="inline-block w-3 h-3 rounded-full flex-shrink-0"
							style="background: {COMPARISON_COLORS[0]}"
						></span>
						<span class="text-xs text-orange-400 font-medium uppercase tracking-wide">Referenz</span>
					</div>
					<p class="text-sm font-semibold leading-snug">{refActivity.name}</p>
					<p class="text-xs text-gray-400 mt-0.5">
						{fmtDate(refActivity.start_date)} · {fmtKm(refActivity.distance_m)} · {fmtTime(refActivity.moving_time_s)}
					</p>
				</div>

				<!-- Ähnliche Aktivitäten -->
				<div>
					<p class="text-xs text-gray-500 font-medium uppercase tracking-wide mb-2">
						Ähnliche ({similarList.length})
						{#if selectedIds.length > 0}
							· <span class="text-orange-400">{selectedIds.length} ausgewählt</span>
						{/if}
					</p>
					{#if similarList.length === 0}
						<p class="text-sm text-gray-600 italic">Keine ähnlichen Aktivitäten gefunden.</p>
					{/if}
					<div class="space-y-1.5 max-h-[60vh] overflow-y-auto pr-1">
						{#each similarList as act}
							{@const isSelected  = selectedIds.includes(act.id)}
							{@const isLoading   = loadingIds.has(act.id)}
							{@const colorIdx    = isSelected ? (selectedIds.indexOf(act.id) + 1) % COMPARISON_COLORS.length : null}
							{@const isDisabled  = isLoading || (!isSelected && selectedIds.length >= 4)}
							<button
								type="button"
								onclick={() => toggleSelect(act.id)}
								disabled={isDisabled}
								class="w-full text-left rounded-lg border p-2.5 transition-colors text-sm
									{isSelected
										? 'border-orange-500/50 bg-[var(--t-surface)]'
										: 'border-gray-800 bg-[var(--t-surface)] hover:border-gray-600'}
									{isLoading ? 'opacity-60 cursor-wait' : ''}
									{!isLoading && isDisabled ? 'opacity-40 cursor-not-allowed' : ''}"
							>
								<div class="flex items-start gap-2">
									{#if isLoading}
										<span class="inline-block w-2.5 h-2.5 rounded-full border-2 border-orange-400 border-t-transparent animate-spin flex-shrink-0 mt-0.5"></span>
									{:else if colorIdx !== null}
										<span
											class="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 mt-0.5"
											style="background: {COMPARISON_COLORS[colorIdx]}"
										></span>
									{:else}
										<span class="inline-block w-2.5 h-2.5 rounded-full border border-gray-600 flex-shrink-0 mt-0.5"></span>
									{/if}
									<div class="min-w-0">
										<p class="font-medium leading-snug truncate">{act.name}</p>
										<p class="text-xs text-gray-400 mt-0.5">
											{fmtDate(act.start_date)} · {fmtKm(act.distance_m)}
										</p>
										<p class="text-xs text-gray-500 mt-0.5">
											{fmtSpeed(act.avg_speed_ms)}
											{#if act.avg_hr} · {Math.round(act.avg_hr)} bpm{/if}
											{#if act.start_distance_km < 1} · Start ~{(act.start_distance_km * 1000).toFixed(0)} m{:else} · Start ~{act.start_distance_km.toFixed(1)} km{/if}
										</p>
									</div>
								</div>
							</button>
						{/each}
					</div>
				</div>
			</div>

			<!-- === Rechte Spalte: Karte + Charts === -->
			<div class="lg:col-span-2 space-y-4">

				<!-- Karte -->
				<div bind:this={mapContainer} class="h-72 rounded-xl overflow-hidden border border-gray-800 z-0"></div>

				<!-- Legende -->
				{#if chartTracks().length > 0}
					<div class="flex flex-wrap gap-3">
						{#each chartTracks() as t}
							<div class="flex items-center gap-1.5 text-xs text-gray-300">
								<span class="inline-block w-3 h-1.5 rounded-full" style="background: {t.color}"></span>
								<span class="truncate max-w-[160px]">{t.label}</span>
							</div>
						{/each}
					</div>
				{/if}

				<!-- Charts -->
				{#if chartTracks().length > 0}
					<div class="rounded-xl border border-gray-800 bg-[var(--t-surface)] p-4 space-y-4">
						<ComparisonChart
							tracks={chartTracks()}
							valueKey="altitude_m"
							title="Höhe"
							unit="m"
						/>
						<ComparisonChart
							tracks={chartTracks()}
							valueKey="speed_ms"
							title="Geschwindigkeit"
							unit="km/h"
							transform={(v) => v * 3.6}
						/>
						<ComparisonChart
							tracks={chartTracks()}
							valueKey="hr"
							title="Herzfrequenz"
							unit="bpm"
						/>
					</div>
				{/if}

				<!-- Stats-Tabelle -->
				{#if selectedIds.length > 0}
					<div class="rounded-xl border border-gray-800 bg-[var(--t-surface)] overflow-x-auto">
						<table class="w-full text-sm">
							<thead>
								<tr class="border-b border-gray-800 text-left text-xs text-gray-500 uppercase tracking-wide">
									<th class="px-3 py-2 font-medium">Aktivität</th>
									<th class="px-3 py-2 font-medium">Datum</th>
									<th class="px-3 py-2 font-medium">Distanz</th>
									<th class="px-3 py-2 font-medium">Zeit</th>
									<th class="px-3 py-2 font-medium">Ø Speed</th>
									<th class="px-3 py-2 font-medium">Ø HR</th>
									<th class="px-3 py-2 font-medium">Höhenmeter</th>
								</tr>
							</thead>
							<tbody>
								<!-- Referenz -->
								<tr class="border-b border-gray-800/50 bg-orange-500/5">
									<td class="px-3 py-2 flex items-center gap-2">
										<span class="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0" style="background: {COMPARISON_COLORS[0]}"></span>
										<span class="truncate max-w-[140px] font-medium">{refActivity.name}</span>
									</td>
									<td class="px-3 py-2 text-gray-300">{fmtDate(refActivity.start_date)}</td>
									<td class="px-3 py-2 text-gray-300">{fmtKm(refActivity.distance_m)}</td>
									<td class="px-3 py-2 text-gray-300">{fmtTime(refActivity.moving_time_s)}</td>
									<td class="px-3 py-2 text-gray-300">{fmtSpeed(refActivity.avg_speed_ms)}</td>
									<td class="px-3 py-2 text-gray-300">{fmtHr(refActivity.avg_hr)}</td>
									<td class="px-3 py-2 text-gray-300">{fmtElev(refActivity.elevation_gain_m)}</td>
								</tr>
								<!-- Ausgewählte -->
								{#each selectedIds as id, i}
									{@const act = similarList.find(a => a.id === id)}
									{#if act}
										<tr class="border-b border-gray-800/50 hover:bg-white/5">
											<td class="px-3 py-2">
												<div class="flex items-center gap-2">
													<span class="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0" style="background: {COMPARISON_COLORS[(i + 1) % COMPARISON_COLORS.length]}"></span>
													<span class="truncate max-w-[140px]">{act.name}</span>
												</div>
											</td>
											<td class="px-3 py-2 text-gray-300">{fmtDate(act.start_date)}</td>
											<td class="px-3 py-2 text-gray-300">{fmtKm(act.distance_m)}</td>
											<td class="px-3 py-2 text-gray-300">{fmtTime(act.moving_time_s)}</td>
											<td class="px-3 py-2 text-gray-300">{fmtSpeed(act.avg_speed_ms)}</td>
											<td class="px-3 py-2 text-gray-300">{fmtHr(act.avg_hr)}</td>
											<td class="px-3 py-2 text-gray-300">{fmtElev(act.elevation_gain_m)}</td>
										</tr>
									{/if}
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>
