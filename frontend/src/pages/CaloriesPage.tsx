import { useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ChartTooltip } from '@/components/ui/chart-tooltip';
import {
  ComposedChart, BarChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, Legend,
} from 'recharts';
import { useConfig } from '@/lib/config-context';

interface CaloriesData {
  total_kcal:          number;
  total_kcal_workouts: number;
  rides:               number;
  workouts:            number;
  avg_kcal:            number;
  avg_kcal_workouts:   number | null;
  kcal_per_hour:       number | null;
  monthly: {
    month: string; kcal: number; kcal_workouts: number;
    rides: number; workouts: number; avg_kcal: number;
  }[];
  yearly: {
    year: string; kcal: number; kcal_workouts: number;
    rides: number; workouts: number; avg_kcal: number;
  }[];
}

function fmtKcal(v: number, millionLabel: string): string {
  if (v >= 1000000) return `${(v / 1000000).toFixed(1)} ${millionLabel}`;
  if (v >= 1000)    return `${(v / 1000).toFixed(1)}k`;
  return String(Math.round(v));
}

// Farben – konsistent in allen Charts
const COLOR_RIDES    = 'var(--primary)';
const COLOR_WORKOUTS = 'var(--chart-2)';

function MonthTooltip({ active, payload, label }: { active?: boolean; payload?: any[]; label?: string }) {
  const { t } = useTranslation('calories');
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  const total = (d?.kcal ?? 0) + (d?.kcal_workouts ?? 0);
  return (
    <ChartTooltip
      active={active}
      label={label}
      rows={[
        ...(d?.kcal > 0 ? [{ label: t('tooltip.rides', { count: d.rides }), value: `${d.kcal.toLocaleString()} ${t('units.kcal')}`, color: COLOR_RIDES }] : []),
        ...(d?.kcal_workouts > 0 ? [{ label: t('tooltip.workouts', { count: d.workouts }), value: `${d.kcal_workouts.toLocaleString()} ${t('units.kcal')}`, color: COLOR_WORKOUTS }] : []),
        ...(d?.kcal > 0 && d?.kcal_workouts > 0 ? [{ label: t('tooltip.total'), value: `${total.toLocaleString()} ${t('units.kcal')}`, separator: true }] : []),
        ...(d?.rolling_avg > 0 ? [{ label: t('tooltip.rollingAvg'), value: `${d.rolling_avg.toLocaleString()} ${t('units.kcal')}` }] : []),
      ]}
    />
  );
}

function YearTooltip({ active, payload, label }: { active?: boolean; payload?: any[]; label?: string }) {
  const { t } = useTranslation('calories');
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  const total = (d?.kcal ?? 0) + (d?.kcal_workouts ?? 0);
  return (
    <ChartTooltip
      active={active}
      label={label}
      rows={[
        ...(d?.kcal > 0 ? [{ label: t('tooltip.rides', { count: d.rides }), value: `${d.kcal.toLocaleString()} ${t('units.kcal')}`, color: COLOR_RIDES }] : []),
        ...(d?.kcal_workouts > 0 ? [{ label: t('tooltip.workouts', { count: d.workouts }), value: `${d.kcal_workouts.toLocaleString()} ${t('units.kcal')}`, color: COLOR_WORKOUTS }] : []),
        ...(d?.kcal > 0 && d?.kcal_workouts > 0 ? [{ label: t('tooltip.total'), value: `${total.toLocaleString()} ${t('units.kcal')}`, separator: true }] : []),
      ]}
    />
  );
}

