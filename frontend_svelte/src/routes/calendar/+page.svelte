<script lang="ts">
	import { onMount } from 'svelte';
	import { api, type Activity, type OtherActivity } from '$lib/api';
	import { tzStore, dateKey } from '$lib/tz.svelte';

	// Standardjahr = laufendes Jahr
	const currentYear = new Date().getFullYear();
	let selectedYear = $state(currentYear);
	let availableYears = $state<string[]>([]);
	let activities = $state<Activity[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let otherByDate = $state<Map<string, OtherActivity[]>>(new Map());

	// Tooltip-State
	let tooltip = $state<{ x: number; y: number; day: DayCell } | null>(null);

	interface DayCell {
		date: string;       // YYYY-MM-DD
		km: number;         // Gesamtdistanz des Tages
		acts: Activity[];   // Rad-Aktivitäten des Tages
	}

	// Kalender-Grid: Array von Wochen (je 7 Slots; null = kein Tag dieses Jahres)
	let weeks = $state<(DayCell | null)[][]>([]);
	let monthLabels = $state<{ label: string; weekIndex: number }[]>([]);

	async function load() {
		loading = true;
		error = null;
		try {
			if (availableYears.length === 0) {
				const s = await api.activityStats();
				availableYears = s.available_years;
			}
			const [res, otherActs] = await Promise.all([
				api.activities({ limit: 500, year: selectedYear }),
				api.otherActivities(selectedYear),
			]);
			activities = res.items;

			// Andere Aktivitäten nach lokalem Datum gruppieren (dateKey wie bei Rides)
			const map = new Map<string, OtherActivity[]>();
			for (const a of otherActs) {
				// a.date ist UTC-Datum (YYYY-MM-DD) aus DB → T12:00:00 vermeidet Tagsgrenzen-Probleme
				const key = dateKey(a.date + 'T12:00:00', tzStore.offset);
				if (!map.has(key)) map.set(key, []);
				map.get(key)!.push(a);
			}
			otherByDate = map;

			buildCalendar();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Fehler beim Laden';
		} finally {
			loading = false;
		}
	}

	// Lokales Datum als YYYY-MM-DD ohne UTC-Konvertierung
	function localDateStr(d: Date): string {
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
	}

	function buildCalendar() {
		// Aktivitäten nach YYYY-MM-DD gruppieren
		const byDate = new Map<string, Activity[]>();
		for (const act of activities) {
			const d = dateKey(act.start_date, tzStore.offset);
			if (!byDate.has(d)) byDate.set(d, []);
			byDate.get(d)!.push(act);
		}

		const start = new Date(selectedYear, 0, 1);
		const end = new Date(selectedYear, 11, 31);

		// Montag = 0, Sonntag = 6 (ISO-Wochentag)
		const isoDay = (d: Date) => (d.getDay() + 6) % 7;

		// Erste Zelle des Grids = Montag der Woche, in der Jan 1 liegt
		const gridStart = new Date(start);
		gridStart.setDate(gridStart.getDate() - isoDay(start));

		const newWeeks: (DayCell | null)[][] = [];
		const newMonthLabels: { label: string; weekIndex: number }[] = [];
		const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
		let seenMonths = new Set<number>();

		let cursor = new Date(gridStart);
		while (cursor <= end || newWeeks.length === 0) {
			const week: (DayCell | null)[] = [];
			for (let dow = 0; dow < 7; dow++) {
				const inYear = cursor.getFullYear() === selectedYear;
				if (inYear) {
					// localDateStr statt toISOString(): cursor ist lokale Mitternacht,
			// toISOString() würde in UTC+2 den Vortag liefern → Kalender um 1 Tag versetzt
			const dateStr = localDateStr(cursor);
					const acts = byDate.get(dateStr) ?? [];
					const km = acts.reduce((s, a) => s + (a.distance_m ?? 0) / 1000, 0);
					week.push({ date: dateStr, km, acts });

					// Monatslabel an der ersten Woche eines Monats
					const mo = cursor.getMonth();
					if (dow === 0 && !seenMonths.has(mo)) {
						seenMonths.add(mo);
						newMonthLabels.push({ label: MONTHS[mo], weekIndex: newWeeks.length });
					}
				} else {
					week.push(null);
				}
				cursor.setDate(cursor.getDate() + 1);
			}
			newWeeks.push(week);
			if (cursor.getFullYear() > selectedYear) break;
		}

		weeks = newWeeks;
		monthLabels = newMonthLabels;
	}

	// Farbstufe 0–4 je nach km; berücksichtigt auch Gym-only-Tage
	function colorClass(day: DayCell | null): string {
		if (!day) return 'bg-gray-800 hover:bg-gray-700';
		const others = otherByDate.get(day.date);
		// Nur Gym, kein Ride → lila
		if (day.acts.length === 0 && others && others.length > 0) {
			return 'bg-purple-900/40 border border-purple-700/50 hover:bg-purple-800/50';
		}
		if (day.acts.length === 0) return 'bg-gray-800 hover:bg-gray-700';
		if (day.km < 15)  return 'bg-orange-950 hover:bg-orange-900';
		if (day.km < 30)  return 'bg-orange-800 hover:bg-orange-700';
		if (day.km < 50)  return 'bg-orange-600 hover:bg-orange-500';
		return              'bg-orange-400 hover:bg-orange-300';
	}

	// Ob ein Tag sowohl Rides als auch andere Aktivitäten hat
	function hasMixed(day: DayCell): boolean {
		return day.acts.length > 0 && (otherByDate.get(day.date)?.length ?? 0) > 0;
	}

	function fmtDuration(s: number): string {
		if (!s) return '';
		const h = Math.floor(s / 3600);
		const m = Math.floor((s % 3600) / 60);
		return h > 0 ? `${h}h ${m}m` : `${m}m`;
	}

	function showTooltip(e: MouseEvent, day: DayCell | null) {
		if (!day) return;
		tooltip = { x: (e as MouseEvent & { pageX: number }).pageX, y: (e as MouseEvent & { pageY: number }).pageY, day };
	}
	function hideTooltip() { tooltip = null; }

	// Statistiken für Legende
	const activeDays = $derived(activities.length > 0
		? new Set(activities.map(a => a.start_date.slice(0, 10))).size
		: 0);
	const totalKm = $derived(activities.reduce((s, a) => s + (a.distance_m ?? 0) / 1000, 0));

	const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

	onMount(load);
</script>

<svelte:head>
	<title>Kalender – MyBiking</title>
</svelte:head>

<!-- Tooltip -->
{#if tooltip}
	<div
		class="fixed z-50 pointer-events-none bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs shadow-xl"
		style="left: {tooltip.x + 12}px; top: {tooltip.y - 8}px"
	>
		<p class="font-semibold text-gray-200">{tooltip.day.date}</p>
		{#if tooltip.day.acts.length === 0 && !(otherByDate.get(tooltip.day.date)?.length)}
			<p class="text-gray-500">Kein Training</p>
		{:else}
			{#if tooltip.day.acts.length > 0}
				<p class="text-orange-400">{tooltip.day.km.toFixed(1)} km · {tooltip.day.acts.length} Ride{tooltip.day.acts.length > 1 ? 's' : ''}</p>
				{#each tooltip.day.acts as act}
					<p class="text-gray-400 truncate max-w-48">{act.name}</p>
				{/each}
			{/if}
			{#each otherByDate.get(tooltip.day.date) ?? [] as other}
				<p class="text-purple-400 mt-0.5">{other.sport_type}{other.moving_time_s ? ' · ' + fmtDuration(other.moving_time_s) : ''}</p>
			{/each}
		{/if}
	</div>
{/if}

<div class="space-y-6">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold">Aktivitätskalender</h1>
			{#if !loading}
				<p class="text-sm text-gray-400 mt-0.5">
					{activeDays} aktive Tage · {Math.round(totalKm).toLocaleString('de-DE')} km
				</p>
			{/if}
		</div>
		<select
			bind:value={selectedYear}
			onchange={load}
			class="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-orange-500"
		>
			{#each availableYears as y}
				<option value={Number(y)}>{y}</option>
			{/each}
		</select>
	</div>

	{#if error}
		<div class="rounded bg-red-900/50 border border-gray-700 p-4 text-red-300 text-sm">{error}</div>
	{/if}

	{#if loading}
		<div class="h-40 bg-gray-800/50 animate-pulse rounded-xl"></div>
	{:else}
		<!-- Kalender-Grid -->
		<div class="overflow-x-auto">
			<div class="inline-flex gap-1 relative min-w-max">
				<!-- Wochentag-Labels links -->
				<div class="flex flex-col gap-1 mr-1 pt-6">
					{#each WEEKDAYS as wd, i}
						<!-- Nur Mo, Mi, Fr, So anzeigen um Platz zu sparen -->
						<div class="h-3 text-[10px] text-gray-500 leading-3 text-right w-5">
							{i % 2 === 0 ? wd : ''}
						</div>
					{/each}
				</div>

				<!-- Wochen-Spalten -->
				<div class="flex flex-col">
					<!-- Monat-Labels -->
					<div class="relative h-5 mb-1">
						{#each monthLabels as { label, weekIndex }}
							<span
								class="absolute text-[10px] text-gray-400"
								style="left: {weekIndex * 16}px"
							>{label}</span>
						{/each}
					</div>

					<!-- Tages-Zellen -->
					<div class="flex gap-1">
						{#each weeks as week}
							<div class="flex flex-col gap-1">
								{#each week as day}
									{#if day === null}
										<div class="w-3 h-3 rounded-sm bg-transparent"></div>
									{:else if day.acts.length > 0}
										<!-- Tag mit Ride (ggf. + Gym-Punkt) -->
										<a
											href={day.acts.length === 1 ? `/activities/${day.acts[0].id}` : `/activities?date=${day.date}`}
											class="w-3 h-3 rounded-sm cursor-pointer transition-colors relative {colorClass(day)}"
											onmouseenter={(e) => showTooltip(e, day)}
											onmouseleave={hideTooltip}
											aria-label="{day.date}: {day.km.toFixed(1)} km"
										>
											{#if hasMixed(day)}
												<!-- Kleiner lila Punkt unten rechts: Gym zusätzlich zum Ride -->
												<span class="absolute bottom-0 right-0 w-1 h-1 rounded-full bg-purple-400 pointer-events-none"></span>
											{/if}
										</a>
									{:else}
										<!-- Tag ohne Ride (evtl. mit Gym → lila) -->
										<div
											class="w-3 h-3 rounded-sm transition-colors relative {colorClass(day)}"
											onmouseenter={(e) => showTooltip(e, day)}
											onmouseleave={hideTooltip}
										></div>
									{/if}
								{/each}
							</div>
						{/each}
					</div>
				</div>
			</div>
		</div>

		<!-- Legende -->
		<div class="flex items-center gap-2 text-xs text-gray-500 flex-wrap">
			<span>Weniger</span>
			<div class="w-3 h-3 rounded-sm bg-gray-800"></div>
			<div class="w-3 h-3 rounded-sm bg-orange-950"></div>
			<div class="w-3 h-3 rounded-sm bg-orange-800"></div>
			<div class="w-3 h-3 rounded-sm bg-orange-600"></div>
			<div class="w-3 h-3 rounded-sm bg-orange-400"></div>
			<span>Mehr</span>
			<span class="ml-4 text-gray-600">(&lt;15 / 15–30 / 30–50 / 50+ km)</span>
			<span class="ml-4 flex items-center gap-1">
				<span class="inline-block w-3 h-3 rounded-sm bg-purple-900/40 border border-purple-700/50"></span>
				Gym-Tag
			</span>
		</div>

		<!-- Monatsübersicht -->
		<section>
			<h2 class="text-lg font-semibold mb-3">Monatsübersicht</h2>
			<div class="grid grid-cols-3 md:grid-cols-6 gap-2">
				{#each Array(12) as _, mo}
					{@const moActs = activities.filter(a => new Date(a.start_date).getMonth() === mo)}
					{@const moKm = moActs.reduce((s, a) => s + (a.distance_m ?? 0) / 1000, 0)}
					{@const MONTHS_FULL = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember']}
					<div class="rounded-lg bg-gray-800/60 p-3 {moActs.length === 0 ? 'opacity-40' : ''}">
						<p class="text-xs text-gray-400">{MONTHS_FULL[mo]}</p>
						<p class="text-lg font-bold mt-0.5">{moActs.length > 0 ? Math.round(moKm) : '–'} <span class="text-xs font-normal text-gray-500">{moActs.length > 0 ? 'km' : ''}</span></p>
						<p class="text-xs text-gray-500">{moActs.length} Ride{moActs.length !== 1 ? 's' : ''}</p>
					</div>
				{/each}
			</div>
		</section>
	{/if}
</div>
