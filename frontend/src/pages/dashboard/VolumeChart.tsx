import { useTranslation } from 'react-i18next';

import type { WeeklyVolume } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const BAR_MAX_PX = 64;

export function VolumeChart({ weeklyVol, weeks }: { weeklyVol: WeeklyVolume[]; weeks: number }) {
  const { t } = useTranslation('dashboard');

  const hasVolData = weeklyVol.some(
    w => w.ride_minutes + w.workout_minutes + w.weight_training_minutes > 0
  );
  if (!hasVolData) return null;

  const maxVolMin = Math.max(
    1,
    ...weeklyVol.map(w => w.ride_minutes + w.workout_minutes + w.weight_training_minutes)
  );

  function barPx(minutes: number) {
    return Math.round((minutes / maxVolMin) * BAR_MAX_PX);
  }

  function volLabel(w: WeeklyVolume) {
    return w.weeks_ago === 0 ? t('charts.current') : t('charts.weeksAgo', { weeks: w.weeks_ago });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-sm text-muted-foreground font-medium">
            {t('charts.volumeTitle', { weeks })}
          </CardTitle>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full inline-block" style={{ background: '#3b82f6' }} />
              {t('charts.legendRide')}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full inline-block" style={{ background: '#a78bfa' }} />
              {t('charts.legendWorkout')}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full inline-block" style={{ background: '#f59e0b' }} />
              {t('charts.legendStrength')}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-1" style={{ height: `${BAR_MAX_PX + 20}px` }}>
          {weeklyVol.map((w, i) => {
            const total = w.ride_minutes + w.workout_minutes + w.weight_training_minutes;
            const ridePx = barPx(w.ride_minutes);
            const workoutPx = barPx(w.workout_minutes);
            const weightPx = barPx(w.weight_training_minutes);
            return (
              <div key={i} className="flex flex-col items-center flex-1 min-w-0">
                <div
                  className="w-full flex flex-col-reverse rounded-sm overflow-hidden"
                  style={{ height: `${barPx(total)}px` }}
                  title={t('charts.totalMinutesTooltip', { label: volLabel(w), minutes: Math.round(total) })}
                >
                  {w.weight_training_minutes > 0 && (
                    <div style={{ height: `${weightPx}px`, background: '#f59e0b', flexShrink: 0 }} />
                  )}
                  {w.workout_minutes > 0 && (
                    <div style={{ height: `${workoutPx}px`, background: '#a78bfa', flexShrink: 0 }} />
                  )}
                  {w.ride_minutes > 0 && (
                    <div style={{ height: `${ridePx}px`, background: '#3b82f6', flexShrink: 0 }} />
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground mt-1 truncate w-full text-center">
                  {volLabel(w)}
                </p>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
