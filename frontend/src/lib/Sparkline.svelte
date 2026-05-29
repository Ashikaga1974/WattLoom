<script lang="ts">
	let { values, labels, formatValue, color = '#fc4c02' }: {
		values: number[];
		labels?: string[];
		formatValue?: (v: number) => string;
		color?: string;
	} = $props();

	const W = 120, H = 28, GAP = 2;

	const max = $derived(Math.max(...values, 1));
	const barW = $derived((W - GAP * (values.length - 1)) / values.length);

	function barX(i: number) { return i * (barW + GAP); }
	function barH(v: number) { return Math.max(2, (v / max) * H); }
	function barY(v: number) { return H - barH(v); }

	let hoverIdx = $state<number | null>(null);
	let mouseX = $state(0);
	let mouseY = $state(0);

	function onEnter(e: MouseEvent, i: number) {
		hoverIdx = i;
		mouseX = e.clientX;
		mouseY = e.clientY;
	}
	function onMoveRect(e: MouseEvent) {
		mouseX = e.clientX;
		mouseY = e.clientY;
	}

	function barFill(i: number): string {
		if (hoverIdx === null) return i === values.length - 1 ? color : `${color}66`;
		if (i === hoverIdx) return color;
		return `${color}33`;
	}
</script>

{#if hoverIdx !== null}
	<div class="fixed z-50 pointer-events-none -translate-x-1/2 -translate-y-full"
		style="left:{mouseX}px; top:{mouseY - 6}px">
		<div class="bg-gray-900 border border-gray-700 rounded px-2 py-0.5 text-xs whitespace-nowrap shadow-lg">
			{#if labels?.[hoverIdx]}<span class="text-gray-400">{labels[hoverIdx]}</span><span class="mx-1 text-gray-600">·</span>{/if}
			<span class="text-white font-medium">{formatValue ? formatValue(values[hoverIdx]) : values[hoverIdx]}</span>
		</div>
	</div>
{/if}

<svg viewBox="0 0 {W} {H}" class="w-full" style="height:28px" aria-hidden="true"
	onmouseleave={() => (hoverIdx = null)}>
	{#each values as v, i}
		<rect
			x={barX(i).toFixed(1)}
			y={barY(v).toFixed(1)}
			width={barW.toFixed(1)}
			height={barH(v).toFixed(1)}
			rx="1.5"
			fill={barFill(i)}
			stroke={hoverIdx === i ? '#ffffff44' : 'none'}
			stroke-width="1"
			style="cursor:default"
			onmouseenter={(e) => onEnter(e, i)}
			onmousemove={onMoveRect}
		/>
	{/each}
</svg>
