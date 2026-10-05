import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, type SegmentSummary } from '@/lib/api';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { fmtTimeShort } from '@/lib/format';
import { useSegmentTimeMode } from '@/lib/segment-time-mode';
import { SegmentTimeModeToggle } from '@/components/SegmentTimeModeToggle';

export default function SegmentsPage() {
  const { t } = useTranslation(['segments', 'common']);
  const [segments, setSegments] = useState<SegmentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeMode, setTimeMode] = useSegmentTimeMode();

  useEffect(() => {
    api.segments()
      .then(setSegments)
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <PageHeader title={t('title')} subtitle={t('subtitle')} />
        {segments.length > 0 && <SegmentTimeModeToggle mode={timeMode} onChange={setTimeMode} />}
      </div>

      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      )}

      {error && <p className="text-destructive text-sm">{error}</p>}

      {!loading && !error && segments.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            {t('empty')}
          </CardContent>
        </Card>
      )}

      {!loading && !error && segments.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                  <th className="px-4 py-3 font-medium">{t('table.name')}</th>
                  <th className="px-4 py-3 font-medium text-right">{t('table.distance')}</th>
                  <th className="px-4 py-3 font-medium text-right">{t('table.efforts')}</th>
                  <th className="px-4 py-3 font-medium text-right">{t('table.bestTime')}</th>
                </tr>
              </thead>
              <tbody>
                {segments.map(s => (
                  <tr key={s.id} className="border-b border-border last:border-0 hover:bg-muted/40 transition-colors">
                    <td className="px-4 py-3">
                      <Link to={`/segments/${s.id}`} className="font-medium text-foreground hover:text-primary-strong transition-colors">
                        {s.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{(s.distance_m / 1000).toFixed(2)} km</td>
                    <td className="px-4 py-3 text-right tabular-nums">{s.effort_count}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {(() => {
                        const best = timeMode === 'moving' ? (s.best_moving_time_s ?? s.best_time_s) : s.best_time_s;
                        return best != null ? fmtTimeShort(best) : '–';
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
