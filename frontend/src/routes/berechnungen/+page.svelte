<script lang="ts">
	import { BEZIER_TENSION, SPARKLINE_WEEKS, SPEED_COLOR_BUCKETS, TRACK_SIMPLIFY_M } from '$lib/config';
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

	<!-- Allgemeines -->
	<section class="space-y-4">
		<h2 class="text-lg font-semibold border-b border-gray-800 pb-2">Allgemeines</h2>

		<div class="space-y-3 text-sm text-gray-300">
			<div class="rounded-lg bg-gray-800/60 p-4 space-y-2">
				<div class="flex gap-3">
					<span class="text-gray-500 w-48 shrink-0">Datumsfeld</span>
					<span><code class="text-xs bg-gray-900 px-1.5 py-0.5 rounded">start_date_local</code> für alle Anzeigen und Berechnungen (lokale Zeitzone der Aktivität)</span>
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
