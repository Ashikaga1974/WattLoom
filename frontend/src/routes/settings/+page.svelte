<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { api } from '$lib/api';

	let weightInput    = $state<string>('');
	let birthYearInput = $state<string>('');
	let ftpManualInput = $state<string>('');
	let saved          = $state<{ weight_kg: number | null; birth_year: number | null; ftp_manual: number | null } | null>(null);
	let saving         = $state(false);
	let saveSuccess    = $state(false);
	let saveError      = $state<string | null>(null);

	// Import
	let importStatus = $state<'idle' | 'running' | 'done' | 'error'>('idle');
	let importLog    = $state<string[]>([]);
	let importZip    = $state<string | null>(null);
	let pollTimer: ReturnType<typeof setInterval> | null = null;

	// Reset
	let resetConfirm = $state(false);
	let resetBusy    = $state(false);
	let resetError   = $state<string | null>(null);
	let resetDone    = $state(false);

	onMount(async () => {
		try {
			const res = await api.getSettings();
			saved = res;
			if (res.weight_kg   != null) weightInput    = String(res.weight_kg);
			if (res.birth_year  != null) birthYearInput = String(res.birth_year);
			if (res.ftp_manual  != null) ftpManualInput = String(res.ftp_manual);
		} catch { /* ignore */ }

		await refreshImportStatus();
		if (importStatus === 'running') startPolling();
	});

	onDestroy(() => stopPolling());

	async function refreshImportStatus() {
		try {
			const s = await api.importStatus();
			importStatus = s.status as typeof importStatus;
			importLog    = s.log;
			importZip    = s.zip_name;
		} catch { /* Backend nicht erreichbar */ }
	}

	function startPolling() {
		if (pollTimer) return;
		pollTimer = setInterval(async () => {
			await refreshImportStatus();
			if (importStatus !== 'running') stopPolling();
		}, 1000);
	}

	function stopPolling() {
		if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
	}

	async function startImport() {
		importLog    = [];
		importZip    = null;
		importStatus = 'running';
		try {
			await api.startImport();
			startPolling();
		} catch (e) {
			importStatus = 'error';
			importLog    = [e instanceof Error ? e.message : 'Fehler beim Starten'];
		}
	}

	async function confirmReset() {
		resetBusy  = true;
		resetError = null;
		resetDone  = false;
		try {
			const res = await api.resetDb();
			if (!res.ok) throw new Error(res.message ?? 'Fehler');
			resetDone    = true;
			resetConfirm = false;
			importStatus = 'idle';
			importLog    = [];
			importZip    = null;
		} catch (e) {
			resetError = e instanceof Error ? e.message : 'Fehler beim Zurücksetzen';
		} finally {
			resetBusy = false;
		}
	}

	async function save() {
		const kg = parseFloat(String(weightInput).replace(',', '.'));
		if (weightInput && (isNaN(kg) || kg < 30 || kg > 200)) {
			saveError = 'Gewicht muss zwischen 30 und 200 kg liegen';
			return;
		}
		const year = birthYearInput ? parseInt(birthYearInput) : null;
		if (year !== null && (year < 1920 || year > 2010)) {
			saveError = 'Geburtsjahr muss zwischen 1920 und 2010 liegen';
			return;
		}
		const ftp = ftpManualInput ? parseInt(ftpManualInput) : null;
		if (ftp !== null && (ftp < 50 || ftp > 600)) {
			saveError = 'FTP muss zwischen 50 und 600 Watt liegen';
			return;
		}
		saving    = true;
		saveError = null;
		try {
			const res = await api.saveSettings({
				weight_kg:  weightInput    ? kg   : undefined,
				birth_year: year  ?? undefined,
				ftp_manual: ftp   ?? undefined,
			});
			saved       = res;
			saveSuccess = true;
			setTimeout(() => (saveSuccess = false), 2500);
		} catch (e) {
			saveError = e instanceof Error ? e.message : 'Speichern fehlgeschlagen';
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head>
	<title>Einstellungen – MyBiking</title>
</svelte:head>

<div class="space-y-8 max-w-2xl">

	<!-- Header -->
	<div>
		<h1 class="text-2xl font-bold">Einstellungen</h1>
		<p class="text-xs text-gray-500 mt-0.5">Persönliche Daten · Import · Datenbank</p>
	</div>

	<!-- Persönliche Daten -->
	<section class="rounded-xl bg-gray-800/40 border border-gray-800 overflow-hidden">
		<div class="px-5 py-4 border-b border-gray-800/80">
			<h2 class="text-sm font-semibold text-gray-300">Persönliche Daten</h2>
			<p class="text-xs text-gray-600 mt-0.5">Für w/kg- und VO2max-Berechnungen auf der FTP-Seite</p>
		</div>

		<div class="p-5 space-y-5">
			<div class="grid grid-cols-1 sm:grid-cols-3 gap-5">
				<!-- Gewicht -->
				<div>
					<label for="weight" class="block text-xs text-gray-400 uppercase tracking-wider mb-2">
						Körpergewicht
					</label>
					<div class="flex items-center gap-2">
						<input
							id="weight"
							type="number"
							step="0.1"
							min="30"
							max="200"
							bind:value={weightInput}
							placeholder="75.5"
							class="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200
							       focus:outline-none focus:border-orange-500 transition-colors"
							onkeydown={(e) => e.key === 'Enter' && save()}
						/>
						<span class="text-xs text-gray-500 whitespace-nowrap">kg</span>
					</div>
					{#if saved?.weight_kg != null}
						<p class="text-xs text-gray-600 mt-1.5">{saved.weight_kg} kg gespeichert</p>
					{/if}
				</div>

				<!-- Geburtsjahr -->
				<div>
					<label for="birthyear" class="block text-xs text-gray-400 uppercase tracking-wider mb-2">
						Geburtsjahr
					</label>
					<input
						id="birthyear"
						type="number"
						step="1"
						min="1920"
						max="2010"
						bind:value={birthYearInput}
						placeholder="1985"
						class="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200
						       focus:outline-none focus:border-orange-500 transition-colors"
						onkeydown={(e) => e.key === 'Enter' && save()}
					/>
					{#if saved?.birth_year != null}
						<p class="text-xs text-gray-600 mt-1.5">{saved.birth_year} · {new Date().getFullYear() - saved.birth_year} Jahre</p>
					{/if}
				</div>

				<!-- Manuelle FTP -->
				<div>
					<label for="ftp" class="block text-xs text-gray-400 uppercase tracking-wider mb-2">
						FTP <span class="text-gray-600 normal-case tracking-normal">(aus eigenem Test)</span>
					</label>
					<div class="flex items-center gap-2">
						<input
							id="ftp"
							type="number"
							step="1"
							min="50"
							max="600"
							bind:value={ftpManualInput}
							placeholder="220"
							class="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200
							       focus:outline-none focus:border-orange-500 transition-colors"
							onkeydown={(e) => e.key === 'Enter' && save()}
						/>
						<span class="text-xs text-gray-500">W</span>
					</div>
					{#if saved?.ftp_manual != null}
						<p class="text-xs text-gray-600 mt-1.5">{saved.ftp_manual} W gespeichert</p>
					{:else}
						<p class="text-xs text-gray-700 mt-1.5">20-min-Test × 0,95</p>
					{/if}
				</div>
			</div>

			<div class="flex items-center gap-4 pt-1">
				<button
					onclick={save}
					disabled={saving}
					class="rounded-lg px-5 py-2 text-sm font-medium bg-orange-600 hover:bg-orange-500
					       disabled:opacity-50 transition-colors text-white"
				>
					{saving ? 'Speichern…' : 'Speichern'}
				</button>
				{#if saveSuccess}
					<span class="text-sm text-green-400">Gespeichert</span>
				{/if}
				{#if saveError}
					<span class="text-sm text-red-400">{saveError}</span>
				{/if}
			</div>
		</div>
	</section>

	<!-- Import -->
	<section class="rounded-xl bg-gray-800/40 border border-gray-800 overflow-hidden">
		<div class="px-5 py-4 border-b border-gray-800/80">
			<h2 class="text-sm font-semibold text-gray-300">Daten importieren</h2>
			<p class="text-xs text-gray-600 mt-0.5">
				Neuen Strava-Export in den <code class="bg-gray-800 px-1 rounded text-gray-400">download/</code>-Ordner legen,
				dann Import starten – die neueste ZIP wird automatisch erkannt.
			</p>
		</div>

		<div class="p-5 space-y-4">
			<div class="flex items-center gap-4">
				<button
					onclick={startImport}
					disabled={importStatus === 'running'}
					class="rounded-lg px-5 py-2 text-sm font-medium bg-orange-600 hover:bg-orange-500
					       disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-white"
				>
					{importStatus === 'running' ? 'Import läuft…' : 'Import starten'}
				</button>

				{#if importZip}
					<span class="text-xs text-gray-500 font-mono">{importZip}</span>
				{/if}
				{#if importStatus === 'done'}
					<span class="text-sm text-green-400">Abgeschlossen</span>
				{:else if importStatus === 'error'}
					<span class="text-sm text-red-400">Fehler beim Import</span>
				{/if}
			</div>

			{#if importLog.length > 0}
				<div class="rounded-lg bg-gray-950 border border-gray-800/60 p-3 max-h-56 overflow-y-auto
				            font-mono text-xs text-gray-400 space-y-0.5 leading-relaxed">
					{#each importLog as line}
						<div
							class:text-red-400={line.startsWith('ERR') || line.startsWith('FEHLER')}
							class:text-yellow-400={line.startsWith('WARN')}
							class:text-green-400={line.startsWith('Import abgeschlossen')}
							class:text-gray-300={!line.startsWith('ERR') && !line.startsWith('FEHLER') && !line.startsWith('WARN') && !line.startsWith('Import abgeschlossen')}
						>{line}</div>
					{/each}
					{#if importStatus === 'running'}
						<div class="text-gray-600 animate-pulse">…</div>
					{/if}
				</div>
			{/if}
		</div>
	</section>

	<!-- Datenbank zurücksetzen -->
	<section class="rounded-xl bg-gray-800/40 border border-gray-800 overflow-hidden">
		<div class="px-5 py-4 border-b border-gray-800/80">
			<h2 class="text-sm font-semibold text-gray-300">Datenbank zurücksetzen</h2>
			<p class="text-xs text-gray-600 mt-0.5">
				Löscht alle Aktivitäten, Tracks, Laps und Bikes – persönliche Einstellungen bleiben erhalten.
			</p>
		</div>

		<div class="p-5">
			{#if resetDone}
				<p class="text-sm text-green-400 mb-3">Datenbank wurde geleert.</p>
			{/if}
			{#if resetError}
				<p class="text-sm text-red-400 mb-3">{resetError}</p>
			{/if}

			{#if !resetConfirm}
				<button
					onclick={() => { resetConfirm = true; resetDone = false; resetError = null; }}
					disabled={importStatus === 'running'}
					class="rounded-lg px-5 py-2 text-sm font-medium border border-red-900 text-red-500
					       hover:bg-red-950/40 hover:border-red-700 hover:text-red-400
					       disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
				>
					Datenbank leeren
				</button>
			{:else}
				<div class="rounded-lg border border-red-900/60 bg-red-950/20 p-4 space-y-3">
					<p class="text-sm text-red-300">Alle importierten Daten werden unwiderruflich gelöscht. Wirklich fortfahren?</p>
					<div class="flex gap-3">
						<button
							onclick={confirmReset}
							disabled={resetBusy}
							class="rounded-lg px-4 py-2 text-sm font-medium bg-red-700 hover:bg-red-600
							       disabled:opacity-50 transition-colors text-white"
						>
							{resetBusy ? 'Lösche…' : 'Ja, jetzt leeren'}
						</button>
						<button
							onclick={() => resetConfirm = false}
							disabled={resetBusy}
							class="rounded-lg px-4 py-2 text-sm font-medium text-gray-400 hover:text-gray-200 transition-colors"
						>
							Abbrechen
						</button>
					</div>
				</div>
			{/if}
		</div>
	</section>

</div>
