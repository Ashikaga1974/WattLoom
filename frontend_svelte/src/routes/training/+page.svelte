<script lang="ts">
	import { onMount } from 'svelte';
	import { api } from '$lib/api';

	interface WeekEntry {
		yearWeek: string;   // "2025-W03"
		year: number;
		week: number;
		km: number;
		avg4: number;       // gleitender 4-Wochen-Schnitt
		label: string;      // Monat+Jahr für X-Achse
	}

	let allWeeks = $state<WeekEntry[]>([]);
	let viewWeeks = $state<WeekEntry[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let showAll = $state(false);

	function isoWeek(dateStr: string): { year: number; week: number } {
		const d = new Date(dateStr);
		const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
		const dow = tmp.getUTCDay() || 7;
		tmp.setUTCDate(tmp.getUTCDate() + 4 - dow);
		const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
		const week = Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
		return { year: tmp.getUTCFullYear(), week };
	}

	// Datum des Montags einer ISO-Woche
	function weekStart(year: number, week: number): Date {
		const jan4 = new Date(Date.UTC(year, 0, 4));
		const dow = jan4.getUTCDay() || 7;
		const monday = new Date(jan4);
		monday.setUTCDate(jan4.getUTCDate() - (dow - 1) + (week - 1) * 7);
		return monday;
	}

	const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

	onMount(async () => {
		try {
			// Alle Aktivitäten auf einmal holen (max 500, wir haben 365)
			const res = await api.activities({ limit: 500 });

			// Nach ISO-Woche gruppieren (Ausreißerjahre < 2000 ignorieren)
			const byWeek = new Map<string, number>();
			for (const act of res.items) {
				if (new Date(act.start_date).getFullYear() < 2000) continue;
				const { year, week } = isoWeek(act.start_date);
				const key = `${year}-W${String(week).padStart(2, '0')}`;
				byWeek.set(key, (byWeek.get(key) ?? 0) + act.distance_m / 1000);
			}

			// Lückenlosen Bereich von frühester bis aktuellster Woche aufbauen
			const keys = [...byWeek.keys()].sort();
			if (keys.length === 0) { loading = false; return; }

			const [firstY, firstW] = keys[0].split('-W').map(Number);
			const now = new Date();
			const { year: lastY, week: lastW } = isoWeek(now.toISOString());

			const entries: WeekEntry[] = [];
			let y = firstY, w = firstW;
			while (y < lastY || (y === lastY && w <= lastW)) {
				const key = `${y}-W${String(w).padStart(2, '0')}`;
				const km = byWeek.get(key) ?? 0;
				const start = weekStart(y, w);
				const label = `${MONTHS[start.getUTCMonth()]} ${start.getUTCFullYear()}`;
				entries.push({ yearWeek: key, year: y, week: w, km, avg4: 0, label });

				// Nächste Woche
				w++;
				// ISO-Wochen: 52 oder 53 Wochen pro Jahr
				const weeksInYear = isoWeeksInYear(y);
				if (w > weeksInYear) { w = 1; y++; }
			}

			// Gleitender 4-Wochen-Schnitt berechnen
			for (let i = 0; i < entries.length; i++) {
				const slice = entries.slice(Math.max(0, i - 3), i + 1);
				entries[i].avg4 = slice.reduce((s, e) => s + e.km, 0) / slice.length;
			}

			allWeeks = entries;
			updateView();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Fehler beim Laden';
		} finally {
			loading = false;
		}
	});

	function isoWeeksInYear(year: number): number {
		// Ein Jahr hat 53 ISO-Wochen wenn Jan 1 oder Dez 31 ein Donnerstag ist
		const p = (y: number) => {
			const n = y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400);
			return n % 7;
		};
		return p(year) === 4 || p(year - 1) === 3 ? 53 : 52;
	}

	function updateView() {
		viewWeeks = showAll ? allWeeks : allWeeks.slice(-52);
	}

	$effect(() => { if (allWeeks.length) updateView(); });

	// SVG-Parameter
	const W = 1000;
	const H = 240;
	const PAD = { top: 16, right: 16, bottom: 40, left: 48 };
	const chartW = W - PAD.left - PAD.right;
	const chartH = H - PAD.top - PAD.bottom;

	const maxKm = $derived(
		viewWeeks.length ? Math.ceil(Math.max(...viewWeeks.map(e => e.km)) / 25 + 1) * 25 : 100
	);

	function xOf(i: number) {
		return PAD.left + (i / Math.max(viewWeeks.length - 1, 1)) * chartW;
	}
	function yOf(km: number) {
		return PAD.top + chartH - (km / maxKm) * chartH;
	}

	// Monatslabels: nur wenn sich Monat oder Jahr ändert
	const xLabels = $derived(() => {
		const labels: { x: number; label: string }[] = [];
		let lastLabel = '';
		viewWeeks.forEach((e, i) => {
			if (e.label !== lastLabel) {
				// Nur jeden 2. Monat beschriften wenn > 26 Wochen
				if (viewWeeks.length > 26) {
					const start = weekStart(e.year, e.week);
					if (start.getUTCMonth() % 2 !== 0 && viewWeeks.length <= 78) return;
					if (viewWeeks.length > 78 && start.getUTCMonth() % 3 !== 0) return;
				}
				labels.push({ x: xOf(i), label: e.label });
				lastLabel = e.label;
			}
		});
		return labels;
	});

	const yTicks = $derived(() => {
		const step = maxKm <= 150 ? 25 : 50;
		const ticks: number[] = [];
		for (let v = 0; v <= maxKm; v += step) ticks.push(v);
		return ticks;
	});

	// Balkenbreite (minimal 1px)
	const barW = $derived(Math.max(1, chartW / Math.max(viewWeeks.length, 1) - 1));

	// Avg-Linie
	const avgLine = $derived(
		viewWeeks.map((e, i) => `${xOf(i).toFixed(1)},${yOf(e.avg4).toFixed(1)}`).join(' ')
	);

	// Gesamtstatistiken der sichtbaren Periode
	const stats = $derived(() => {
		const total = viewWeeks.reduce((s, e) => s + e.km, 0);
		const active = viewWeeks.filter(e => e.km > 0).length;
		const peak = Math.max(...viewWeeks.map(e => e.km), 0);
		const avgActive = active ? total / active : 0;
		return { total: Math.round(total), active, peak: Math.round(peak), avgActive: Math.round(avgActive) };
	});
