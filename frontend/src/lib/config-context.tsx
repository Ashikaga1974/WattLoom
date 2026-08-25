import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api';

export interface AppConfig {
  language: string;
  bezier_tension: number;
  sparkline_weeks: number;
  speed_color_buckets: number;
  track_simplify_m: number;
  wear_warning_pct: number;
  chain_maintenance_km: number;
  comparison_simplify: number;
  block_hours: number;
  volume_trend_weeks: number;
  chart_height_mini: number;
  chart_height_compact: number;
  chart_height: number;
  chart_height_dense: number;
  comparison_colors: string[];
}

export const CONFIG_DEFAULTS: AppConfig = {
  language: 'de',
  bezier_tension: 0.2,
  sparkline_weeks: 8,
  speed_color_buckets: 20,
  track_simplify_m: 5,
  wear_warning_pct: 90,
  chain_maintenance_km: 300,
  comparison_simplify: 20,
  block_hours: 3,
  volume_trend_weeks: 4,
  chart_height_mini: 100,
  chart_height_compact: 140,
  chart_height: 200,
  chart_height_dense: 220,
  comparison_colors: ['#f97316', '#3b82f6', '#22c55e', '#a855f7', '#eab308'],
};

interface ConfigContextValue {
  config: AppConfig;
  reload: () => Promise<void>;
}

const ConfigContext = createContext<ConfigContextValue>({
  config: CONFIG_DEFAULTS,
  reload: async () => {},
});

export function ConfigProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<AppConfig>(CONFIG_DEFAULTS);

  const reload = useCallback(async () => {
    try {
      const s = await api.getSettings();
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
    } catch { /* Backend nicht erreichbar, Defaults behalten */ }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  return (
    <ConfigContext.Provider value={{ config, reload }}>
      {children}
    </ConfigContext.Provider>
  );
}

export function useConfig(): AppConfig {
  return useContext(ConfigContext).config;
}

export function useConfigReload(): () => Promise<void> {
  return useContext(ConfigContext).reload;
}
