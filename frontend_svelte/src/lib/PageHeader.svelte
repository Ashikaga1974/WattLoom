<script lang="ts">
	interface Props {
		title: string;
		subtitle?: string;
		years?: string[];
		selectedYear?: string;
		allLabel?: string;
		onchange?: () => void;
	}

	let {
		title,
		subtitle,
		years = [],
		selectedYear = $bindable(''),
		allLabel = 'Alle Jahre',
		onchange,
	}: Props = $props();
</script>

<div class="flex flex-wrap items-center justify-between gap-4">
	<div>
		<h1 class="text-2xl font-bold">{title}</h1>
		{#if subtitle}
			<p class="text-xs text-gray-500 mt-0.5">{subtitle}</p>
		{/if}
	</div>
	{#if years.length > 0}
		<select
			bind:value={selectedYear}
			{onchange}
			class="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-orange-500"
		>
			<option value="">{allLabel}</option>
			{#each years as y}
				<option value={y}>{y}</option>
			{/each}
		</select>
	{/if}
</div>
