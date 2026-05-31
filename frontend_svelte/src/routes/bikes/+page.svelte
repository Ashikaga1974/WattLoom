<script lang="ts">
	import { onMount } from 'svelte';
	import { api, type Bike } from '$lib/api';
	import PageHeader from '$lib/PageHeader.svelte';

	let bikes = $state<Bike[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);

	onMount(async () => {
		try {
			bikes = await api.bikes();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Fehler beim Laden';
		} finally {
			loading = false;
		}
	});
</script>

<div class="space-y-6">
	<PageHeader title="Bikes" />

	{#if error}
		<div class="rounded bg-red-900/50 border border-red-700 p-4 text-red-300 text-sm">{error}</div>
	{:else if loading}
		<div class="grid md:grid-cols-2 gap-4">
			{#each Array(2) as _}
				<div class="h-40 bg-gray-800/50 animate-pulse rounded-xl"></div>
			{/each}
		</div>
	{:else}
		<div class="grid md:grid-cols-2 gap-4">
			{#each bikes as bike}
				<div class="rounded-xl bg-gray-800 p-6 flex flex-col gap-4">
					<!-- Bike-Header -->
					<div class="flex items-start justify-between">
						<div>
							<h2 class="text-xl font-bold">{bike.name}</h2>
							{#if (bike.brand || bike.model) && `${bike.brand ?? ''} ${bike.model ?? ''}`.trim() !== bike.name}
								<p class="text-sm text-gray-400 mt-0.5">{bike.brand ?? ''} {bike.model ?? ''}</p>
							{/if}
							{#if bike.description}
								<p class="text-sm text-gray-500 mt-1">{bike.description}</p>
							{/if}
						</div>
						{#if bike.retired}
							<span class="text-xs bg-gray-700 text-gray-400 px-2 py-1 rounded">Ausgemustert</span>
						{/if}
					</div>

					<!-- Kennzahlen -->
					<div class="grid grid-cols-2 gap-3">
						<div class="rounded-lg bg-gray-700/50 px-4 py-3">
							<p class="text-xs text-gray-400 uppercase tracking-wider">Rides</p>
							<p class="text-2xl font-bold mt-0.5 text-orange-400">{bike.ride_count}</p>
						</div>
						{#if bike.distance_m}
							<div class="rounded-lg bg-gray-700/50 px-4 py-3">
								<p class="text-xs text-gray-400 uppercase tracking-wider">Gesamtdistanz</p>
								<p class="text-2xl font-bold mt-0.5">{Math.round(bike.distance_m / 1000).toLocaleString('de-DE')} <span class="text-sm font-normal text-gray-400">km</span></p>
							</div>
						{/if}
					</div>

					<!-- Link zu gefilterten Aktivitäten -->
					<a
						href="/activities?bike={bike.id}"
						class="inline-flex items-center gap-1 text-sm text-orange-400 hover:underline mt-auto"
					>
						Alle Aktivitäten ansehen →
					</a>
				</div>
			{/each}

			{#if bikes.length === 0}
				<p class="text-gray-500 col-span-2">Keine Bikes gefunden.</p>
			{/if}
		</div>
	{/if}
</div>
