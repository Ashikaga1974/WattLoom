import { useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

import { api, type WeeklyVolume } from '@/lib/api';
import { useConfig } from '@/lib/config-context';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { InsightCard } from '@/components/ui/insight-card';
import { Button } from '@/components/ui/button';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceLine, ResponsiveContainer,
} from 'recharts';
import { fmtTime } from '@/lib/format';
import { ChartTooltip } from '@/components/ui/chart-tooltip';
import type { Insight } from '@/lib/insights';

import { StatTile } from './shared';

function VolumeTooltip({ active, payload }: { active?: boolean; payload?: any[] }) {
  const { t } = useTranslation('progress');
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload as { label: string; week_start?: string; Radfahren: number; Workout: number; Kraft: number; Trend?: number };
  let weekLabelStr = t('volumeTab.tooltip.weekLabel', { date: d.label });
  if (d.week_start) {
    const date = new Date(d.week_start.endsWith('Z') ? d.week_start : d.week_start + 'Z');
    weekLabelStr = t('volumeTab.tooltip.weekLabel', { date: date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) });
  }
  const rows = [
    { label: t('volumeTab.tooltip.cycling'), value: fmtTime(d.Radfahren * 60), color: '#fc4c02' },
    { label: t('volumeTab.tooltip.workout'), value: fmtTime(d.Workout * 60), color: '#60a5fa' },
    { label: t('volumeTab.tooltip.strength'), value: fmtTime(d.Kraft * 60), color: '#4ade80' },
  ];
  if (d.Trend != null) {
    rows.push({ label: t('volumeTab.tooltip.fixedWeekAvgLabel'), value: fmtTime(d.Trend * 60), color: '#facc15' });
  }
  return <ChartTooltip active={active} label={weekLabelStr} rows={rows} />;
}

function weekLabel(dateStr: string): string {
  const d = new Date(dateStr.endsWith('Z') ? dateStr : dateStr + 'Z');
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
}

function calcStats(data: WeeklyVolume[]) {
  const totalRide = data.reduce((s, w) => s + w.ride_minutes, 0);
  const totalWorkout = data.reduce((s, w) => s + w.workout_minutes, 0);
  const totalWeight = data.reduce((s, w) => s + w.weight_training_minutes, 0);
  const weekTotals = data.map(w => w.ride_minutes + w.workout_minutes + w.weight_training_minutes);
  const activeWeeks = weekTotals.filter(m => m > 0).length;
  const peakTotal = Math.max(...weekTotals, 0);
  const avgTotal = activeWeeks > 0 ? Math.round(weekTotals.reduce((s, m) => s + m, 0) / activeWeeks) : 0;
  return { totalRide, totalWorkout, totalWeight, activeWeeks, peakTotal, avgTotal, total: data.length };
}

function buildVolumeInsights(
  t: TFunction<'progress'>,
  chartData: { label: string; total: number }[],
  stats: ReturnType<typeof calcStats>,
  volumeTrendWeeks: number
): Insight[] {
  const insights: Insight[] = [];

  if (stats.activeWeeks > 0) {
    insights.push({
      text: t('volumeTab.insights.avgPerActiveWeek', { avg: fmtTime(stats.avgTotal * 60), activeWeeks: stats.activeWeeks, total: stats.total }),
      type: 'neutral',
    });
  }

  if (chartData.length >= volumeTrendWeeks * 2) {
    const last = chartData.slice(-volumeTrendWeeks);
    const prev = chartData.slice(-volumeTrendWeeks * 2, -volumeTrendWeeks);
    const avgLast = last.reduce((s, w) => s + w.total, 0) / last.length;
    const avgPrev = prev.reduce((s, w) => s + w.total, 0) / prev.length;
    const diff = avgLast - avgPrev;
    if (diff >= 30) {
      insights.push({
        text: t('volumeTab.insights.upTrend', { avgLast: fmtTime(Math.round(avgLast) * 60), weeks: volumeTrendWeeks, avgPrev: fmtTime(Math.round(avgPrev) * 60) }),
        type: 'positive',
      });
    } else if (diff <= -30) {
      insights.push({
        text: t('volumeTab.insights.downTrend', { avgLast: fmtTime(Math.round(avgLast) * 60), weeks: volumeTrendWeeks, avgPrev: fmtTime(Math.round(avgPrev) * 60) }),
        type: 'warning',
      });
    } else {
      insights.push({
        text: t('volumeTab.insights.stableTrend', { weeks: volumeTrendWeeks, avgLast: fmtTime(Math.round(avgLast) * 60) }),
        type: 'neutral',
      });
    }
  }

  if (chartData.length > 0) {
    const peak = chartData.reduce((a, b) => (b.total > a.total ? b : a));
    if (peak.total > 0) {
      insights.push({ text: t('volumeTab.insights.peakWeek', { label: peak.label, value: fmtTime(peak.total * 60) }), type: 'neutral' });
    }
  }

  if (stats.totalWorkout > 0 || stats.totalWeight > 0) {
    const totalAll = stats.totalRide + stats.totalWorkout + stats.totalWeight;
    const pctOther = totalAll > 0 ? Math.round(((stats.totalWorkout + stats.totalWeight) / totalAll) * 100) : 0;
    insights.push({ text: t('volumeTab.insights.otherShare', { pct: pctOther }), type: 'neutral' });
  }

  return insights;
}

