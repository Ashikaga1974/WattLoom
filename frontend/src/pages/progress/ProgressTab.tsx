import { useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

import { api, type WeeklyVolume, type FitnessFingerprint } from '@/lib/api';
import { useConfig } from '@/lib/config-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { InsightCard } from '@/components/ui/insight-card';
import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceLine, ResponsiveContainer, BarChart, Bar, AreaChart,
} from 'recharts';
import { fmtTime } from '@/lib/format';
import { ChartTooltip } from '@/components/ui/chart-tooltip';
import type { Insight } from '@/lib/insights';

import { PALETTE, MONTHS, MONTH_DOYS, StatTile, type MonthlyEntry } from './shared';

// ─── Custom Tooltips ─────────────────────────────────────────────────────────

function YearProgressTooltip({ active, payload, label }: { active?: boolean; payload?: any[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <ChartTooltip
      active={active}
      label={doyToLabel(Number(label))}
      rows={payload.map(p => ({
        label: String(p.name),
        value: p.value != null ? `${Number(p.value).toFixed(0)} km` : null,
        color: p.color as string,
      }))}
    />
  );
}

function YearBarTooltip({ active, payload }: { active?: boolean; payload?: any[] }) {
  const { t } = useTranslation('progress');
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload as { year: string; km: number; projected?: number };
  return (
    <ChartTooltip
      active={active}
      label={d.year}
      rows={[
        { label: t('progressTab.tooltip.actual'), value: `${d.km.toFixed(0)} km` },
        ...(d.projected != null ? [{ label: t('progressTab.tooltip.forecast'), value: `${d.projected.toFixed(0)} km`, color: '#fc4c02' }] : []),
      ]}
    />
  );
}

function MonthlyTrendTooltip({ active, payload, label }: { active?: boolean; payload?: any[]; label?: string }) {
  const { t } = useTranslation('progress');
  if (!active || !payload?.length) return null;
  const km = payload.find(p => p.dataKey === 'km');
  return (
    <ChartTooltip
      active={active}
      label={label}
      rows={[
        { label: t('progressTab.tooltip.distance'), value: km?.value != null ? `${Number(km.value).toFixed(0)} km` : null },
      ]}
    />
  );
}

// ─── Shared ──────────────────────────────────────────────────────────────────

type YearData = Record<string, [number, number][]>;

function todayDoy(): number {
  const n = new Date();
  return Math.floor((n.getTime() - new Date(n.getFullYear(), 0, 0).getTime()) / 86_400_000);
}

function kmAt(pts: [number, number][], doy: number): number | null {
  let v: number | null = null;
  for (const [d, k] of pts) {
    if (d <= doy) v = k;
    else break;
  }
  return v;
}

function progYearColor(years: string[], year: string): string {
  return PALETTE[years.indexOf(year) % PALETTE.length];
}

function buildLineData(yearData: YearData, years: string[]) {
  const doySet = new Set<number>();
  doySet.add(1);
  for (const pts of Object.values(yearData)) {
    for (const [d] of pts) doySet.add(d);
  }
  for (const d of MONTH_DOYS) doySet.add(d);
  const sorted = [...doySet].sort((a, b) => a - b);
  return sorted.map(doy => {
    const row: Record<string, number | null> = { doy };
    for (const y of years) row[y] = kmAt(yearData[y] ?? [], doy);
    return row;
  });
}

function doyToLabel(doy: number): string {
  const d = new Date(2024, 0, doy);
  return d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
}

function weekTotalMinutes(w: WeeklyVolume): number {
  return w.ride_minutes + w.workout_minutes + w.weight_training_minutes;
}

// Fasst langfristigen (Jahre) und kurzfristigen (12-Wochen) Trend + Fitness-Score
// zu einer Gesamteinschätzung zusammen – beantwortet "habe ich mich gesteigert?"
function buildTrendInsights(
  t: TFunction<'progress'>,
  years: string[],
  yearData: YearData,
  currentYear: string,
  weeklyData: WeeklyVolume[],
  fitness: FitnessFingerprint | null
): Insight[] {
  const insights: Insight[] = [];

  // Langfristig: ältestes vs. jüngstes abgeschlossenes Jahr (aktuelles Jahr ist nicht vergleichbar, da unvollständig)
  const fullYears = years.filter(y => y !== currentYear);
  if (fullYears.length >= 2) {
    const first = fullYears[0];
    const last = fullYears[fullYears.length - 1];
    const firstKm = yearData[first]?.at(-1)?.[1] ?? 0;
    const lastKm = yearData[last]?.at(-1)?.[1] ?? 0;
    if (firstKm > 0) {
      const diffPct = Math.round(((lastKm - firstKm) / firstKm) * 100);
      if (diffPct >= 15) {
        insights.push({
          text: t('progressTab.insights.longTermUp', { first, firstKm: Math.round(firstKm), last, lastKm: Math.round(lastKm), pct: diffPct }),
          type: 'positive',
        });
      } else if (diffPct <= -15) {
        insights.push({
          text: t('progressTab.insights.longTermDown', { first, firstKm: Math.round(firstKm), last, lastKm: Math.round(lastKm), pct: diffPct }),
          type: 'warning',
        });
      } else {
        insights.push({
          text: t('progressTab.insights.longTermFlat', { first, firstKm: Math.round(firstKm), last, lastKm: Math.round(lastKm) }),
          type: 'neutral',
        });
      }
    }
  }

  // Kurzfristig: letzte 12 vs. vorherige 12 Wochen (Ø Trainingszeit)
  if (weeklyData.length >= 24) {
    const last12 = weeklyData.slice(-12);
    const prev12 = weeklyData.slice(-24, -12);
    const avgLast = last12.reduce((s, w) => s + weekTotalMinutes(w), 0) / 12;
    const avgPrev = prev12.reduce((s, w) => s + weekTotalMinutes(w), 0) / 12;
    const diff = avgLast - avgPrev;
    if (diff >= 30) {
      insights.push({
        text: t('progressTab.insights.shortTermUp', { avgLast: fmtTime(Math.round(avgLast) * 60), avgPrev: fmtTime(Math.round(avgPrev) * 60) }),
        type: 'positive',
      });
    } else if (diff <= -30) {
      insights.push({
        text: t('progressTab.insights.shortTermDown', { avgLast: fmtTime(Math.round(avgLast) * 60), avgPrev: fmtTime(Math.round(avgPrev) * 60) }),
        type: 'warning',
      });
    } else {
      insights.push({
        text: t('progressTab.insights.shortTermFlat', { avgLast: fmtTime(Math.round(avgLast) * 60) }),
        type: 'neutral',
      });
    }
  }

  // Fitness-Score als dritte, unabhängige Perspektive (CTL/Form/Effizienz/Kontinuität)
  if (fitness && fitness.score > 0) {
    if (fitness.trend === 'up') {
      insights.push({ text: t('progressTab.insights.fitnessUp', { score: fitness.score, level: fitness.level }), type: 'positive' });
    } else if (fitness.trend === 'down') {
      insights.push({ text: t('progressTab.insights.fitnessDown', { score: fitness.score, level: fitness.level }), type: 'warning' });
    } else {
      insights.push({ text: t('progressTab.insights.fitnessFlat', { score: fitness.score, level: fitness.level }), type: 'neutral' });
    }
  }

  return insights;
}

export function ProgressTab() {
  const { t } = useTranslation('progress');
  const config = useConfig();
  const [yearData, setYearData] = useState<YearData>({});
  const [monthlyAll, setMonthlyAll] = useState<MonthlyEntry[]>([]);
  const [weeklyData, setWeeklyData] = useState<WeeklyVolume[]>([]);
  const [fitness, setFitness] = useState<FitnessFingerprint | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const currentYear = String(new Date().getFullYear());
  const doy = todayDoy();

  useEffect(() => {
    // buildTrendInsights nutzt nur die letzten 24 Wochen (Kurzfristig-Vergleich) – kein Grund, mehr zu laden
    Promise.all([api.yearProgress(), api.monthlyAll(), api.weeklyVolume(24), api.fitnessFingerprint()])
      .then(([progress, monthly, weekly, fit]) => {
        setYearData(progress.years);
        setMonthlyAll(monthly);
        setWeeklyData(weekly);
        setFitness(fit);
      })
      .catch(e => setError(e instanceof Error ? e.message : t('common.genericError')))
      .finally(() => setLoading(false));
  }, []);

  const years = useMemo(() => Object.keys(yearData).sort(), [yearData]);

  const vsLastYear = useMemo(() => {
    const prevYear = String(Number(currentYear) - 1);
    const cur = yearData[currentYear];
    const prev = yearData[prevYear];
    if (!cur || !prev) return null;
    const curKm = kmAt(cur, doy) ?? 0;
    const prevKm = kmAt(prev, doy) ?? 0;
    return { curKm, prevKm, diff: curKm - prevKm, prevYear };
  }, [yearData, currentYear, doy]);

  const projection = useMemo(() => {
    const cur = yearData[currentYear];
    if (!cur || cur.length === 0) return null;
    const kmToday = kmAt(cur, doy) ?? 0;
    if (kmToday <= 0 || doy <= 1) return null;
    const dailyRate = kmToday / doy;
    const projEnd = Math.round(dailyRate * 365);
    const prevYear = String(Number(currentYear) - 1);
    const prevEnd = yearData[prevYear]?.at(-1)?.[1] ?? null;
    return { kmToday, dailyRate, projEnd, remainingDays: 365 - doy, remainingKm: Math.round(projEnd - kmToday), prevEnd, prevYear };
  }, [yearData, currentYear, doy]);

  const lineData = useMemo(() => buildLineData(yearData, years), [yearData, years]);

  const barData = useMemo(() =>
    years.map(y => ({
      year: y,
      km: y === currentYear ? (kmAt(yearData[y] ?? [], doy) ?? 0) : (yearData[y]?.at(-1)?.[1] ?? 0),
      projected: y === currentYear && projection ? projection.projEnd : undefined,
      color: progYearColor(years, y),
    })),
    [years, yearData, currentYear, doy, projection]
  );

  const areaData = useMemo(() =>
    monthlyAll.map(d => ({ label: `${d.year}-${String(d.month).padStart(2, '0')}`, km: d.distance_km, year: d.year })),
    [monthlyAll]
  );

  const trendInsights = useMemo(
    () => buildTrendInsights(t, years, yearData, currentYear, weeklyData, fitness),
    [t, years, yearData, currentYear, weeklyData, fitness]
  );

  if (loading) return <div className="h-80 bg-muted animate-pulse rounded-xl" />;

  if (error) return (
    <div className="rounded border border-destructive/50 bg-destructive/10 p-4 text-destructive text-sm">{error}</div>
  );

  const currentYearColor = progYearColor(years, currentYear);

  return (
    <div className="space-y-6">
      {vsLastYear && (
        <div className="flex flex-wrap gap-3">
          <StatTile
            icon="🚴"
            label={t('progressTab.sinceStartOfYear', { year: currentYear })}
            value={`${vsLastYear.curKm.toFixed(0)} km`}
            valueColor="#fc4c02"
          />
          <StatTile
            icon="🕓"
            label={t('progressTab.sinceStartOfYear', { year: vsLastYear.prevYear })}
            value={`${vsLastYear.prevKm.toFixed(0)} km`}
            valueColor="#60a5fa"
          />
          <StatTile
            icon={vsLastYear.diff >= 0 ? '↑' : '↓'}
            label={t('progressTab.difference')}
            value={`${vsLastYear.diff >= 0 ? '+' : ''}${vsLastYear.diff.toFixed(0)} km`}
            valueColor={vsLastYear.diff >= 0 ? '#4ade80' : '#f87171'}
            bg={vsLastYear.diff >= 0 ? 'hsl(var(--chart-2) / 0.1)' : 'hsl(var(--destructive) / 0.1)'}
            borderColor={vsLastYear.diff >= 0 ? 'hsl(var(--chart-2) / 0.3)' : 'hsl(var(--destructive) / 0.3)'}
          />
        </div>
      )}

      {years.length > 0 && (
        <Card className="shadow-sm border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">📈 {t('progressTab.cumulativeKmTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={config.chart_height_dense}>
              <ComposedChart data={lineData} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
                <defs>
                  <linearGradient id="curYearGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={currentYearColor} stopOpacity={0.22} />
                    <stop offset="95%" stopColor={currentYearColor} stopOpacity={0.01} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="doy"
                  type="number"
                  domain={[1, 366]}
                  ticks={MONTH_DOYS}
                  tickFormatter={d => MONTHS[MONTH_DOYS.indexOf(d)] ?? ''}
                  tick={{ fontSize: 11 }}
                />
                <YAxis
                  tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)}
                  tick={{ fontSize: 11 }}
                  width={48}
                />
                <Tooltip content={<YearProgressTooltip />} />
                <Legend />
                <ReferenceLine
                  x={doy}
                  stroke="hsl(var(--muted-foreground))"
                  strokeDasharray="5 3"
                  label={{ value: t('progressTab.today'), fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                />
                {/* Flächen-Wash nur unter dem aktuellen Jahr – hebt es visuell als "die Geschichte" hervor */}
                <Area
                  dataKey={currentYear}
                  name={currentYear}
                  stroke="none"
                  fill="url(#curYearGrad)"
                  legendType="none"
                  isAnimationActive={false}
                  connectNulls
                />
                {years.map(y => (
                  <Line
                    key={y}
                    dataKey={y}
                    name={y}
                    stroke={progYearColor(years, y)}
                    strokeWidth={y === currentYear ? 2.5 : 1.8}
                    strokeOpacity={y === currentYear ? 1 : 0.7}
                    dot={false}
                    connectNulls
                    isAnimationActive={false}
                  />
                ))}
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {years.length > 0 && (
        <Card className="shadow-sm border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">📊 {t('progressTab.kmPerYearTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={config.chart_height}>
              <BarChart data={barData} margin={{ top: 16, right: 16, bottom: 8, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="year" tick={{ fontSize: 12 }} />
                <YAxis
                  tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                  tick={{ fontSize: 11 }}
                  width={48}
                />
                <Tooltip content={<YearBarTooltip />} />
                <Bar dataKey="km" name="km" radius={[3, 3, 0, 0]} fill="#fc4c02" isAnimationActive={false}>
                  {barData.map(entry => (
                    <rect key={entry.year} fill={entry.color} fillOpacity={entry.year === currentYear ? 1 : 0.65} />
                  ))}
                </Bar>
                <Bar dataKey="projected" name={t('progressTab.tooltip.forecast')} fill="#fc4c02" fillOpacity={0.2} radius={[3, 3, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {areaData.length > 1 && (
        <Card className="shadow-sm border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">🗓️ {t('progressTab.monthlyOverviewTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={config.chart_height_dense}>
              <AreaChart data={areaData} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
                <defs>
                  <linearGradient id="monthGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#fc4c02" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#fc4c02" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10 }}
                  interval="preserveStartEnd"
                  tickFormatter={v => { const [, m] = v.split('-'); return m === '01' ? v.slice(0, 4) : ''; }}
                />
                <YAxis
                  tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)}
                  tick={{ fontSize: 11 }}
                  width={48}
                />
                <Tooltip content={<MonthlyTrendTooltip />} />
                <Area type="monotone" dataKey="km" stroke="#fc4c02" strokeWidth={1.5} fill="url(#monthGrad)" dot={false} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {projection && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">
            {t('progressTab.yearForecastTitle', { year: currentYear })}
            <span className="text-xs font-normal text-muted-foreground ml-2">
              {t('progressTab.forecastBasis', { rate: projection.dailyRate.toFixed(1) })}
            </span>
          </h2>
          <div className="flex flex-wrap gap-3">
            <StatTile
              icon="🏁"
              label={t('progressTab.forecastYearEnd')}
              value={`${projection.projEnd.toLocaleString('de-DE')} km`}
              valueColor="#fc4c02"
            />
            <StatTile
              icon="⏳"
              label={t('progressTab.daysRemaining', { days: projection.remainingDays })}
              value={t('progressTab.kmOpen', { km: projection.remainingKm.toLocaleString('de-DE') })}
            />
            {projection.prevEnd !== null && (
              <StatTile
                icon={projection.projEnd >= projection.prevEnd ? '📈' : '📉'}
                label={t('progressTab.vsYear', { year: projection.prevYear, km: Math.round(projection.prevEnd).toLocaleString('de-DE') })}
                value={`${projection.projEnd >= projection.prevEnd ? '+' : ''}${(projection.projEnd - projection.prevEnd).toFixed(0)} km`}
                valueColor={projection.projEnd >= projection.prevEnd ? '#4ade80' : '#f87171'}
                bg={projection.projEnd >= projection.prevEnd ? 'rgba(20,83,45,0.2)' : 'rgba(127,29,29,0.2)'}
                borderColor={projection.projEnd >= projection.prevEnd ? 'rgba(22,163,74,0.3)' : 'rgba(220,38,38,0.3)'}
              />
            )}
          </div>
        </div>
      )}

      <InsightCard
        insights={trendInsights}
        title={t('progressTab.insightsTitle')}
        subtitle={t('progressTab.insightsSubtitle')}
      />
    </div>
  );
}
