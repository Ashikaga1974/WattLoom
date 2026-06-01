import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type Bike, type Settings } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

type ImportStatus = 'idle' | 'running' | 'done' | 'error';

export default function SettingsPage() {
  // Einstellungen-Felder
  const [weightInput, setWeightInput]     = useState('');
  const [birthYearInput, setBirthYearInput] = useState('');
  const [ftpInput, setFtpInput]           = useState('');
  const [tzInput, setTzInput]             = useState('auto');
  const [saved, setSaved]                 = useState<Settings | null>(null);
  const [saving, setSaving]               = useState(false);
  const [saveSuccess, setSaveSuccess]     = useState(false);
  const [saveError, setSaveError]         = useState<string | null>(null);

  // Import
  const [importStatus, setImportStatus]   = useState<ImportStatus>('idle');
  const [importLog, setImportLog]         = useState<string[]>([]);
  const [importZip, setImportZip]         = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // FIT-Einzelimport
  const [bikes, setBikes]                 = useState<Bike[]>([]);
  const [fitFile, setFitFile]             = useState<File | null>(null);
  const [fitBikeId, setFitBikeId]         = useState('');
  const [fitUploading, setFitUploading]   = useState(false);
  const [fitResult, setFitResult]         = useState<{ activity_id: number; name: string } | null>(null);
  const [fitError, setFitError]           = useState<string | null>(null);
  const fitInputRef                       = useRef<HTMLInputElement>(null);
  const navigate                          = useNavigate();

  // Reset
  const [resetConfirm, setResetConfirm]   = useState(false);
  const [resetBusy, setResetBusy]         = useState(false);
  const [resetError, setResetError]       = useState<string | null>(null);
  const [resetDone, setResetDone]         = useState(false);

  // Lade-Status initial
  const [loadingSettings, setLoadingSettings] = useState(true);

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }

  async function refreshStatus() {
    try {
      const s = await api.importStatus();
      setImportStatus(s.status as ImportStatus);
      setImportLog(s.log);
      setImportZip(s.zip_name);
      if (s.status !== 'running') stopPolling();
    } catch { /* Backend nicht erreichbar */ }
  }

  function startPolling() {
    if (pollRef.current) return;
    pollRef.current = setInterval(refreshStatus, 2000);
  }

  useEffect(() => {
    async function init() {
      try {
        const res = await api.getSettings();
        setSaved(res);
        if (res.weight_kg != null)  setWeightInput(String(res.weight_kg));
        if (res.birth_year != null) setBirthYearInput(String(res.birth_year));
        if (res.ftp_manual != null) setFtpInput(String(res.ftp_manual));
        setTzInput(res.tz_offset != null ? String(res.tz_offset) : 'auto');
      } catch { /* ignorieren */ }
      setLoadingSettings(false);

      await refreshStatus();

      try {
        const b = await api.bikes();
        setBikes(b);
        if (b.length > 0) setFitBikeId(b[0].id);
      } catch { /* ignorieren */ }
    }
    init();
    return stopPolling;
  }, []);

  // Polling starten, wenn Status 'running' wurde
  useEffect(() => {
    if (importStatus === 'running') startPolling();
    else stopPolling();
  }, [importStatus]);

  async function save() {
    const kg = parseFloat(weightInput.replace(',', '.'));
    if (weightInput && (isNaN(kg) || kg < 30 || kg > 200)) {
      setSaveError('Gewicht muss zwischen 30 und 200 kg liegen');
      return;
    }
    const year = birthYearInput ? parseInt(birthYearInput) : null;
    if (year !== null && (year < 1920 || year > 2010)) {
      setSaveError('Geburtsjahr muss zwischen 1920 und 2010 liegen');
      return;
    }
    const ftp = ftpInput ? parseInt(ftpInput) : null;
    if (ftp !== null && (ftp < 50 || ftp > 600)) {
      setSaveError('FTP muss zwischen 50 und 600 Watt liegen');
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const tz = tzInput === 'auto' ? null : parseInt(tzInput);
      const res = await api.saveSettings({
        weight_kg:  weightInput ? kg : undefined,
        birth_year: year ?? undefined,
        ftp_manual: ftp ?? undefined,
        tz_offset:  tz,
      });
      setSaved(res);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Speichern fehlgeschlagen');
    } finally {
      setSaving(false);
    }
  }

  async function doStartImport() {
    setImportLog([]);
    setImportZip(null);
    setImportStatus('running');
    try {
      await api.startImport();
      startPolling();
    } catch (e) {
      setImportStatus('error');
      setImportLog([e instanceof Error ? e.message : 'Fehler beim Starten']);
    }
  }

  async function confirmReset() {
    setResetBusy(true);
    setResetError(null);
    setResetDone(false);
    try {
      const res = await api.resetDb();
      if (!res.ok) throw new Error(res.message ?? 'Fehler');
      setResetDone(true);
      setResetConfirm(false);
      setImportStatus('idle');
      setImportLog([]);
      setImportZip(null);
    } catch (e) {
      setResetError(e instanceof Error ? e.message : 'Fehler beim Zurücksetzen');
    } finally {
      setResetBusy(false);
    }
  }

  async function doFitUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!fitFile || !fitBikeId) return;
    setFitUploading(true);
    setFitResult(null);
    setFitError(null);
    try {
      const res = await api.importFitFile(fitFile, fitBikeId);
      setFitResult(res);
      setFitFile(null);
      if (fitInputRef.current) fitInputRef.current.value = '';
    } catch (err) {
      setFitError(err instanceof Error ? err.message : 'Unbekannter Fehler');
    } finally {
      setFitUploading(false);
    }
  }

  function logLineClass(line: string): string {
    if (line.startsWith('ERR') || line.startsWith('FEHLER')) return 'text-red-500';
    if (line.startsWith('WARN')) return 'text-yellow-500';
    if (line.startsWith('Import abgeschlossen')) return 'text-green-500';
    return 'text-muted-foreground';
  }

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Einstellungen</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Persönliche Daten · Import · Datenbank</p>
      </div>

      {/* ── Persönliche Daten ── */}
      <Card>
        <CardHeader className="border-b border-border pb-3">
          <CardTitle className="text-sm font-semibold">Persönliche Daten</CardTitle>
          <p className="text-xs text-muted-foreground">Für w/kg- und VO2max-Berechnungen auf der FTP-Seite</p>
        </CardHeader>
        <CardContent className="pt-5 space-y-5">
          {loadingSettings ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                {/* Gewicht */}
                <div>
                  <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-2">
                    Körpergewicht
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.1"
                      min="30"
                      max="200"
                      value={weightInput}
                      onChange={(e) => setWeightInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && save()}
                      placeholder="75.5"
                      className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-colors"
                    />
                    <span className="text-xs text-muted-foreground whitespace-nowrap">kg</span>
                  </div>
                  {saved?.weight_kg != null && (
                    <p className="text-xs text-muted-foreground/60 mt-1.5">{saved.weight_kg} kg gespeichert</p>
                  )}
                </div>

                {/* Geburtsjahr */}
                <div>
                  <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-2">
                    Geburtsjahr
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="1920"
                    max="2010"
                    value={birthYearInput}
                    onChange={(e) => setBirthYearInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && save()}
                    placeholder="1985"
                    className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-colors"
                  />
                  {saved?.birth_year != null && (
                    <p className="text-xs text-muted-foreground/60 mt-1.5">
                      {saved.birth_year} · {new Date().getFullYear() - saved.birth_year} Jahre
                    </p>
                  )}
                </div>

                {/* Manuelle FTP */}
                <div>
                  <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-2">
                    FTP <span className="text-muted-foreground/50 normal-case tracking-normal">(aus eigenem Test)</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="1"
                      min="50"
                      max="600"
                      value={ftpInput}
                      onChange={(e) => setFtpInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && save()}
                      placeholder="220"
                      className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-colors"
                    />
                    <span className="text-xs text-muted-foreground">W</span>
                  </div>
                  {saved?.ftp_manual != null ? (
                    <p className="text-xs text-muted-foreground/60 mt-1.5">{saved.ftp_manual} W gespeichert</p>
                  ) : (
                    <p className="text-xs text-muted-foreground/40 mt-1.5">20-min-Test × 0,95</p>
                  )}
                </div>

                {/* Zeitzone */}
                <div>
                  <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-2">
                    Zeitzone
                  </label>
                  <select
                    value={tzInput}
                    onChange={(e) => setTzInput(e.target.value)}
                    className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-colors"
                  >
                    <option value="auto">Auto (Systemzeit)</option>
                    <option value="1">+1h (CET – Winter)</option>
                    <option value="2">+2h (CEST – Sommer)</option>
                  </select>
                  <p className="text-xs text-muted-foreground/50 mt-1.5">
                    Aktivitätszeiten sind in UTC. Auto nutzt die Browser-Zeitzone.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4 pt-1">
                <button
                  onClick={save}
                  disabled={saving}
                  className="rounded-md px-5 py-2 text-sm font-medium bg-orange-500 hover:bg-orange-600 disabled:opacity-50 transition-colors text-white cursor-pointer"
                >
                  {saving ? 'Speichern…' : 'Speichern'}
                </button>
                {saveSuccess && <span className="text-sm text-green-600">Gespeichert</span>}
                {saveError && <span className="text-sm text-red-500">{saveError}</span>}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Import ── */}
      <Card>
        <CardHeader className="border-b border-border pb-3">
          <CardTitle className="text-sm font-semibold">Daten importieren</CardTitle>
          <p className="text-xs text-muted-foreground">
            Neuen Strava-Export in den{' '}
            <code className="bg-muted px-1 rounded text-foreground text-xs">download/</code>
            {' '}Ordner legen, dann Import starten – die neueste ZIP wird automatisch erkannt.
          </p>
        </CardHeader>
        <CardContent className="pt-5 space-y-4">
          <div className="flex items-center gap-4 flex-wrap">
            <button
              onClick={doStartImport}
              disabled={importStatus === 'running'}
              className="rounded-md px-5 py-2 text-sm font-medium bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-white cursor-pointer"
            >
              {importStatus === 'running' ? 'Import läuft…' : 'Import starten'}
            </button>
            {importZip && (
              <span className="text-xs text-muted-foreground font-mono">{importZip}</span>
            )}
            {importStatus === 'done' && <span className="text-sm text-green-600">Abgeschlossen</span>}
            {importStatus === 'error' && <span className="text-sm text-red-500">Fehler beim Import</span>}
          </div>

          {importLog.length > 0 && (
            <div className="rounded-lg border border-border bg-muted/40 p-3 max-h-56 overflow-y-auto font-mono text-xs space-y-0.5 leading-relaxed">
              {importLog.map((line, i) => (
                <div key={i} className={logLineClass(line)}>{line}</div>
              ))}
              {importStatus === 'running' && (
                <div className="text-muted-foreground/40 animate-pulse">…</div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── FIT-Datei Einzelimport ── */}
      <Card>
        <CardHeader className="border-b border-border pb-3">
          <CardTitle className="text-sm font-semibold">FIT-Datei importieren</CardTitle>
          <p className="text-xs text-muted-foreground">
            Einzelne .fit-Datei von Garmin, Zepp/Amazfit oder anderen Geräten direkt importieren.
          </p>
        </CardHeader>
        <CardContent className="pt-5">
          <form onSubmit={doFitUpload} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Datei-Auswahl */}
              <div>
                <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-2">
                  FIT-Datei
                </label>
                <input
                  ref={fitInputRef}
                  type="file"
                  accept=".fit"
                  onChange={e => {
                    setFitFile(e.target.files?.[0] ?? null);
                    setFitResult(null);
                    setFitError(null);
                  }}
                  className="w-full text-sm text-muted-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-medium file:bg-muted file:text-foreground hover:file:bg-muted/80 cursor-pointer"
                />
              </div>

              {/* Bike-Dropdown */}
              <div>
                <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-2">
                  Bike
                </label>
                <select
                  value={fitBikeId}
                  onChange={e => setFitBikeId(e.target.value)}
                  className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-colors"
                >
                  {bikes.length === 0 && (
                    <option value="">Keine Bikes vorhanden</option>
                  )}
                  {bikes.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-4 flex-wrap">
              <button
                type="submit"
                disabled={!fitFile || !fitBikeId || fitUploading}
                className="rounded-md px-5 py-2 text-sm font-medium bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-white cursor-pointer"
              >
                {fitUploading ? 'Importiere…' : 'Importieren'}
              </button>

              {fitResult && (
                <div className="flex items-center gap-3">
                  <span className="text-sm text-green-600">
                    Importiert: <span className="font-medium">{fitResult.name}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => navigate(`/activities/${fitResult.activity_id}`)}
                    className="text-xs text-orange-500 hover:text-orange-400 underline underline-offset-2 transition-colors"
                  >
                    Aktivität öffnen →
                  </button>
                </div>
              )}

              {fitError && (
                <span className="text-sm text-red-500">{fitError}</span>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {/* ── Datenbank zurücksetzen ── */}
      <Card>
        <CardHeader className="border-b border-border pb-3">
          <CardTitle className="text-sm font-semibold">Datenbank zurücksetzen</CardTitle>
          <p className="text-xs text-muted-foreground">
            Löscht alle Aktivitäten, Tracks, Laps und Bikes – persönliche Einstellungen bleiben erhalten.
          </p>
        </CardHeader>
        <CardContent className="pt-5">
          {resetDone && <p className="text-sm text-green-600 mb-3">Datenbank wurde geleert.</p>}
          {resetError && <p className="text-sm text-red-500 mb-3">{resetError}</p>}

          {!resetConfirm ? (
            <button
              onClick={() => { setResetConfirm(true); setResetDone(false); setResetError(null); }}
              disabled={importStatus === 'running'}
              className="rounded-md px-5 py-2 text-sm font-medium border border-destructive/40 text-destructive hover:bg-destructive/10 hover:border-destructive/70 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              Datenbank leeren
            </button>
          ) : (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 space-y-3">
              <p className="text-sm text-destructive">
                Alle importierten Daten werden unwiderruflich gelöscht. Wirklich fortfahren?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={confirmReset}
                  disabled={resetBusy}
                  className="rounded-md px-4 py-2 text-sm font-medium bg-red-600 hover:bg-red-700 disabled:opacity-50 transition-colors text-white cursor-pointer"
                >
                  {resetBusy ? 'Lösche…' : 'Ja, jetzt leeren'}
                </button>
                <button
                  onClick={() => setResetConfirm(false)}
                  disabled={resetBusy}
                  className="rounded-md px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                >
                  Abbrechen
                </button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
