import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { api, type ZoneDistributionData } from '@/lib/api';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartTooltip } from '@/components/ui/chart-tooltip';
import { InsightCard } from '@/components/ui/insight-card';
import type { Insight } from '@/lib/insights';
import { fmtTime } from '@/lib/format';
import { useConfig } from '@/lib/config-context';

// Reihenfolge + Farben wie backend/api/zones.py: HR_ZONES (5 Zonen, gleiche Codes/Farben
// wie ActivityDetailPage.tsx, damit Zonen-Farben app-weit konsistent bleiben)
const ZONE_META = [
  { key: 'zone1', code: 'recovery',  color: '#60a5fa' },
  { key: 'zone2', code: 'endurance', color: '#4ade80' },
  { key: 'zone3', code: 'tempo',     color: '#facc15' },
  { key: 'zone4', code: 'threshold', color: '#fb923c' },
  { key: 'zone5', code: 'vo2max',    color: '#ef4444' },
] as const;

// ─── Insights (80/20-Polarisierungs-Check) ─────────────────────────────────────

function buildInsights(data: ZoneDistributionData, t: TFunction<'zonedist'>): Insight[] {
  const insights: Insight[] = [];
  if (data.total_seconds === 0) return insights;

  if (data.easy_pct >= 70 && data.hard_pct <= 25) {
    insights.push({ text: t('insights.wellPolarized', { pct: data.easy_pct.toFixed(0) }), type: 'positive' });
  }
  if (data.moderate_pct > 30) {
    insights.push({ text: t('insights.tooMuchGreyZone', { pct: data.moderate_pct.toFixed(0) }), type: 'warning' });
  }
  if (data.easy_pct < 60 && data.moderate_pct <= 30) {
    insights.push({ text: t('insights.lowEasyShare', { pct: data.easy_pct.toFixed(0) }), type: 'warning' });
  }
  if (insights.length === 0) {
    insights.push({ text: t('insights.neutral'), type: 'neutral' });
  }
  return insights;
}

// ─── Summary-Kacheln ────────────────────────────────────────────────────────────

