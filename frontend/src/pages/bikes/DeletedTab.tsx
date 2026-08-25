import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type DeletedComponent } from '@/lib/api';
import { fmtNum } from '@/lib/format';
import { componentLabel } from './componentTypes';

export function DeletedTab() {
  const { t } = useTranslation(['bikes', 'common']);
  const [items, setItems] = useState<DeletedComponent[]>([]);
  const [bikeNames, setBikeNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.deletedComponents().then(setItems).finally(() => setLoading(false));
    api.bikes().then(bikes => setBikeNames(Object.fromEntries(bikes.map(b => [b.id, b.name]))));
  }, []);

  function fmtDate(iso: string | null) {
    if (!iso) return '—';
    return new Date(iso + 'T00:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  if (loading) return <p className="text-sm text-muted-foreground">{t('deleted.loading')}</p>;
  if (items.length === 0) return <p className="text-sm text-muted-foreground">{t('deleted.empty')}</p>;

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40">
            <th className="text-left px-3 py-2 font-semibold text-muted-foreground">{t('deleted.table.type')}</th>
            <th className="text-left px-3 py-2 font-semibold text-muted-foreground">{t('deleted.table.bike')}</th>
            <th className="text-left px-3 py-2 font-semibold text-muted-foreground">{t('deleted.table.purchase')}</th>
            <th className="text-right px-3 py-2 font-semibold text-muted-foreground">{t('deleted.table.ridden')}</th>
            <th className="text-left px-3 py-2 font-semibold text-muted-foreground">{t('deleted.table.installed')}</th>
            <th className="text-left px-3 py-2 font-semibold text-muted-foreground">{t('deleted.table.deletedAt')}</th>
          </tr>
        </thead>
        <tbody>
          {items.map(c => (
            <tr key={c.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
              <td className="px-3 py-2 font-medium">{componentLabel(c.type, t)}</td>
              <td className="px-3 py-2 text-muted-foreground">{bikeNames[c.bike_id] ?? c.bike_id}</td>
              <td className="px-3 py-2 text-muted-foreground">
                {c.purchase_name ?? '—'}
                {c.url && (
                  <>
                    {' · '}
                    <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{t('deleted.orderLinkText')}</a>
                  </>
                )}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{fmtNum(Math.round(c.km_since_service))} km</td>
              <td className="px-3 py-2 text-muted-foreground">{fmtDate(c.added_at)}</td>
              <td className="px-3 py-2 text-muted-foreground">{fmtDate(c.deleted_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
