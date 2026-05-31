<script lang="ts">
	import { BEZIER_TENSION, SPARKLINE_WEEKS, SPEED_COLOR_BUCKETS, TRACK_SIMPLIFY_M, COMPARISON_SIMPLIFY } from '$lib/config';
</script>

<svelte:head>
	<title>Berechnungen & Annahmen – MyBiking</title>
</svelte:head>

<div class="space-y-8 max-w-3xl">

	<div>
		<h1 class="text-2xl font-bold">Berechnungen & Annahmen</h1>
		<p class="text-sm text-gray-400 mt-1">
			Alle Parameter werden direkt aus dem Code gelesen – diese Seite ist immer aktuell.
		</p>
	</div>

	<!-- Dashboard -->
	<section class="space-y-4">
		<h2 class="text-lg font-semibold border-b border-gray-800 pb-2">Dashboard – Sparklines</h2>

		<div class="space-y-3 text-sm text-gray-300">
			<p>
				Jede Stat-Kachel zeigt ein Balkendiagramm der letzten Aktivitätsperiode.
			</p>
			<div class="rounded-lg bg-gray-800/60 p-4 space-y-2">
				<div class="flex gap-3">
					<span class="text-gray-500 w-48 shrink-0">Ohne Jahresfilter</span>
					<span>Letzte <span class="text-orange-400 font-mono font-semibold">{SPARKLINE_WEEKS}</span> Wochen, gruppiert per Kalenderwochen-Abstand zu heute</span>
				</div>
				<div class="flex gap-3">
					<span class="text-gray-500 w-48 shrink-0">Mit Jahresfilter</span>
					<span>12 Monate des gewählten Jahres (Jan–Dez)</span>
				</div>
				<div class="flex gap-3">
					<span class="text-gray-500 w-48 shrink-0">Wochenberechnung</span>
					<span class="font-mono text-xs bg-gray-900 px-2 py-0.5 rounded">CAST((julianday('now') − julianday(start_date)) / 7 AS INTEGER)</span>
				</div>
				<div class="flex gap-3">
					<span class="text-gray-500 w-48 shrink-0">Fehlende Wochen/Monate</span>
					<span>Werden mit 0 aufgefüllt – Lücken im Aktivitätsverlauf sind sichtbar</span>
				</div>
			</div>
		</div>
	</section>

	<!-- Aktivitätsdetail – Karte -->
	<section class="space-y-4">
		<h2 class="text-lg font-semibold border-b border-gray-800 pb-2">Aktivitätskarte – Geschwindigkeitsfärbung</h2>

		<div class="space-y-3 text-sm text-gray-300">
			<p>
				Die Route wird in Segmente gleicher Farbe aufgeteilt. Langsam = Blau, schnell = Rot.
			</p>
			<div class="rounded-lg bg-gray-800/60 p-4 space-y-2">
				<div class="flex gap-3">
					<span class="text-gray-500 w-48 shrink-0">Farbstufen</span>
					<span><span class="text-orange-400 font-mono font-semibold">{SPEED_COLOR_BUCKETS}</span> gleichmäßige Buckets zwischen Mindest- und Höchstgeschwindigkeit</span>
				</div>
				<div class="flex gap-3">
					<span class="text-gray-500 w-48 shrink-0">Farbmodell</span>
					<span class="font-mono text-xs bg-gray-900 px-2 py-0.5 rounded">HSL(240 − t·240, 80%, 55%) mit t = (v − v_min) / (v_max − v_min)</span>
				</div>
				<div class="flex gap-3">
					<span class="text-gray-500 w-48 shrink-0">Min/Max-Basis</span>
					<span>Alle Punkte mit Geschwindigkeit &gt; 0 km/h (Stillstand wird ignoriert)</span>
				</div>
				<div class="flex gap-3">
					<span class="text-gray-500 w-48 shrink-0">Segmentierung</span>
					<span>Aufeinanderfolgende Punkte im gleichen Bucket werden zu einer Polyline zusammengefasst</span>
				</div>
				<div class="flex gap-3">
					<span class="text-gray-500 w-48 shrink-0">Track-Vereinfachung</span>
					<span>Ramer-Douglas-Peucker mit Toleranz <span class="text-orange-400 font-mono font-semibold">{TRACK_SIMPLIFY_M} m</span> vor der Übertragung</span>
				</div>
			</div>
		</div>
	</section>

	<!-- Aktivitätsdetail – Profile -->
	<section class="space-y-4">
		<h2 class="text-lg font-semibold border-b border-gray-800 pb-2">Aktivitätsdetail – Diagrammprofile</h2>

		<div class="space-y-3 text-sm text-gray-300">
			<div class="rounded-lg bg-gray-800/60 p-4 space-y-3">
				<div>
					<p class="font-medium text-gray-200 mb-1">Höhenprofil</p>
					<div class="space-y-1 pl-2 border-l-2 border-gray-700">
						<p><span class="text-gray-500">Y-Achse:</span> tatsächliche Höhe in m ü. NN (Minimum bis Maximum)</p>
						<p><span class="text-gray-500">Höhengewinn:</span> <span class="font-mono text-xs bg-gray-900 px-1.5 py-0.5 rounded">Σ max(0, alt[i] − alt[i−1])</span> – nur positive Differenzen</p>
						<p><span class="text-gray-500">Null-Filter:</span> Punkte ohne Höhendaten werden übersprungen</p>
					</div>
				</div>
				<div>
					<p class="font-medium text-gray-200 mb-1">Geschwindigkeitsprofil</p>
					<div class="space-y-1 pl-2 border-l-2 border-gray-700">
						<p><span class="text-gray-500">Y-Achse:</span> km/h, gerundet auf 5er-Schritte (Minimum / Maximum)</p>
						<p><span class="text-gray-500">Durchschnitt:</span> arithmetisches Mittel aller Punkte mit Geschwindigkeit &gt; 0</p>
					</div>
				</div>
				<div>
					<p class="font-medium text-gray-200 mb-1">Herzfrequenzprofil</p>
					<div class="space-y-1 pl-2 border-l-2 border-gray-700">
						<p><span class="text-gray-500">Y-Achse:</span> bpm, gerundet auf 5er-Schritte (Minimum / Maximum)</p>
						<p><span class="text-gray-500">Durchschnitt:</span> arithmetisches Mittel aller Punkte mit HR &gt; 0</p>
					</div>
				</div>
				<div>
					<p class="font-medium text-gray-200 mb-1">Kombiniertes Profil</p>
					<div class="space-y-1 pl-2 border-l-2 border-gray-700">
						<p><span class="text-gray-500">Normalisierung:</span> jede Datenreihe unabhängig auf 0–1 skaliert: <span class="font-mono text-xs bg-gray-900 px-1.5 py-0.5 rounded">(v − min) / (max − min)</span></p>
						<p><span class="text-gray-500">Lücken:</span> Punkte ohne Wert werden auf y = 0 gesetzt (sichtbare Lücke im Profil)</p>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- Diagramm-Kurven -->
	<section class="space-y-4">
		<h2 class="text-lg font-semibold border-b border-gray-800 pb-2">Diagramm-Kurven – Glättung</h2>

		<div class="space-y-3 text-sm text-gray-300">
			<p>
				Alle Liniendiagramme verwenden kubische Bezier-Splines (Catmull-Rom-Konvertierung) statt gerader Liniensegmente.
			</p>
			<div class="rounded-lg bg-gray-800/60 p-4 space-y-2">
				<div class="flex gap-3">
					<span class="text-gray-500 w-48 shrink-0">Methode</span>
					<span>Catmull-Rom → kubische Bezier</span>
				</div>
				<div class="flex gap-3">
					<span class="text-gray-500 w-48 shrink-0">Spannung (Tension)</span>
					<span><span class="text-orange-400 font-mono font-semibold">{BEZIER_TENSION}</span> – 0 = gerade Linien, 0.5 = starke Rundung</span>
				</div>
				<div class="flex gap-3">
					<span class="text-gray-500 w-48 shrink-0">Kontrollpunkte</span>
					<span class="font-mono text-xs bg-gray-900 px-2 py-0.5 rounded">cp1 = P[i] + (P[i+1] − P[i−1]) · T</span>
				</div>
				<div class="flex gap-3">
					<span class="text-gray-500 w-48 shrink-0">Endpunkte</span>
					<span>Erstes und letztes Segment clamp auf sich selbst (kein Überschwingen)</span>
				</div>
				<div class="flex gap-3">
					<span class="text-gray-500 w-48 shrink-0">Lücken</span>
					<span>Jeder kontinuierliche Abschnitt wird separat geglättet; Null-Werte erzeugen ein neues Segment</span>
				</div>
			</div>
		</div>
	</section>

	<!-- Jahresfortschritt -->
	<section class="space-y-4">
		<h2 class="text-lg font-semibold border-b border-gray-800 pb-2">Jahresfortschritt & Prognose</h2>

		<div class="space-y-3 text-sm text-gray-300">
			<div class="rounded-lg bg-gray-800/60 p-4 space-y-3">
				<div>
					<p class="font-medium text-gray-200 mb-1">Kumulierter Jahresfortschritt</p>
					<div class="space-y-1 pl-2 border-l-2 border-gray-700">
						<p><span class="text-gray-500">X-Achse:</span> Jahrestag 1–365 (1. Jan bis 31. Dez)</p>
						<p><span class="text-gray-500">Y-Wert:</span> kumulierte Kilometer bis zu diesem Tag</p>
						<p><span class="text-gray-500">Jahrestag (heute):</span> <span class="font-mono text-xs bg-gray-900 px-1.5 py-0.5 rounded">⌊(now − 1. Jan) / 86 400 000 ms⌋</span></p>
					</div>
				</div>
				<div>
					<p class="font-medium text-gray-200 mb-1">Jahresprognose</p>
					<div class="space-y-1 pl-2 border-l-2 border-gray-700">
						<p><span class="text-gray-500">Methode:</span> lineare Extrapolation auf Basis der bisherigen Saison</p>
						<p><span class="text-gray-500">Formel:</span> <span class="font-mono text-xs bg-gray-900 px-1.5 py-0.5 rounded">Prognose = (km_heute / Jahrestag_heute) × 365</span></p>
						<p><span class="text-gray-500">Annahme:</span> gleichmäßige Verteilung der Fahrten – saisonale Schwankungen werden <em>nicht</em> berücksichtigt</p>
						<p><span class="text-gray-500">Vergleich:</span> gegen letztes Jahr-Gesamtergebnis (letzter Datenpunkt des Vorjahres)</p>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- FTP-Schätzung -->
	<section class="space-y-4">
		<h2 class="text-lg font-semibold border-b border-gray-800 pb-2">FTP-Schätzung (HR-korrigiert)</h2>

		<div class="space-y-3 text-sm text-gray-300">
			<p>
				Mangels Leistungsmesser wird die FTP aus durchschnittlicher Leistung (Garmin-Summendaten) und Herzfrequenz extrapoliert.
				Basis: lineare Power/HR-Beziehung, extrapoliert zur Schwellen-HR.
			</p>
			<div class="rounded-lg bg-gray-800/60 p-4 space-y-2">
				<div class="flex gap-3">
					<span class="text-gray-500 w-48 shrink-0">Ride-Filter</span>
					<span>Nur Rides mit Leistungsdaten und Dauer <span class="font-mono text-xs bg-gray-900 px-1.5 py-0.5 rounded">45–75 min (2 700–4 500 s)</span></span>
				</div>
				<div class="flex gap-3">
					<span class="text-gray-500 w-48 shrink-0">HR-Filter</span>
					<span>Nur Rides mit avg_hr ≥ 65 % HRmax (<span class="font-mono text-xs bg-gray-900 px-1.5 py-0.5 rounded">MIN_HR_RATIO = 0.65</span>)</span>
				</div>
				<div class="flex gap-3">
					<span class="text-gray-500 w-48 shrink-0">Formel (mit HR)</span>
					<span class="font-mono text-xs bg-gray-900 px-2 py-0.5 rounded">FTP = avg_power × 1.08 / (avg_hr / HRmax)</span>
				</div>
				<div class="flex gap-3">
					<span class="text-gray-500 w-48 shrink-0">Faktor erklärt</span>
					<span><span class="font-mono text-xs bg-gray-900 px-1.5 py-0.5 rounded">1.08 = 0.90 × 1.20</span> – Schwellen-HR bei 90 % HRmax + 20 % Korrekturfaktor</span>
				</div>
				<div class="flex gap-3">
					<span class="text-gray-500 w-48 shrink-0">Formel (ohne HR)</span>
					<span class="font-mono text-xs bg-gray-900 px-2 py-0.5 rounded">FTP = avg_power × 1.38</span>
					<span class="text-gray-500 text-xs self-center">(1.15 × 1.20)</span>
				</div>
				<div class="flex gap-3">
					<span class="text-gray-500 w-48 shrink-0">HRmax</span>
					<span>Globales Maximum aller Aktivitäten (<code class="text-xs bg-gray-900 px-1.5 py-0.5 rounded">MAX(max_hr)</code>)</span>
				</div>
				<div class="flex gap-3">
					<span class="text-gray-500 w-48 shrink-0">Darstellung</span>
					<span>Trend-Chart: gleitende Schätzung pro Ride über Zeit; aktueller FTP = Mittelwert der letzten 90 Tage</span>
				</div>
			</div>
		</div>
	</section>

	<!-- VO2max -->
	<section class="space-y-4">
		<h2 class="text-lg font-semibold border-b border-gray-800 pb-2">VO2max-Schätzung</h2>

		<div class="space-y-3 text-sm text-gray-300">
			<p>
				Näherungsformel nach Coggan aus dem FTP-Wert und Körpergewicht.
				Nur eine grobe Einschätzung – kein Ersatz für einen Labortest.
			</p>
			<div class="rounded-lg bg-gray-800/60 p-4 space-y-2">
				<div class="flex gap-3">
					<span class="text-gray-500 w-48 shrink-0">Formel</span>
					<span class="font-mono text-xs bg-gray-900 px-2 py-0.5 rounded">VO2max = (FTP_W / Gewicht_kg) × 10.8 + 7</span>
				</div>
				<div class="flex gap-3">
					<span class="text-gray-500 w-48 shrink-0">Einheit</span>
					<span>ml/min/kg</span>
				</div>
				<div class="flex gap-3">
					<span class="text-gray-500 w-48 shrink-0">Basis</span>
					<span>Manuelles FTP (wenn gesetzt) oder geschätztes FTP; Gewicht aus Einstellungen</span>
				</div>
			</div>
		</div>
	</section>

	<!-- HR-Zonen -->
	<section class="space-y-4">
		<h2 class="text-lg font-semibold border-b border-gray-800 pb-2">Zeit in Zonen – Herzfrequenz</h2>

		<div class="space-y-3 text-sm text-gray-300">
			<p>5 Zonen basierend auf % HRmax. HRmax = globales Maximum aller Aktivitäten.</p>
			<div class="rounded-lg bg-gray-800/60 p-4 space-y-2">
				{#each [
					{ zone: 'Z1 · Regeneration', range: '0–60 %',   color: '#60a5fa' },
					{ zone: 'Z2 · Grundlage',    range: '60–70 %',  color: '#4ade80' },
					{ zone: 'Z3 · Tempo',         range: '70–80 %',  color: '#facc15' },
					{ zone: 'Z4 · Schwelle',      range: '80–90 %',  color: '#fb923c' },
					{ zone: 'Z5 · VO2max',        range: '90–100 %', color: '#ef4444' },
				] as z}
					<div class="flex gap-3 items-center">
						<span class="w-3 h-3 rounded-sm shrink-0" style="background:{z.color}"></span>
						<span class="text-gray-300 w-44 shrink-0">{z.zone}</span>
						<span class="font-mono text-xs bg-gray-900 px-1.5 py-0.5 rounded">{z.range} HRmax</span>
					</div>
				{/each}
				<div class="flex gap-3 mt-2 pt-2 border-t border-gray-700">
					<span class="text-gray-500 w-48 shrink-0">Zeitdelta-Cap</span>
					<span>Max. <span class="font-mono text-xs bg-gray-900 px-1.5 py-0.5 rounded">10 s</span> zwischen aufeinanderfolgenden Track-Punkten (verhindert Lücken-Artefakte)</span>
				</div>
			</div>
		</div>
	</section>

	<!-- Power-Zonen -->
	<section class="space-y-4">
		<h2 class="text-lg font-semibold border-b border-gray-800 pb-2">Zeit in Zonen – Leistung (Coggan)</h2>

		<div class="space-y-3 text-sm text-gray-300">
			<p>7 Zonen nach Coggan, basierend auf % FTP. FTP = manueller Wert (Einstellungen) oder Schätzung.</p>
			<div class="rounded-lg bg-gray-800/60 p-4 space-y-2">
				{#each [
					{ zone: 'Z1 · Active Recovery', range: '0–55 %',     color: '#60a5fa' },
					{ zone: 'Z2 · Endurance',       range: '55–75 %',    color: '#4ade80' },
					{ zone: 'Z3 · Tempo',           range: '75–90 %',    color: '#a3e635' },
					{ zone: 'Z4 · Schwelle',        range: '90–105 %',   color: '#facc15' },
					{ zone: 'Z5 · VO2max',          range: '105–120 %',  color: '#fb923c' },
					{ zone: 'Z6 · Anaerob',         range: '120–150 %',  color: '#f87171' },
					{ zone: 'Z7 · Neuromuskulär',   range: '> 150 %',    color: '#c084fc' },
				] as z}
					<div class="flex gap-3 items-center">
						<span class="w-3 h-3 rounded-sm shrink-0" style="background:{z.color}"></span>
						<span class="text-gray-300 w-44 shrink-0">{z.zone}</span>
						<span class="font-mono text-xs bg-gray-900 px-1.5 py-0.5 rounded">{z.range} FTP</span>
					</div>
				{/each}
			</div>
		</div>
	</section>

	<!-- Form-Kurve (PMC) -->
	<section class="space-y-4">
		<h2 class="text-lg font-semibold border-b border-gray-800 pb-2">Form-Kurve – CTL / ATL / TSB (PMC)</h2>

		<div class="space-y-3 text-sm text-gray-300">
			<p>
				Performance Management Chart auf Basis von hrTSS (Heart Rate Training Stress Score).
				Alle Ride- und Workout-Typen fließen ein.
			</p>
			<div class="rounded-lg bg-gray-800/60 p-4 space-y-3">
				<div>
					<p class="font-medium text-gray-200 mb-1">hrTSS</p>
					<div class="space-y-1 pl-2 border-l-2 border-gray-700">
						<p><span class="text-gray-500">Formel:</span> <span class="font-mono text-xs bg-gray-900 px-1.5 py-0.5 rounded">hrTSS = (Dauer_h) × (avg_HR / Schwellen-HR)² × 100</span></p>
						<p><span class="text-gray-500">Schwellen-HR:</span> <span class="font-mono text-xs bg-gray-900 px-1.5 py-0.5 rounded">0.85 × HRmax</span> (global max; Fallback: 185 bpm)</p>
						<p><span class="text-gray-500">Ohne HR:</span> <span class="font-mono text-xs bg-gray-900 px-1.5 py-0.5 rounded">hrTSS = Dauer_h × 50</span></p>
					</div>
				</div>
				<div>
					<p class="font-medium text-gray-200 mb-1">CTL – Fitness (Chronic Training Load)</p>
					<div class="space-y-1 pl-2 border-l-2 border-blue-700">
						<p><span class="text-gray-500">Methode:</span> Exponentieller gleitender Mittelwert über <strong>42 Tage</strong></p>
						<p><span class="text-gray-500">Formel:</span> <span class="font-mono text-xs bg-gray-900 px-1.5 py-0.5 rounded">CTL = CTL_prev + (2/43) × (TSS − CTL_prev)</span></p>
					</div>
				</div>
				<div>
					<p class="font-medium text-gray-200 mb-1">ATL – Müdigkeit (Acute Training Load)</p>
					<div class="space-y-1 pl-2 border-l-2 border-orange-700">
						<p><span class="text-gray-500">Methode:</span> Exponentieller gleitender Mittelwert über <strong>7 Tage</strong></p>
						<p><span class="text-gray-500">Formel:</span> <span class="font-mono text-xs bg-gray-900 px-1.5 py-0.5 rounded">ATL = ATL_prev + (2/8) × (TSS − ATL_prev)</span></p>
					</div>
				</div>
				<div>
					<p class="font-medium text-gray-200 mb-1">TSB – Form (Training Stress Balance)</p>
					<div class="space-y-1 pl-2 border-l-2 border-gray-700">
						<p><span class="font-mono text-xs bg-gray-900 px-1.5 py-0.5 rounded">TSB = CTL − ATL</span></p>
						<p><span class="text-gray-500">Positiv:</span> frisch / ausgeruht – <span class="text-gray-500">Negativ:</span> ermüdet</p>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- Streckenvergleich -->
	<section class="space-y-4">
		<h2 class="text-lg font-semibold border-b border-gray-800 pb-2">Streckenvergleich – Ähnlichkeit</h2>

		<div class="space-y-3 text-sm text-gray-300">
			<p>
				Findet Aktivitäten mit ähnlichem Startpunkt und ähnlicher Distanz.
				Kein geometrisches Track-Matching (kein Fréchet / Hausdorff).
			</p>
			<div class="rounded-lg bg-gray-800/60 p-4 space-y-2">
				<div class="flex gap-3">
					<span class="text-gray-500 w-48 shrink-0">Startpunkt-Radius</span>
					<span>Standard <span class="font-mono text-xs bg-gray-900 px-1.5 py-0.5 rounded">2 km</span> (Haversine-Distanz)</span>
				</div>
				<div class="flex gap-3">
					<span class="text-gray-500 w-48 shrink-0">Distanztoleranz</span>
					<span>Standard <span class="font-mono text-xs bg-gray-900 px-1.5 py-0.5 rounded">±20 %</span> der Referenz-Distanz</span>
				</div>
				<div class="flex gap-3">
					<span class="text-gray-500 w-48 shrink-0">Track-Vereinfachung</span>
					<span>RDP-Toleranz <span class="text-orange-400 font-mono font-semibold">{COMPARISON_SIMPLIFY} m</span> (höher als Detailansicht – Performance)</span>
				</div>
				<div class="flex gap-3">
					<span class="text-gray-500 w-48 shrink-0">Ergebnis-Limit</span>
					<span>Max. 10 ähnliche Aktivitäten</span>
				</div>
			</div>
		</div>
	</section>

	<!-- Allgemeines -->
	<section class="space-y-4">
		<h2 class="text-lg font-semibold border-b border-gray-800 pb-2">Allgemeines</h2>

		<div class="space-y-3 text-sm text-gray-300">
			<div class="rounded-lg bg-gray-800/60 p-4 space-y-2">
				<div class="flex gap-3">
					<span class="text-gray-500 w-48 shrink-0">Datumsfeld</span>
					<span><code class="text-xs bg-gray-900 px-1.5 py-0.5 rounded">start_date</code> (UTC) – Anzeige wird via <code class="text-xs bg-gray-900 px-1.5 py-0.5 rounded">tz.svelte.ts</code> in lokale Zeit umgerechnet (Auto = Browser-TZ, oder fixer Offset aus Einstellungen)</span>
				</div>
				<div class="flex gap-3">
					<span class="text-gray-500 w-48 shrink-0">Geschwindigkeit</span>
					<span>Alle API-Werte in m/s, Anzeige in km/h (<span class="font-mono text-xs bg-gray-900 px-1.5 py-0.5 rounded">× 3.6</span>)</span>
				</div>
				<div class="flex gap-3">
					<span class="text-gray-500 w-48 shrink-0">Distanz</span>
					<span>Alle API-Werte in Metern, Anzeige in km (<span class="font-mono text-xs bg-gray-900 px-1.5 py-0.5 rounded">/ 1000</span>)</span>
				</div>
				<div class="flex gap-3">
					<span class="text-gray-500 w-48 shrink-0">Datenbank</span>
					<span>SQLite, Zeitvergleiche via <code class="text-xs bg-gray-900 px-1.5 py-0.5 rounded">julianday()</code> und <code class="text-xs bg-gray-900 px-1.5 py-0.5 rounded">strftime()</code></span>
				</div>
			</div>
		</div>
	</section>

</div>
