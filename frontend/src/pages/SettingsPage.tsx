import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, type Bike, type Settings, type WeatherStatus } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { CONFIG_DEFAULTS, useConfigReload } from '@/lib/config-context';
import { fmtClock, fmtDate } from '@/lib/format';

type ImportStatus = 'idle' | 'running' | 'done' | 'error';

export default function SettingsPage() {
  // Einstellungen-Felder
  const [weightInput, setWeightInput]     = useState('');
  const [birthYearInput, setBirthYearInput] = useState('');
  const [hrMaxInput, setHrMaxInput]       = useState('185');
  const [tzInput, setTzInput]             = useState('auto');
  const [saved, setSaved]                 = useState<Settings | null>(null);
  const [saving, setSaving]               = useState(false);
  const [saveSuccess, setSaveSuccess]     = useState(false);
  const [saveError, setSaveError]         = useState<string | null>(null);

  const [yearlyKmGoalInput, setYearlyKmGoalInput]     = useState('');
  const [weeklyHoursGoalInput, setWeeklyHoursGoalInput] = useState('');
  const [goalSaving, setGoalSaving]       = useState(false);
  const [goalSuccess, setGoalSuccess]     = useState(false);
  const [goalError, setGoalError]         = useState<string | null>(null);

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
  const [fitResult, setFitResult]         = useState<{ activity_id: number; name: string; is_ride: boolean } | null>(null);
  const [fitError, setFitError]           = useState<string | null>(null);
  const fitInputRef                       = useRef<HTMLInputElement>(null);

  // TCX-Einzelimport
  const [tcxFile, setTcxFile]             = useState<File | null>(null);
  const [tcxBikeId, setTcxBikeId]         = useState('');
  const [tcxUploading, setTcxUploading]   = useState(false);
  const [tcxResult, setTcxResult]         = useState<{ activity_id: number; name: string; is_ride: boolean } | null>(null);
  const [tcxError, setTcxError]           = useState<string | null>(null);
  const tcxInputRef                       = useRef<HTMLInputElement>(null);

  // GPX-Einzelimport
  const [gpxFile, setGpxFile]             = useState<File | null>(null);
  const [gpxBikeId, setGpxBikeId]         = useState('');
  const [gpxUploading, setGpxUploading]   = useState(false);
  const [gpxResult, setGpxResult]         = useState<{ activity_id: number; name: string; is_ride: boolean } | null>(null);
  const [gpxError, setGpxError]           = useState<string | null>(null);
  const gpxInputRef                       = useRef<HTMLInputElement>(null);

  const navigate                          = useNavigate();
  const [searchParams, setSearchParams]   = useSearchParams();
  const tab                               = searchParams.get('tab') ?? 'allgemein';
  function handleTabChange(value: string) {
    setSearchParams({ tab: value }, { replace: true });
  }

  // App-Konfiguration
  const reloadConfig = useConfigReload();
  const [bezierInput, setBezierInput]           = useState(String(CONFIG_DEFAULTS.bezier_tension));
  const [sparklineInput, setSparklineInput]     = useState(String(CONFIG_DEFAULTS.sparkline_weeks));
  const [bucketInput, setBucketInput]           = useState(String(CONFIG_DEFAULTS.speed_color_buckets));
  const [simplifyInput, setSimplifyInput]       = useState(String(CONFIG_DEFAULTS.track_simplify_m));
  const [wearPctInput, setWearPctInput]         = useState(String(CONFIG_DEFAULTS.wear_warning_pct));
  const [configSaving, setConfigSaving]         = useState(false);
  const [configSuccess, setConfigSuccess]       = useState(false);
  const [configError, setConfigError]           = useState<string | null>(null);

  // Erweiterte Einstellungen (Leistungsschätzung, PMC, Streckenvergleich)
  const [defaultBikeIdInput, setDefaultBikeIdInput]     = useState('');
  const [crrInput, setCrrInput]                         = useState('0.004');
  const [cdaInput, setCdaInput]                         = useState('0.32');
  const [bikeKgInput, setBikeKgInput]                   = useState('8');
  const [thresholdHrPctInput, setThresholdHrPctInput]   = useState('85');
  const [ctlDaysInput, setCtlDaysInput]                 = useState('42');
  const [atlDaysInput, setAtlDaysInput]                 = useState('7');
  const [maxSpeedKmhInput, setMaxSpeedKmhInput]         = useState('90');
  const [matchRadiusMInput, setMatchRadiusMInput]       = useState('500');
  const [advancedSaving, setAdvancedSaving]             = useState(false);
  const [advancedSuccess, setAdvancedSuccess]           = useState(false);
  const [advancedError, setAdvancedError]               = useState<string | null>(null);

  // Diagramm & Darstellung
  const [comparisonSimplifyInput, setComparisonSimplifyInput] = useState(String(CONFIG_DEFAULTS.comparison_simplify));
  const [blockHoursInput, setBlockHoursInput]                 = useState(String(CONFIG_DEFAULTS.block_hours));
  const [volumeTrendWeeksInput, setVolumeTrendWeeksInput]     = useState(String(CONFIG_DEFAULTS.volume_trend_weeks));
  const [chartHeightMiniInput, setChartHeightMiniInput]       = useState(String(CONFIG_DEFAULTS.chart_height_mini));
  const [chartHeightCompactInput, setChartHeightCompactInput] = useState(String(CONFIG_DEFAULTS.chart_height_compact));
  const [chartHeightInput, setChartHeightInput]               = useState(String(CONFIG_DEFAULTS.chart_height));
  const [chartHeightDenseInput, setChartHeightDenseInput]     = useState(String(CONFIG_DEFAULTS.chart_height_dense));
  const [comparisonColorsInput, setComparisonColorsInput]     = useState<string[]>(CONFIG_DEFAULTS.comparison_colors);
  const [displaySaving, setDisplaySaving]                     = useState(false);
  const [displaySuccess, setDisplaySuccess]                   = useState(false);
  const [displayError, setDisplayError]                       = useState<string | null>(null);

  // Wetterdaten
  const [weatherStatus, setWeatherStatus]   = useState<WeatherStatus | null>(null);
  const [weatherFetching, setWeatherFetching] = useState(false);
  const weatherPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Leistungsschätzung
  const [powerBusy, setPowerBusy]     = useState(false);
  const [powerMsg, setPowerMsg]       = useState<string | null>(null);
  const [powerError, setPowerError]   = useState<string | null>(null);

  // WattLoomApp-Sync
  const [appSyncStatus, setAppSyncStatus] = useState<{ last_synced_at: string | null; last_status: string | null; last_message: string | null } | null>(null);
  const [appSyncBusy, setAppSyncBusy]     = useState(false);
  const [appSyncError, setAppSyncError]   = useState<string | null>(null);

  // Import-Sicherheitsabfrage
  const [importConfirm, setImportConfirm] = useState(false);

  // Reset
  const [resetConfirm, setResetConfirm]   = useState(false);
  const [resetBusy, setResetBusy]         = useState(false);
  const [resetError, setResetError]       = useState<string | null>(null);
  const [resetDone, setResetDone]         = useState(false);
  const [resetBackupName, setResetBackupName] = useState<string | null>(null);

  // Lade-Status initial
  const [loadingSettings, setLoadingSettings] = useState(true);

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }

  function stopWeatherPolling() {
    if (weatherPollRef.current) { clearInterval(weatherPollRef.current); weatherPollRef.current = null; }
  }

  async function refreshWeatherStatus() {
    try {
      const s = await api.weatherStatus();
      setWeatherStatus(s);
      if (!s.running) {
        stopWeatherPolling();
        setWeatherFetching(false);
      }
    } catch { /* ignorieren */ }
  }

  async function startWeatherFetch() {
    setWeatherFetching(true);
    try {
      await api.weatherFetchAll();
      weatherPollRef.current = setInterval(refreshWeatherStatus, 2000);
    } catch {
      setWeatherFetching(false);
    }
  }

  async function startPowerRecalc() {
    setPowerBusy(true);
    setPowerMsg(null);
    setPowerError(null);
    try {
      const res = await api.recalculatePower();
      if (res.ok) {
        setPowerMsg(res.message);
      } else {
        setPowerError(res.message);
      }
    } catch (e: unknown) {
      setPowerError(e instanceof Error ? e.message : 'Unbekannter Fehler');
    } finally {
      setPowerBusy(false);
    }
  }

  async function loadAppSyncStatus() {
    try {
      setAppSyncStatus(await api.appSyncStatus());
    } catch { /* ignorieren */ }
  }

  async function startAppSync() {
    setAppSyncBusy(true);
    setAppSyncError(null);
    try {
      const res = await api.appSyncRun();
      if (!res.ok) setAppSyncError(res.message);
      await loadAppSyncStatus();
    } catch (e: unknown) {
      setAppSyncError(e instanceof Error ? e.message : 'Unbekannter Fehler');
    } finally {
      setAppSyncBusy(false);
    }
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
        setHrMaxInput(String(res.hr_max ?? 185));
        setTzInput(res.tz_offset != null ? String(res.tz_offset) : 'auto');
        if (res.yearly_km_goal != null)    setYearlyKmGoalInput(String(res.yearly_km_goal));
        if (res.weekly_hours_goal != null) setWeeklyHoursGoalInput(String(res.weekly_hours_goal));
        setBezierInput(String(res.bezier_tension      ?? CONFIG_DEFAULTS.bezier_tension));
        setSparklineInput(String(res.sparkline_weeks  ?? CONFIG_DEFAULTS.sparkline_weeks));
        setBucketInput(String(res.speed_color_buckets ?? CONFIG_DEFAULTS.speed_color_buckets));
        setSimplifyInput(String(res.track_simplify_m  ?? CONFIG_DEFAULTS.track_simplify_m));
        setWearPctInput(String(res.wear_warning_pct   ?? CONFIG_DEFAULTS.wear_warning_pct));
        setDefaultBikeIdInput(res.default_bike_id ?? '');
        setCrrInput(String(res.crr ?? 0.004));
        setCdaInput(String(res.cda ?? 0.32));
        setBikeKgInput(String(res.bike_kg ?? 8));
        setThresholdHrPctInput(String(Math.round((res.threshold_hr_pct ?? 0.85) * 100)));
        setCtlDaysInput(String(res.ctl_days ?? 42));
        setAtlDaysInput(String(res.atl_days ?? 7));
        setMaxSpeedKmhInput(String(Math.round((res.max_plausible_speed_ms ?? 25) * 3.6)));
        setMatchRadiusMInput(String(Math.round((res.path_match_radius_km ?? 0.5) * 1000)));
        setComparisonSimplifyInput(String(res.comparison_simplify   ?? CONFIG_DEFAULTS.comparison_simplify));
        setBlockHoursInput(String(res.block_hours                   ?? CONFIG_DEFAULTS.block_hours));
        setVolumeTrendWeeksInput(String(res.volume_trend_weeks       ?? CONFIG_DEFAULTS.volume_trend_weeks));
        setChartHeightMiniInput(String(res.chart_height_mini         ?? CONFIG_DEFAULTS.chart_height_mini));
        setChartHeightCompactInput(String(res.chart_height_compact   ?? CONFIG_DEFAULTS.chart_height_compact));
        setChartHeightInput(String(res.chart_height                 ?? CONFIG_DEFAULTS.chart_height));
        setChartHeightDenseInput(String(res.chart_height_dense       ?? CONFIG_DEFAULTS.chart_height_dense));
        const colors = res.comparison_colors ? res.comparison_colors.split(',').filter(Boolean) : null;
        setComparisonColorsInput(colors && colors.length > 0 ? colors : CONFIG_DEFAULTS.comparison_colors);
      } catch { /* ignorieren */ }
      setLoadingSettings(false);

      await refreshStatus();
      await refreshWeatherStatus();
      await loadAppSyncStatus();

      try {
        const b = await api.bikes();
        setBikes(b);
        if (b.length > 0) {
          setFitBikeId(b[0].id); setTcxBikeId(b[0].id); setGpxBikeId(b[0].id);
          setDefaultBikeIdInput(prev => prev || b[0].id);
        }
      } catch { /* ignorieren */ }
    }
    init();
    return () => { stopPolling(); stopWeatherPolling(); };
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
    const hrMax = parseInt(hrMaxInput);
    if (isNaN(hrMax) || hrMax < 100 || hrMax > 240) {
      setSaveError('HRmax muss zwischen 100 und 240 bpm liegen');
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const tz = tzInput === 'auto' ? null : parseInt(tzInput);
      const res = await api.saveSettings({
        weight_kg:  weightInput ? kg : undefined,
        birth_year: year ?? undefined,
        hr_max:     hrMax,
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

  async function saveGoals() {
    const km = yearlyKmGoalInput ? parseFloat(yearlyKmGoalInput.replace(',', '.')) : null;
    if (km !== null && (isNaN(km) || km <= 0)) {
      setGoalError('Jahres-km-Ziel muss größer als 0 sein');
      return;
    }
    const hours = weeklyHoursGoalInput ? parseFloat(weeklyHoursGoalInput.replace(',', '.')) : null;
    if (hours !== null && (isNaN(hours) || hours <= 0)) {
      setGoalError('Wochenstunden-Ziel muss größer als 0 sein');
      return;
    }
    setGoalSaving(true);
    setGoalError(null);
    try {
      const res = await api.saveSettings({
        yearly_km_goal:    km,
        weekly_hours_goal: hours,
      });
      setSaved(res);
      setGoalSuccess(true);
      setTimeout(() => setGoalSuccess(false), 2500);
    } catch (e) {
      setGoalError(e instanceof Error ? e.message : 'Speichern fehlgeschlagen');
    } finally {
      setGoalSaving(false);
    }
  }

  async function saveConfig() {
    const bezier = parseFloat(bezierInput.replace(',', '.'));
    const sparkline = parseInt(sparklineInput);
    const buckets = parseInt(bucketInput);
    const simplify = parseInt(simplifyInput);
    const wearPct = parseFloat(wearPctInput.replace(',', '.'));
    if (isNaN(bezier) || bezier < 0 || bezier > 0.5) {
      setConfigError('Kurvenglättung: 0.0 – 0.5');
      return;
    }
    if (isNaN(sparkline) || sparkline < 4 || sparkline > 16) {
      setConfigError('Sparkline-Wochen: 4 – 16');
      return;
    }
    if (isNaN(buckets) || buckets < 5 || buckets > 40) {
      setConfigError('Farbstufen: 5 – 40');
      return;
    }
    if (isNaN(simplify) || simplify < 1 || simplify > 20) {
      setConfigError('Track-Toleranz: 1 – 20 m');
      return;
    }
    if (isNaN(wearPct) || wearPct < 50 || wearPct > 100) {
      setConfigError('Verschleiß-Warnschwelle: 50 – 100 %');
      return;
    }
    setConfigSaving(true);
    setConfigError(null);
    try {
      await api.saveSettings({
        bezier_tension:      bezier,
        sparkline_weeks:     sparkline,
        speed_color_buckets: buckets,
        track_simplify_m:    simplify,
        wear_warning_pct:    wearPct,
      });
      await reloadConfig();
      setConfigSuccess(true);
      setTimeout(() => setConfigSuccess(false), 2500);
    } catch (e) {
      setConfigError(e instanceof Error ? e.message : 'Speichern fehlgeschlagen');
    } finally {
      setConfigSaving(false);
    }
  }

  async function saveAdvanced() {
    const crr = parseFloat(crrInput.replace(',', '.'));
    const cda = parseFloat(cdaInput.replace(',', '.'));
    const bikeKg = parseFloat(bikeKgInput.replace(',', '.'));
    const thresholdPct = parseFloat(thresholdHrPctInput.replace(',', '.'));
    const ctlDays = parseInt(ctlDaysInput);
    const atlDays = parseInt(atlDaysInput);
    const maxSpeedKmh = parseFloat(maxSpeedKmhInput.replace(',', '.'));
    const matchRadiusM = parseFloat(matchRadiusMInput.replace(',', '.'));

    if (isNaN(crr) || crr <= 0 || crr > 0.02) {
      setAdvancedError('Rollwiderstand (Crr): 0.001 – 0.02');
      return;
    }
    if (isNaN(cda) || cda <= 0 || cda > 0.6) {
      setAdvancedError('Luftwiderstand (CdA): 0.1 – 0.6 m²');
      return;
    }
    if (isNaN(bikeKg) || bikeKg <= 0 || bikeKg > 30) {
      setAdvancedError('Bike-Gewicht: 1 – 30 kg');
      return;
    }
    if (isNaN(thresholdPct) || thresholdPct < 50 || thresholdPct > 100) {
      setAdvancedError('Schwellen-HR: 50 – 100 % HRmax');
      return;
    }
    if (isNaN(ctlDays) || ctlDays < 7 || ctlDays > 90) {
      setAdvancedError('CTL-Zeitkonstante: 7 – 90 Tage');
      return;
    }
    if (isNaN(atlDays) || atlDays < 3 || atlDays > 21) {
      setAdvancedError('ATL-Zeitkonstante: 3 – 21 Tage');
      return;
    }
    if (isNaN(maxSpeedKmh) || maxSpeedKmh < 40 || maxSpeedKmh > 200) {
      setAdvancedError('GPS-Sprung-Filter: 40 – 200 km/h');
      return;
    }
    if (isNaN(matchRadiusM) || matchRadiusM < 100 || matchRadiusM > 2000) {
      setAdvancedError('Streckenvergleich-Toleranz: 100 – 2000 m');
      return;
    }
    setAdvancedSaving(true);
    setAdvancedError(null);
    try {
      const res = await api.saveSettings({
        default_bike_id:        defaultBikeIdInput || undefined,
        crr,
        cda,
        bike_kg:                bikeKg,
        threshold_hr_pct:       thresholdPct / 100,
        ctl_days:               ctlDays,
        atl_days:               atlDays,
        max_plausible_speed_ms: maxSpeedKmh / 3.6,
        path_match_radius_km:   matchRadiusM / 1000,
      });
      setSaved(res);
      setAdvancedSuccess(true);
      setTimeout(() => setAdvancedSuccess(false), 2500);
    } catch (e) {
      setAdvancedError(e instanceof Error ? e.message : 'Speichern fehlgeschlagen');
    } finally {
      setAdvancedSaving(false);
    }
  }

  function updateComparisonColor(idx: number, value: string) {
    setComparisonColorsInput(prev => prev.map((c, i) => (i === idx ? value : c)));
  }

  async function saveDisplayConfig() {
    const comparisonSimplify = parseInt(comparisonSimplifyInput);
    const blockHours = parseInt(blockHoursInput);
    const volumeTrendWeeks = parseInt(volumeTrendWeeksInput);
    const chartHeightMini = parseInt(chartHeightMiniInput);
    const chartHeightCompact = parseInt(chartHeightCompactInput);
    const chartHeightVal = parseInt(chartHeightInput);
    const chartHeightDense = parseInt(chartHeightDenseInput);

    if (isNaN(comparisonSimplify) || comparisonSimplify < 5 || comparisonSimplify > 50) {
      setDisplayError('Track-Vereinfachung Vergleich: 5 – 50 m');
      return;
    }
    if (isNaN(blockHours) || blockHours < 1 || blockHours > 12 || 24 % blockHours !== 0) {
      setDisplayError('Zeitblock-Stunden: 1 – 12, muss 24 teilen (z.B. 1, 2, 3, 4, 6, 8, 12)');
      return;
    }
    if (isNaN(volumeTrendWeeks) || volumeTrendWeeks < 2 || volumeTrendWeeks > 12) {
      setDisplayError('Volumen-Trend-Fenster: 2 – 12 Wochen');
      return;
    }
    if (isNaN(chartHeightMini) || chartHeightMini < 60 || chartHeightMini > 200) {
      setDisplayError('Chart-Höhe Mini: 60 – 200 px');
      return;
    }
    if (isNaN(chartHeightCompact) || chartHeightCompact < 80 || chartHeightCompact > 260) {
      setDisplayError('Chart-Höhe Kompakt: 80 – 260 px');
      return;
    }
    if (isNaN(chartHeightVal) || chartHeightVal < 120 || chartHeightVal > 320) {
      setDisplayError('Chart-Höhe Standard: 120 – 320 px');
      return;
    }
    if (isNaN(chartHeightDense) || chartHeightDense < 140 || chartHeightDense > 360) {
      setDisplayError('Chart-Höhe Dicht: 140 – 360 px');
      return;
    }
    setDisplaySaving(true);
    setDisplayError(null);
    try {
      await api.saveSettings({
        comparison_simplify:  comparisonSimplify,
        block_hours:          blockHours,
        volume_trend_weeks:   volumeTrendWeeks,
        chart_height_mini:    chartHeightMini,
        chart_height_compact: chartHeightCompact,
        chart_height:         chartHeightVal,
        chart_height_dense:   chartHeightDense,
        comparison_colors:    comparisonColorsInput.join(','),
      });
      await reloadConfig();
      setDisplaySuccess(true);
      setTimeout(() => setDisplaySuccess(false), 2500);
    } catch (e) {
      setDisplayError(e instanceof Error ? e.message : 'Speichern fehlgeschlagen');
    } finally {
      setDisplaySaving(false);
    }
  }

  async function handleImportClick() {
    const stats = await api.activityStats();
    if (stats.total_rides > 0) {
      setImportConfirm(true);
    } else {
      await doStartImport();
    }
  }

  async function doStartImport() {
    setImportConfirm(false);
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
      setResetBackupName(res.backup ?? null);
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
    if (!fitFile) return;
    setFitUploading(true);
    setFitResult(null);
    setFitError(null);
    try {
      const res = await api.importFitFile(fitFile, fitBikeId || undefined);
      setFitResult(res);
      setFitFile(null);
      if (fitInputRef.current) fitInputRef.current.value = '';
    } catch (err) {
      setFitError(err instanceof Error ? err.message : 'Unbekannter Fehler');
    } finally {
      setFitUploading(false);
    }
  }

  async function doTcxUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!tcxFile) return;
    setTcxUploading(true);
    setTcxResult(null);
    setTcxError(null);
    try {
      const res = await api.importTcxFile(tcxFile, tcxBikeId || undefined);
      setTcxResult(res);
      setTcxFile(null);
      if (tcxInputRef.current) tcxInputRef.current.value = '';
    } catch (err) {
      setTcxError(err instanceof Error ? err.message : 'Unbekannter Fehler');
    } finally {
      setTcxUploading(false);
    }
  }

  async function doGpxUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!gpxFile) return;
    setGpxUploading(true);
    setGpxResult(null);
    setGpxError(null);
    try {
      const res = await api.importGpxFile(gpxFile, gpxBikeId || undefined);
      setGpxResult(res);
      setGpxFile(null);
      if (gpxInputRef.current) gpxInputRef.current.value = '';
    } catch (err) {
      setGpxError(err instanceof Error ? err.message : 'Unbekannter Fehler');
    } finally {
      setGpxUploading(false);
    }
  }

  function logLineClass(line: string): string {
    if (line.startsWith('ERR') || line.startsWith('FEHLER')) return 'text-red-500';
    if (line.startsWith('WARN')) return 'text-yellow-500';
    if (line.startsWith('Import abgeschlossen')) return 'text-green-500';
    return 'text-muted-foreground';
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Einstellungen</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Persönliche Daten · Import · Datenbank</p>
      </div>

      <Tabs value={tab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="allgemein">Allgemein</TabsTrigger>
          <TabsTrigger value="importe">Importe</TabsTrigger>
        </TabsList>

        <TabsContent value="allgemein" className="mt-6 space-y-8">

      {/* ── Persönliche Daten ── */}
      <Card>
        <CardHeader className="border-b border-border pb-3">
          <CardTitle className="text-sm font-semibold">Persönliche Daten</CardTitle>
          <p className="text-xs text-muted-foreground">Für w/kg-Berechnungen</p>
        </CardHeader>
        <CardContent className="pt-5 space-y-5">
          {loadingSettings ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
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

                {/* HRmax */}
                <div>
                  <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-2">
                    HRmax
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="1"
                      min="100"
                      max="240"
                      value={hrMaxInput}
                      onChange={(e) => setHrMaxInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && save()}
                      placeholder="185"
                      className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-colors"
                    />
                    <span className="text-xs text-muted-foreground whitespace-nowrap">bpm</span>
                  </div>
                  <p className="text-xs text-muted-foreground/50 mt-1.5">Für hrTSS- und PMC-Berechnungen (Standard 185)</p>
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

      {/* ── Trainingsziele ── */}
      <Card>
        <CardHeader className="border-b border-border pb-3">
          <CardTitle className="text-sm font-semibold">Trainingsziele</CardTitle>
          <p className="text-xs text-muted-foreground">Fortschrittsanzeige im Dashboard – leer lassen zum Deaktivieren</p>
        </CardHeader>
        <CardContent className="pt-5 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-2">
                Jahresziel
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="10"
                  min="0"
                  value={yearlyKmGoalInput}
                  onChange={(e) => setYearlyKmGoalInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && saveGoals()}
                  placeholder="3000"
                  className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-colors"
                />
                <span className="text-xs text-muted-foreground whitespace-nowrap">km / Jahr</span>
              </div>
            </div>

            <div>
              <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-2">
                Wochenziel
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={weeklyHoursGoalInput}
                  onChange={(e) => setWeeklyHoursGoalInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && saveGoals()}
                  placeholder="5"
                  className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-colors"
                />
                <span className="text-xs text-muted-foreground whitespace-nowrap">h / Woche</span>
              </div>
              <p className="text-xs text-muted-foreground/50 mt-1.5">Rad + Workout + Kraft zusammen</p>
            </div>
          </div>

          <div className="flex items-center gap-4 pt-1">
            <button
              onClick={saveGoals}
              disabled={goalSaving}
              className="rounded-md px-5 py-2 text-sm font-medium bg-orange-500 hover:bg-orange-600 disabled:opacity-50 transition-colors text-white cursor-pointer"
            >
              {goalSaving ? 'Speichern…' : 'Speichern'}
            </button>
            {goalSuccess && <span className="text-sm text-green-600">Gespeichert</span>}
            {goalError && <span className="text-sm text-red-500">{goalError}</span>}
          </div>
        </CardContent>
      </Card>

      {/* ── App-Konfiguration ── */}
      <Card>
        <CardHeader className="border-b border-border pb-3">
          <CardTitle className="text-sm font-semibold">App-Konfiguration</CardTitle>
          <p className="text-xs text-muted-foreground">Anzeigeoptionen und Performance-Parameter</p>
        </CardHeader>
        <CardContent className="pt-5 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-2">
                Kurvenglättung
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.05"
                  min="0"
                  max="0.5"
                  value={bezierInput}
                  onChange={e => setBezierInput(e.target.value)}
                  className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-colors"
                />
              </div>
              <p className="text-xs text-muted-foreground/50 mt-1.5">0 = gerade · 0.5 = stark gerundet</p>
            </div>

            <div>
              <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-2">
                Sparkline-Wochen
              </label>
              <input
                type="number"
                step="1"
                min="4"
                max="16"
                value={sparklineInput}
                onChange={e => setSparklineInput(e.target.value)}
                className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-colors"
              />
              <p className="text-xs text-muted-foreground/50 mt-1.5">Wochen im Dashboard-Verlauf (4–16)</p>
            </div>

            <div>
              <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-2">
                Geschwindigkeits-Farbstufen
              </label>
              <input
                type="number"
                step="1"
                min="5"
                max="40"
                value={bucketInput}
                onChange={e => setBucketInput(e.target.value)}
                className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-colors"
              />
              <p className="text-xs text-muted-foreground/50 mt-1.5">Farbstufen auf der Aktivitätskarte (5–40)</p>
            </div>

            <div>
              <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-2">
                Track-Toleranz
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="1"
                  min="1"
                  max="20"
                  value={simplifyInput}
                  onChange={e => setSimplifyInput(e.target.value)}
                  className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-colors"
                />
                <span className="text-xs text-muted-foreground whitespace-nowrap">m</span>
              </div>
              <p className="text-xs text-muted-foreground/50 mt-1.5">RDP-Vereinfachung beim Track-Laden (1–20 m)</p>
            </div>

            <div>
              <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-2">
                Verschleiß-Warnschwelle
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="1"
                  min="50"
                  max="100"
                  value={wearPctInput}
                  onChange={e => setWearPctInput(e.target.value)}
                  className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-colors"
                />
                <span className="text-xs text-muted-foreground whitespace-nowrap">%</span>
              </div>
              <p className="text-xs text-muted-foreground/50 mt-1.5">Ab diesem Verschleiß-% erscheint die Dashboard-Warnung (50–100)</p>
            </div>
          </div>

          <div className="flex items-center gap-4 pt-1">
            <button
              onClick={saveConfig}
              disabled={configSaving}
              className="rounded-md px-5 py-2 text-sm font-medium bg-orange-500 hover:bg-orange-600 disabled:opacity-50 transition-colors text-white cursor-pointer"
            >
              {configSaving ? 'Speichern…' : 'Speichern'}
            </button>
            {configSuccess && <span className="text-sm text-green-600">Gespeichert</span>}
            {configError && <span className="text-sm text-red-500">{configError}</span>}
          </div>
        </CardContent>
      </Card>

      {/* ── Erweiterte Einstellungen ── */}
      <Card>
        <CardHeader className="border-b border-border pb-3">
          <CardTitle className="text-sm font-semibold">Erweiterte Einstellungen</CardTitle>
          <p className="text-xs text-muted-foreground">
            Physikalische und algorithmische Parameter für Leistungsschätzung, PMC und Streckenvergleich –
            Standardwerte passen meist, nur bei Bedarf anpassen.
          </p>
        </CardHeader>
        <CardContent className="pt-5 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-2">
                Standard-Bike
              </label>
              <select
                value={defaultBikeIdInput}
                onChange={e => setDefaultBikeIdInput(e.target.value)}
                className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-colors"
              >
                {bikes.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground/50 mt-1.5">Fallback für Aktivitäten ohne Strava-Gear-Zuordnung</p>
            </div>

            <div>
              <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-2">
                Bike-Gewicht (Leistungsschätzung)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.5"
                  min="1"
                  max="30"
                  value={bikeKgInput}
                  onChange={e => setBikeKgInput(e.target.value)}
                  className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-colors"
                />
                <span className="text-xs text-muted-foreground whitespace-nowrap">kg</span>
              </div>
              <p className="text-xs text-muted-foreground/50 mt-1.5">Inkl. Anbauteile (Standard 8 kg)</p>
            </div>

            <div>
              <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-2">
                Rollwiderstand (Crr)
              </label>
              <input
                type="number"
                step="0.001"
                min="0.001"
                max="0.02"
                value={crrInput}
                onChange={e => setCrrInput(e.target.value)}
                className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-colors"
              />
              <p className="text-xs text-muted-foreground/50 mt-1.5">Rennreifen 0.004 · Gravel/MTB höher</p>
            </div>

            <div>
              <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-2">
                Luftwiderstand (CdA)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.01"
                  min="0.1"
                  max="0.6"
                  value={cdaInput}
                  onChange={e => setCdaInput(e.target.value)}
                  className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-colors"
                />
                <span className="text-xs text-muted-foreground whitespace-nowrap">m²</span>
              </div>
              <p className="text-xs text-muted-foreground/50 mt-1.5">Rennposition 0.32 · Hoods ~0.36</p>
            </div>

            <div>
              <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-2">
                Schwellen-HR
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="1"
                  min="50"
                  max="100"
                  value={thresholdHrPctInput}
                  onChange={e => setThresholdHrPctInput(e.target.value)}
                  className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-colors"
                />
                <span className="text-xs text-muted-foreground whitespace-nowrap">% HRmax</span>
              </div>
              <p className="text-xs text-muted-foreground/50 mt-1.5">Für hrTSS/PMC (Standard 85 %)</p>
            </div>

            <div>
              <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-2">
                GPS-Sprung-Filter
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="5"
                  min="40"
                  max="200"
                  value={maxSpeedKmhInput}
                  onChange={e => setMaxSpeedKmhInput(e.target.value)}
                  className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-colors"
                />
                <span className="text-xs text-muted-foreground whitespace-nowrap">km/h</span>
              </div>
              <p className="text-xs text-muted-foreground/50 mt-1.5">Kappt Best-Effort-Segmente oberhalb (Standard 90, E-Bike ggf. höher)</p>
            </div>

            <div>
              <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-2">
                CTL-Zeitkonstante
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="1"
                  min="7"
                  max="90"
                  value={ctlDaysInput}
                  onChange={e => setCtlDaysInput(e.target.value)}
                  className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-colors"
                />
                <span className="text-xs text-muted-foreground whitespace-nowrap">Tage</span>
              </div>
              <p className="text-xs text-muted-foreground/50 mt-1.5">Trainingslast-Glättung (Standard 42)</p>
            </div>

            <div>
              <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-2">
                ATL-Zeitkonstante
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="1"
                  min="3"
                  max="21"
                  value={atlDaysInput}
                  onChange={e => setAtlDaysInput(e.target.value)}
                  className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-colors"
                />
                <span className="text-xs text-muted-foreground whitespace-nowrap">Tage</span>
              </div>
              <p className="text-xs text-muted-foreground/50 mt-1.5">Ermüdungs-Glättung (Standard 7)</p>
            </div>

            <div>
              <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-2">
                Streckenvergleich-Toleranz
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="50"
                  min="100"
                  max="2000"
                  value={matchRadiusMInput}
                  onChange={e => setMatchRadiusMInput(e.target.value)}
                  className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-colors"
                />
                <span className="text-xs text-muted-foreground whitespace-nowrap">m</span>
              </div>
              <p className="text-xs text-muted-foreground/50 mt-1.5">GPS-Toleranz je Distanz-Marke (Standard 500 m)</p>
            </div>
          </div>

          <div className="flex items-center gap-4 pt-1">
            <button
              onClick={saveAdvanced}
              disabled={advancedSaving}
              className="rounded-md px-5 py-2 text-sm font-medium bg-orange-500 hover:bg-orange-600 disabled:opacity-50 transition-colors text-white cursor-pointer"
            >
              {advancedSaving ? 'Speichern…' : 'Speichern'}
            </button>
            {advancedSuccess && <span className="text-sm text-green-600">Gespeichert</span>}
            {advancedError && <span className="text-sm text-red-500">{advancedError}</span>}
          </div>
        </CardContent>
      </Card>

      {/* ── Diagramm & Darstellung ── */}
      <Card>
        <CardHeader className="border-b border-border pb-3">
          <CardTitle className="text-sm font-semibold">Diagramm & Darstellung</CardTitle>
          <p className="text-xs text-muted-foreground">
            Chart-Höhen, Zeitraster und Streckenvergleich-Farben – Standardwerte passen meist.
          </p>
        </CardHeader>
        <CardContent className="pt-5 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-2">
                Track-Vereinfachung Vergleich
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="1"
                  min="5"
                  max="50"
                  value={comparisonSimplifyInput}
                  onChange={e => setComparisonSimplifyInput(e.target.value)}
                  className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-colors"
                />
                <span className="text-xs text-muted-foreground whitespace-nowrap">m</span>
              </div>
              <p className="text-xs text-muted-foreground/50 mt-1.5">RDP-Toleranz auf der Streckenvergleich-Seite (Standard 20)</p>
            </div>

            <div>
              <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-2">
                Zeitblock-Stunden
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="1"
                  min="1"
                  max="12"
                  value={blockHoursInput}
                  onChange={e => setBlockHoursInput(e.target.value)}
                  className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-colors"
                />
                <span className="text-xs text-muted-foreground whitespace-nowrap">h</span>
              </div>
              <p className="text-xs text-muted-foreground/50 mt-1.5">Blockbreite Tageszeit-Auswertung, muss 24 teilen (Standard 3)</p>
            </div>

            <div>
              <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-2">
                Volumen-Trend-Fenster
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="1"
                  min="2"
                  max="12"
                  value={volumeTrendWeeksInput}
                  onChange={e => setVolumeTrendWeeksInput(e.target.value)}
                  className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-colors"
                />
                <span className="text-xs text-muted-foreground whitespace-nowrap">Wochen</span>
              </div>
              <p className="text-xs text-muted-foreground/50 mt-1.5">Rolling-Ø-Fenster Volumen-Trendlinie (Standard 4)</p>
            </div>

            <div>
              <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-2">
                Chart-Höhe Mini
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="10"
                  min="60"
                  max="200"
                  value={chartHeightMiniInput}
                  onChange={e => setChartHeightMiniInput(e.target.value)}
                  className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-colors"
                />
                <span className="text-xs text-muted-foreground whitespace-nowrap">px</span>
              </div>
              <p className="text-xs text-muted-foreground/50 mt-1.5">Winzige Inline-Sparklines (Standard 100)</p>
            </div>

            <div>
              <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-2">
                Chart-Höhe Kompakt
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="10"
                  min="80"
                  max="260"
                  value={chartHeightCompactInput}
                  onChange={e => setChartHeightCompactInput(e.target.value)}
                  className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-colors"
                />
                <span className="text-xs text-muted-foreground whitespace-nowrap">px</span>
              </div>
              <p className="text-xs text-muted-foreground/50 mt-1.5">Kleine Trend-Charts, z.B. Dashboard (Standard 140)</p>
            </div>

            <div>
              <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-2">
                Chart-Höhe Standard
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="10"
                  min="120"
                  max="320"
                  value={chartHeightInput}
                  onChange={e => setChartHeightInput(e.target.value)}
                  className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-colors"
                />
                <span className="text-xs text-muted-foreground whitespace-nowrap">px</span>
              </div>
              <p className="text-xs text-muted-foreground/50 mt-1.5">Standard-Analyse-Chart (Standard 200)</p>
            </div>

            <div>
              <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-2">
                Chart-Höhe Dicht
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="10"
                  min="140"
                  max="360"
                  value={chartHeightDenseInput}
                  onChange={e => setChartHeightDenseInput(e.target.value)}
                  className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-colors"
                />
                <span className="text-xs text-muted-foreground whitespace-nowrap">px</span>
              </div>
              <p className="text-xs text-muted-foreground/50 mt-1.5">Dichte Mehrserien-Charts (Standard 220)</p>
            </div>
          </div>

          <div>
            <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-2">
              Streckenvergleich-Farben
            </label>
            <div className="flex items-center gap-3 flex-wrap">
              {comparisonColorsInput.map((color, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <input
                    type="color"
                    value={color}
                    onChange={e => updateComparisonColor(i, e.target.value)}
                    className="h-8 w-10 rounded border border-input bg-background cursor-pointer"
                  />
                  <span className="text-xs text-muted-foreground">{i + 1}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground/50 mt-1.5">Reihenfolge: Referenz-Track zuerst, dann bis zu 4 Vergleichsfahrten</p>
          </div>

          <div className="flex items-center gap-4 pt-1">
            <button
              onClick={saveDisplayConfig}
              disabled={displaySaving}
              className="rounded-md px-5 py-2 text-sm font-medium bg-orange-500 hover:bg-orange-600 disabled:opacity-50 transition-colors text-white cursor-pointer"
            >
              {displaySaving ? 'Speichern…' : 'Speichern'}
            </button>
            {displaySuccess && <span className="text-sm text-green-600">Gespeichert</span>}
            {displayError && <span className="text-sm text-red-500">{displayError}</span>}
          </div>
        </CardContent>
      </Card>

      {/* ── WattLoomApp-Sync ── */}
      <Card>
        <CardHeader className="border-b border-border pb-3">
          <CardTitle className="text-sm font-semibold">WattLoomApp-Sync</CardTitle>
          <p className="text-xs text-muted-foreground">
            Spiegelt die Daten in die Cloud-DB der mobilen App (Neon Postgres). Manuell anstoßen,
            z.B. nach jedem Strava-Import.
          </p>
        </CardHeader>
        <CardContent className="pt-5 space-y-4">
          {appSyncStatus?.last_synced_at && (
            <p className="text-sm text-muted-foreground">
              Letzter Sync: {fmtDate(appSyncStatus.last_synced_at)} {fmtClock(appSyncStatus.last_synced_at)}
              {appSyncStatus.last_status === 'error' && (
                <span className="text-red-500"> – fehlgeschlagen: {appSyncStatus.last_message}</span>
              )}
              {appSyncStatus.last_status === 'ok' && (
                <span className="text-green-600"> – {appSyncStatus.last_message}</span>
              )}
            </p>
          )}
          {!appSyncStatus?.last_synced_at && (
            <p className="text-sm text-muted-foreground">Noch nicht synchronisiert.</p>
          )}
          {appSyncError && <p className="text-sm text-red-500">{appSyncError}</p>}
          <button
            onClick={startAppSync}
            disabled={appSyncBusy}
            className="rounded-md px-5 py-2 text-sm font-medium bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-white cursor-pointer"
          >
            {appSyncBusy ? 'Synchronisiert…' : 'Jetzt synchronisieren'}
          </button>
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
          {resetDone && (
            <p className="text-sm text-green-600 mb-3">
              Datenbank wurde geleert.
              {resetBackupName && <> Backup vorher gesichert: <code className="text-xs">{resetBackupName}</code></>}
            </p>
          )}
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

        </TabsContent>

        <TabsContent value="importe" className="mt-6 space-y-8">

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
          {importConfirm ? (
            <div className="rounded-lg border border-orange-500/40 bg-orange-500/10 p-4 space-y-3">
              <p className="text-sm font-medium text-orange-600 dark:text-orange-400">
                ⚠ Datenbank enthält bereits Aktivitäten
              </p>
              <p className="text-xs text-muted-foreground">
                Ein erneuter Import dupliziert Track-Punkte, Laps und Streckenvergleiche.
                Zuerst <strong>Datenbank zurücksetzen</strong>, dann importieren.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={doStartImport}
                  className="rounded-md px-4 py-1.5 text-xs font-medium bg-orange-500 hover:bg-orange-600 text-white transition-colors cursor-pointer"
                >
                  Trotzdem importieren
                </button>
                <button
                  onClick={() => setImportConfirm(false)}
                  className="rounded-md px-4 py-1.5 text-xs font-medium border border-border hover:bg-muted transition-colors cursor-pointer"
                >
                  Abbrechen
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-4 flex-wrap">
              <button
                onClick={handleImportClick}
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
          )}

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

              {/* Bike-Dropdown (optional – nur für Radtouren) */}
              <div>
                <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-2">
                  Bike <span className="normal-case font-normal">(optional, nur für Radtouren)</span>
                </label>
                <select
                  value={fitBikeId}
                  onChange={e => setFitBikeId(e.target.value)}
                  className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-colors"
                >
                  <option value="">– kein Rad / Workout –</option>
                  {bikes.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-4 flex-wrap">
              <button
                type="submit"
                disabled={!fitFile || fitUploading}
                className="rounded-md px-5 py-2 text-sm font-medium bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-white cursor-pointer"
              >
                {fitUploading ? 'Importiere…' : 'Importieren'}
              </button>

              {fitResult && (
                <div className="flex items-center gap-3">
                  <span className="text-sm text-green-600">
                    Importiert: <span className="font-medium">{fitResult.name}</span>
                  </span>
                  {fitResult.is_ride && (
                    <button
                      type="button"
                      onClick={() => navigate(`/activities/${fitResult.activity_id}`)}
                      className="text-xs text-orange-500 hover:text-orange-400 underline underline-offset-2 transition-colors"
                    >
                      Aktivität öffnen →
                    </button>
                  )}
                </div>
              )}

              {fitError && (
                <span className="text-sm text-red-500">{fitError}</span>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {/* ── TCX-Datei Einzelimport ── */}
      <Card>
        <CardHeader className="border-b border-border pb-3">
          <CardTitle className="text-sm font-semibold">TCX-Datei importieren</CardTitle>
          <p className="text-xs text-muted-foreground">
            Einzelne .tcx-Datei von Amazfit/Mi Fitness, Garmin oder anderen Geräten direkt importieren.
          </p>
        </CardHeader>
        <CardContent className="pt-5">
          <form onSubmit={doTcxUpload} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Datei-Auswahl */}
              <div>
                <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-2">
                  TCX-Datei
                </label>
                <input
                  ref={tcxInputRef}
                  type="file"
                  accept=".tcx"
                  onChange={e => {
                    setTcxFile(e.target.files?.[0] ?? null);
                    setTcxResult(null);
                    setTcxError(null);
                  }}
                  className="w-full text-sm text-muted-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-medium file:bg-muted file:text-foreground hover:file:bg-muted/80 cursor-pointer"
                />
              </div>

              {/* Bike-Dropdown (optional – nur für Radtouren) */}
              <div>
                <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-2">
                  Bike <span className="normal-case font-normal">(optional, nur für Radtouren)</span>
                </label>
                <select
                  value={tcxBikeId}
                  onChange={e => setTcxBikeId(e.target.value)}
                  className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-colors"
                >
                  <option value="">– kein Rad / Workout –</option>
                  {bikes.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-4 flex-wrap">
              <button
                type="submit"
                disabled={!tcxFile || tcxUploading}
                className="rounded-md px-5 py-2 text-sm font-medium bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-white cursor-pointer"
              >
                {tcxUploading ? 'Importiere…' : 'Importieren'}
              </button>

              {tcxResult && (
                <div className="flex items-center gap-3">
                  <span className="text-sm text-green-600">
                    Importiert: <span className="font-medium">{tcxResult.name}</span>
                  </span>
                  {tcxResult.is_ride && (
                    <button
                      type="button"
                      onClick={() => navigate(`/activities/${tcxResult.activity_id}`)}
                      className="text-xs text-orange-500 hover:text-orange-400 underline underline-offset-2 transition-colors"
                    >
                      Aktivität öffnen →
                    </button>
                  )}
                  {!tcxResult.is_ride && (
                    <button
                      type="button"
                      onClick={() => navigate('/activities?tab=workouts')}
                      className="text-xs text-orange-500 hover:text-orange-400 underline underline-offset-2 transition-colors"
                    >
                      Workouts öffnen →
                    </button>
                  )}
                </div>
              )}

              {tcxError && (
                <span className="text-sm text-red-500">{tcxError}</span>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {/* ── GPX-Datei Einzelimport ── */}
      <Card>
        <CardHeader className="border-b border-border pb-3">
          <CardTitle className="text-sm font-semibold">GPX-Datei importieren</CardTitle>
          <p className="text-xs text-muted-foreground">
            Einzelne .gpx-Datei von Garmin, Komoot, Strava oder anderen Quellen direkt importieren.
          </p>
        </CardHeader>
        <CardContent className="pt-5">
          <form onSubmit={doGpxUpload} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-2">
                  GPX-Datei
                </label>
                <input
                  ref={gpxInputRef}
                  type="file"
                  accept=".gpx"
                  onChange={e => {
                    setGpxFile(e.target.files?.[0] ?? null);
                    setGpxResult(null);
                    setGpxError(null);
                  }}
                  className="w-full text-sm text-muted-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-medium file:bg-muted file:text-foreground hover:file:bg-muted/80 cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-2">
                  Bike <span className="normal-case font-normal">(optional, nur für Radtouren)</span>
                </label>
                <select
                  value={gpxBikeId}
                  onChange={e => setGpxBikeId(e.target.value)}
                  className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-colors"
                >
                  <option value="">– kein Rad / Workout –</option>
                  {bikes.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-4 flex-wrap">
              <button
                type="submit"
                disabled={!gpxFile || gpxUploading}
                className="rounded-md px-5 py-2 text-sm font-medium bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-white cursor-pointer"
              >
                {gpxUploading ? 'Importiere…' : 'Importieren'}
              </button>

              {gpxResult && (
                <div className="flex items-center gap-3">
                  <span className="text-sm text-green-600">
                    Importiert: <span className="font-medium">{gpxResult.name}</span>
                  </span>
                  {gpxResult.is_ride && (
                    <button
                      type="button"
                      onClick={() => navigate(`/activities/${gpxResult.activity_id}`)}
                      className="text-xs text-orange-500 hover:text-orange-400 underline underline-offset-2 transition-colors"
                    >
                      Aktivität öffnen →
                    </button>
                  )}
                  {!gpxResult.is_ride && (
                    <button
                      type="button"
                      onClick={() => navigate('/activities?tab=workouts')}
                      className="text-xs text-orange-500 hover:text-orange-400 underline underline-offset-2 transition-colors"
                    >
                      Workouts öffnen →
                    </button>
                  )}
                </div>
              )}

              {gpxError && (
                <span className="text-sm text-red-500">{gpxError}</span>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {/* ── Wetterdaten ── */}
      <Card>
        <CardHeader className="border-b border-border pb-3">
          <CardTitle className="text-sm font-semibold">Wetterdaten abrufen</CardTitle>
          <p className="text-xs text-muted-foreground">
            Temperatur, Wind und Niederschlag für jede Aktivität von Open-Meteo (kostenlos, kein API-Key).
          </p>
        </CardHeader>
        <CardContent className="pt-5 space-y-4">
          {weatherStatus && (
            <div className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{weatherStatus.with_weather}</span>
              {' '}von{' '}
              <span className="font-medium text-foreground">{weatherStatus.total_activities}</span>
              {' '}Aktivitäten haben Wetterdaten
              {weatherStatus.without_weather > 0 && (
                <span className="ml-1 text-xs">({weatherStatus.without_weather} fehlen noch)</span>
              )}
            </div>
          )}

          {weatherStatus?.running && (
            <div className="text-xs text-muted-foreground">
              Abrufen… {weatherStatus.done} / {weatherStatus.total}
              {weatherStatus.errors > 0 && (
                <span className="text-orange-500 ml-2">{weatherStatus.errors} Fehler</span>
              )}
            </div>
          )}

          <button
            onClick={startWeatherFetch}
            disabled={weatherFetching || weatherStatus?.running || weatherStatus?.without_weather === 0}
            className="rounded-md px-5 py-2 text-sm font-medium bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-white cursor-pointer"
          >
            {weatherFetching || weatherStatus?.running ? 'Läuft…' : 'Wetterdaten abrufen'}
          </button>
          {weatherStatus?.with_weather === weatherStatus?.total_activities && weatherStatus?.total_activities > 0 && !weatherStatus?.running && (
            <p className="text-xs text-green-600">Alle Aktivitäten haben Wetterdaten.</p>
          )}
        </CardContent>
      </Card>

      {/* ── Leistungsschätzung ── */}
      <Card>
        <CardHeader className="border-b border-border pb-3">
          <CardTitle className="text-sm font-semibold">Leistung schätzen</CardTitle>
          <p className="text-xs text-muted-foreground">
            Berechnet Durchschnittsleistung und Normalized Power aus GPS + Höhenprofil für alle Radtouren
            mit Track-Daten. Physikalisches Modell: Rollwiderstand (Crr 0.004), Luftwiderstand (CdA 0.32 m²),
            Steigungsarbeit. Genauigkeit ca. ±15 % – Wind wird nicht berücksichtigt.
            Setzt voraus, dass Körpergewicht gesetzt ist.
          </p>
        </CardHeader>
        <CardContent className="pt-5 space-y-4">
          {powerMsg && <p className="text-sm text-green-600">{powerMsg} – läuft im Hintergrund.</p>}
          {powerError && <p className="text-sm text-red-500">{powerError}</p>}
          <button
            onClick={startPowerRecalc}
            disabled={powerBusy}
            className="rounded-md px-5 py-2 text-sm font-medium bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-white cursor-pointer"
          >
            {powerBusy ? 'Startet…' : 'Leistung für alle Fahrten schätzen'}
          </button>
        </CardContent>
      </Card>

        </TabsContent>
      </Tabs>
    </div>
  );
}
