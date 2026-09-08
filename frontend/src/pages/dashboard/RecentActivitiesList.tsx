import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import type { Activity } from '@/lib/api';
import { fmtKm, fmtDate, fmtSpeed, fmtWeekday } from '@/lib/format';
import { rideTitle } from '@/lib/activity-display';
import { Skeleton } from '@/components/ui/skeleton';

export function RecentActivitiesList({ activities, loading }: { activities: Activity[]; loading: boolean }) {
  const { t } = useTranslation('dashboard');

  return (
    <section>
      <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-3 px-1">
        {t('recent.title')}
      </h2>
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="space-y-1.5">
          {activities.map((act, i) => (
            <Link
              key={act.id}
              to={`/activities/${act.id}`}
              className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-3 hover:bg-muted transition-all duration-200 hover:border-primary/40 group"
            >
              {/* farbige Akzent-Linie – leichte Variation über die 5 Einträge */}
              <div
                className="w-1 h-9 rounded-full shrink-0 transition-opacity duration-200 opacity-50 group-hover:opacity-90"
                style={{ background: `hsl(${220 - i * 28},75%,55%)` }}
              />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm leading-snug truncate group-hover:text-primary transition-colors">
                  {rideTitle(act, t)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {fmtWeekday(act.start_date)}, {fmtDate(act.start_date)}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-bold text-sm tabular-nums">{fmtKm(act.distance_m)} km</p>
                {act.avg_speed_ms && (
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {fmtSpeed(act.avg_speed_ms)} km/h
                  </p>
                )}
              </div>
            </Link>
          ))}
          {activities.length === 0 && (
            <p className="text-sm text-muted-foreground px-1">{t('recent.empty')}</p>
          )}
          <Link to="/activities" className="block pt-1 px-1 text-xs text-primary hover:underline">
            {t('recent.viewAll')}
          </Link>
        </div>
      )}
    </section>
  );
}
