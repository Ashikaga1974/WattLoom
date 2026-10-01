import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

import { api, type ComparisonBaseline, type PeriodComparison, type PeriodSummary } from '@/lib/api';
import { fmtNum } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { InsightCard } from '@/components/ui/insight-card';
import { Skeleton } from '@/components/ui/skeleton';
import type { Insight, InsightType } from '@/lib/insights';

const DAY_OPTIONS = [30, 90, 365] as const;
const BASELINE_OPTIONS: ComparisonBaseline[] = ['last_year', 'previous'];
const BEST_EFFORT_KM = ['10', '20', '30', '50'];

// Volumen-Kennzahlen bleiben neutral eingefärbt: mehr fahren ist nicht automatisch besser
type Polarity = 'higherIsBetter' | 'lowerIsBetter' | 'neutral';

interface MetricRow {
  key: string;
  label: string;
  current: number | null;
  previous: number | null;
  format: (v: number) => string;
  polarity: Polarity;
}

const POSITIVE_CODES = new Set([
  'faster_similar_hr', 'faster', 'efficiency_up', 'best_efforts_improved', 'fitness_up', 'consistency_up',
]);
const WARNING_CODES = new Set([
  'slower_similar_hr', 'slower', 'efficiency_down', 'best_efforts_worse', 'fitness_down', 'consistency_down',
]);

/**
 * Sekunden als h:mm:ss bzw. m:ss – Bestzeiten unterscheiden sich oft nur um Sekunden,
 * fmtTime() aus format.ts rundet auf Minuten.
 */
