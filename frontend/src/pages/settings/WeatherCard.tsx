import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type WeatherStatus } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function WeatherCard() {
  const { t: ts } = useTranslation('settings');
  const [weatherStatus, setWeatherStatus] = useState<WeatherStatus | null>(null);
  const [weatherFetching, setWeatherFetching] = useState(false);
  const weatherPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  useEffect(() => {
    refreshWeatherStatus();
    return () => stopWeatherPolling();
  }, []);

  return (
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
        {weatherStatus?.with_weather === weatherStatus?.total_activities && (weatherStatus?.total_activities ?? 0) > 0 && !weatherStatus?.running && (
          <p className="text-xs text-green-600">{ts('weather.allDone')}</p>
        )}
      </CardContent>
    </Card>
  );
}
