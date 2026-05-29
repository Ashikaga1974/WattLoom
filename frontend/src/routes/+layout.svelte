<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { themeStore } from '$lib/theme.svelte';
	import ThemeSwitcher from '$lib/ThemeSwitcher.svelte';

	let { children } = $props();

	const p = $derived($page.url.pathname);

	const isAktivitaeten = $derived(
		p.startsWith('/activities') || p === '/calendar' || p === '/best'
	);
	const isAnalyse = $derived(
		['/training', '/compare', '/form', '/stats', '/hrcurve', '/timeheatmap', '/speedhr', '/progress', '/ftp', '/tempcorr', '/berechnungen']
			.some(r => p.startsWith(r))
	);
	const isKarte   = $derived(p === '/heatmap');
	const isBikes    = $derived(p.startsWith('/bikes'));
	const isStrecken = $derived(p.startsWith('/strecken'));
	const isDash     = $derived(p === '/');

	onMount(() => {
		themeStore.init();
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="min-h-screen bg-gray-950 text-gray-100">

	<!-- Hauptnavigation -->
	<nav class="border-b border-gray-700 bg-gray-900 shadow-sm">
		<div class="mx-auto max-w-6xl px-4 flex items-center gap-7 h-14 w-full">
			<span class="font-bold text-orange-400 text-lg mr-1">MyBiking</span>

			<a href="/"
				class="text-sm transition-colors hover:text-orange-400"
				class:text-orange-400={isDash}
				class:text-gray-400={!isDash}
			>Dashboard</a>

			<a href="/activities"
				class="text-sm transition-colors hover:text-orange-400"
				class:text-orange-400={isAktivitaeten}
				class:text-gray-400={!isAktivitaeten}
			>Aktivitäten</a>

			<a href="/heatmap"
				class="text-sm transition-colors hover:text-orange-400"
				class:text-orange-400={isKarte}
				class:text-gray-400={!isKarte}
			>Karte</a>

			<a href="/progress"
				class="text-sm transition-colors hover:text-orange-400"
				class:text-orange-400={isAnalyse}
				class:text-gray-400={!isAnalyse}
			>Analyse</a>

			<a href="/bikes"
				class="text-sm transition-colors hover:text-orange-400"
				class:text-orange-400={isBikes}
				class:text-gray-400={!isBikes}
			>Bikes</a>

			<a href="/strecken"
				class="text-sm transition-colors hover:text-orange-400"
				class:text-orange-400={isStrecken}
				class:text-gray-400={!isStrecken}
			>Strecken</a>

			<div class="ml-auto flex items-center gap-3">
			<ThemeSwitcher />

			<a href="/settings" title="Einstellungen"
				class="text-gray-500 hover:text-orange-400 transition-colors"
				class:text-orange-400={p === '/settings'}
			>
				<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
				</svg>
			</a>
			</div>
		</div>
	</nav>

	<!-- Sub-Navigation: Aktivitäten -->
	{#if isAktivitaeten}
		<div class="border-b border-gray-700 bg-gray-800">
			<div class="mx-auto max-w-6xl px-4 flex items-center gap-5 h-9">
				{#each [
					{ href: '/activities', label: 'Liste' },
					{ href: '/calendar',   label: 'Kalender' },
					{ href: '/best',       label: 'Best of' },
				] as item}
					<a href={item.href}
						class="text-xs transition-colors hover:text-orange-300"
						class:text-orange-300={p.startsWith(item.href)}
						class:text-gray-500={!p.startsWith(item.href)}
					>{item.label}</a>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Sub-Navigation: Analyse -->
	{#if isAnalyse}
		<div class="border-b border-gray-700 bg-gray-800">
			<div class="mx-auto max-w-6xl px-4 flex items-center gap-5 h-9">
				{#each [
					{ href: '/progress',    label: 'Jahresfortschritt' },
					{ href: '/ftp',         label: 'FTP' },
					{ href: '/tempcorr',    label: 'Temperatur' },
					{ href: '/training',    label: 'Training' },
					{ href: '/compare',     label: 'Vergleich' },
					{ href: '/form',        label: 'Form' },
					{ href: '/stats',       label: 'Verteilungen' },
					{ href: '/hrcurve',     label: 'HR-Kurve' },
					{ href: '/timeheatmap', label: 'Tageszeit' },
					{ href: '/speedhr',      label: 'Speed–HR' },
					{ href: '/berechnungen', label: 'Berechnungen' },
				] as item}
					<a href={item.href}
						class="text-xs transition-colors hover:text-orange-300"
						class:text-orange-300={p.startsWith(item.href)}
						class:text-gray-500={!p.startsWith(item.href)}
					>{item.label}</a>
				{/each}
			</div>
		</div>
	{/if}

	<main class="mx-auto max-w-6xl px-4 py-6">
		{@render children()}
	</main>
</div>
