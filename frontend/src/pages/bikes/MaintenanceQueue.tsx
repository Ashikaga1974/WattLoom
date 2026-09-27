import { useTranslation } from 'react-i18next';
import type { Bike, BikeComponent } from '@/lib/api';
import { componentLabel, wearColor } from './componentTypes';

// Kritischste Verschleiß-Kandidaten über alle aktiven Bikes hinweg, absteigend sortiert –
// beantwortet "was muss ich bald tun", ohne jede Bike-Karte einzeln aufzuklappen.
const THRESHOLD_PCT = 60;
const MAX_ITEMS = 8;

function openBikeCard(bikeId: string) {
  const el = document.getElementById(`bike-${bikeId}`);
  if (!(el instanceof HTMLDetailsElement)) return;
  el.open = true;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function MaintenanceQueue({ bikes }: { bikes: Bike[] }) {
  const { t } = useTranslation(['bikes', 'common']);

  const queue = bikes
    .filter(b => !b.retired)
    .flatMap(b => b.components
      .filter(c => !c.retired_at && (c.pct_used ?? 0) >= THRESHOLD_PCT)
      .map(c => ({ bike: b, comp: c })))
    .sort((a, b) => (b.comp.pct_used ?? 0) - (a.comp.pct_used ?? 0))
    .slice(0, MAX_ITEMS);

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
        {t('overview.maintenanceQueueHeading')}
      </h2>
      {queue.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('overview.maintenanceQueueEmpty')}</p>
      ) : (
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(min(170px, 100%), 1fr))` }}>
          {queue.map(({ bike, comp }: { bike: Bike; comp: BikeComponent }) => {
            const pct = comp.pct_used ?? 0;
            const color = wearColor(pct);
            const dateLabel = comp.estimated_service_date
              ? new Date(comp.estimated_service_date + 'T00:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
              : null;
            return (
              <button
                key={comp.id}
                onClick={() => openBikeCard(bike.id)}
                className="min-w-0 text-left rounded-xl border border-border bg-card p-3 shadow-sm hover:border-primary/50 transition-colors"
              >
                <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground truncate">{bike.name}</p>
                <p className="text-sm font-bold truncate">{componentLabel(comp.type, t)}</p>
                <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%`, background: color }} />
                </div>
                <div className="mt-1 flex items-baseline justify-between text-sm">
                  <span className="font-bold tabular-nums" style={{ color }}>{Math.round(pct)}%</span>
                  {pct >= 100
                    ? <span className="text-sm font-semibold" style={{ color }}>{t('componentRow.maintenanceDue')}</span>
                    : dateLabel && <span className="text-sm text-muted-foreground">{t('componentRow.estimatedDate', { date: dateLabel })}</span>}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
