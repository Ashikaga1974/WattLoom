<script lang="ts">
	import type { TrackPoint } from '$lib/api';

	export interface TrackData {
		id: number;
		label: string;
		color: string;
		points: TrackPoint[];
	}

	let {
		tracks,
		valueKey,
		title,
		unit,
		transform = (v: number) => v,
	}: {
		tracks: TrackData[];
		valueKey: keyof TrackPoint;
		title: string;
		unit: string;
		transform?: (v: number) => number;
	} = $props();

	const W = 900;
	const H = 160;
	const PAD = { top: 10, right: 16, bottom: 26, left: 44 };
	const chartW = W - PAD.left - PAD.right;
	const chartH = H - PAD.top - PAD.bottom;

	const maxDistKm = $derived(() => {
		let max = 0;
		for (const t of tracks) {
			for (const p of t.points) {
				if (p.distance_m != null) max = Math.max(max, p.distance_m / 1000);
			}
		}
		return max || 1;
	});

	const allValues = $derived(() => {
		const vals: number[] = [];
		for (const t of tracks) {
			for (const p of t.points) {
				const v = p[valueKey];
				if (v != null && (v as number) > 0) vals.push(transform(v as number));
			}
		}
		return vals;
	});

	const minVal = $derived(() => allValues().length ? Math.min(...allValues()) * 0.95 : 0);
	const maxVal = $derived(() => allValues().length ? Math.max(...allValues()) * 1.05 : 100);

	function xOf(distKm: number): number {
		return PAD.left + (distKm / maxDistKm()) * chartW;
	}

	function yOf(val: number): number {
		const range = maxVal() - minVal() || 1;
		return PAD.top + chartH - ((val - minVal()) / range) * chartH;
	}

	function pathFor(track: TrackData): string {
		const valid = track.points.filter(
			p => p.distance_m != null && p[valueKey] != null && (p[valueKey] as number) > 0
		);
		if (valid.length < 2) return '';
		return valid
			.map((p, i) => {
				const x = xOf((p.distance_m as number) / 1000).toFixed(1);
				const y = yOf(transform(p[valueKey] as number)).toFixed(1);
				return `${i === 0 ? 'M' : 'L'}${x},${y}`;
			})
			.join('');
	}

	const yTicks = $derived(() => {
		const min = minVal(), max = maxVal();
		const range = max - min;
		const step = range <= 10 ? 2 : range <= 30 ? 5 : range <= 80 ? 10 : range <= 200 ? 20 : range <= 500 ? 50 : 100;
		const start = Math.ceil(min / step) * step;
		const ticks: number[] = [];
		for (let v = start; v <= max; v += step) ticks.push(Math.round(v));
		return ticks;
	});

	const xTicks = $derived(() => {
		const max = maxDistKm();
		const step = max <= 15 ? 5 : max <= 40 ? 10 : max <= 80 ? 20 : 50;
		const ticks: number[] = [];
		for (let v = 0; v <= max; v += step) ticks.push(v);
		return ticks;
	});
</script>

<div>
	<p class="text-xs text-gray-400 mb-1 font-medium">{title} <span class="text-gray-600">({unit})</span></p>
	<svg viewBox="0 0 {W} {H}" class="w-full" style="height: {H}px">
		<!-- Gitternetz -->
		{#each yTicks() as v}
			<line
				x1={PAD.left} y1={yOf(v).toFixed(1)}
				x2={W - PAD.right} y2={yOf(v).toFixed(1)}
				stroke="var(--chart-line)" stroke-width="0.5"
			/>
			<text x={PAD.left - 4} y={yOf(v) + 4} font-size="9" fill="var(--chart-text)" text-anchor="end">{v}</text>
		{/each}

		<!-- X-Achse -->
		{#each xTicks() as v}
			<text x={xOf(v).toFixed(1)} y={H - 8} font-size="9" fill="var(--chart-text)" text-anchor="middle">{v}</text>
			{#if v > 0}
				<line
					x1={xOf(v).toFixed(1)} y1={PAD.top}
					x2={xOf(v).toFixed(1)} y2={PAD.top + chartH}
					stroke="var(--chart-line)" stroke-width="0.5"
				/>
			{/if}
		{/each}

		<!-- Basislinie -->
		<line
			x1={PAD.left} y1={PAD.top + chartH}
			x2={W - PAD.right} y2={PAD.top + chartH}
			stroke="var(--chart-line)" stroke-width="1"
		/>

		<!-- Track-Linien -->
		{#each tracks as track}
			<path d={pathFor(track)} fill="none" stroke={track.color} stroke-width="2" stroke-linejoin="round" stroke-linecap="round" opacity="0.85" />
		{/each}
	</svg>
</div>
