import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import type { PrEvent } from '@/lib/api';
import { fmtDate } from '@/lib/format';
import { rideTitle } from '@/lib/activity-display';

function fmtPrTime(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

export function PrWidget({ events, onDismiss }: { events: PrEvent[]; onDismiss: (id: number) => void }) {
  const { t } = useTranslation('dashboard');
  if (events.length === 0) return null;
  return (
    <div className="rounded-2xl border px-5 py-4" style={{ borderColor: '#f59e0b50', background: 'rgba(245,158,11,0.07)' }}>
      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-2.5">
        {t('pr.title')}
      </p>
      <div className="space-y-2">
        {events.map(e => (
          <div key={e.id} className="flex items-center justify-between gap-3 text-sm">
            <Link to={`/activities/${e.activity_id}`} className="min-w-0 hover:opacity-80 transition-opacity">
              <div>
                <span className="font-semibold">{e.distance_km} km</span>
                <span className="text-muted-foreground"> {t('pr.in')} </span>
                <span className="font-bold tabular-nums" style={{ color: '#f59e0b' }}>{fmtPrTime(e.best_time_s)}</span>
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {rideTitle({ name: e.activity_name, start_date_local: e.activity_date ?? undefined }, t)}
                {e.activity_date && <> · {fmtDate(e.activity_date)}</>}
              </div>
            </Link>
            <button
              onClick={() => onDismiss(e.id)}
              className="shrink-0 text-muted-foreground hover:text-foreground transition-colors text-xs"
              title={t('pr.dismiss')}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