export default function CaloriesPage() {
  const { t } = useTranslation('calories');
  const config = useConfig();
  const [data, setData]             = useState<CaloriesData | null>(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<string | null>(null);

  const currentYear = new Date().getFullYear();

  useEffect(() => {
    setLoading(true);
    const year = selectedYear && selectedYear !== 'all' ? Number(selectedYear) : null;
    api.calories(year)
      .then(setData)
      .catch(e => setError(e instanceof Error ? e.message : t('errorFallback')))
      .finally(() => setLoading(false));
  }, [selectedYear]);

  const availableYears = useMemo(() => {
    if (!data) return [];
    return data.yearly.map(y => y.year).filter(y => y >= '2022');
  }, [data]);

  const MONTHS = t('months', { returnObjects: true }) as string[];
  const monthlyFormatted = useMemo(() => {
    if (!data) return [];
    const base = data.monthly.map(m => {
      const [y, mo] = m.month.split('-');
      const label = selectedYear ? MONTHS[Number(mo) - 1] : `${MONTHS[Number(mo) - 1]} ${y.slice(2)}`;
      return { ...m, label };
    });
    // 3-Monats-gleitender Durchschnitt über Gesamtkalorien
    return base.map((m, i) => {
      const slice = base.slice(Math.max(0, i - 2), i + 1);
      const avg = slice.reduce((s, x) => s + x.kcal + x.kcal_workouts, 0) / slice.length;
      return { ...m, rolling_avg: Math.round(avg) };
    });
  }, [data, selectedYear]);

  const fatKg = data
    ? ((data.total_kcal + data.total_kcal_workouts) / 7700).toFixed(1)
    : null;

  const bestYear = data?.yearly.length
    ? data.yearly.reduce((a, b) =>
        (b.kcal + b.kcal_workouts) > (a.kcal + a.kcal_workouts) ? b : a,
        data.yearly[0])
    : null;

  const hasWorkouts = (data?.total_kcal_workouts ?? 0) > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        years={availableYears}
        selectedYear={selectedYear ?? 'all'}
        onYearChange={v => setSelectedYear(v === 'all' ? null : v)}
      />

      {error && (
        <div className="rounded border border-destructive/50 bg-destructive/10 p-4 text-destructive text-sm">{error}</div>
      )}

      {loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {[0, 1, 2, 3, 4, 5].map(i => (
              <Card key={i}><CardContent className="pt-6"><Skeleton className="h-14 w-full" /></CardContent></Card>
            ))}
          </div>
          <Card><CardContent className="pt-6"><Skeleton className="h-64 w-full" /></CardContent></Card>
        </div>
      ) : data ? (
        <>
          {/* KPI-Kacheln */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {/* Radtouren */}
            <Card>
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-muted-foreground">
                  {selectedYear && selectedYear !== 'all' ? t('kpi.ridesYear', { year: selectedYear }) : t('kpi.ridesTotal')}
                </p>
                <p className="text-2xl font-bold mt-1" style={{ color: COLOR_RIDES }}>
                  {fmtKcal(data.total_kcal, t('units.million'))}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">{t('kpi.kcalRides', { count: data.rides })}</p>
              </CardContent>
            </Card>

            {/* Workouts */}
            <Card>
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-muted-foreground">
                  {selectedYear && selectedYear !== 'all' ? t('kpi.workoutsYear', { year: selectedYear }) : t('kpi.workoutsTotal')}
                </p>
                <p className="text-2xl font-bold mt-1" style={{ color: hasWorkouts ? COLOR_WORKOUTS : undefined }}>
                  {hasWorkouts ? fmtKcal(data.total_kcal_workouts, t('units.million')) : '–'}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {hasWorkouts ? t('kpi.kcalWorkouts', { count: data.workouts }) : t('kpi.noData')}
                </p>
              </CardContent>
            </Card>

            {/* Fettäquivalent (kombiniert) */}
            <Card>
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-muted-foreground">{t('kpi.fatEquivalent')}</p>
                <p className="text-2xl font-bold mt-1">{fatKg}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{t('units.fatUnit')}</p>
              </CardContent>
            </Card>

            {/* Ø pro Ride */}
            <Card>
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-muted-foreground">{t('kpi.avgPerRide')}</p>
                <p className="text-2xl font-bold mt-1">{data.avg_kcal.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{t('units.kcal')}</p>
              </CardContent>
            </Card>

            {/* Ø pro Workout */}
            <Card>
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-muted-foreground">{t('kpi.avgPerWorkout')}</p>
                <p className="text-2xl font-bold mt-1">
                  {data.avg_kcal_workouts ? data.avg_kcal_workouts.toLocaleString() : '–'}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">{t('units.kcal')}</p>
              </CardContent>
            </Card>

            {/* kcal/h */}
            <Card>
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-muted-foreground">{t('kpi.avgPerHour')}</p>
                <p className="text-2xl font-bold mt-1">
                  {data.kcal_per_hour ? data.kcal_per_hour.toLocaleString() : '–'}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">{t('units.kcalPerHour')}</p>
              </CardContent>
            </Card>
          </div>

          {/* Monatsverlauf */}
          {monthlyFormatted.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">
                  {selectedYear && selectedYear !== 'all' ? t('chart.monthlyTitleYear', { year: selectedYear }) : t('chart.monthlyTitle')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={config.chart_height_dense}>
                  <ComposedChart data={monthlyFormatted} margin={{ top: 8, right: 10, bottom: 0, left: 0 }}>
                    <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.5} />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                      axisLine={false} tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                      axisLine={false} tickLine={false}
                      tickFormatter={v => fmtKcal(v, t('units.million'))}
                      width={40}
                    />
                    <Tooltip content={<MonthTooltip />} />
                    {hasWorkouts && (
                      <Legend
                        formatter={v => v === 'kcal' ? t('chart.legendRides') : v === 'kcal_workouts' ? t('chart.legendWorkouts') : t('chart.legendRollingAvg')}
                        wrapperStyle={{ fontSize: 11 }}
                      />
                    )}
                    <Bar dataKey="kcal" stackId="a" name="kcal" radius={hasWorkouts ? [0,0,0,0] : [3,3,0,0]} maxBarSize={40}>
                      {monthlyFormatted.map((m, i) => {
                        const isCurrentMonth =
                          m.month === `${currentYear}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
                        return (
                          <Cell key={i} fill={COLOR_RIDES} fillOpacity={isCurrentMonth ? 1 : 0.65} />
                        );
                      })}
                    </Bar>
                    {hasWorkouts && (
                      <Bar dataKey="kcal_workouts" stackId="a" name="kcal_workouts" radius={[3,3,0,0]} maxBarSize={40}
                        fill={COLOR_WORKOUTS} fillOpacity={0.85}
                      />
                    )}
                    <Line
                      dataKey="rolling_avg"
                      name="rolling_avg"
                      type="monotone"
                      stroke="var(--muted-foreground)"
                      strokeWidth={2}
                      dot={false}
                      legendType="none"
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Jahresvergleich */}
          {data.yearly.length > 1 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">{t('chart.yearlyTitle')}</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={config.chart_height}>
                  <BarChart data={data.yearly} margin={{ top: 8, right: 10, bottom: 0, left: 0 }}>
                    <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.5} />
                    <XAxis
                      dataKey="year"
                      tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
                      axisLine={false} tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                      axisLine={false} tickLine={false}
                      tickFormatter={v => fmtKcal(v, t('units.million'))}
                      width={44}
                    />
                    <Tooltip content={<YearTooltip />} />
                    <Bar dataKey="kcal" stackId="a" name="kcal" radius={[0,0,0,0]} maxBarSize={60}>
                      {data.yearly.map((y, i) => (
                        <Cell
                          key={i}
                          fill={COLOR_RIDES}
                          fillOpacity={bestYear?.year === y.year ? 0.9 : 0.5}
                        />
                      ))}
                    </Bar>
                    <Bar dataKey="kcal_workouts" stackId="a" name="kcal_workouts"
                      radius={[4,4,0,0]} maxBarSize={60}
                      fill={COLOR_WORKOUTS} fillOpacity={0.8}
                    />
                  </BarChart>
                </ResponsiveContainer>
                <p className="text-xs text-muted-foreground mt-2">
                  {t('bestYear.label')}{' '}
                  <span className="font-medium text-foreground">{bestYear?.year}</span>{' '}
                  {t('bestYear.with', { kcal: ((bestYear?.kcal ?? 0) + (bestYear?.kcal_workouts ?? 0)).toLocaleString() })}
                  {' '}({t('bestYear.rides', { count: bestYear?.rides })}{(bestYear?.workouts ?? 0) > 0 ? ` + ${t('bestYear.workouts', { count: bestYear?.workouts })}` : ''})
                </p>
              </CardContent>
            </Card>
          )}
        </>
      ) : (
        <p className="text-muted-foreground text-sm">{t('emptyState')}</p>
      )}
    </div>
  );
}
