<script lang="ts">
	import type { TrackPoint } from './api';
	import { smoothArea, smoothLine } from './chart-utils';

	let { points, totalDistanceM, onhover }: {
		points: TrackPoint[];
		totalDistanceM: number;
		onhover?: (origIdx: number | null) => void;
	} = $props();

	const valid        = $derived(points.filter(p => p.speed_ms !== null && p.speed_ms > 0));
	const validOrigIdx = $derived(
		points.reduce<number[]>((acc, p, i) => { if (p.speed_ms != null && p.speed_ms > 0) acc.push(i); return acc; }, [])
	);
	let hoverIdx = $state<number | null>(null);

	const speeds   = $derived(valid.map(p => (p.speed_ms as number) * 3.6));
	const minSpd   = $derived(speeds.length ? Math.floor(Math.min(...speeds) / 5) * 5 : 0);
	const maxSpd   = $derived(speeds.length ? Math.ceil( Math.max(...speeds) / 5) * 5 : 40);
	const avgSpd   = $derived(speeds.length ? speeds.reduce((a, v) => a + v, 0) / speeds.length : 0);
	const spdRange = $derived(Math.max(maxSpd - minSpd, 1));

	const W = 1000;
	const H = 180;
	const PAD_LEFT   = 48;
	const PAD_RIGHT  = 12;
	const PAD_TOP    = 12;
	const PAD_BOTTOM = 28;
	const chartW = $derived(W - PAD_LEFT - PAD_RIGHT);
	const chartH = $derived(H - PAD_TOP - PAD_BOTTOM);

	function xOf(i: number) {
		return PAD_LEFT + (i / (valid.length - 1)) * chartW;
	}
	function yOf(kmh: number) {
		return PAD_TOP + chartH - ((kmh - minSpd) / spdRange) * chartH;
	}

	const coords = $derived(valid.map((p, i) => [xOf(i), yOf((p.speed_ms as number) * 3.6)] as [number, number]));
	const pathArea = $derived(smoothArea(coords, PAD_TOP + chartH));
	const pathLine = $derived(smoothLine(coords));

	const yLabels = $derived(() => {
		const steps = 4;
		return Array.from({ length: steps + 1 }, (_, i) => {
			const kmh = minSpd + (spdRange / steps) * i;
			return { kmh: Math.round(kmh), y: yOf(kmh) };
		});
	});

	function onMove(e: MouseEvent) {
		const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
		const svgX = (e.clientX - rect.left) * (W / rect.width) - PAD_LEFT;
		const idx = Math.max(0, Math.min(valid.length - 1, Math.round((svgX / chartW) * (valid.length - 1))));
		hoverIdx = idx;
		onhover?.(validOrigIdx[idx]);
	}
	function onLeave() { hoverIdx = null; onhover?.(null); }

	const totalKm = $derived(totalDistanceM / 1000);
	const xLabels = $derived(() => {
		const count = Math.min(6, Math.floor(totalKm));
		if (count < 1) return [];
		const step = totalKm / count;
		return Array.from({ length: count + 1 }, (_, i) => ({
			km: Math.round(i * step),
			x:  PAD_LEFT + ((i * step) / totalKm) * chartW,
		}));
	});
</script>

{#if valid.length < 2}
	<p class="text-sm text-gray-500">Keine Geschwindigkeitsdaten verfügbar.</p>
{:else}
	<div class="space-y-1">
		<div class="flex items-center justify-between text-xs text-gray-500 mb-1">
			<span>Geschwindigkeit</span>
			<span>{Math.min(...speeds).toFixed(1)} – {Math.max(...speeds).toFixed(1)} km/h · Ø {avgSpd.toFixed(1)} km/h</span>
		</div>
		<svg viewBox="0 0 {W} {H}" class="w-full" style="height: 140px"
			onmousemove={onMove} onmouseleave={onLeave} role="presentation">
			<defs>
				<linearGradient id="spdGrad" x1="0" y1="0" x2="0" y2="1">
					<stop offset="0%"   stop-color="#60a5fa" stop-opacity="0.6" />
					<stop offset="100%" stop-color="#60a5fa" stop-opacity="0.05" />
				</linearGradient>
			</defs>

			{#each yLabels() as { y }}
				<line x1={PAD_LEFT} y1={y.toFixed(1)} x2={W - PAD_RIGHT} y2={y.toFixed(1)}
					stroke="var(--chart-line)" stroke-width="0.5" />
			{/each}

			<path d={pathArea} fill="url(#spdGrad)" />
			<path d={pathLine} fill="none" stroke="#60a5fa" stroke-width="1.5" stroke-linejoin="round"/>

			{#each yLabels() as { kmh, y }}
				<text x={PAD_LEFT - 4} y={y + 4} font-size="11" fill="var(--chart-text)" text-anchor="end">{kmh}</text>
			{/each}

			{#each xLabels() as { km, x }}
				<text x={x} y={H - 6} font-size="11" fill="var(--chart-text)" text-anchor="middle">{km} km</text>
			{/each}

			<line x1={PAD_LEFT} y1={PAD_TOP + chartH} x2={W - PAD_RIGHT} y2={PAD_TOP + chartH}
				stroke="var(--chart-line)" stroke-width="0.8" />

			{#if hoverIdx != null}
				<circle cx={xOf(hoverIdx).toFixed(1)} cy={yOf((valid[hoverIdx].speed_ms as number) * 3.6).toFixed(1)}
					r="4" fill="#60a5fa" stroke="#fff" stroke-width="1.5"/>
			{/if}
		</svg>
	</div>
{/if}
