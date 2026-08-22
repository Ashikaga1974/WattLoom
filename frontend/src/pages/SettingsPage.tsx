import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, type Bike, type Language, type Settings, type SingleImportResult, type WeatherStatus } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { CONFIG_DEFAULTS, useConfigReload } from '@/lib/config-context';
import { fmtClock, fmtDate } from '@/lib/format';
import { rideTitle, workoutTitle } from '@/lib/activity-display';

type ImportStatus = 'idle' | 'running' | 'done' | 'error';

export default function SettingsPage() {
  const { t } = useTranslation('common');
  const { t: ts } = useTranslation('settings');
  // Einstellungen-Felder
  const [languageInput, setLanguageInput] = useState<string>(CONFIG_DEFAULTS.language);
  const [languages, setLanguages]         = useState<Language[]>([]);
  const [importLangInput, setImportLangInput] = useState('');
  const [translationImportBusy, setTranslationImportBusy]   = useState(false);
  const [translationImportError, setTranslationImportError] = useState<string | null>(null);
  const [translationImportSuccess, setTranslationImportSuccess] = useState(false);
  const translationFileRef = useRef<HTMLInputElement>(null);
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
  const [fitResult, setFitResult]         = useState<SingleImportResult | null>(null);
  const [fitError, setFitError]           = useState<string | null>(null);
  const fitInputRef                       = useRef<HTMLInputElement>(null);

  // TCX-Einzelimport
  const [tcxFile, setTcxFile]             = useState<File | null>(null);
  const [tcxBikeId, setTcxBikeId]         = useState('');
  const [tcxUploading, setTcxUploading]   = useState(false);
  const [tcxResult, setTcxResult]         = useState<SingleImportResult | null>(null);
  const [tcxError, setTcxError]           = useState<string | null>(null);
  const tcxInputRef                       = useRef<HTMLInputElement>(null);

  // GPX-Einzelimport
  const [gpxFile, setGpxFile]             = useState<File | null>(null);
  const [gpxBikeId, setGpxBikeId]         = useState('');
  const [gpxUploading, setGpxUploading]   = useState(false);
  const [gpxResult, setGpxResult]         = useState<SingleImportResult | null>(null);
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

  // HF-Korrektur (z.B. Betablocker/Bisoprolol) – dämpft die Herzfrequenzantwort unter
  // Belastung; rein empirische, vom Nutzer selbst kalibrierte Näherung, kein Medizinwert.
  const [hrCorrectionEnabled, setHrCorrectionEnabled]   = useState(false);
  const [hrCorrectionPctInput, setHrCorrectionPctInput] = useState('8');
  const [hrCorrectionSinceInput, setHrCorrectionSinceInput] = useState('');
  const [hrCorrectionSaving, setHrCorrectionSaving]     = useState(false);
  const [hrCorrectionSuccess, setHrCorrectionSuccess]   = useState(false);
  const [hrCorrectionError, setHrCorrectionError]       = useState<string | null>(null);

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
      setPowerError(e instanceof Error ? e.message : ts('common.unknownError'));
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
      setAppSyncError(e instanceof Error ? e.message : ts('common.unknownError'));
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
        setLanguageInput(res.language ?? CONFIG_DEFAULTS.language);
        try { setLanguages(await api.getLanguages()); } catch { /* ignorieren */ }
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
        setHrCorrectionEnabled(res.hr_correction_enabled === 1);
        setHrCorrectionPctInput(String(res.hr_correction_pct ?? 8));
        setHrCorrectionSinceInput(res.hr_correction_since ?? '');
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

  async function changeLanguage(lang: string) {
    setLanguageInput(lang);
    try {
      const res = await api.saveSettings({ language: lang });
      setSaved(res);
      await reloadConfig();
    } catch { /* Sprache bleibt lokal gesetzt, nächster Reload versucht es erneut */ }
  }

  function exportTranslations(lang: string) {
    api.exportTranslations(lang).then(data => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `wattloom-translations-${lang}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }).catch(() => { /* ignorieren */ });
  }

  async function importTranslations(file: File) {
    if (!importLangInput) return;
    setTranslationImportBusy(true);
    setTranslationImportError(null);
    setTranslationImportSuccess(false);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      await api.importTranslations(importLangInput, parsed);
      setLanguages(await api.getLanguages());
      setTranslationImportSuccess(true);
    } catch (e) {
      setTranslationImportError(e instanceof Error ? e.message : 'Import fehlgeschlagen');
    } finally {
      setTranslationImportBusy(false);
      if (translationFileRef.current) translationFileRef.current.value = '';
    }
  }

  async function save() {
    const kg = parseFloat(weightInput.replace(',', '.'));
    if (weightInput && (isNaN(kg) || kg < 30 || kg > 200)) {
      setSaveError(ts('personalData.errors.weightRange'));
      return;
    }
    const year = birthYearInput ? parseInt(birthYearInput) : null;
    if (year !== null && (year < 1920 || year > 2010)) {
      setSaveError(ts('personalData.errors.birthYearRange'));
      return;
    }
    const hrMax = parseInt(hrMaxInput);
    if (isNaN(hrMax) || hrMax < 100 || hrMax > 240) {
      setSaveError(ts('personalData.errors.hrMaxRange'));
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
      setSaveError(e instanceof Error ? e.message : ts('common.saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  async function saveGoals() {
    const km = yearlyKmGoalInput ? parseFloat(yearlyKmGoalInput.replace(',', '.')) : null;
    if (km !== null && (isNaN(km) || km <= 0)) {
      setGoalError(ts('goals.errors.yearlyPositive'));
      return;
    }
    const hours = weeklyHoursGoalInput ? parseFloat(weeklyHoursGoalInput.replace(',', '.')) : null;
    if (hours !== null && (isNaN(hours) || hours <= 0)) {
      setGoalError(ts('goals.errors.weeklyPositive'));
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
      setGoalError(e instanceof Error ? e.message : ts('common.saveFailed'));
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
      setConfigError(ts('appConfig.errors.bezierRange'));
      return;
    }
    if (isNaN(sparkline) || sparkline < 4 || sparkline > 16) {
      setConfigError(ts('appConfig.errors.sparklineRange'));
      return;
    }
    if (isNaN(buckets) || buckets < 5 || buckets > 40) {
      setConfigError(ts('appConfig.errors.bucketsRange'));
      return;
    }
    if (isNaN(simplify) || simplify < 1 || simplify > 20) {
      setConfigError(ts('appConfig.errors.simplifyRange'));
      return;
    }
    if (isNaN(wearPct) || wearPct < 50 || wearPct > 100) {
      setConfigError(ts('appConfig.errors.wearPctRange'));
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
      setConfigError(e instanceof Error ? e.message : ts('common.saveFailed'));
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
      setAdvancedError(ts('advanced.errors.crrRange'));
      return;
    }
    if (isNaN(cda) || cda <= 0 || cda > 0.6) {
      setAdvancedError(ts('advanced.errors.cdaRange'));
      return;
    }
    if (isNaN(bikeKg) || bikeKg <= 0 || bikeKg > 30) {
      setAdvancedError(ts('advanced.errors.bikeKgRange'));
      return;
    }
    if (isNaN(thresholdPct) || thresholdPct < 50 || thresholdPct > 100) {
      setAdvancedError(ts('advanced.errors.thresholdHrRange'));
      return;
    }
    if (isNaN(ctlDays) || ctlDays < 7 || ctlDays > 90) {
      setAdvancedError(ts('advanced.errors.ctlDaysRange'));
      return;
    }
    if (isNaN(atlDays) || atlDays < 3 || atlDays > 21) {
      setAdvancedError(ts('advanced.errors.atlDaysRange'));
      return;
    }
    if (isNaN(maxSpeedKmh) || maxSpeedKmh < 40 || maxSpeedKmh > 200) {
      setAdvancedError(ts('advanced.errors.gpsFilterRange'));
      return;
    }
    if (isNaN(matchRadiusM) || matchRadiusM < 100 || matchRadiusM > 2000) {
      setAdvancedError(ts('advanced.errors.matchRadiusRange'));
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
      setAdvancedError(e instanceof Error ? e.message : ts('common.saveFailed'));
    } finally {
      setAdvancedSaving(false);
    }
  }

  async function saveHrCorrection() {
    const pct = parseFloat(hrCorrectionPctInput.replace(',', '.'));
    if (isNaN(pct) || pct < 0 || pct > 30) {
      setHrCorrectionError(ts('hrCorrection.errors.pctRange'));
      return;
    }
    setHrCorrectionSaving(true);
    setHrCorrectionError(null);
    try {
      const res = await api.saveSettings({
        hr_correction_enabled: hrCorrectionEnabled ? 1 : 0,
        hr_correction_pct:     pct,
        hr_correction_since:   hrCorrectionSinceInput || null,
      });
      setSaved(res);
      setHrCorrectionSuccess(true);
      setTimeout(() => setHrCorrectionSuccess(false), 2500);
    } catch (e) {
      setHrCorrectionError(e instanceof Error ? e.message : ts('common.saveFailed'));
    } finally {
      setHrCorrectionSaving(false);
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
      setDisplayError(ts('display.errors.comparisonSimplifyRange'));
      return;
    }
    if (isNaN(blockHours) || blockHours < 1 || blockHours > 12 || 24 % blockHours !== 0) {
      setDisplayError(ts('display.errors.blockHoursRange'));
      return;
    }
    if (isNaN(volumeTrendWeeks) || volumeTrendWeeks < 2 || volumeTrendWeeks > 12) {
      setDisplayError(ts('display.errors.volumeTrendWeeksRange'));
      return;
    }
    if (isNaN(chartHeightMini) || chartHeightMini < 60 || chartHeightMini > 200) {
      setDisplayError(ts('display.errors.chartHeightMiniRange'));
      return;
    }
    if (isNaN(chartHeightCompact) || chartHeightCompact < 80 || chartHeightCompact > 260) {
      setDisplayError(ts('display.errors.chartHeightCompactRange'));
      return;
    }
    if (isNaN(chartHeightVal) || chartHeightVal < 120 || chartHeightVal > 320) {
      setDisplayError(ts('display.errors.chartHeightRange'));
      return;
    }
    if (isNaN(chartHeightDense) || chartHeightDense < 140 || chartHeightDense > 360) {
      setDisplayError(ts('display.errors.chartHeightDenseRange'));
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
      setDisplayError(e instanceof Error ? e.message : ts('common.saveFailed'));
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
      setImportLog([e instanceof Error ? e.message : ts('import.startError')]);
    }
  }

  async function confirmReset() {
    setResetBusy(true);
    setResetError(null);
    setResetDone(false);
    try {
      const res = await api.resetDb();
      if (!res.ok) throw new Error(res.message ?? ts('reset.genericFailure'));
      setResetDone(true);
      setResetBackupName(res.backup ?? null);
      setResetConfirm(false);
      setImportStatus('idle');
      setImportLog([]);
      setImportZip(null);
    } catch (e) {
      setResetError(e instanceof Error ? e.message : ts('reset.genericError'));
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
      setFitError(err instanceof Error ? err.message : ts('common.unknownError'));
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
      setTcxError(err instanceof Error ? err.message : ts('common.unknownError'));
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
      setGpxError(err instanceof Error ? err.message : ts('common.unknownError'));
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
        <h1 className="text-2xl font-semibold tracking-tight">{ts('pageTitle')}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{ts('pageSubtitle')}</p>
      </div>

      <Tabs value={tab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="allgemein">{ts('tabs.general')}</TabsTrigger>
          <TabsTrigger value="importe">{ts('tabs.imports')}</TabsTrigger>
        </TabsList>

        <TabsContent value="allgemein" className="mt-6 space-y-8">

      {/* ── Sprache ── */}
      <Card>
        <CardHeader className="border-b border-border pb-3">
          <CardTitle className="text-sm font-semibold">{ts('language.title')}</CardTitle>
        </CardHeader>
        <CardContent className="pt-5 space-y-5">
          <div className="inline-flex rounded-md border border-input overflow-hidden flex-wrap">
            {languages.filter(l => l.available).map((lang) => (
              <button
                key={lang.code}
                type="button"
                onClick={() => changeLanguage(lang.code)}
                className={`px-4 py-2 text-sm transition-colors ${
                  languageInput === lang.code
                    ? 'bg-orange-500 text-white'
                    : 'bg-background hover:bg-muted text-foreground'
                }`}
              >
                {lang.name}
              </button>
            ))}
          </div>

          <div className="border-t border-border pt-4 space-y-3">
            <p className="text-xs text-muted-foreground">{ts('language.translateHint')}</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => exportTranslations(languageInput)}
                className="px-3 py-1.5 text-sm rounded-md border border-input bg-background hover:bg-muted"
              >
                {ts('language.exportButton')}
              </button>
              <span className="text-xs text-muted-foreground">{ts('language.exportHint')}</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={importLangInput}
                onChange={e => setImportLangInput(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">{ts('language.importLangPlaceholder')}</option>
                {languages.map(l => (
                  <option key={l.code} value={l.code}>{l.name}{l.available ? ` (${ts('language.alreadyTranslated')})` : ''}</option>
                ))}
              </select>
              <input
                ref={translationFileRef}
                type="file"
                accept="application/json"
                disabled={!importLangInput || translationImportBusy}
                onChange={e => { const f = e.target.files?.[0]; if (f) importTranslations(f); }}
                className="text-sm"
              />
            </div>
            {translationImportBusy && <p className="text-xs text-muted-foreground">{ts('language.importBusy')}</p>}
            {translationImportSuccess && <p className="text-xs text-green-500">{ts('language.importSuccess')}</p>}
            {translationImportError && <p className="text-xs text-destructive">{translationImportError}</p>}
          </div>
        </CardContent>
      </Card>

      {/* ── Persönliche Daten ── */}
      <Card>
        <CardHeader className="border-b border-border pb-3">
          <CardTitle className="text-sm font-semibold">{ts('personalData.title')}</CardTitle>
          <p className="text-xs text-muted-foreground">{ts('personalData.subtitle')}</p>
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
                    {ts('personalData.weightLabel')}
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
                    <span className="text-xs text-muted-foreground whitespace-nowrap">{ts('units.kg')}</span>
                  </div>
                  {saved?.weight_kg != null && (
                    <p className="text-xs text-muted-foreground/60 mt-1.5">{ts('personalData.weightSaved', { value: saved.weight_kg })}</p>
                  )}
                </div>

                {/* Geburtsjahr */}
                <div>
                  <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-2">
                    {ts('personalData.birthYearLabel')}
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
                      {ts('personalData.birthYearInfo', { year: saved.birth_year, age: new Date().getFullYear() - saved.birth_year })}
                    </p>
                  )}
                </div>

                {/* HRmax */}
                <div>
                  <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-2">
                    {ts('personalData.hrMaxLabel')}
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
                    <span className="text-xs text-muted-foreground whitespace-nowrap">{ts('units.bpm')}</span>
                  </div>
                  <p className="text-xs text-muted-foreground/50 mt-1.5">{ts('personalData.hrMaxHint')}</p>
                </div>

                {/* Zeitzone */}
                <div>
                  <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-2">
                    {ts('personalData.timezoneLabel')}
                  </label>
                  <select
                    value={tzInput}
                    onChange={(e) => setTzInput(e.target.value)}
                    className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-colors"
                  >
                    <option value="auto">{ts('personalData.timezoneAuto')}</option>
                    <option value="1">{ts('personalData.timezoneCet')}</option>
                    <option value="2">{ts('personalData.timezoneCest')}</option>
                  </select>
                  <p className="text-xs text-muted-foreground/50 mt-1.5">
                    {ts('personalData.timezoneHint')}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4 pt-1">
                <button
                  onClick={save}
                  disabled={saving}
                  className="rounded-md px-5 py-2 text-sm font-medium bg-orange-500 hover:bg-orange-600 disabled:opacity-50 transition-colors text-white cursor-pointer"
                >
                  {saving ? ts('common.saving') : t('actions.save')}
                </button>
                {saveSuccess && <span className="text-sm text-green-600">{ts('common.saved')}</span>}
                {saveError && <span className="text-sm text-red-500">{saveError}</span>}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Trainingsziele ── */}
      <Card>
        <CardHeader className="border-b border-border pb-3">
          <CardTitle className="text-sm font-semibold">{ts('goals.title')}</CardTitle>
          <p className="text-xs text-muted-foreground">{ts('goals.subtitle')}</p>
        </CardHeader>
        <CardContent className="pt-5 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-2">
                {ts('goals.yearlyLabel')}
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
                <span className="text-xs text-muted-foreground whitespace-nowrap">{ts('units.kmPerYear')}</span>
              </div>
            </div>

            <div>
              <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-2">
                {ts('goals.weeklyLabel')}
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
                <span className="text-xs text-muted-foreground whitespace-nowrap">{ts('units.hoursPerWeek')}</span>
              </div>
              <p className="text-xs text-muted-foreground/50 mt-1.5">{ts('goals.weeklyHint')}</p>
            </div>
          </div>

          <div className="flex items-center gap-4 pt-1">
            <button
              onClick={saveGoals}
              disabled={goalSaving}
              className="rounded-md px-5 py-2 text-sm font-medium bg-orange-500 hover:bg-orange-600 disabled:opacity-50 transition-colors text-white cursor-pointer"
            >
              {goalSaving ? ts('common.saving') : t('actions.save')}
            </button>
            {goalSuccess && <span className="text-sm text-green-600">{ts('common.saved')}</span>}
            {goalError && <span className="text-sm text-red-500">{goalError}</span>}
          </div>
        </CardContent>
      </Card>

      {/* ── App-Konfiguration ── */}
      <Card>
        <CardHeader className="border-b border-border pb-3">
          <CardTitle className="text-sm font-semibold">{ts('appConfig.title')}</CardTitle>
          <p className="text-xs text-muted-foreground">{ts('appConfig.subtitle')}</p>
        </CardHeader>
        <CardContent className="pt-5 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-2">
                {ts('appConfig.bezierLabel')}
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
              <p className="text-xs text-muted-foreground/50 mt-1.5">{ts('appConfig.bezierHint')}</p>
            </div>

            <div>
              <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-2">
                {ts('appConfig.sparklineLabel')}
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
              <p className="text-xs text-muted-foreground/50 mt-1.5">{ts('appConfig.sparklineHint')}</p>
            </div>

            <div>
              <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-2">
                {ts('appConfig.bucketsLabel')}
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
              <p className="text-xs text-muted-foreground/50 mt-1.5">{ts('appConfig.bucketsHint')}</p>
            </div>

            <div>
              <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-2">
                {ts('appConfig.simplifyLabel')}
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
                <span className="text-xs text-muted-foreground whitespace-nowrap">{ts('units.m')}</span>
              </div>
              <p className="text-xs text-muted-foreground/50 mt-1.5">{ts('appConfig.simplifyHint')}</p>
            </div>

            <div>
              <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-2">
                {ts('appConfig.wearPctLabel')}
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
                <span className="text-xs text-muted-foreground whitespace-nowrap">{ts('units.percent')}</span>
              </div>
              <p className="text-xs text-muted-foreground/50 mt-1.5">{ts('appConfig.wearPctHint')}</p>
            </div>
          </div>

          <div className="flex items-center gap-4 pt-1">
            <button
              onClick={saveConfig}
              disabled={configSaving}
              className="rounded-md px-5 py-2 text-sm font-medium bg-orange-500 hover:bg-orange-600 disabled:opacity-50 transition-colors text-white cursor-pointer"
            >
              {configSaving ? ts('common.saving') : t('actions.save')}
            </button>
            {configSuccess && <span className="text-sm text-green-600">{ts('common.saved')}</span>}
            {configError && <span className="text-sm text-red-500">{configError}</span>}
          </div>
        </CardContent>
      </Card>

      {/* ── Erweiterte Einstellungen ── */}
      <Card>
        <CardHeader className="border-b border-border pb-3">
          <CardTitle className="text-sm font-semibold">{ts('advanced.title')}</CardTitle>
          <p className="text-xs text-muted-foreground">
            {ts('advanced.subtitle')}
          </p>
        </CardHeader>
        <CardContent className="pt-5 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-2">
                {ts('advanced.defaultBikeLabel')}
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
              <p className="text-xs text-muted-foreground/50 mt-1.5">{ts('advanced.defaultBikeHint')}</p>
            </div>

            <div>
              <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-2">
                {ts('advanced.bikeKgLabel')}
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
                <span className="text-xs text-muted-foreground whitespace-nowrap">{ts('units.kg')}</span>
              </div>
              <p className="text-xs text-muted-foreground/50 mt-1.5">{ts('advanced.bikeKgHint')}</p>
            </div>

            <div>
              <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-2">
                {ts('advanced.crrLabel')}
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
              <p className="text-xs text-muted-foreground/50 mt-1.5">{ts('advanced.crrHint')}</p>
            </div>

            <div>
              <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-2">
                {ts('advanced.cdaLabel')}
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
                <span className="text-xs text-muted-foreground whitespace-nowrap">{ts('units.m2')}</span>
              </div>
              <p className="text-xs text-muted-foreground/50 mt-1.5">{ts('advanced.cdaHint')}</p>
            </div>

            <div>
              <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-2">
                {ts('advanced.thresholdHrLabel')}
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
                <span className="text-xs text-muted-foreground whitespace-nowrap">{ts('units.percentHrMax')}</span>
              </div>
              <p className="text-xs text-muted-foreground/50 mt-1.5">{ts('advanced.thresholdHrHint')}</p>
            </div>

            <div>
              <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-2">
                {ts('advanced.gpsFilterLabel')}
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
                <span className="text-xs text-muted-foreground whitespace-nowrap">{ts('units.kmh')}</span>
              </div>
              <p className="text-xs text-muted-foreground/50 mt-1.5">{ts('advanced.gpsFilterHint')}</p>
            </div>

            <div>
              <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-2">
                {ts('advanced.ctlDaysLabel')}
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
                <span className="text-xs text-muted-foreground whitespace-nowrap">{ts('units.days')}</span>
              </div>
              <p className="text-xs text-muted-foreground/50 mt-1.5">{ts('advanced.ctlDaysHint')}</p>
            </div>

            <div>
              <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-2">
                {ts('advanced.atlDaysLabel')}
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
                <span className="text-xs text-muted-foreground whitespace-nowrap">{ts('units.days')}</span>
              </div>
              <p className="text-xs text-muted-foreground/50 mt-1.5">{ts('advanced.atlDaysHint')}</p>
            </div>

            <div>
              <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-2">
                {ts('advanced.matchRadiusLabel')}
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
                <span className="text-xs text-muted-foreground whitespace-nowrap">{ts('units.m')}</span>
              </div>
              <p className="text-xs text-muted-foreground/50 mt-1.5">{ts('advanced.matchRadiusHint')}</p>
            </div>
          </div>

          <div className="flex items-center gap-4 pt-1">
            <button
              onClick={saveAdvanced}
              disabled={advancedSaving}
              className="rounded-md px-5 py-2 text-sm font-medium bg-orange-500 hover:bg-orange-600 disabled:opacity-50 transition-colors text-white cursor-pointer"
            >
              {advancedSaving ? ts('common.saving') : t('actions.save')}
            </button>
            {advancedSuccess && <span className="text-sm text-green-600">{ts('common.saved')}</span>}
            {advancedError && <span className="text-sm text-red-500">{advancedError}</span>}
          </div>
        </CardContent>
      </Card>

      {/* ── HF-Korrektur (z.B. Betablocker) ── */}
      <Card>
        <CardHeader className="border-b border-border pb-3">
          <CardTitle className="text-sm font-semibold">{ts('hrCorrection.title')}</CardTitle>
          <p className="text-xs text-muted-foreground">{ts('hrCorrection.subtitle')}</p>
        </CardHeader>
        <CardContent className="pt-5 space-y-5">
          <label className="flex items-center gap-2.5 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={hrCorrectionEnabled}
              onChange={e => setHrCorrectionEnabled(e.target.checked)}
              className="accent-primary h-4 w-4"
            />
            <span className="font-medium">{ts('hrCorrection.enableLabel')}</span>
          </label>

          <p className="text-xs text-muted-foreground leading-relaxed bg-muted/40 rounded-md p-3">
            {ts('hrCorrection.disclaimer')}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-2">
                {ts('hrCorrection.pctLabel')}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="1"
                  min="0"
                  max="30"
                  value={hrCorrectionPctInput}
                  onChange={e => setHrCorrectionPctInput(e.target.value)}
                  className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-colors"
                />
                <span className="text-xs text-muted-foreground whitespace-nowrap">{ts('units.percentHrMax')}</span>
              </div>
              <p className="text-xs text-muted-foreground/50 mt-1.5">{ts('hrCorrection.pctHint')}</p>
            </div>

            <div>
              <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-2">
                {ts('hrCorrection.sinceLabel')}
              </label>
              <input
                type="date"
                value={hrCorrectionSinceInput}
                onChange={e => setHrCorrectionSinceInput(e.target.value)}
                className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-colors"
              />
              <p className="text-xs text-muted-foreground/50 mt-1.5">{ts('hrCorrection.sinceHint')}</p>
            </div>
          </div>

          <div className="flex items-center gap-4 pt-1">
            <button
              onClick={saveHrCorrection}
              disabled={hrCorrectionSaving}
              className="rounded-md px-5 py-2 text-sm font-medium bg-orange-500 hover:bg-orange-600 disabled:opacity-50 transition-colors text-white cursor-pointer"
            >
              {hrCorrectionSaving ? ts('common.saving') : t('actions.save')}
            </button>
            {hrCorrectionSuccess && <span className="text-sm text-green-600">{ts('common.saved')}</span>}
            {hrCorrectionError && <span className="text-sm text-red-500">{hrCorrectionError}</span>}
          </div>
        </CardContent>
      </Card>

      {/* ── Diagramm & Darstellung ── */}
      <Card>
        <CardHeader className="border-b border-border pb-3">
          <CardTitle className="text-sm font-semibold">{ts('display.title')}</CardTitle>
          <p className="text-xs text-muted-foreground">
            {ts('display.subtitle')}
          </p>
        </CardHeader>
        <CardContent className="pt-5 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-2">
                {ts('display.comparisonSimplifyLabel')}
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
                <span className="text-xs text-muted-foreground whitespace-nowrap">{ts('units.m')}</span>
              </div>
              <p className="text-xs text-muted-foreground/50 mt-1.5">{ts('display.comparisonSimplifyHint')}</p>
            </div>

            <div>
              <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-2">
                {ts('display.blockHoursLabel')}
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
                <span className="text-xs text-muted-foreground whitespace-nowrap">{ts('units.hours')}</span>
              </div>
              <p className="text-xs text-muted-foreground/50 mt-1.5">{ts('display.blockHoursHint')}</p>
            </div>

            <div>
              <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-2">
                {ts('display.volumeTrendWeeksLabel')}
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
                <span className="text-xs text-muted-foreground whitespace-nowrap">{ts('units.weeks')}</span>
              </div>
              <p className="text-xs text-muted-foreground/50 mt-1.5">{ts('display.volumeTrendWeeksHint')}</p>
            </div>

            <div>
              <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-2">
                {ts('display.chartHeightMiniLabel')}
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
                <span className="text-xs text-muted-foreground whitespace-nowrap">{ts('units.px')}</span>
              </div>
              <p className="text-xs text-muted-foreground/50 mt-1.5">{ts('display.chartHeightMiniHint')}</p>
            </div>

            <div>
              <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-2">
                {ts('display.chartHeightCompactLabel')}
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
                <span className="text-xs text-muted-foreground whitespace-nowrap">{ts('units.px')}</span>
              </div>
              <p className="text-xs text-muted-foreground/50 mt-1.5">{ts('display.chartHeightCompactHint')}</p>
            </div>

            <div>
              <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-2">
                {ts('display.chartHeightLabel')}
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
                <span className="text-xs text-muted-foreground whitespace-nowrap">{ts('units.px')}</span>
              </div>
              <p className="text-xs text-muted-foreground/50 mt-1.5">{ts('display.chartHeightHint')}</p>
            </div>

            <div>
              <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-2">
                {ts('display.chartHeightDenseLabel')}
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
                <span className="text-xs text-muted-foreground whitespace-nowrap">{ts('units.px')}</span>
              </div>
              <p className="text-xs text-muted-foreground/50 mt-1.5">{ts('display.chartHeightDenseHint')}</p>
            </div>
          </div>

          <div>
            <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-2">
              {ts('display.colorsLabel')}
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
            <p className="text-xs text-muted-foreground/50 mt-1.5">{ts('display.colorsHint')}</p>
          </div>

          <div className="flex items-center gap-4 pt-1">
            <button
              onClick={saveDisplayConfig}
              disabled={displaySaving}
              className="rounded-md px-5 py-2 text-sm font-medium bg-orange-500 hover:bg-orange-600 disabled:opacity-50 transition-colors text-white cursor-pointer"
            >
              {displaySaving ? ts('common.saving') : t('actions.save')}
            </button>
            {displaySuccess && <span className="text-sm text-green-600">{ts('common.saved')}</span>}
            {displayError && <span className="text-sm text-red-500">{displayError}</span>}
          </div>
        </CardContent>
      </Card>

      {/* ── WattLoomApp-Sync ── */}
      <Card>
        <CardHeader className="border-b border-border pb-3">
          <CardTitle className="text-sm font-semibold">{ts('appSync.title')}</CardTitle>
          <p className="text-xs text-muted-foreground">
            {ts('appSync.subtitle')}
          </p>
        </CardHeader>
        <CardContent className="pt-5 space-y-4">
          {appSyncStatus?.last_synced_at && (
            <p className="text-sm text-muted-foreground">
              {ts('appSync.lastSync', { date: fmtDate(appSyncStatus.last_synced_at), time: fmtClock(appSyncStatus.last_synced_at) })}
              {appSyncStatus.last_status === 'error' && (
                <span className="text-red-500"> {ts('appSync.failedPrefix')} {appSyncStatus.last_message}</span>
              )}
              {appSyncStatus.last_status === 'ok' && (
                <span className="text-green-600"> – {appSyncStatus.last_message}</span>
              )}
            </p>
          )}
          {!appSyncStatus?.last_synced_at && (
            <p className="text-sm text-muted-foreground">{ts('appSync.notSyncedYet')}</p>
          )}
          {appSyncError && <p className="text-sm text-red-500">{appSyncError}</p>}
          <button
            onClick={startAppSync}
            disabled={appSyncBusy}
            className="rounded-md px-5 py-2 text-sm font-medium bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-white cursor-pointer"
          >
            {appSyncBusy ? ts('appSync.syncing') : ts('appSync.syncNow')}
          </button>
        </CardContent>
      </Card>

      {/* ── Datenbank zurücksetzen ── */}
      <Card>
        <CardHeader className="border-b border-border pb-3">
          <CardTitle className="text-sm font-semibold">{ts('reset.title')}</CardTitle>
          <p className="text-xs text-muted-foreground">
            {ts('reset.subtitle')}
          </p>
        </CardHeader>
        <CardContent className="pt-5">
          {resetDone && (
            <p className="text-sm text-green-600 mb-3">
              {ts('reset.done')}
              {resetBackupName && <> {ts('reset.backupSavedPrefix')} <code className="text-xs">{resetBackupName}</code></>}
            </p>
          )}
          {resetError && <p className="text-sm text-red-500 mb-3">{resetError}</p>}

          {!resetConfirm ? (
            <button
              onClick={() => { setResetConfirm(true); setResetDone(false); setResetError(null); }}
              disabled={importStatus === 'running'}
              className="rounded-md px-5 py-2 text-sm font-medium border border-destructive/40 text-destructive hover:bg-destructive/10 hover:border-destructive/70 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              {ts('reset.clearButton')}
            </button>
          ) : (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 space-y-3">
              <p className="text-sm text-destructive">
                {ts('reset.confirmText')}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={confirmReset}
                  disabled={resetBusy}
                  className="rounded-md px-4 py-2 text-sm font-medium bg-red-600 hover:bg-red-700 disabled:opacity-50 transition-colors text-white cursor-pointer"
                >
                  {resetBusy ? ts('reset.deleting') : ts('reset.confirmYes')}
                </button>
                <button
                  onClick={() => setResetConfirm(false)}
                  disabled={resetBusy}
                  className="rounded-md px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                >
                  {t('actions.cancel')}
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
          <CardTitle className="text-sm font-semibold">{ts('import.title')}</CardTitle>
          <p className="text-xs text-muted-foreground">
            {ts('import.subtitlePrefix')}{' '}
            <code className="bg-muted px-1 rounded text-foreground text-xs">download/</code>
            {' '}{ts('import.subtitleSuffix')}
          </p>
        </CardHeader>
        <CardContent className="pt-5 space-y-4">
          {importConfirm ? (
            <div className="rounded-lg border border-orange-500/40 bg-orange-500/10 p-4 space-y-3">
              <p className="text-sm font-medium text-orange-600 dark:text-orange-400">
                {ts('import.confirmTitle')}
              </p>
              <p className="text-xs text-muted-foreground">
                {ts('import.confirmTextIntro')}
                {' '}{ts('import.confirmTextBeforeStrong')} <strong>{ts('import.confirmTextStrong')}</strong>{ts('import.confirmTextAfterStrong')}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={doStartImport}
                  className="rounded-md px-4 py-1.5 text-xs font-medium bg-orange-500 hover:bg-orange-600 text-white transition-colors cursor-pointer"
                >
                  {ts('import.importAnyway')}
                </button>
                <button
                  onClick={() => setImportConfirm(false)}
                  className="rounded-md px-4 py-1.5 text-xs font-medium border border-border hover:bg-muted transition-colors cursor-pointer"
                >
                  {t('actions.cancel')}
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
                {importStatus === 'running' ? ts('import.running') : ts('import.startButton')}
              </button>
              {importZip && (
                <span className="text-xs text-muted-foreground font-mono">{importZip}</span>
              )}
              {importStatus === 'done' && <span className="text-sm text-green-600">{ts('import.done')}</span>}
              {importStatus === 'error' && <span className="text-sm text-red-500">{ts('import.error')}</span>}
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
          <CardTitle className="text-sm font-semibold">{ts('fitImport.title')}</CardTitle>
          <p className="text-xs text-muted-foreground">
            {ts('fitImport.subtitle')}
          </p>
        </CardHeader>
        <CardContent className="pt-5">
          <form onSubmit={doFitUpload} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Datei-Auswahl */}
              <div>
                <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-2">
                  {ts('fitImport.fileLabel')}
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
                  {ts('importCommon.bikeLabel')} <span className="normal-case font-normal">{ts('importCommon.bikeOptionalHint')}</span>
                </label>
                <select
                  value={fitBikeId}
                  onChange={e => setFitBikeId(e.target.value)}
                  className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-colors"
                >
                  <option value="">{ts('importCommon.noBikeOption')}</option>
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
                {fitUploading ? ts('importCommon.importing') : ts('importCommon.importButton')}
              </button>

              {fitResult && (
                <div className="flex items-center gap-3">
                  <span className="text-sm text-green-600">
                    Importiert: <span className="font-medium">{fitResult.is_ride ? rideTitle(fitResult, t) : workoutTitle(fitResult, t)}</span>
                  </span>
                  {fitResult.is_ride && (
                    <button
                      type="button"
                      onClick={() => navigate(`/activities/${fitResult.activity_id}`)}
                      className="text-xs text-orange-500 hover:text-orange-400 underline underline-offset-2 transition-colors"
                    >
                      {ts('importCommon.openActivity')}
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
          <CardTitle className="text-sm font-semibold">{ts('tcxImport.title')}</CardTitle>
          <p className="text-xs text-muted-foreground">
            {ts('tcxImport.subtitle')}
          </p>
        </CardHeader>
        <CardContent className="pt-5">
          <form onSubmit={doTcxUpload} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Datei-Auswahl */}
              <div>
                <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-2">
                  {ts('tcxImport.fileLabel')}
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
                  {ts('importCommon.bikeLabel')} <span className="normal-case font-normal">{ts('importCommon.bikeOptionalHint')}</span>
                </label>
                <select
                  value={tcxBikeId}
                  onChange={e => setTcxBikeId(e.target.value)}
                  className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-colors"
                >
                  <option value="">{ts('importCommon.noBikeOption')}</option>
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
                {tcxUploading ? ts('importCommon.importing') : ts('importCommon.importButton')}
              </button>

              {tcxResult && (
                <div className="flex items-center gap-3">
                  <span className="text-sm text-green-600">
                    Importiert: <span className="font-medium">{tcxResult.is_ride ? rideTitle(tcxResult, t) : workoutTitle(tcxResult, t)}</span>
                  </span>
                  {tcxResult.is_ride && (
                    <button
                      type="button"
                      onClick={() => navigate(`/activities/${tcxResult.activity_id}`)}
                      className="text-xs text-orange-500 hover:text-orange-400 underline underline-offset-2 transition-colors"
                    >
                      {ts('importCommon.openActivity')}
                    </button>
                  )}
                  {!tcxResult.is_ride && (
                    <button
                      type="button"
                      onClick={() => navigate('/activities?tab=workouts')}
                      className="text-xs text-orange-500 hover:text-orange-400 underline underline-offset-2 transition-colors"
                    >
                      {ts('importCommon.openWorkouts')}
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
          <CardTitle className="text-sm font-semibold">{ts('gpxImport.title')}</CardTitle>
          <p className="text-xs text-muted-foreground">
            {ts('gpxImport.subtitle')}
          </p>
        </CardHeader>
        <CardContent className="pt-5">
          <form onSubmit={doGpxUpload} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-2">
                  {ts('gpxImport.fileLabel')}
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
                  {ts('importCommon.bikeLabel')} <span className="normal-case font-normal">{ts('importCommon.bikeOptionalHint')}</span>
                </label>
                <select
                  value={gpxBikeId}
                  onChange={e => setGpxBikeId(e.target.value)}
                  className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-colors"
                >
                  <option value="">{ts('importCommon.noBikeOption')}</option>
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
                {gpxUploading ? ts('importCommon.importing') : ts('importCommon.importButton')}
              </button>

              {gpxResult && (
                <div className="flex items-center gap-3">
                  <span className="text-sm text-green-600">
                    Importiert: <span className="font-medium">{gpxResult.is_ride ? rideTitle(gpxResult, t) : workoutTitle(gpxResult, t)}</span>
                  </span>
                  {gpxResult.is_ride && (
                    <button
                      type="button"
                      onClick={() => navigate(`/activities/${gpxResult.activity_id}`)}
                      className="text-xs text-orange-500 hover:text-orange-400 underline underline-offset-2 transition-colors"
                    >
                      {ts('importCommon.openActivity')}
                    </button>
                  )}
                  {!gpxResult.is_ride && (
                    <button
                      type="button"
                      onClick={() => navigate('/activities?tab=workouts')}
                      className="text-xs text-orange-500 hover:text-orange-400 underline underline-offset-2 transition-colors"
                    >
                      {ts('importCommon.openWorkouts')}
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
          <CardTitle className="text-sm font-semibold">{ts('weather.title')}</CardTitle>
          <p className="text-xs text-muted-foreground">
            {ts('weather.subtitle')}
          </p>
        </CardHeader>
        <CardContent className="pt-5 space-y-4">
          {weatherStatus && (
            <div className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{weatherStatus.with_weather}</span>
              {' '}{ts('weather.statusJoiner')}{' '}
              <span className="font-medium text-foreground">{weatherStatus.total_activities}</span>
              {' '}{ts('weather.statusSuffix')}
              {weatherStatus.without_weather > 0 && (
                <span className="ml-1 text-xs">{ts('weather.missing', { count: weatherStatus.without_weather })}</span>
              )}
            </div>
          )}

          {weatherStatus?.running && (
            <div className="text-xs text-muted-foreground">
              {ts('weather.fetchingProgress', { done: weatherStatus.done, total: weatherStatus.total })}
              {weatherStatus.errors > 0 && (
                <span className="text-orange-500 ml-2">{ts('weather.errorsCount', { count: weatherStatus.errors })}</span>
              )}
            </div>
          )}

          <button
            onClick={startWeatherFetch}
            disabled={weatherFetching || weatherStatus?.running || weatherStatus?.without_weather === 0}
            className="rounded-md px-5 py-2 text-sm font-medium bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-white cursor-pointer"
          >
            {weatherFetching || weatherStatus?.running ? ts('weather.running') : ts('weather.fetchButton')}
          </button>
          {weatherStatus?.with_weather === weatherStatus?.total_activities && weatherStatus?.total_activities > 0 && !weatherStatus?.running && (
            <p className="text-xs text-green-600">{ts('weather.allDone')}</p>
          )}
        </CardContent>
      </Card>

      {/* ── Leistungsschätzung ── */}
      <Card>
        <CardHeader className="border-b border-border pb-3">
          <CardTitle className="text-sm font-semibold">{ts('power.title')}</CardTitle>
          <p className="text-xs text-muted-foreground">
            {ts('power.subtitle')}
          </p>
        </CardHeader>
        <CardContent className="pt-5 space-y-4">
          {powerMsg && <p className="text-sm text-green-600">{powerMsg} {ts('power.backgroundSuffix')}</p>}
          {powerError && <p className="text-sm text-red-500">{powerError}</p>}
          <button
            onClick={startPowerRecalc}
            disabled={powerBusy}
            className="rounded-md px-5 py-2 text-sm font-medium bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-white cursor-pointer"
          >
            {powerBusy ? ts('power.starting') : ts('power.estimateButton')}
          </button>
        </CardContent>
      </Card>

        </TabsContent>
      </Tabs>
    </div>
  );
}
