<script lang="ts">
	import type { TrackPoint } from './api';
	import { smoothLineWithGaps, smoothArea } from './chart-utils';

	let { points, totalDistanceM, onhover }: {
		points: TrackPoint[];
		totalDistanceM: number;
		onhover?: (origIdx: number | null) => void;
	} = $props();

	const W = 1000, H = 220;
	const PAD = { left: 12, right: 12, top: 16, bottom: 28 };
	const cW = W - PAD.left - PAD.right;
	const cH = H - PAD.top - PAD.bottom;

	const alts = $derived(points.map(p => p.altitude_m));
	const spds = $derived(points.map(p => p.speed_ms != null ? p.speed_ms * 3.6 : null));
	const hrs  = $derived(points.map(p => p.hr));

	function valids(arr: (number | null)[]) {
		return arr.filter((v): v is number => v != null && v > 0);
	}

	const vAlts = $derived(valids(alts));
	const vSpds = $derived(valids(spds));
	const vHrs  = $derived(valids(hrs));

	const minAlt = $derived(vAlts.length ? Math.min(...vAlts) : 0);
	const maxAlt = $derived(vAlts.length ? Math.max(...vAlts) : 1);
	const minSpd = $derived(vSpds.length ? Math.min(...vSpds) : 0);
	const maxSpd = $derived(vSpds.length ? Math.max(...vSpds) : 1);
	const minHR  = $derived(vHrs.length  ? Math.min(...vHrs)  : 0);
	const maxHR  = $derived(vHrs.length  ? Math.max(...vHrs)  : 1);

	function norm(v: number, min: number, max: number) {
		return max > min ? Math.max(0, Math.min(1, (v - min) / (max - min))) : 0.5;
	}
	function xOf(i: number) { return PAD.left + (i / Math.max(1, points.length - 1)) * cW; }
	function yOf(n: number) { return PAD.top + cH * (1 - n); }

	const bot = $derived(PAD.top + cH);

	const altLine = $derived(smoothLineWithGaps(alts, xOf, v => yOf(norm(v, minAlt, maxAlt))));
	const spdLine = $derived(smoothLineWithGaps(spds, xOf, v => yOf(norm(v, minSpd, maxSpd))));
	const hrLine  = $derived(smoothLineWithGaps(hrs,  xOf, v => yOf(norm(v, minHR,  maxHR))));

	// Area: Nullwerte auf Boden, keine Lücken → smoothArea über volle Länge
	const altArea = $derived(smoothArea(alts.map((v, i) => [xOf(i), yOf(v != null && v > 0 ? norm(v, minAlt, maxAlt) : 0)] as [number, number]), bot));
	const spdArea = $derived(smoothArea(spds.map((v, i) => [xOf(i), yOf(v != null && v > 0 ? norm(v, minSpd, maxSpd) : 0)] as [number, number]), bot));
	const hrArea  = $derived(smoothArea(hrs.map( (v, i) => [xOf(i), yOf(v != null && v > 0 ? norm(v, minHR,  maxHR)  : 0)] as [number, number]), bot));

	// Hover
	let hoverIdx = $state<number | null>(null);

	function onMove(e: MouseEvent) {
		const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
		const svgX = (e.clientX - rect.left) * (W / rect.width) - PAD.left;
		const idx = Math.max(0, Math.min(points.length - 1, Math.round((svgX / cW) * (points.length - 1))));
		hoverIdx = idx;
		onhover?.(idx);
	}

	const hov = $derived(hoverIdx != null ? {
		x:   xOf(hoverIdx),
		alt: alts[hoverIdx],
		spd: spds[hoverIdx],
		hr:  hrs[hoverIdx],
	} : null);

	const totalKm = $derived(totalDistanceM / 1000);
	const xLabels = $derived(() => {
		const count = Math.min(6, Math.floor(totalKm));
		if (count < 1) return [];
		const step = totalKm / count;
		return Array.from({ length: count + 1 }, (_, i) => ({
			km: Math.round(i * step),
			x:  PAD.left + ((i * step) / totalKm) * cW,
		}));
	});

	const hasData = $derived(vAlts.length > 1 || vSpds.length > 1 || vHrs.length > 1);
</script>

