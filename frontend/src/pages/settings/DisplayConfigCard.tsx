import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CONFIG_DEFAULTS, useConfigReload } from '@/lib/config-context';

export function DisplayConfigCard() {
  const { t } = useTranslation('common');
  const { t: ts } = useTranslation('settings');
  const reloadConfig = useConfigReload();
  const [comparisonSimplifyInput, setComparisonSimplifyInput] = useState(String(CONFIG_DEFAULTS.comparison_simplify));
  const [blockHoursInput, setBlockHoursInput] = useState(String(CONFIG_DEFAULTS.block_hours));
  const [volumeTrendWeeksInput, setVolumeTrendWeeksInput] = useState(String(CONFIG_DEFAULTS.volume_trend_weeks));
  const [chartHeightMiniInput, setChartHeightMiniInput] = useState(String(CONFIG_DEFAULTS.chart_height_mini));
  const [chartHeightCompactInput, setChartHeightCompactInput] = useState(String(CONFIG_DEFAULTS.chart_height_compact));
  const [chartHeightInput, setChartHeightInput] = useState(String(CONFIG_DEFAULTS.chart_height));
  const [chartHeightDenseInput, setChartHeightDenseInput] = useState(String(CONFIG_DEFAULTS.chart_height_dense));
  const [comparisonColorsInput, setComparisonColorsInput] = useState<string[]>(CONFIG_DEFAULTS.comparison_colors);
  const [displaySaving, setDisplaySaving] = useState(false);
  const [displaySuccess, setDisplaySuccess] = useState(false);
  const [displayError, setDisplayError] = useState<string | null>(null);

  useEffect(() => {
    api.getSettings().then(res => {
      setComparisonSimplifyInput(String(res.comparison_simplify   ?? CONFIG_DEFAULTS.comparison_simplify));
      setBlockHoursInput(String(res.block_hours                   ?? CONFIG_DEFAULTS.block_hours));
      setVolumeTrendWeeksInput(String(res.volume_trend_weeks       ?? CONFIG_DEFAULTS.volume_trend_weeks));
      setChartHeightMiniInput(String(res.chart_height_mini         ?? CONFIG_DEFAULTS.chart_height_mini));
      setChartHeightCompactInput(String(res.chart_height_compact   ?? CONFIG_DEFAULTS.chart_height_compact));
      setChartHeightInput(String(res.chart_height                 ?? CONFIG_DEFAULTS.chart_height));
      setChartHeightDenseInput(String(res.chart_height_dense       ?? CONFIG_DEFAULTS.chart_height_dense));
      const colors = res.comparison_colors ? res.comparison_colors.split(',').filter(Boolean) : null;
      setComparisonColorsInput(colors && colors.length > 0 ? colors : CONFIG_DEFAULTS.comparison_colors);
    }).catch(() => {});
  }, []);

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

  return (
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
  );
}
