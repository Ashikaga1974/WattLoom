<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { api } from '$lib/api';

	let mapContainer: HTMLDivElement;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let mapInstance: any = null;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let heatLayer: any = null;

	let loading = $state(true);
	let error = $state<string | null>(null);
	let pointCount = $state(0);
	let selectedYear = $state<string>('');
	let availableYears = $state<string[]>([]);

	async function loadAndRender() {
		loading = true;
		error = null;
		try {
			// Jahre aus Stats holen (nur beim ersten Mal)
			if (availableYears.length === 0) {
				const stats = await api.activityStats();
				availableYears = stats.available_years;
			}

			const year = selectedYear ? Number(selectedYear) : undefined;
			const data = await api.heatmap(20, year);
			pointCount = data.count;

			if (heatLayer && mapInstance) {
				mapInstance.removeLayer(heatLayer);
			}

			// leaflet.heat hat keine sauberen ESM-Types – dynamisch laden
			const L = (await import('leaflet')).default;
			await import('leaflet/dist/leaflet.css');
			// @ts-expect-error leaflet.heat erweitert L global nach dem Import
			await import('leaflet.heat');

			if (!mapInstance) {
				mapInstance = L.map(mapContainer, { zoomControl: true });
				L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
					attribution: '© OpenStreetMap',
					maxZoom: 19,
				}).addTo(mapInstance);
				mapInstance.invalidateSize();
			}

			if (data.points.length === 0) {
				mapInstance.setView([51.0, 10.0], 6);
				return;
			}

			// Bounding Box: Median ±5° als Toleranz, um GPS-Ausreißer zu ignorieren
			const sortedLats = [...data.points.map((p: [number, number]) => p[0])].sort((a, b) => a - b);
			const sortedLons = [...data.points.map((p: [number, number]) => p[1])].sort((a, b) => a - b);
			const medLat = sortedLats[Math.floor(sortedLats.length / 2)];
			const medLon = sortedLons[Math.floor(sortedLons.length / 2)];
			const tolerance = 5;
			let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
			for (const [lat, lon] of data.points) {
				if (Math.abs(lat - medLat) > tolerance || Math.abs(lon - medLon) > tolerance) continue;
				if (lat < minLat) minLat = lat;
				if (lat > maxLat) maxLat = lat;
				if (lon < minLon) minLon = lon;
				if (lon > maxLon) maxLon = lon;
			}
			mapInstance.fitBounds([[minLat, minLon], [maxLat, maxLon]], { padding: [40, 40] });

			// @ts-expect-error L.heatLayer kommt von leaflet.heat
			heatLayer = L.heatLayer(data.points, {
				radius: 8,
				blur: 12,
				maxZoom: 17,
				gradient: { 0.2: '#1e40af', 0.4: '#0ea5e9', 0.6: '#22c55e', 0.8: '#eab308', 1.0: '#ef4444' },
			}).addTo(mapInstance);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Fehler beim Laden';
		} finally {
			loading = false;
		}
	}

	onMount(loadAndRender);

	onDestroy(() => {
		if (mapInstance) { mapInstance.remove(); mapInstance = null; }
	});
</script>

<svelte:head>
	<title>Heatmap – MyBiking</title>
</svelte:head>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<h1 class="text-2xl font-bold">Heatmap</h1>
		<div class="flex items-center gap-3">
			{#if !loading}
				<span class="text-xs text-gray-500">{pointCount.toLocaleString('de-DE')} Punkte</span>
			{/if}
			<select
				bind:value={selectedYear}
				onchange={loadAndRender}
				class="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-orange-500"
			>
				<option value="">Alle Jahre</option>
				{#each availableYears as y}
					<option value={y}>{y}</option>
				{/each}
			</select>
		</div>
	</div>

	{#if error}
		<div class="rounded bg-red-900/50 border border-red-700 p-4 text-red-300 text-sm">{error}</div>
	{/if}

	<div class="relative">
		{#if loading}
			<div class="absolute inset-0 z-10 flex items-center justify-center bg-gray-900/70 rounded-xl">
				<div class="text-gray-300 text-sm">Lade Track-Daten…</div>
			</div>
		{/if}
		<div
			bind:this={mapContainer}
			class="h-[calc(100vh-12rem)] min-h-96 rounded-xl overflow-hidden border border-gray-800"
		></div>
	</div>
</div>