</script>

<svelte:head>
	<title>Trainingsverlauf – MyBiking</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex flex-wrap items-center justify-between gap-4">
		<h1 class="text-2xl font-bold">Trainingsverlauf</h1>
		<div class="flex items-center gap-3">
			<span class="text-sm text-gray-400">— gleitender 4-Wochen-Schnitt</span>
			<button
				onclick={() => { showAll = !showAll; }}
				class="px-3 py-1.5 rounded-full text-sm border transition-colors"
				class:border-orange-500={showAll}
				class:text-orange-400={showAll}
				class:border-gray-700={!showAll}
				class:text-gray-400={!showAll}
			>
				{showAll ? 'Letzte 52 Wochen' : 'Alle Jahre'}
			</button>
		</div>
	</div>

	{#if error}
		<div class="rounded bg-red-900/50 border border-red-700 p-4 text-red-300 text-sm">{error}</div>
	{/if}

	{#if loading}
		<div class="h-64 bg-gray-800/50 animate-pulse rounded-xl"></div>
	{:else}
		<!-- Chart -->
		<div class="rounded-xl bg-gray-800/40 border border-gray-800 p-4 overflow-x-auto">
			<svg viewBox="0 0 {W} {H}" class="w-full min-w-[600px]" style="height: 240px">
				<!-- Gitternetz -->
				{#each yTicks() as v}
					<line
						x1={PAD.left} y1={yOf(v).toFixed(1)}
						x2={W - PAD.right} y2={yOf(v).toFixed(1)}
						stroke="var(--chart-line)" stroke-width="1"
					/>
					<text x={PAD.left - 6} y={yOf(v) + 4} font-size="11" fill="var(--chart-text)" text-anchor="end">
						{v}
					</text>
				{/each}

				<!-- Basis-Linie -->
				<line
					x1={PAD.left} y1={PAD.top + chartH}
					x2={W - PAD.right} y2={PAD.top + chartH}
					stroke="var(--chart-line)" stroke-width="1"
				/>

				<!-- Balken -->
				{#each viewWeeks as entry, i}
					{#if entry.km > 0}
						{@const bx = xOf(i) - barW / 2}
						{@const bh = (entry.km / maxKm) * chartH}
						<rect
							x={bx.toFixed(1)}
							y={(PAD.top + chartH - bh).toFixed(1)}
							width={barW.toFixed(1)}
							height={bh.toFixed(1)}
							fill="#fc4c02"
							opacity="0.35"
							rx="1"
						/>
					{/if}
				{/each}

				<!-- 4-Wochen-Schnitt Linie -->
				{#if avgLine}
					<polyline
						points={avgLine}
						fill="none"
						stroke="#fc4c02"
						stroke-width="2"
						stroke-linejoin="round"
						stroke-linecap="round"
					/>
				{/if}

				<!-- X-Achse Labels -->
				{#each xLabels() as { x, label }}
					<text x={x} y={H - 10} font-size="10" fill="var(--chart-text)" text-anchor="middle">{label}</text>
					<line
						x1={x} y1={PAD.top}
						x2={x} y2={PAD.top + chartH}
						stroke="var(--chart-line)" stroke-width="0.5"
					/>
				{/each}
			</svg>
		</div>

		<!-- Stats -->
		<div class="grid grid-cols-2 md:grid-cols-4 gap-3">
			<div class="rounded-xl bg-gray-800/60 p-4">
				<p class="text-xs text-gray-400 uppercase tracking-wider">Gesamt</p>
				<p class="text-2xl font-bold mt-1">{stats().total.toLocaleString('de-DE')} <span class="text-sm font-normal text-gray-400">km</span></p>
			</div>
			<div class="rounded-xl bg-gray-800/60 p-4">
				<p class="text-xs text-gray-400 uppercase tracking-wider">Aktive Wochen</p>
				<p class="text-2xl font-bold mt-1">{stats().active} <span class="text-sm font-normal text-gray-400">/ {viewWeeks.length}</span></p>
			</div>
			<div class="rounded-xl bg-gray-800/60 p-4">
				<p class="text-xs text-gray-400 uppercase tracking-wider">Beste Woche</p>
				<p class="text-2xl font-bold mt-1">{stats().peak} <span class="text-sm font-normal text-gray-400">km</span></p>
			</div>
			<div class="rounded-xl bg-gray-800/60 p-4">
				<p class="text-xs text-gray-400 uppercase tracking-wider">⌀ aktive Woche</p>
				<p class="text-2xl font-bold mt-1">{stats().avgActive} <span class="text-sm font-normal text-gray-400">km</span></p>
			</div>
		</div>
	{/if}
</div>
