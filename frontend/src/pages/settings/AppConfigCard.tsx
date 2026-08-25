import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CONFIG_DEFAULTS, useConfigReload } from '@/lib/config-context';

export function AppConfigCard() {
  const { t } = useTranslation('common');
  const { t: ts } = useTranslation('settings');
  const reloadConfig = useConfigReload();
  const [bezierInput, setBezierInput] = useState(String(CONFIG_DEFAULTS.bezier_tension));
  const [sparklineInput, setSparklineInput] = useState(String(CONFIG_DEFAULTS.sparkline_weeks));
  const [bucketInput, setBucketInput] = useState(String(CONFIG_DEFAULTS.speed_color_buckets));
  const [simplifyInput, setSimplifyInput] = useState(String(CONFIG_DEFAULTS.track_simplify_m));
  const [wearPctInput, setWearPctInput] = useState(String(CONFIG_DEFAULTS.wear_warning_pct));
  const [chainMaintenanceKmInput, setChainMaintenanceKmInput] = useState(String(CONFIG_DEFAULTS.chain_maintenance_km));
  const [configSaving, setConfigSaving] = useState(false);
  const [configSuccess, setConfigSuccess] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);

  useEffect(() => {
    api.getSettings().then(res => {
      setBezierInput(String(res.bezier_tension      ?? CONFIG_DEFAULTS.bezier_tension));
      setSparklineInput(String(res.sparkline_weeks  ?? CONFIG_DEFAULTS.sparkline_weeks));
      setBucketInput(String(res.speed_color_buckets ?? CONFIG_DEFAULTS.speed_color_buckets));
      setSimplifyInput(String(res.track_simplify_m  ?? CONFIG_DEFAULTS.track_simplify_m));
      setWearPctInput(String(res.wear_warning_pct   ?? CONFIG_DEFAULTS.wear_warning_pct));
      setChainMaintenanceKmInput(String(res.chain_maintenance_km ?? CONFIG_DEFAULTS.chain_maintenance_km));
    }).catch(() => {});
  }, []);

  async function saveConfig() {
    const bezier = parseFloat(bezierInput.replace(',', '.'));
    const sparkline = parseInt(sparklineInput);
    const buckets = parseInt(bucketInput);
    const simplify = parseInt(simplifyInput);
    const wearPct = parseFloat(wearPctInput.replace(',', '.'));
    const chainMaintenanceKm = parseFloat(chainMaintenanceKmInput.replace(',', '.'));
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
    if (isNaN(chainMaintenanceKm) || chainMaintenanceKm < 50 || chainMaintenanceKm > 1000) {
      setConfigError(ts('appConfig.errors.chainMaintenanceKmRange'));
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
        chain_maintenance_km: chainMaintenanceKm,
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

  return (
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

          <div>
            <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-2">
              {ts('appConfig.chainMaintenanceKmLabel')}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="10"
                min="50"
                max="1000"
                value={chainMaintenanceKmInput}
                onChange={e => setChainMaintenanceKmInput(e.target.value)}
                className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-colors"
              />
              <span className="text-xs text-muted-foreground whitespace-nowrap">{ts('units.km')}</span>
            </div>
            <p className="text-xs text-muted-foreground/50 mt-1.5">{ts('appConfig.chainMaintenanceKmHint')}</p>
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
  );
}
