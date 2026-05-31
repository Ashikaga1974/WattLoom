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
		class="flex items-center text-gray-500 hover:text-orange-400 transition-colors"
		aria-label="Theme wechseln"
	>
		<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			<circle cx="12" cy="12" r="4"/>
			<path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
		</svg>
	</button>

	{#if open}
		<div class="bg-gray-900 border border-gray-700 rounded-lg shadow-xl absolute left-0 bottom-full mb-2 w-36 py-1 z-50">
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