function fmtEffortTime(totalSeconds: number): string {
  const s = Math.round(Math.abs(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

function buildRows(t: TFunction<'progress'>, current: PeriodSummary, previous: PeriodSummary): MetricRow[] {
  const rows: MetricRow[] = [
    { key: 'rides', label: t('changeSummary.metrics.rides'), current: current.rides, previous: previous.rides, format: v => fmtNum(v), polarity: 'neutral' },
    { key: 'km', label: t('changeSummary.metrics.km'), current: current.km, previous: previous.km, format: v => `${fmtNum(v)} km`, polarity: 'neutral' },
    { key: 'hours', label: t('changeSummary.metrics.hours'), current: current.hours, previous: previous.hours, format: v => `${fmtNum(v, 1)} h`, polarity: 'neutral' },
    { key: 'elevation', label: t('changeSummary.metrics.elevation'), current: current.elevation_m, previous: previous.elevation_m, format: v => `${fmtNum(v)} m`, polarity: 'neutral' },
    { key: 'speed', label: t('changeSummary.metrics.speed'), current: current.avg_speed_kmh, previous: previous.avg_speed_kmh, format: v => `${fmtNum(v, 1)} km/h`, polarity: 'higherIsBetter' },
    { key: 'hr', label: t('changeSummary.metrics.hr'), current: current.avg_hr, previous: previous.avg_hr, format: v => `${fmtNum(v)} bpm`, polarity: 'neutral' },
    { key: 'efficiency', label: t('changeSummary.metrics.efficiency'), current: current.efficiency, previous: previous.efficiency, format: v => fmtNum(v, 2), polarity: 'higherIsBetter' },
    { key: 'activeWeeks', label: t('changeSummary.metrics.activeWeeks'), current: current.active_weeks, previous: previous.active_weeks, format: v => fmtNum(v), polarity: 'higherIsBetter' },
    { key: 'ctl', label: t('changeSummary.metrics.ctl'), current: current.ctl, previous: previous.ctl, format: v => fmtNum(v, 1), polarity: 'higherIsBetter' },
  ];
  for (const km of BEST_EFFORT_KM) {
    rows.push({
      key: `best${km}`,
      label: t('changeSummary.metrics.bestEffort', { km }),
      current: current.best_efforts[km] ?? null,
      previous: previous.best_efforts[km] ?? null,
      format: fmtEffortTime,
      polarity: 'lowerIsBetter',
    });
  }
  return rows;
}

function deltaClass(delta: number, polarity: Polarity): string {
  if (polarity === 'neutral' || delta === 0) return 'text-muted-foreground';
  const isBetter = polarity === 'higherIsBetter' ? delta > 0 : delta < 0;
  return isBetter ? 'text-green-500' : 'text-orange-500';
}

function DeltaCell({ row }: { row: MetricRow }) {
  if (row.current === null || row.previous === null) {
    return <td className="px-4 py-2 text-right text-muted-foreground">—</td>;
  }
  const delta = row.current - row.previous;
  const sign = delta > 0 ? '+' : delta < 0 ? '−' : '±';
  return (
    <td className={`px-4 py-2 text-right font-mono ${deltaClass(delta, row.polarity)}`}>
      {sign}{row.format(Math.abs(delta))}
    </td>
  );
}

function insightType(code: string): InsightType {
  if (POSITIVE_CODES.has(code)) return 'positive';
  if (WARNING_CODES.has(code)) return 'warning';
  return 'neutral';
}

/** Block "Was hat sich verändert?": Zeitraumvergleich mit Kennzahlen-Tabelle und regelbasierten Aussagen. */
export function ChangeSummary() {
  const { t } = useTranslation('progress');
  const [days, setDays] = useState<number>(90);
  const [baseline, setBaseline] = useState<ComparisonBaseline>('last_year');
  const [data, setData] = useState<PeriodComparison | null>(null);
  // Schlüssel der zuletzt geladenen Daten – loading wird daraus abgeleitet statt synchron im Effect gesetzt
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const requestKey = `${days}-${baseline}`;

  useEffect(() => {
    // ignore verhindert, dass eine langsamere Antwort für eine vorherige Auswahl gewinnt
    let ignore = false;
    api.periodComparison(days, baseline)
      .then(d => { if (!ignore) setData(d); })
      .catch(() => { if (!ignore) setData(null); })
      .finally(() => { if (!ignore) setLoadedKey(requestKey); });
    return () => { ignore = true; };
  }, [days, baseline, requestKey]);

  const loading = loadedKey !== requestKey;
  const insights: Insight[] = (data?.insights ?? []).map(i => ({
    text: t(`changeSummary.insights.${i.code}`, i.values),
    type: insightType(i.code),
  }));
  const subtitle = baseline === 'last_year'
    ? t('changeSummary.subtitleLastYear', { days })
    : t('changeSummary.subtitlePrevious', { days });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{t('changeSummary.title')}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex gap-1">
            {DAY_OPTIONS.map(option => (
              <Button key={option} size="sm" variant={days === option ? 'default' : 'outline'} onClick={() => setDays(option)}>
                {t('changeSummary.daysOption', { days: option })}
              </Button>
            ))}
          </div>
          <div className="flex gap-1">
            {BASELINE_OPTIONS.map(option => (
              <Button key={option} size="sm" variant={baseline === option ? 'default' : 'outline'} onClick={() => setBaseline(option)}>
                {t(option === 'last_year' ? 'changeSummary.baselineLastYear' : 'changeSummary.baselinePrevious')}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {loading || !data ? (
        <Skeleton className="h-64" />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="shadow-sm border">
            <CardContent className="p-0">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-left uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2 font-medium">{t('changeSummary.table.metric')}</th>
                    <th className="px-4 py-2 font-medium text-right">{t('changeSummary.table.current')}</th>
                    <th className="px-4 py-2 font-medium text-right">{t('changeSummary.table.previous')}</th>
                    <th className="px-4 py-2 font-medium text-right">{t('changeSummary.table.change')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {buildRows(t, data.current, data.previous).map(row => (
                    <tr key={row.key}>
                      <td className="px-4 py-2 font-medium">{row.label}</td>
                      <td className="px-4 py-2 text-right font-mono">{row.current !== null ? row.format(row.current) : '—'}</td>
                      <td className="px-4 py-2 text-right font-mono text-muted-foreground">{row.previous !== null ? row.format(row.previous) : '—'}</td>
                      <DeltaCell row={row} />
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="px-4 py-2 border-t border-border text-xs text-muted-foreground">{t('changeSummary.caveat')}</p>
            </CardContent>
          </Card>
          <InsightCard insights={insights} title={t('changeSummary.insightsTitle')} subtitle={t('changeSummary.insightsSubtitle')} />
        </div>
      )}
    </div>
  );
}
