<script lang="ts">
	import type { ZoneInfo } from '$lib/api';

	let { zones, title, unit }: { zones: ZoneInfo[]; title: string; unit: string } = $props();

	// Zeit formatieren: < 3600s → "mm:ss", sonst "h:mm:ss"
	function fmtTime(s: number): string {
		if (s < 3600) {
			const m = Math.floor(s / 60);
			const sec = s % 60;
			return `${m}:${String(sec).padStart(2, '0')}`;
		}
		const h = Math.floor(s / 3600);
		const m = Math.floor((s % 3600) / 60);
		const sec = s % 60;
		return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
	}

	// Range-Text je nach vorhandenen Feldern zusammenbauen
	function rangeText(z: ZoneInfo): string {
		if (z.min_bpm !== undefined && z.max_bpm !== undefined) return `${z.min_bpm}–${z.max_bpm} ${unit}`;
		if (z.min_bpm !== undefined) return `≥ ${z.min_bpm} ${unit}`;
		if (z.min_w !== undefined && z.max_w !== undefined) return `${z.min_w}–${z.max_w} ${unit}`;
		if (z.min_w !== undefined) return `≥ ${z.min_w} ${unit}`;
		return '';
	}
</script>

<div class="space-y-1.5">
	<p class="text-sm font-semibold text-gray-300 mb-2">{title}</p>

	{#each zones as z}
		<div class="flex items-center gap-2 {z.seconds === 0 ? 'opacity-40' : ''}">
			<!-- Zonen-Badge -->
			<span class="w-6 text-xs font-bold text-right text-gray-500">Z{z.zone}</span>

			<!-- Label + Range -->
			<div class="w-36 min-w-0">
				<span class="text-xs font-semibold text-gray-300 truncate block leading-tight">{z.label}</span>
				{#if rangeText(z)}
					<span class="text-xs text-gray-500 leading-tight">{rangeText(z)}</span>
				{/if}
			</div>

			<!-- Balken -->
			<div class="flex-1 h-3 bg-gray-700 rounded-full overflow-hidden">
				<div
					class="h-full rounded-full transition-all"
					style="width: {z.pct}%; background: {z.color}"
				></div>
			</div>

			<!-- Zeit -->
			<span class="w-12 text-xs text-right text-gray-300 tabular-nums">{fmtTime(z.seconds)}</span>

			<!-- Prozent -->
			<span class="w-9 text-xs text-right text-gray-500 tabular-nums">{z.pct.toFixed(0)}%</span>
		</div>
	{/each}
</div>
