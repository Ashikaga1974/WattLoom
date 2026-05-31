<script lang="ts">
	import type { TrackPoint } from './api';
	import { smoothArea, smoothLine } from './chart-utils';

	let { points, totalDistanceM, onhover }: {
		points: TrackPoint[];
		totalDistanceM: number;
		onhover?: (origIdx: number | null) => void;
	} = $props();

	const valid       = $derived(points.filter(p => p.altitude_m !== null));
	const validOrigIdx = $derived(
		points.reduce<number[]>((acc, p, i) => { if (p.altitude_m !== null) acc.push(i); return acc; }, [])
	);
	let hoverIdx = $state<number | null>(null);

	const alts    = $derived(valid.map(p => p.altitude_m as number));
	const minAlt  = $derived(alts.length ? Math.min(...alts) : 0);
	const maxAlt  = $derived(alts.length ? Math.max(...alts) : 0);
	const altRange = $derived(Math.max(maxAlt - minAlt, 1));

	// SVG-Dimensionen (viewBox-Koordinaten)
	const W = 1000;
	const H = 180;
	const PAD_LEFT   = 48;
	const PAD_RIGHT  = 12;
	const PAD_TOP    = 12;
	const PAD_BOTTOM = 28;
	const chartW = $derived(W - PAD_LEFT - PAD_RIGHT);
	const chartH = $derived(H - PAD_TOP - PAD_BOTTOM);

	// Hilfsfunktionen: Punkt → SVG-Koordinate
	function xOf(i: number) {
		return PAD_LEFT + (i / (valid.length - 1)) * chartW;
	}
	function yOf(alt: number) {
		return PAD_TOP + chartH - ((alt - minAlt) / altRange) * chartH;
	}

	const coords = $derived(valid.map((p, i) => [xOf(i), yOf(p.altitude_m as number)] as [number, number]));
	const pathArea = $derived(smoothArea(coords, PAD_TOP + chartH));
	const pathLine = $derived(smoothLine(coords));

	// Y-Achsen-Labels (3–4 Stufen)
	const yLabels = $derived(() => {
		const steps = 4;
		return Array.from({ length: steps + 1 }, (_, i) => {
			const alt = minAlt + (altRange / steps) * i;
			const y   = yOf(alt);
			return { alt: Math.round(alt), y };
		});
	});

	// X-Achsen-Labels (km)
	const totalKm = $derived(totalDistanceM / 1000);
	const xLabels = $derived(() => {
		const count = Math.min(6, Math.floor(totalKm));
		if (count < 1) return [];
		const step = totalKm / count;
		return Array.from({ length: count + 1 }, (_, i) => {
			const km = i * step;
			const x  = PAD_LEFT + (km / totalKm) * chartW;
			return { km: Math.round(km), x };
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

	const elevationGain = $derived(() => {
		let gain = 0;
		for (let i = 1; i < alts.length; i++) {
			const diff = alts[i] - alts[i - 1];
			if (diff > 0) gain += diff;
		}
		return Math.round(gain);
	});
</script>

{#if valid.length < 2}
	<p class="text-sm text-gray-500">Keine Höhendaten verfügbar.</p>
{:else}
	<div class="space-y-1">
		<div class="flex items-center justify-between text-xs text-gray-500 mb-1">
			<span>Höhenprofil</span>
			<span>{minAlt.toFixed(0)} – {maxAlt.toFixed(0)} m · +{elevationGain()} m</span>
		</div>
		<svg viewBox="0 0 {W} {H}" class="w-full" style="height: 140px"
			onmousemove={onMove} onmouseleave={onLeave} role="presentation">
			<defs>
				<linearGradient id="elevGrad" x1="0" y1="0" x2="0" y2="1">
					<stop offset="0%"   stop-color="#fc4c02" stop-opacity="0.6" />
					<stop offset="100%" stop-color="#fc4c02" stop-opacity="0.05" />
				</linearGradient>
			</defs>

			<!-- Gitternetz -->
			{#each yLabels() as { y }}
				<line
					x1={PAD_LEFT} y1={y.toFixed(1)}
					x2={W - PAD_RIGHT} y2={y.toFixed(1)}
					stroke="var(--chart-line)" stroke-width="0.5"
				/>
			{/each}

			<!-- Gefüllte Fläche -->
			<path d={pathArea} fill="url(#elevGrad)" />

			<!-- Linie oben -->
			<path d={pathLine} fill="none" stroke="#fc4c02" stroke-width="1.5" stroke-linejoin="round"/>

			<!-- Y-Achse Labels -->
			{#each yLabels() as { alt, y }}
				<text
					x={PAD_LEFT - 4} y={y + 4}
					font-size="11" fill="var(--chart-text)" text-anchor="end"
				>{alt}</text>
			{/each}

			<!-- X-Achse Labels -->
			{#each xLabels() as { km, x }}
				<text
					x={x} y={H - 6}
					font-size="11" fill="var(--chart-text)" text-anchor="middle"
				>{km} km</text>
			{/each}

			<!-- Hover-Punkt -->
			{#if hoverIdx != null}
				<circle cx={xOf(hoverIdx).toFixed(1)} cy={yOf(valid[hoverIdx].altitude_m as number).toFixed(1)}
					r="4" fill="#fc4c02" stroke="#fff" stroke-width="1.5"/>
			{/if}

			<!-- Rahmen-Linie X-Achse -->
			<line
				x1={PAD_LEFT} y1={PAD_TOP + chartH}
				x2={W - PAD_RIGHT} y2={PAD_TOP + chartH}
				stroke="var(--chart-line)" stroke-width="0.8"
			/>
		</svg>
	</div>
{/if}
