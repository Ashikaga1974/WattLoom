import { createContext, useContext } from 'react';

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

export interface ConfigContextValue {
  config: AppConfig;
  reload: () => Promise<void>;
  loading: boolean;
  onboardingCompleted: boolean;
}

// Provider liegt in ConfigProvider.tsx – Fast Refresh verlangt, dass .tsx-Dateien nur Komponenten exportieren.
export const ConfigContext = createContext<ConfigContextValue>({
  config: CONFIG_DEFAULTS,
  reload: async () => {},
  loading: true,
  // Fail-safe-Default: solange nichts geladen wurde, keinen Wizard erzwingen
  onboardingCompleted: true,
});

export function useConfig(): AppConfig {
  return useContext(ConfigContext).config;
}

export function useConfigReload(): () => Promise<void> {
  return useContext(ConfigContext).reload;
}

export function useOnboarding(): { loading: boolean; onboardingCompleted: boolean } {
  const { loading, onboardingCompleted } = useContext(ConfigContext);
  return { loading, onboardingCompleted };
}