function SummaryTiles({ data }: { data: ZoneDistributionData }) {
  const { t } = useTranslation('zonedist');
  const tiles = [
    { pct: data.easy_pct,     color: '#4ade80', label: t('summary.easyLabel'),     hint: t('summary.easyHint') },
    { pct: data.moderate_pct, color: '#facc15', label: t('summary.moderateLabel'), hint: t('summary.moderateHint') },
    { pct: data.hard_pct,     color: '#ef4444', label: t('summary.hardLabel'),     hint: t('summary.hardHint') },
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {tiles.map(tile => (
        <Card key={tile.label} className="shadow-sm overflow-hidden">
          <div className="h-1" style={{ background: tile.color }} />
          <CardContent className="pt-4">
            <p className="text-3xl font-bold tabular-nums" style={{ color: tile.color }}>{tile.pct.toFixed(0)}%</p>
            <p className="text-sm font-medium mt-1">{tile.label}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{tile.hint}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Zonen-Detail-Balken (analog ActivityDetailPage.tsx: ZoneBar) ──────────────

function ZoneBar({ label, pct, color, seconds }: { label: string; pct: number; color: string; seconds: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 text-xs text-muted-foreground shrink-0">{label}</span>
      <div className="flex-1 h-4 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${Math.max(pct, pct > 0 ? 2 : 0)}%`, background: color }}
        />
      </div>
      <span className="w-14 text-xs text-muted-foreground text-right shrink-0">{fmtTime(seconds)}</span>
      <span className="w-10 text-xs text-muted-foreground text-right shrink-0">{pct.toFixed(0)}%</span>
    </div>
  );
}

// ─── Monatlicher Zonen-Verlauf (gestapelt) ─────────────────────────────────────

function MonatsTooltip({ active, payload, label }: { active?: boolean; payload?: any[]; label?: string }) {
  const { t } = useTranslation('zonedist');
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  return (
    <ChartTooltip
      active={active}
      label={label}
      rows={ZONE_META.map(z => ({
        label: t(`zoneLabel.${z.code}`),
        value: `${(d?.[z.key] ?? 0).toFixed(1)} h`,
        color: z.color,
      }))}
    />
  );
}

function MonatsChart({ data }: { data: ZoneDistributionData['by_month'] }) {
  const { t } = useTranslation('zonedist');
  const { chart_height } = useConfig();
  const chartData = data.map(d => ({
    label:  d.month.slice(2, 4) + '/' + d.month.slice(5, 7),
    zone1:  d.zone1_seconds / 3600,
    zone2:  d.zone2_seconds / 3600,
    zone3:  d.zone3_seconds / 3600,
    zone4:  d.zone4_seconds / 3600,
    zone5:  d.zone5_seconds / 3600,
  }));

  if (chartData.length === 0) return null;

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {t('charts.monthly')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={chart_height}>
          <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.08} vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false}
              interval={Math.floor(chartData.length / 12)} />
            <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={false} width={32}
              tickFormatter={v => `${v}h`} />
            <Tooltip content={<MonatsTooltip />} />
            {ZONE_META.map((z, i) => (
              <Bar
                key={z.key}
                dataKey={z.key}
                stackId="zones"
                fill={z.color}
                fillOpacity={0.9}
                maxBarSize={40}
                radius={i === ZONE_META.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>

        <div className="mt-3 flex flex-wrap justify-center gap-4 text-xs text-muted-foreground">
          {ZONE_META.map(z => (
            <span key={z.key} className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-sm" style={{ background: z.color }} />
              {t(`zoneLabel.${z.code}`)}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Haupt-Seite ────────────────────────────────────────────────────────────────

export default function ZoneDistributionPage() {
  const { t } = useTranslation('zonedist');
  const [searchParams, setSearchParams] = useSearchParams();
  const yearParam = searchParams.get('year');
  // Default beim ersten Laden: aktuelles Jahr statt "Alle Jahre" – letzteres würde bei
  // wachsender Trackpoint-Menge mehrere Sekunden laden (kein Jahresfilter in der SQL-Query).
  // Explizite Wahl "Alle Jahre" wird als ?year=all in der URL gemerkt, damit sie beim
  // nächsten Aufruf nicht wieder auf das aktuelle Jahr zurückfällt.
  const filterYear = yearParam === 'all' ? undefined
    : yearParam ? parseInt(yearParam)
    : new Date().getFullYear();

  const [data, setData] = useState<ZoneDistributionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [availableYears, setAvailableYears] = useState<number[]>([]);

  useEffect(() => {
    api.activityStats().then(s => {
      setAvailableYears(s.available_years.map(Number).filter(y => y >= 2000));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    api.zoneDistribution(filterYear)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [filterYear]);

  function onYearChange(year: string | null) {
    if (year && year !== 'all') setSearchParams({ year }, { replace: true });
    else setSearchParams({ year: 'all' }, { replace: true });
  }

  if (loading || !data) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('title')} />
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="h-28 animate-pulse rounded-xl bg-muted" />
          <div className="h-28 animate-pulse rounded-xl bg-muted" />
          <div className="h-28 animate-pulse rounded-xl bg-muted" />
        </div>
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        years={availableYears}
        selectedYear={filterYear ?? null}
        onYearChange={onYearChange}
      />

      {data.total_seconds === 0 ? (
        <Card className="shadow-sm">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {t('empty')}
          </CardContent>
        </Card>
      ) : (
        <>
          <SummaryTiles data={data} />

          <InsightCard
            insights={buildInsights(data, t)}
            title={t('insightTitle')}
            subtitle={t('insightSubtitle')}
          />

          <MonatsChart data={data.by_month} />

          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                {t('charts.breakdown')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {data.zones.map(z => (
                <ZoneBar key={z.zone} label={t(`zoneLabel.${z.code}`)} pct={z.pct} color={z.color} seconds={z.seconds} />
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
