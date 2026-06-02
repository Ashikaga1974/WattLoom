import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api';

export interface AppConfig {
  bezier_tension: number;
  sparkline_weeks: number;
  speed_color_buckets: number;
  track_simplify_m: number;
}

export const CONFIG_DEFAULTS: AppConfig = {
  bezier_tension: 0.2,
  sparkline_weeks: 8,
  speed_color_buckets: 20,
  track_simplify_m: 5,
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
      setConfig({
        bezier_tension:      s.bezier_tension      ?? CONFIG_DEFAULTS.bezier_tension,
        sparkline_weeks:     s.sparkline_weeks     ?? CONFIG_DEFAULTS.sparkline_weeks,
        speed_color_buckets: s.speed_color_buckets ?? CONFIG_DEFAULTS.speed_color_buckets,
        track_simplify_m:    s.track_simplify_m    ?? CONFIG_DEFAULTS.track_simplify_m,
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
