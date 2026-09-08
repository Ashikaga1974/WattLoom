import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import type { Bike } from '@/lib/api';
import { Skeleton } from '@/components/ui/skeleton';

export function BikesList({ bikes, loading }: { bikes: Bike[]; loading: boolean }) {
  const { t } = useTranslation('dashboard');

  return (
    <section>
      <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-3 px-1">
        {t('bikes.title')}
      </h2>
      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
        </div>
      ) : bikes.length === 0 ? (
        <p className="text-sm text-muted-foreground px-1">{t('bikes.empty')}</p>
      ) : (
        <div className="space-y-1.5">
          {bikes.map(bike => {
            const maxRides = Math.max(...bikes.map(b => b.ride_count));
            const pct = maxRides > 0 ? (bike.ride_count / maxRides) * 100 : 0;
            return (
              <div
                key={bike.id}
                className="rounded-xl border border-border bg-card px-4 py-3"
              >
                <div className="flex items-center justify-between mb-2.5">
                  <p className="font-semibold text-sm">
                    {bike.name}
                  </p>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {bike.ride_count} Rides
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${pct}%`, background: 'var(--primary)' }}
                  />
                </div>
              </div>
            );
          })}
          <Link to="/bikes" className="block pt-1 px-1 text-xs text-primary hover:underline">
            {t('bikes.viewAll')}
          </Link>
        </div>
      )}
    </section>
  );
}
