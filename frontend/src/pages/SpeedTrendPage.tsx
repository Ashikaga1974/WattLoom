import { Fragment, useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  ComposedChart,
  BarChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Cell,
  LabelList,
  ResponsiveContainer,
} from 'recharts';
import { api, type SpeedTrendData, type SpeedTrendMonth } from '@/lib/api';
import { useConfig } from '@/lib/config-context';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { InsightCard } from '@/components/ui/insight-card';
import { ChartTooltip } from '@/components/ui/chart-tooltip';
import { fmtDate } from '@/lib/format';
import type { Insight } from '@/lib/insights';

// Farbskala blau → grün → orange (konsistent mit LeafletMap/SpeedChart)
function speedColor(speed: number, min: number, max: number, lightness = 52): string {
  if (max <= min) return `hsl(220, 75%, ${lightness}%)`;
  const t = Math.max(0, Math.min(1, (speed - min) / (max - min)));
  const hue = Math.round(240 - t * 210); // 240 (blau) → 30 (orange)
  return `hsl(${hue}, 80%, ${lightness}%)`;
}

function formatTs(ts: number): string {
  return new Date(ts).toLocaleDateString('de-DE', { month: 'short', year: '2-digit' });
}

// --- Insights ---
function buildInsights(data: SpeedTrendData, t: TFunction<'speedtrend'>): Insight[] {
  const insights: Insight[] = [];
  const { by_year, monthly_heatmap } = data;

  // Jahr-über-Jahr-Trend
  if (by_year.length >= 2) {
    const last = by_year[by_year.length - 1];
    const prev = by_year[by_year.length - 2];
    if (last.delta_kmh !== null) {
      const abs = Math.abs(last.delta_kmh).toFixed(1);
      if (last.delta_kmh >= 0.5) {
        insights.push({ text: t('insights.yearTrendUp', { year: last.year, value: abs, prevYear: prev.year }), type: 'positive' });
      } else if (last.delta_kmh <= -0.5) {
        insights.push({ text: t('insights.yearTrendDown', { year: last.year, value: abs, prevYear: prev.year }), type: 'warning' });
      } else {
        insights.push({ text: t('insights.yearTrendFlat', { year: last.year, prevYear: prev.year }), type: 'neutral' });
      }
    }
  }

  // Schnellstes Jahr
  if (by_year.length > 1) {
    const best = by_year.reduce((a, b) => (a.avg_kmh > b.avg_kmh ? a : b));
    const isCurrentBest = best.year === by_year[by_year.length - 1].year;
    if (isCurrentBest) {
      insights.push({ text: t('insights.bestYearCurrent', { year: best.year, avg: best.avg_kmh.toFixed(1), rides: best.rides }), type: 'positive' });
    } else {
      insights.push({ text: t('insights.bestYearPast', { year: best.year, avg: best.avg_kmh.toFixed(1) }), type: 'neutral' });
    }
  }

  // Saisonaler Effekt (Sommer vs. Winter)
  if (monthly_heatmap.length >= 6) {
    const getM = (m: string) => parseInt(m.slice(5));
    const winter = monthly_heatmap.filter(m => { const mo = getM(m.month); return mo <= 2 || mo === 12; });
    const summer = monthly_heatmap.filter(m => { const mo = getM(m.month); return mo >= 6 && mo <= 8; });
    if (winter.length >= 2 && summer.length >= 2) {
      const avgW = winter.reduce((s, m) => s + m.avg_kmh, 0) / winter.length;
      const avgS = summer.reduce((s, m) => s + m.avg_kmh, 0) / summer.length;
      const diff = avgS - avgW;
      if (diff >= 0.8) {
        insights.push({ text: t('insights.seasonalEffect', { diff: diff.toFixed(1), summer: avgS.toFixed(1), winter: avgW.toFixed(1) }), type: 'neutral' });
      } else if (diff < 0) {
        insights.push({ text: t('insights.seasonalUnusual'), type: 'neutral' });
      }
    }
  }

  // Langzeittrend: erster vs. letzter Jahresdurchschnitt
  if (by_year.length >= 3) {
    const first = by_year[0];
    const last = by_year[by_year.length - 1];
    const total = last.avg_kmh - first.avg_kmh;
    if (total >= 0.5) {
      insights.push({ text: t('insights.longTermUp', { year: first.year, value: total.toFixed(1) }), type: 'positive' });
    } else if (total <= -0.5) {
      insights.push({ text: t('insights.longTermDown', { year: first.year, value: Math.abs(total).toFixed(1) }), type: 'warning' });
    } else {
      insights.push({ text: t('insights.longTermFlat', { year: first.year }), type: 'neutral' });
    }
  }

  return insights;
}

