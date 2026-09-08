import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import type { ActivityStats } from '@/lib/api';
import { fmtTime, fmtNum } from '@/lib/format';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

// Zählt cubic-ease-out von 0 zum Zielwert hoch
function useCountUp(target: number, duration = 1400): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!target) { setValue(0); return; }
    let raf: number;
    const start = performance.now();
    function tick(now: number) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(eased * target));
      if (t < 1) raf = requestAnimationFrame(tick);
      else setValue(target);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

// Einzelne animierte KPI-Kachel
function KpiTile({
  label,
  target,
  unit,
  loading,
}: {
  label: string;
  target: number;
  unit: string;
  loading: boolean;
}) {
  const [started, setStarted] = useState(false);
  useEffect(() => {
    if (loading) { setStarted(false); return; }
    const t = setTimeout(() => setStarted(true), 100);
    return () => clearTimeout(t);
  }, [loading]);

  const animated = useCountUp(started ? Math.round(target) : 0);

  if (loading) {
    return (
      <div className="flex flex-col items-center py-8 px-4">
        <Skeleton className="h-14 w-32 mb-3" />
        <Skeleton className="h-3 w-16" />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center py-8 px-4 text-center">
      <p
        className="text-5xl md:text-6xl font-black tabular-nums leading-none tracking-tight"
        style={{ color: 'var(--primary)' }}
      >
        {fmtNum(animated)}
      </p>
      <p className="text-sm font-semibold text-foreground mt-2">{unit}</p>
      <p className="text-[11px] text-muted-foreground mt-0.5 uppercase tracking-wider">{label}</p>
    </div>
  );
}

export function KpiSection({
  stats,
  loading,
  availableYears,
  selectedYear,
  onYearChange,
}: {
  stats: ActivityStats | null;
  loading: boolean;
  availableYears: string[];
  selectedYear: string | null;
  onYearChange: (year: string | null) => void;
}) {
  const { t } = useTranslation('dashboard');
  const hasData = !loading && stats != null && stats.total_rides > 0;

  return (
    <Card className="overflow-hidden p-0 gap-0">
      {/* Jahr-Selector */}
      {availableYears.length > 0 && (
        <div className="flex items-center gap-1.5 px-5 pt-4 pb-0 flex-wrap">
          <span className="text-[11px] text-muted-foreground mr-1 uppercase tracking-wider">{t('period.label')}</span>
          {[null, ...availableYears].map(y => {
            const active = y === selectedYear;
            return (
              <button
                key={y ?? 'all'}
                onClick={() => onYearChange(y)}
                className="text-xs px-3 py-1 rounded-full font-medium transition-all duration-150"
                style={
                  active
                    ? { background: 'var(--primary)', color: 'var(--primary-foreground)' }
                    : { background: 'var(--muted)', color: 'var(--muted-foreground)' }
                }
              >
                {y ?? t('period.all')}
              </button>
            );
          })}
        </div>
      )}

      {/* 4 KPI-Tiles */}
      {hasData ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 divide-border mt-3">
            <KpiTile label={t('kpi.activities')} target={stats.total_rides} unit="Rides" loading={loading} />
            <KpiTile label={t('kpi.totalDistance')} target={Math.round(stats.total_km)} unit="km" loading={loading} />
            <KpiTile label={t('kpi.movingTime')} target={Math.round(stats.total_moving_s / 3600)} unit={t('kpi.hours')} loading={loading} />
            <KpiTile label={t('kpi.elevation')} target={Math.round(stats.total_elevation_m)} unit="Hm" loading={loading} />
          </div>

          {/* Durchschnitts-Strip */}
          <div className="grid grid-cols-3 divide-x divide-border border-t border-border">
            <div className="flex flex-col items-center py-3 px-4">
              <p className="text-base font-bold text-foreground tabular-nums">{stats.avg_km.toFixed(1)} km</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{t('kpi.avgRide')}</p>
            </div>
            <div className="flex flex-col items-center py-3 px-4">
              <p className="text-base font-bold text-foreground tabular-nums">{stats.avg_speed_kmh.toFixed(1)} km/h</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{t('kpi.avgSpeed')}</p>
            </div>
            <div className="flex flex-col items-center py-3 px-4">
              {stats.avg_hr ? (
                <>
                  <p className="text-base font-bold text-foreground tabular-nums">{Math.round(stats.avg_hr)} bpm</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{t('kpi.avgHr')}</p>
                </>
              ) : stats.avg_power_w ? (
                <>
                  <p className="text-base font-bold text-foreground tabular-nums">{Math.round(stats.avg_power_w)} W</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{t('kpi.avgPower')}</p>
                </>
              ) : (
                <>
                  <p className="text-base font-bold text-foreground tabular-nums">
                    {fmtTime(Math.round(stats.total_moving_s / stats.total_rides))}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{t('kpi.avgDuration')}</p>
                </>
              )}
            </div>
          </div>
        </>
      ) : loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 mt-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center py-8 px-4">
              <Skeleton className="h-14 w-32 mb-3" />
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </div>
      ) : (
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground mb-3">{t('kpi.noData')}</p>
          <Link to="/settings" className="text-sm text-primary hover:underline">
            {t('kpi.openSettings')}
          </Link>
        </CardContent>
      )}
    </Card>
  );
}