{#if !hasData}
	<p class="text-sm text-gray-500">Keine Daten verfügbar.</p>
{:else}
	<div>
		<div class="flex items-center justify-between text-xs mb-2">
			<div class="flex gap-4 text-gray-400">
				{#if vAlts.length > 1}
					<span class="flex items-center gap-1.5">
						<span class="inline-block w-4 h-[2px] bg-orange-400 rounded"></span>Höhe
					</span>
				{/if}
				{#if vSpds.length > 1}
					<span class="flex items-center gap-1.5">
						<span class="inline-block w-4 h-[2px] bg-blue-400 rounded"></span>Speed
					</span>
				{/if}
				{#if vHrs.length > 1}
					<span class="flex items-center gap-1.5">
						<span class="inline-block w-4 h-[2px] bg-red-400 rounded"></span>HR
					</span>
				{/if}
				<span class="text-gray-600 italic">normalisiert</span>
			</div>
			{#if hov}
				<div class="flex gap-3 tabular-nums">
					{#if hov.alt != null}<span class="text-orange-400">{hov.alt.toFixed(0)} m</span>{/if}
					{#if hov.spd != null}<span class="text-blue-400">{hov.spd.toFixed(1)} km/h</span>{/if}
					{#if hov.hr  != null}<span class="text-red-400">{hov.hr.toFixed(0)} bpm</span>{/if}
				</div>
			{/if}
		</div>

		<svg viewBox="0 0 {W} {H}" class="w-full" style="height:200px"
			onmousemove={onMove} onmouseleave={() => { hoverIdx = null; onhover?.(null); }} role="presentation">
			<defs>
				<linearGradient id="cpAlt" x1="0" y1="0" x2="0" y2="1">
					<stop offset="0%"   stop-color="#fc4c02" stop-opacity="0.2"/>
					<stop offset="100%" stop-color="#fc4c02" stop-opacity="0.01"/>
				</linearGradient>
				<linearGradient id="cpSpd" x1="0" y1="0" x2="0" y2="1">
					<stop offset="0%"   stop-color="#60a5fa" stop-opacity="0.2"/>
					<stop offset="100%" stop-color="#60a5fa" stop-opacity="0.01"/>
				</linearGradient>
				<linearGradient id="cpHr" x1="0" y1="0" x2="0" y2="1">
					<stop offset="0%"   stop-color="#f87171" stop-opacity="0.2"/>
					<stop offset="100%" stop-color="#f87171" stop-opacity="0.01"/>
				</linearGradient>
			</defs>

			<!-- Gitternetz -->
			{#each [0.25, 0.5, 0.75, 1.0] as f}
				<line x1={PAD.left} y1={yOf(f).toFixed(1)} x2={W - PAD.right} y2={yOf(f).toFixed(1)}
					stroke="var(--chart-line)" stroke-width="1"/>
			{/each}

			<!-- Areas -->
			<path d={altArea} fill="url(#cpAlt)"/>
			<path d={spdArea} fill="url(#cpSpd)"/>
			<path d={hrArea}  fill="url(#cpHr)"/>

			<!-- Linien -->
			<path d={altLine} fill="none" stroke="#fc4c02" stroke-width="1.5" stroke-linejoin="round"/>
			<path d={spdLine} fill="none" stroke="#60a5fa" stroke-width="1.5" stroke-linejoin="round"/>
			<path d={hrLine}  fill="none" stroke="#f87171" stroke-width="1.5" stroke-linejoin="round"/>

			<!-- Hover -->
			{#if hov}
				<line x1={hov.x.toFixed(1)} y1={PAD.top} x2={hov.x.toFixed(1)} y2={PAD.top + cH}
					stroke="var(--chart-text)" stroke-width="1" stroke-dasharray="3,2"/>
				{#if hov.alt != null}
					<circle cx={hov.x.toFixed(1)} cy={yOf(norm(hov.alt, minAlt, maxAlt)).toFixed(1)} r="3.5" fill="#fc4c02"/>
				{/if}
				{#if hov.spd != null}
					<circle cx={hov.x.toFixed(1)} cy={yOf(norm(hov.spd, minSpd, maxSpd)).toFixed(1)} r="3.5" fill="#60a5fa"/>
				{/if}
				{#if hov.hr != null}
					<circle cx={hov.x.toFixed(1)} cy={yOf(norm(hov.hr, minHR, maxHR)).toFixed(1)} r="3.5" fill="#f87171"/>
				{/if}
			{/if}

			<!-- X-Achse -->
			{#each xLabels() as { km, x }}
				<text x={x} y={H - 6} font-size="11" fill="var(--chart-text)" text-anchor="middle">{km} km</text>
			{/each}
			<line x1={PAD.left} y1={PAD.top + cH} x2={W - PAD.right} y2={PAD.top + cH}
				stroke="var(--chart-line)" stroke-width="0.8"/>
		</svg>
	</div>
{/if}