// --- Custom Tooltip für Trend-Chart ---
function TrendTooltip({ active, payload }: { active?: boolean; payload?: any[] }) {
  const { t } = useTranslation('speedtrend');
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  if (!point) return null;
  const rolling = payload.find((p: any) => p.dataKey === 'rolling_kmh');

  return (
    <ChartTooltip
      active={active}
      label={point.name ? `${point.name} · ${fmtDate(point.date)}` : fmtDate(point.date)}
      rows={[
        { label: t('tooltip.speed'), value: `${point.speed_kmh} km/h` },
        { label: t('tooltip.distance'), value: `${point.dist_km} km` },
        ...(point.elevation_m > 0 ? [{ label: t('tooltip.elevation'), value: `+${point.elevation_m} m` }] : []),
        ...(rolling?.value != null ? [{ label: t('tooltip.rollingAvg'), value: `${Number(rolling.value).toFixed(1)} km/h`, color: 'var(--primary)', separator: true }] : []),
      ]}
    />
  );
}

// --- Custom Tooltip für Jahresvergleich-Chart ---
function YearTooltip({ active, payload, label }: { active?: boolean; payload?: any[]; label?: string }) {
  const { t } = useTranslation('speedtrend');
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  return (
    <ChartTooltip
      active={active}
      label={label}
      rows={[
        { label: t('tooltip.yearAvgSpeed'), value: `${Number(d?.avg_kmh).toFixed(1)} km/h` },
        { label: t('tooltip.rides'), value: d?.rides },
      ]}
    />
  );
}

