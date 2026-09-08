import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import type { Activity } from '@/lib/api';
import { fmtTime, fmtDate, fmtNum, fmtSpeed, fmtWeekday } from '@/lib/format';
import { rideTitle } from '@/lib/activity-display';
import { Skeleton } from '@/components/ui/skeleton';

// Ein einzelner Stat im Hero
function HeroStat({ value, label, primary = false }: { value: string; label: string; primary?: boolean }) {
  return (
    <div>
      <p
        className={primary ? 'text-3xl font-black leading-none' : 'text-xl font-bold text-foreground leading-none'}
        style={primary ? { color: 'var(--primary)' } : undefined}
      >
        {value}
      </p>
      <p className="text-[11px] text-muted-foreground mt-1 uppercase tracking-wider">{label}</p>
    </div>
  );
}

// Hero-Banner: letzter Ride, immer ungefiltert
export function HeroBanner({ activity, loading }: { activity: Activity | null; loading: boolean }) {
  const { t } = useTranslation(['dashboard', 'common']);
  if (loading) {
    return <Skeleton className="h-44 w-full rounded-2xl" />;
  }
  if (!activity) return null;

  const km = (activity.distance_m / 1000).toFixed(1);
  const speed = activity.avg_speed_ms ? fmtSpeed(activity.avg_speed_ms) : null;
  const hm = activity.elevation_gain_m ? Math.round(activity.elevation_gain_m) : null;

  return (
    <Link to={`/activities/${activity.id}`} className="block group">
      <div
        className="rounded-2xl border border-border/40 overflow-hidden relative"
        style={{
          background:
            'linear-gradient(135deg, rgba(252,76,2,0.18) 0%, rgba(252,76,2,0.06) 40%, var(--card) 70%)',
        }}
      >
        {/* Hover-Glow */}
        <div
          className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse at 8% 50%, rgba(252,76,2,0.14) 0%, transparent 65%)',
          }}
        />

        <div className="relative px-6 py-5">
          {/* Kopfzeile */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span
                className="w-2 h-2 rounded-full animate-pulse shrink-0"
                style={{ background: 'var(--primary)' }}
              />
              <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                {t('hero.lastRide')}
              </span>
            </div>
            <span className="text-xs text-muted-foreground">
              {fmtWeekday(activity.start_date)}, {fmtDate(activity.start_date)}
            </span>
          </div>

          {/* Titel + Link */}
          <div className="flex items-start justify-between gap-4 mb-5">
            <h2 className="text-xl md:text-2xl font-bold text-foreground leading-snug group-hover:text-primary transition-colors duration-200 truncate">
              {rideTitle(activity, t)}
            </h2>
            <span
              className="text-sm font-semibold shrink-0 mt-0.5 group-hover:translate-x-0.5 transition-transform duration-200"
              style={{ color: 'var(--primary)' }}
            >
              {t('hero.details')}
            </span>
          </div>

          {/* Stats-Zeile */}
          <div className="flex items-end flex-wrap gap-y-3">
            <HeroStat value={km} label="km" primary />
            <div className="w-px h-9 bg-border/60 mx-5 shrink-0" />
            <HeroStat value={fmtTime(activity.moving_time_s)} label={t('hero.movingTime')} />
            {speed && (
              <>
                <div className="w-px h-9 bg-border/60 mx-5 shrink-0" />
                <HeroStat value={speed} label="km/h" />
              </>
            )}
            {hm != null && (
              <>
                <div className="w-px h-9 bg-border/60 mx-5 shrink-0" />
                <HeroStat value={fmtNum(hm)} label="Hm" />
              </>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
