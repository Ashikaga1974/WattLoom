import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type Bike } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function AdvancedCard({ bikes }: { bikes: Bike[] }) {
  const { t } = useTranslation('common');
  const { t: ts } = useTranslation('settings');
  const [defaultBikeIdInput, setDefaultBikeIdInput] = useState('');
  // null = Settings noch nicht geladen – verhindert, dass der Bikes-Fallback (unten) vor dem
  // eigentlichen gespeicherten Wert greift, unabhängig davon welcher Fetch zuerst zurückkommt.
  const [settingsDefaultBikeId, setSettingsDefaultBikeId] = useState<string | null>(null);
  const [crrInput, setCrrInput] = useState('0.004');
  const [cdaInput, setCdaInput] = useState('0.32');
  const [bikeKgInput, setBikeKgInput] = useState('8');
  const [thresholdHrPctInput, setThresholdHrPctInput] = useState('85');
  const [ctlDaysInput, setCtlDaysInput] = useState('42');
  const [atlDaysInput, setAtlDaysInput] = useState('7');
  const [maxSpeedKmhInput, setMaxSpeedKmhInput] = useState('90');
  const [matchRadiusMInput, setMatchRadiusMInput] = useState('500');
  const [advancedSaving, setAdvancedSaving] = useState(false);
  const [advancedSuccess, setAdvancedSuccess] = useState(false);
  const [advancedError, setAdvancedError] = useState<string | null>(null);

  useEffect(() => {
    api.getSettings().then(res => {
      setSettingsDefaultBikeId(res.default_bike_id ?? '');
      setCrrInput(String(res.crr ?? 0.004));
      setCdaInput(String(res.cda ?? 0.32));
      setBikeKgInput(String(res.bike_kg ?? 8));
      setThresholdHrPctInput(String(Math.round((res.threshold_hr_pct ?? 0.85) * 100)));
      setCtlDaysInput(String(res.ctl_days ?? 42));
      setAtlDaysInput(String(res.atl_days ?? 7));
      setMaxSpeedKmhInput(String(Math.round((res.max_plausible_speed_ms ?? 25) * 3.6)));
      setMatchRadiusMInput(String(Math.round((res.path_match_radius_km ?? 0.5) * 1000)));
    }).catch(() => {});
  }, []);

  // Gespeicherter default_bike_id gewinnt, sonst Fallback auf das erste Bike – erst anwendbar,
  // sobald die Settings tatsächlich geladen sind (unabhängig davon, welcher Fetch zuerst landet).
  useEffect(() => {
    if (settingsDefaultBikeId === null) return;
    setDefaultBikeIdInput(settingsDefaultBikeId || (bikes[0]?.id ?? ''));
  }, [settingsDefaultBikeId, bikes]);

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
      await api.saveSettings({
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
      setAdvancedSuccess(true);
      setTimeout(() => setAdvancedSuccess(false), 2500);
    } catch (e) {
      setAdvancedError(e instanceof Error ? e.message : ts('common.saveFailed'));
    } finally {
      setAdvancedSaving(false);
    }
  }

  return (
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
  );
}