export function VolumeTab() {
  const { t } = useTranslation('progress');
  const config = useConfig();
  const [allData, setAllData] = useState<WeeklyVolume[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    api.weeklyVolume(520)
      .then(data => setAllData(data))
      .catch(e => setError(e instanceof Error ? e.message : t('common.genericError')))
      .finally(() => setLoading(false));
  }, []);

  const viewData = useMemo(() => {
    if (!showAll) return allData.slice(-52);
    // "Alle Jahre" holt pauschal 520 Wochen (10 Jahre) vom Backend – liegt der erste echte
    // Trainings-Eintrag später, bliebe sonst eine leere Vorlaufstrecke stehen und die eigentlichen
    // Daten würden auf der rechten Chart-Hälfte zusammengequetscht. Führende Leer-Wochen vor der
    // ersten Aktivität abschneiden, damit der Graph den kompletten sichtbaren Bereich ausnutzt.
    const firstActiveIdx = allData.findIndex(w => w.ride_minutes + w.workout_minutes + w.weight_training_minutes > 0);
    return firstActiveIdx > 0 ? allData.slice(firstActiveIdx) : allData;
  }, [allData, showAll]);

  const chartData = useMemo(() => {
    const base = viewData.map(w => ({
      label: weekLabel(w.week_start),
      week_start: w.week_start,
      weeks_ago: w.weeks_ago,
      Radfahren: w.ride_minutes,
      Workout: w.workout_minutes,
      Kraft: w.weight_training_minutes,
      total: w.ride_minutes + w.workout_minutes + w.weight_training_minutes,
    }));
    // Rolling-Ø der letzten volume_trend_weeks Wochen (analog anderer Rolling-Average-Charts)
    return base.map((w, i) => {
      const window = base.slice(Math.max(0, i - (config.volume_trend_weeks - 1)), i + 1);
      const avg = window.reduce((s, x) => s + x.total, 0) / window.length;
      return { ...w, Trend: Math.round(avg) };
    });
  }, [viewData, config.volume_trend_weeks]);

  const stats = useMemo(() => calcStats(viewData), [viewData]);
  const insights = useMemo(
    () => buildVolumeInsights(t, chartData, stats, config.volume_trend_weeks),
    [t, chartData, stats, config.volume_trend_weeks]
  );
  const currentWeek = chartData.find(w => w.weeks_ago === 0);

  if (loading) return <div className="h-64 bg-muted animate-pulse rounded-xl" />;
  if (error) return <EmptyState message={error} />;

  const tiles = [
    { label: t('volumeTab.tiles.rideTotal'), value: fmtTime(stats.totalRide * 60), color: '#fc4c02', icon: '🚴' },
    stats.totalWorkout > 0 ? { label: t('volumeTab.tiles.workoutTotal'), value: fmtTime(stats.totalWorkout * 60), color: '#60a5fa', icon: '🏃' } : null,
    stats.totalWeight > 0 ? { label: t('volumeTab.tiles.strengthTotal'), value: fmtTime(stats.totalWeight * 60), color: '#4ade80', icon: '🏋️' } : null,
    { label: t('volumeTab.tiles.activeWeeks'), value: `${stats.activeWeeks} / ${stats.total}`, color: 'var(--foreground)', icon: '📅' },
    { label: t('volumeTab.tiles.bestWeek'), value: fmtTime(stats.peakTotal * 60), color: 'var(--foreground)', icon: '🔥' },
    { label: t('volumeTab.tiles.avgWeekActive'), value: fmtTime(stats.avgTotal * 60), color: 'var(--foreground)', icon: '⚡' },
  ].filter((tile): tile is { label: string; value: string; color: string; icon: string } => tile !== null);

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button variant={showAll ? 'default' : 'outline'} size="sm" onClick={() => setShowAll(v => !v)}>
          {showAll ? t('volumeTab.toggleLast52') : t('volumeTab.toggleAllYears')}
        </Button>
      </div>

      <Card className="shadow-sm border">
        <CardContent className="pt-4">
          <ResponsiveContainer width="100%" height={config.chart_height_dense}>
            <ComposedChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 8 }} barCategoryGap="15%">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="week_start"
                tickFormatter={weekLabel}
                tick={{ fontSize: 10 }}
                interval={Math.max(0, Math.floor(chartData.length / 20) - 1)}
                angle={chartData.length > 30 ? -45 : 0}
                textAnchor={chartData.length > 30 ? 'end' : 'middle'}
                height={chartData.length > 30 ? 40 : 20}
              />
              <YAxis tickFormatter={v => `${Math.round(v / 60)}h`} tick={{ fontSize: 11 }} width={40} />
              <Tooltip content={<VolumeTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {currentWeek && (
                <ReferenceLine
                  x={currentWeek.week_start}
                  stroke="var(--foreground)"
                  strokeOpacity={0.4}
                  strokeDasharray="2 2"
                  label={{ value: t('volumeTab.currentLabel'), position: 'top', fontSize: 10, fill: 'var(--muted-foreground)' }}
                />
              )}
              <Bar dataKey="Radfahren" name={t('volumeTab.tooltip.cycling')} stackId="a" fill="#fc4c02" fillOpacity={0.85} isAnimationActive={false} />
              <Bar dataKey="Workout" name={t('volumeTab.tooltip.workout')} stackId="a" fill="#60a5fa" fillOpacity={0.85} isAnimationActive={false} />
              <Bar dataKey="Kraft" name={t('volumeTab.tooltip.strength')} stackId="a" fill="#4ade80" fillOpacity={0.85} radius={[2, 2, 0, 0]} isAnimationActive={false} />
              <Line
                type="monotone"
                dataKey="Trend"
                name={t('volumeTab.tooltip.weekAvg', { weeks: config.volume_trend_weeks })}
                stroke="#facc15"
                strokeWidth={2}
                strokeDasharray="8,4"
                dot={false}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {tiles.map(tile => (
          <StatTile key={tile.label} icon={tile.icon} label={tile.label} value={tile.value} valueColor={tile.color} />
        ))}
      </div>

      <InsightCard insights={insights} />
    </div>
  );
}
