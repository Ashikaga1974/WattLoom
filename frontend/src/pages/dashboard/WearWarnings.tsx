import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import type { Bike, BikeComponent } from '@/lib/api';
import { fmtNum } from '@/lib/format';
import { useConfig } from '@/lib/config-context';

// Aktive Komponenten nahe/über dem Verschleiß-Schwellwert bzw. mit fälliger Kettenpflege
// (20 % Vorlauf vor den 300 km, fest lt. Anforderung – unabhängig von wear_warning_pct),
// zusammen absteigend nach ihrem jeweiligen %-Wert sortiert.
const MAINTENANCE_WARNING_PCT = 80;

interface Warning { bike: Bike; comp: BikeComponent; kind: 'wear' | 'maintenance'; pct: number }

function wearWarnings(bikes: Bike[], wearWarningPct: number): Warning[] {
  const wear: Warning[] = bikes.flatMap(bike => bike.components
    .filter(c => c.retired_at == null && (c.pct_used ?? 0) >= wearWarningPct)
    .map(comp => ({ bike, comp, kind: 'wear' as const, pct: comp.pct_used ?? 0 })));
  const maintenance: Warning[] = bikes.flatMap(bike => bike.components
    .filter(c => c.retired_at == null && (c.maintenance_pct_used ?? 0) >= MAINTENANCE_WARNING_PCT)
    .map(comp => ({ bike, comp, kind: 'maintenance' as const, pct: comp.maintenance_pct_used ?? 0 })));
  return [...wear, ...maintenance].sort((a, b) => b.pct - a.pct);
}

export function WearWarnings({ bikes }: { bikes: Bike[] }) {
  const { t } = useTranslation('dashboard');
  const { wear_warning_pct } = useConfig();
  const warnings = wearWarnings(bikes, wear_warning_pct);
  if (warnings.length === 0) return null;
  return (
    <div className="rounded-2xl border px-5 py-4" style={{ borderColor: '#ef444450', background: 'rgba(239,68,68,0.07)' }}>
      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-2.5">
        {t('wear.title')}
      </p>
      <div className="space-y-2">
        {warnings.map(({ bike, comp, kind, pct }) => (
          <Link
            key={`${kind}-${comp.id}`}
            to="/bikes"
            className="flex items-center justify-between gap-3 text-sm hover:opacity-80 transition-opacity"
          >
            <span className="text-foreground">
              <span className="font-semibold">{t(`common:component.${comp.type}`, { defaultValue: comp.type })}</span>
              <span className="text-muted-foreground"> · {bike.name}</span>
              {kind === 'maintenance' && (
                <span className="text-muted-foreground"> · {t('wear.maintenanceDue')}</span>
              )}
            </span>
            <span className="font-bold tabular-nums shrink-0" style={{ color: '#ef4444' }}>
              {kind === 'maintenance' && comp.km_since_maintenance != null
                ? `${fmtNum(Math.round(comp.km_since_maintenance))} km · `
                : null}
              {Math.round(pct)} %
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
