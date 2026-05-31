<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { themeStore } from '$lib/theme.svelte';
	import { tzStore } from '$lib/tz.svelte';
	import ThemeSwitcher from '$lib/ThemeSwitcher.svelte';

	let { children } = $props();

	const p = $derived($page.url.pathname);

	const isAktivitaeten = $derived(
		p.startsWith('/activities') || p === '/calendar' || p === '/best'
	);
	const isAnalyse = $derived(
		['/training', '/compare', '/form', '/stats', '/hrcurve', '/timeheatmap', '/speedhr', '/progress', '/ftp', '/tempcorr', '/wrapped', '/cadence', '/fatigue-index']
			.some(r => p.startsWith(r))
	);
	const isKarte        = $derived(p === '/heatmap' || p.startsWith('/strecken') || p.startsWith('/routes'));
	const isBikes        = $derived(p.startsWith('/bikes'));
	const isDash         = $derived(p === '/');
	const isBerechnungen = $derived(p === '/berechnungen');

	const isVolumen     = $derived(['/progress', '/training', '/compare', '/fatigue-index'].some(r => p.startsWith(r)));
	const isLeistung    = $derived(['/ftp', '/hrcurve', '/cadence'].some(r => p.startsWith(r)));
	const isForm        = $derived(p.startsWith('/form'));
	const isAnalysen    = $derived(['/speedhr', '/tempcorr', '/timeheatmap'].some(r => p.startsWith(r)));
	const isStatistiken = $derived(['/stats', '/wrapped'].some(r => p.startsWith(r)));

	onMount(() => {
		themeStore.init();
		tzStore.load();
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="min-h-screen bg-gray-950 text-gray-100">

	<!-- Fixierte Sidebar -->
	<aside class="fixed inset-y-0 left-0 w-52 flex flex-col bg-gray-900 border-r border-gray-700 z-50">

		<!-- Logo -->
		<div class="h-14 shrink-0 flex items-center px-4 border-b border-gray-700">
			<a href="/" class="font-bold text-orange-400 text-lg tracking-tight">MyBiking</a>
		</div>

		<!-- Navigation -->
		<nav class="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">

			<!-- Dashboard -->
			<a href="/"
				class="flex items-center px-3 py-2 text-sm rounded-md transition-colors hover:text-orange-400 hover:bg-gray-800"
				class:text-orange-400={isDash}
				class:font-medium={isDash}
				class:text-gray-300={!isDash}
			>Dashboard</a>

			<!-- Aktivitäten -->
			<div>
				<a href="/activities"
					class="flex items-center px-3 py-2 text-sm rounded-md transition-colors hover:text-orange-400 hover:bg-gray-800"
					class:text-orange-400={isAktivitaeten}
					class:font-medium={isAktivitaeten}
					class:text-gray-300={!isAktivitaeten}
				>Aktivitäten</a>
				{#if isAktivitaeten}
					<div class="mt-0.5 border-l border-gray-700 ml-4 pl-2 space-y-0.5">
						{#each [
							{ href: '/activities', label: 'Liste' },
							{ href: '/calendar',   label: 'Kalender' },
							{ href: '/best',       label: 'Best of' },
						] as item}
							<a href={item.href}
								class="flex items-center px-2 py-1.5 text-xs rounded transition-colors hover:text-orange-300"
								class:text-orange-300={p.startsWith(item.href)}
								class:text-gray-500={!p.startsWith(item.href)}
							>{item.label}</a>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Karte -->
			<div>
				<a href="/heatmap"
					class="flex items-center px-3 py-2 text-sm rounded-md transition-colors hover:text-orange-400 hover:bg-gray-800"
					class:text-orange-400={isKarte}
					class:font-medium={isKarte}
					class:text-gray-300={!isKarte}
				>Karte</a>
				{#if isKarte}
					<div class="mt-0.5 border-l border-gray-700 ml-4 pl-2 space-y-0.5">
						{#each [
							{ href: '/heatmap',  label: 'Heatmap' },
							{ href: '/routes',   label: 'Top-Strecken' },
							{ href: '/strecken', label: 'Streckenvergleich' },
						] as item}
							<a href={item.href}
								class="flex items-center px-2 py-1.5 text-xs rounded transition-colors hover:text-orange-300"
								class:text-orange-300={p.startsWith(item.href)}
								class:text-gray-500={!p.startsWith(item.href)}
							>{item.label}</a>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Analyse -->
			<div>
				<a href="/progress"
					class="flex items-center px-3 py-2 text-sm rounded-md transition-colors hover:text-orange-400 hover:bg-gray-800"
					class:text-orange-400={isAnalyse}
					class:font-medium={isAnalyse}
					class:text-gray-300={!isAnalyse}
				>Analyse</a>
				{#if isAnalyse}
					<div class="mt-0.5 border-l border-gray-700 ml-4 pl-2 space-y-0.5">

						<!-- Volumen -->
						<div>
							<a href="/progress"
								class="flex items-center px-2 py-1.5 text-xs rounded transition-colors hover:text-orange-300"
								class:text-orange-300={isVolumen}
								class:text-gray-500={!isVolumen}
							>Volumen</a>
							{#if isVolumen}
								<div class="border-l border-gray-700 ml-2 pl-2 space-y-0.5">
									{#each [
										{ href: '/progress',       label: 'Jahresfortschritt' },
										{ href: '/training',       label: 'Training' },
										{ href: '/compare',        label: 'Jahresvergleich' },
										{ href: '/fatigue-index',  label: 'Ermüdung' },
									] as item}
										<a href={item.href}
											class="flex items-center px-2 py-1 text-xs rounded transition-colors hover:text-orange-200"
											class:text-orange-200={p.startsWith(item.href)}
											class:text-gray-600={!p.startsWith(item.href)}
										>{item.label}</a>
									{/each}
								</div>
							{/if}
						</div>

						<!-- Leistung -->
						<div>
							<a href="/ftp"
								class="flex items-center px-2 py-1.5 text-xs rounded transition-colors hover:text-orange-300"
								class:text-orange-300={isLeistung}
								class:text-gray-500={!isLeistung}
							>Leistung</a>
							{#if isLeistung}
								<div class="border-l border-gray-700 ml-2 pl-2 space-y-0.5">
									{#each [
										{ href: '/ftp',     label: 'FTP' },
										{ href: '/hrcurve', label: 'HR-Kurve' },
										{ href: '/cadence', label: 'Kadenz' },
									] as item}
										<a href={item.href}
											class="flex items-center px-2 py-1 text-xs rounded transition-colors hover:text-orange-200"
											class:text-orange-200={p.startsWith(item.href)}
											class:text-gray-600={!p.startsWith(item.href)}
										>{item.label}</a>
									{/each}
								</div>
							{/if}
						</div>

						<!-- Form -->
						<a href="/form"
							class="flex items-center px-2 py-1.5 text-xs rounded transition-colors hover:text-orange-300"
							class:text-orange-300={isForm}
							class:text-gray-500={!isForm}
						>Form</a>

						<!-- Analysen -->
						<div>
							<a href="/speedhr"
								class="flex items-center px-2 py-1.5 text-xs rounded transition-colors hover:text-orange-300"
								class:text-orange-300={isAnalysen}
								class:text-gray-500={!isAnalysen}
							>Analysen</a>
							{#if isAnalysen}
								<div class="border-l border-gray-700 ml-2 pl-2 space-y-0.5">
									{#each [
										{ href: '/speedhr',     label: 'Speed–HR' },
										{ href: '/tempcorr',    label: 'Temperatur' },
										{ href: '/timeheatmap', label: 'Tageszeit' },
									] as item}
										<a href={item.href}
											class="flex items-center px-2 py-1 text-xs rounded transition-colors hover:text-orange-200"
											class:text-orange-200={p.startsWith(item.href)}
											class:text-gray-600={!p.startsWith(item.href)}
										>{item.label}</a>
									{/each}
								</div>
							{/if}
						</div>

						<!-- Statistiken -->
						<div>
							<a href="/stats"
								class="flex items-center px-2 py-1.5 text-xs rounded transition-colors hover:text-orange-300"
								class:text-orange-300={isStatistiken}
								class:text-gray-500={!isStatistiken}
							>Statistiken</a>
							{#if isStatistiken}
								<div class="border-l border-gray-700 ml-2 pl-2 space-y-0.5">
									{#each [
										{ href: '/stats',   label: 'Verteilungen' },
										{ href: '/wrapped', label: 'Jahresrückblick' },
									] as item}
										<a href={item.href}
											class="flex items-center px-2 py-1 text-xs rounded transition-colors hover:text-orange-200"
											class:text-orange-200={p.startsWith(item.href)}
											class:text-gray-600={!p.startsWith(item.href)}
										>{item.label}</a>
									{/each}
								</div>
							{/if}
						</div>

					</div>
				{/if}
			</div>

			<!-- Bikes -->
			<div>
				<a href="/bikes"
					class="flex items-center px-3 py-2 text-sm rounded-md transition-colors hover:text-orange-400 hover:bg-gray-800"
					class:text-orange-400={isBikes}
					class:font-medium={isBikes}
					class:text-gray-300={!isBikes}
				>Bikes</a>
				{#if isBikes}
					<div class="mt-0.5 border-l border-gray-700 ml-4 pl-2 space-y-0.5">
						{#each [
							{ href: '/bikes',         label: 'Übersicht' },
							{ href: '/bikes/compare', label: 'Bike-Vergleich' },
						] as item}
							<a href={item.href}
								class="flex items-center px-2 py-1.5 text-xs rounded transition-colors hover:text-orange-300"
								class:text-orange-300={p === item.href}
								class:text-gray-500={p !== item.href}
							>{item.label}</a>
						{/each}
					</div>
				{/if}
			</div>

		</nav>

		<!-- Untere Icons: ThemeSwitcher, Berechnungen, Settings -->
		<div class="shrink-0 border-t border-gray-700 px-4 py-3 flex items-center gap-3">
			<ThemeSwitcher />

			<a href="/berechnungen" title="Berechnungen & Formeln"
				class="transition-colors hover:text-orange-400"
				class:text-orange-400={isBerechnungen}
				class:text-gray-500={!isBerechnungen}
			>
				<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>
				</svg>
			</a>

			<a href="/settings" title="Einstellungen"
				class="transition-colors hover:text-orange-400"
				class:text-orange-400={p === '/settings'}
				class:text-gray-500={p !== '/settings'}
			>
				<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
				</svg>
			</a>
		</div>

	</aside>

	<!-- Hauptinhalt, verschoben um Sidebar-Breite -->
	<main class="ml-52 min-h-screen px-6 py-6">
		{@render children()}
	</main>

</div>