export default function SpeedTrendPage() {
  const { t } = useTranslation('speedtrend');
  const config = useConfig();
  const [data, setData] = useState<SpeedTrendData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const monthNames = t('heatmap.monthsShort', { returnObjects: true }) as string[];

  useEffect(() => {
    api.speedTrend()
      .then(setData)
      .catch(e => setError(e instanceof Error ? e.message : t('errors.loadFailed')))
      .finally(() => setLoading(false));
  }, []);

  // Trend-Chart: Rides + Rolling in ein gemeinsames Array mergen
  const chartData = useMemo(() => {
    if (!data) return [];
    const rollingMap = new Map(data.rolling.map(r => [r.date, r.rolling_kmh]));
    return data.rides.map(ride => ({
      ts:          new Date(ride.date).getTime(),
      speed_kmh:   ride.speed_kmh,
      rolling_kmh: rollingMap.get(ride.date) ?? null,
      name:        ride.name,
      date:        ride.date,
      dist_km:     ride.dist_km,
      elevation_m: ride.elevation_m,
      year:        ride.year,
      id:          ride.id,
    }));
  }, [data]);

  // Heatmap-Daten aufbereiten
  const { heatmapMap, heatmapYears, heatmapMin, heatmapMax } = useMemo(() => {
    if (!data?.monthly_heatmap.length) {
      return { heatmapMap: new Map<string, SpeedTrendMonth>(), heatmapYears: [] as number[], heatmapMin: 0, heatmapMax: 40 };
    }
    const map = new Map(data.monthly_heatmap.map(m => [m.month, m]));
    const years = Array.from(new Set(data.monthly_heatmap.map(m => parseInt(m.month.slice(0, 4))))).sort() as number[];
    const speeds = data.monthly_heatmap.map(m => m.avg_kmh);
    return { heatmapMap: map, heatmapYears: years, heatmapMin: Math.min(...speeds), heatmapMax: Math.max(...speeds) };
  }, [data]);

  // Farbbereiche für Jahres-Balken
  const { yearMin, yearMax } = useMemo(() => {
    if (!data?.by_year.length) return { yearMin: 0, yearMax: 40 };
    const avgs = data.by_year.map(y => y.avg_kmh);
    return { yearMin: Math.min(...avgs), yearMax: Math.max(...avgs) };
  }, [data]);

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('pageHeader.title')} subtitle={t('pageHeader.subtitleShort')} />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 bg-muted animate-pulse rounded-xl" />
          ))}
        </div>
        <div className="h-80 bg-muted animate-pulse rounded-xl" />
        <div className="h-48 bg-muted animate-pulse rounded-xl" />
      </div>
    );
  }

  if (error || !data || data.stats.total_rides === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('pageHeader.title')} />
        <div className="rounded border border-destructive/50 bg-destructive/10 p-4 text-destructive text-sm">
          {error || t('errors.noData')}
        </div>
      </div>
    );
  }

  const { stats, by_year } = data;
  const trendYear = by_year[by_year.length - 1] ?? null;
  const allSpeeds = data.rides.map(r => r.speed_kmh);
  const speedYMin = Math.floor(Math.min(...allSpeeds) - 1.5);
  const speedYMax = Math.ceil(Math.max(...allSpeeds) + 1.5);
  const insights = buildInsights(data, t);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('pageHeader.title')}
        subtitle={t('pageHeader.subtitle')}
      />

      {/* KPI-Kacheln */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">

        {/* Gesamt-Ø */}
        <Card className="shadow-sm border">
          <CardContent className="px-4 py-3 space-y-1">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('kpi.totalAvg')}</p>
            <p className="text-2xl font-bold text-foreground">{stats.overall_avg_kmh.toFixed(1)}</p>
            <p className="text-[10px] text-muted-foreground">{t('kpi.totalAvgSub', { count: stats.total_rides })}</p>
          </CardContent>
        </Card>

        {/* Schnellste Fahrt */}
        <Card className="shadow-sm" style={{ borderColor: 'rgba(252,76,2,0.25)', background: 'rgba(252,76,2,0.05)' }}>
          <CardContent className="px-4 py-3 space-y-1">
            <p className="text-[10px] uppercase tracking-wide" style={{ color: '#fc4c02' }}>{t('kpi.bestRide')}</p>
            <p className="text-2xl font-bold" style={{ color: '#fc4c02' }}>{stats.best_kmh}</p>
            {stats.best_ride_id ? (
              <Link
                to={`/activities/${stats.best_ride_id}`}
                className="text-[10px] truncate block hover:underline"
                style={{ color: '#fc4c02', opacity: 0.75 }}
              >
                {stats.best_ride_name}
              </Link>
            ) : (
              <p className="text-[10px] text-muted-foreground">{t('kpi.bestRideFallback')}</p>
            )}
          </CardContent>
        </Card>

        {/* Aktuelles Jahr */}
        <Card className="shadow-sm border">
          <CardContent className="px-4 py-3 space-y-1">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {trendYear ? trendYear.year : t('kpi.currentYear')}
            </p>
            {trendYear ? (
              <>
                <div className="flex items-baseline gap-1">
                  <p className="text-2xl font-bold text-foreground">{trendYear.avg_kmh.toFixed(1)}</p>
                  <p className="text-xs text-muted-foreground">km/h</p>
                </div>
                {trendYear.delta_kmh !== null && (
                  <p className={`text-[10px] font-semibold ${trendYear.delta_kmh >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                    {trendYear.delta_kmh >= 0 ? '▲' : '▼'} {t('kpi.vsPreviousYear', { value: Math.abs(trendYear.delta_kmh).toFixed(1) })}
                  </p>
                )}
              </>
            ) : (
              <p className="text-2xl font-bold text-muted-foreground">–</p>
            )}
          </CardContent>
        </Card>

        {/* Zeitraum */}
        <Card className="shadow-sm border">
          <CardContent className="px-4 py-3 space-y-1">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('kpi.period')}</p>
            <p className="text-xl font-bold text-foreground">
              {stats.first_date?.slice(0, 4)} – {stats.last_date?.slice(0, 4)}
            </p>
            <p className="text-[10px] text-muted-foreground">{t('kpi.periodSub', { years: by_year.length, rides: stats.total_rides })}</p>
          </CardContent>
        </Card>
      </div>

      {/* Trend-Chart: Scatter + Rolling Average */}
      <Card className="shadow-sm border overflow-hidden">
        <CardHeader className="pb-1 border-b">
          <CardTitle className="text-base font-semibold">{t('trendChart.title')}</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t('trendChart.subtitle')}
          </p>
        </CardHeader>
        <CardContent className="pt-4">
          <ResponsiveContainer width="100%" height={config.chart_height_dense}>
            <ComposedChart data={chartData} margin={{ top: 12, right: 20, bottom: 36, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                type="number"
                dataKey="ts"
                domain={['dataMin', 'dataMax']}
                scale="time"
                tickCount={8}
                tickFormatter={formatTs}
                tick={{ fontSize: 10 }}
                height={36}
              />
              <YAxis
                domain={[speedYMin, speedYMax]}
                tick={{ fontSize: 10 }}
                width={52}
                tickFormatter={(v) => `${v} km/h`}
              />
              <Tooltip content={<TrendTooltip />} />

              {/* Gesamt-Ø Referenzlinie */}
              <ReferenceLine
                y={stats.overall_avg_kmh}
                stroke="var(--muted-foreground)"
                strokeDasharray="6 3"
                strokeOpacity={0.55}
                label={{
                  value: t('trendChart.avgReferenceLine', { value: stats.overall_avg_kmh }),
                  fontSize: 9,
                  fill: 'var(--muted-foreground)',
                  position: 'insideBottomRight',
                }}
              />

              {/* Einzelne Rides (scatter-artige Darstellung via Line ohne Strich) */}
              <Line
                type="monotone"
                dataKey="speed_kmh"
                strokeWidth={0}
                dot={(props: any) => {
                  const { cx, cy, index } = props;
                  if (cx == null || cy == null) return <g key={`sd-${index}`} />;
                  return (
                    <circle
                      key={`sd-${index}`}
                      cx={cx}
                      cy={cy}
                      r={2.5}
                      fill="var(--muted-foreground)"
                      fillOpacity={0.35}
                    />
                  );
                }}
                activeDot={{ r: 4, fill: 'var(--primary)', strokeWidth: 0 }}
                isAnimationActive={false}
              />

              {/* Gleitender Durchschnitt (20 Rides) */}
              <Line
                type="monotone"
                dataKey="rolling_kmh"
                stroke="var(--primary)"
                strokeWidth={2.5}
                dot={false}
                activeDot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>

          {/* Manuelle Legende */}
          <div className="flex items-center gap-6 justify-center mt-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full" style={{ background: 'var(--muted-foreground)', opacity: 0.4 }} />
              <span>{t('trendChart.legendSingleRide')}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-0.5 bg-primary rounded" />
              <span>{t('trendChart.legendRolling')}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-5 border-t border-dashed border-muted-foreground/55" />
              <span>{t('trendChart.legendOverallAvg')}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Jahresvergleich */}
      {by_year.length > 1 && (
        <Card className="shadow-sm border overflow-hidden">
          <CardHeader className="pb-1 border-b">
            <CardTitle className="text-base font-semibold">{t('yearChart.title')}</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t('yearChart.subtitle')}
            </p>
          </CardHeader>
          <CardContent className="pt-4">
            <ResponsiveContainer width="100%" height={config.chart_height}>
              <BarChart data={by_year} margin={{ top: 30, right: 16, bottom: 8, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                <YAxis
                  domain={[Math.max(0, yearMin - 2), yearMax + 3]}
                  tick={{ fontSize: 10 }}
                  width={52}
                  unit=" km/h"
                />
                <Tooltip content={<YearTooltip />} />
                <Bar dataKey="avg_kmh" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                  {by_year.map((entry, i) => (
                    <Cell key={i} fill={speedColor(entry.avg_kmh, yearMin, yearMax, 52)} fillOpacity={0.85} />
                  ))}
                  <LabelList
                    dataKey="avg_kmh"
                    content={(props: any) => {
                      const { x, y, width, value, index } = props;
                      const yr = by_year[index];
                      const delta = yr?.delta_kmh;
                      const cx = x + width / 2;
                      return (
                        <Fragment key={`lbl-${index}`}>
                          <text x={cx} y={y - 4} textAnchor="middle" fontSize={10} fontWeight={600} fill="var(--foreground)">
                            {Number(value).toFixed(1)}
                          </text>
                          {delta !== null && delta !== undefined && (
                            <text
                              x={cx}
                              y={y - 17}
                              textAnchor="middle"
                              fontSize={9}
                              fontWeight={700}
                              fill={delta >= 0 ? '#10b981' : '#ef4444'}
                            >
                              {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}
                            </text>
                          )}
                        </Fragment>
                      );
                    }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Saison-Heatmap */}
      {heatmapYears.length > 0 && (
        <Card className="shadow-sm border overflow-hidden">
          <CardHeader className="pb-1 border-b">
            <CardTitle className="text-base font-semibold">{t('heatmap.title')}</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t('heatmap.subtitle')}
            </p>
          </CardHeader>
          <CardContent className="pt-4 overflow-x-auto">
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `44px repeat(${heatmapYears.length}, minmax(46px, 1fr))`,
                gap: '3px',
              }}
            >
              {/* Header-Zeile: Jahres-Labels */}
              <div />
              {heatmapYears.map(year => (
                <div key={`hdr-${year}`} className="text-center text-[10px] font-semibold text-muted-foreground pb-1">
                  {year}
                </div>
              ))}

              {/* Monats-Zeilen */}
              {monthNames.map((name, mi) => {
                const cells = heatmapYears.map(year => {
                  const key = `${year}-${String(mi + 1).padStart(2, '0')}`;
                  const cell = heatmapMap.get(key);
                  if (!cell) {
                    return (
                      <div
                        key={`cell-${year}-${mi}`}
                        className="rounded"
                        style={{ height: 30, background: 'rgba(0,0,0,0.05)' }}
                      />
                    );
                  }
                  return (
                    <div
                      key={`cell-${year}-${mi}`}
                      className="rounded flex items-center justify-center text-[10px] font-semibold text-white cursor-default"
                      style={{
                        height: 30,
                        background: speedColor(cell.avg_kmh, heatmapMin, heatmapMax),
                        textShadow: '0 1px 2px rgba(0,0,0,0.55)',
                      }}
                      title={t('heatmap.cellTitle', { month: name, year, speed: cell.avg_kmh.toFixed(1), count: cell.rides })}
                    >
                      {cell.avg_kmh.toFixed(1)}
                    </div>
                  );
                });
                return (
                  <Fragment key={`month-${mi}`}>
                    <div
                      className="text-right text-[10px] text-muted-foreground pr-1.5 flex items-center justify-end"
                      style={{ height: 30 }}
                    >
                      {name}
                    </div>
                    {cells}
                  </Fragment>
                );
              })}
            </div>

            {/* Farbskala-Legende */}
            <div className="flex items-center gap-3 mt-4 justify-end">
              <span className="text-[10px] text-muted-foreground">{t('heatmap.legendSlow')}</span>
              <div
                className="h-3 w-32 rounded"
                style={{ background: `linear-gradient(to right, hsl(240,80%,52%), hsl(135,80%,52%), hsl(30,80%,52%))` }}
              />
              <span className="text-[10px] text-muted-foreground">{t('heatmap.legendFast')}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Einschätzung */}
      <InsightCard insights={insights} />
    </div>
  );
}
