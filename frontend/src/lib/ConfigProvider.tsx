import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { CONFIG_DEFAULTS, ConfigContext, type AppConfig } from './config-context';

export function ConfigProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<AppConfig>(CONFIG_DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [onboardingCompleted, setOnboardingCompleted] = useState(true);

  const reload = useCallback(async () => {
    try {
      const s = await api.getSettings();
      setOnboardingCompleted(s.onboarding_completed === 1);
      const colors = s.comparison_colors ? s.comparison_colors.split(',').filter(Boolean) : null;
      setConfig({
        language:            s.language ?? CONFIG_DEFAULTS.language,
        bezier_tension:      s.bezier_tension      ?? CONFIG_DEFAULTS.bezier_tension,
        sparkline_weeks:     s.sparkline_weeks     ?? CONFIG_DEFAULTS.sparkline_weeks,
        speed_color_buckets: s.speed_color_buckets ?? CONFIG_DEFAULTS.speed_color_buckets,
        track_simplify_m:    s.track_simplify_m    ?? CONFIG_DEFAULTS.track_simplify_m,
        wear_warning_pct:    s.wear_warning_pct    ?? CONFIG_DEFAULTS.wear_warning_pct,
        chain_maintenance_km: s.chain_maintenance_km ?? CONFIG_DEFAULTS.chain_maintenance_km,
        comparison_simplify: s.comparison_simplify ?? CONFIG_DEFAULTS.comparison_simplify,
        block_hours:         s.block_hours         ?? CONFIG_DEFAULTS.block_hours,
        volume_trend_weeks:  s.volume_trend_weeks  ?? CONFIG_DEFAULTS.volume_trend_weeks,
        chart_height_mini:   s.chart_height_mini    ?? CONFIG_DEFAULTS.chart_height_mini,
        chart_height_compact: s.chart_height_compact ?? CONFIG_DEFAULTS.chart_height_compact,
        chart_height:        s.chart_height         ?? CONFIG_DEFAULTS.chart_height,
        chart_height_dense:  s.chart_height_dense   ?? CONFIG_DEFAULTS.chart_height_dense,
        comparison_colors:   colors && colors.length > 0 ? colors : CONFIG_DEFAULTS.comparison_colors,
      });
    } catch { /* Backend nicht erreichbar, Defaults behalten, Wizard bleibt aus (fail-safe) */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  return (
    <ConfigContext.Provider value={{ config, reload, loading, onboardingCompleted }}>
      {children}
    </ConfigContext.Provider>
  );
}
