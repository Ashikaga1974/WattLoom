<script lang="ts">
	import { themeStore, THEMES } from '$lib/theme.svelte';

	// Dropdown-Zustand
	let open = $state(false);

	// Click-outside schließt das Panel
	$effect(() => {
		if (!open) return;

		function handleClick(e: MouseEvent) {
			// Schließen, wenn außerhalb geklickt wurde
			if (!(e.target as Element).closest('[data-theme-switcher]')) {
				open = false;
			}
		}

		document.addEventListener('click', handleClick);
		return () => document.removeEventListener('click', handleClick);
	});
</script>

<!-- Wrapper mit relative für die absolute Positionierung des Panels -->
<div class="relative" data-theme-switcher>
	<button
		onclick={() => (open = !open)}
		title="Theme wechseln"
		class="text-gray-500 hover:text-orange-400 transition-colors"
		aria-label="Theme wechseln"
	>
		<!-- Palette-Icon (18×18) -->
		<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			<circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/>
			<circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/>
			<circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/>
			<circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/>
			<path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>
		</svg>
	</button>

	{#if open}
		<div class="bg-gray-900 border border-gray-700 rounded-lg shadow-xl absolute right-0 top-8 w-36 py-1 z-50">
			{#each THEMES as theme}
				<button
					onclick={() => { themeStore.apply(theme.id); open = false; }}
					class="flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer hover:bg-gray-800 w-full text-left transition-colors"
					class:text-orange-400={themeStore.current === theme.id}
					class:text-gray-400={themeStore.current !== theme.id}
				>
					<!-- Farbvorschau-Swatch -->
					<span
						class="w-3.5 h-3.5 rounded-full border shrink-0"
						class:border-orange-400={themeStore.current === theme.id}
						class:border-gray-700={themeStore.current !== theme.id}
						style="background: {theme.color}"
					></span>
					{theme.label}
				</button>
			{/each}
		</div>
	{/if}
</div>
