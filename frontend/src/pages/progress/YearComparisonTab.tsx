import { useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { api } from '@/lib/api';
import { useConfig } from '@/lib/config-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import {
  ComposedChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { ChartTooltip } from '@/components/ui/chart-tooltip';

import { PALETTE, MONTHS, StatTile, type MonthlyEntry } from './shared';

function YearComparisonTooltip({ active, payload, label, years }: { active?: boolean; payload?: any[]; label?: string; years: number[] }) {
  if (!active || !payload?.length) return null;
  return (
    <ChartTooltip
      active={active}
      label={label}
      rows={payload.map(p => ({
        label: String(p.name),
        value: `${Number(p.value).toFixed(0)} km`,
        color: compYearColor(years, Number(p.name)),
      }))}
    />
  );
}

function compYearColor(years: number[], year: number): string {
  return PALETTE[years.indexOf(year) % PALETTE.length];
}

function buildMonthlyData(data: MonthlyEntry[], selectedYears: number[]) {
  return MONTHS.map((label, i) => {
    const month = i + 1;
    const row: Record<string, number | string> = { month: label };
    for (const y of selectedYears) {
      const entry = data.find(d => d.year === y && d.month === month);
      row[String(y)] = entry?.distance_km ?? 0;
    }
    return row;
  });
}

function yearStats(data: MonthlyEntry[], year: number) {
  const entries = data.filter(d => d.year === year);
  const totalKm = entries.reduce((s, e) => s + e.distance_km, 0);
  const activeMonths = entries.filter(e => e.distance_km > 0).length;
  return {
    totalKm: Math.round(totalKm),
    activeMonths,
    avgKm: activeMonths > 0 ? Math.round(totalKm / activeMonths) : 0,
  };
}

export function YearComparisonTab() {
  const { t } = useTranslation('progress');
  const config = useConfig();
  const [rawData, setRawData] = useState<MonthlyEntry[]>([]);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [selectedYears, setSelectedYears] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.monthlyAll()
      .then(data => {
        setRawData(data);
        const years = [...new Set(data.map(d => d.year))]
          .filter(y => y > 2000)
          .sort((a, b) => b - a);
        setAvailableYears(years);
        setSelectedYears(years.slice(0, 2).sort((a, b) => b - a));
      })
      .catch(e => setError(e instanceof Error ? e.message : t('common.genericError')))
      .finally(() => setLoading(false));
  }, []);

  const sortedSelected = useMemo(() => [...selectedYears].sort((a, b) => b - a), [selectedYears]);

  function toggleYear(year: number) {
    setSelectedYears(prev => prev.includes(year) ? prev.filter(y => y !== year) : [...prev, year]);
  }

  const chartData = useMemo(() => buildMonthlyData(rawData, sortedSelected), [rawData, sortedSelected]);

  if (loading) return <div className="h-64 bg-muted animate-pulse rounded-xl" />;
  if (error) return <EmptyState message={error} />;

  return (
    <div className="space-y-6">
      {/* Jahres-Toggle-Buttons */}
      <div className="flex flex-wrap gap-2">
        {availableYears.map(year => {
          const active = selectedYears.includes(year);
          const color = compYearColor(sortedSelected, year);
          return (
            <button
              key={year}
              onClick={() => toggleYear(year)}
              className="px-3.5 py-1.5 rounded-full text-sm font-semibold border transition-all hover:opacity-90"
              style={active
                ? { background: `${color}22`, borderColor: color, color, boxShadow: `0 1px 0 0 ${color}33` }
                : { background: 'transparent', borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }
              }
            >
              {year}
            </button>
          );
        })}
      </div>

      {sortedSelected.length > 0 && (
        <Card className="shadow-sm border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">📅 {t('yearComparisonTab.chartTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={config.chart_height_dense}>
              <ComposedChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis
                  tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)}
                  tick={{ fontSize: 11 }}
                  width={48}
                  unit=" km"
                />
                <Tooltip content={<YearComparisonTooltip years={sortedSelected} />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {sortedSelected.map(year => (
                  <Area
                    key={`area-${year}`}
                    type="monotone"
                    dataKey={String(year)}
                    name={String(year)}
                    fill={compYearColor(sortedSelected, year)}
                    fillOpacity={0.08}
                    stroke={compYearColor(sortedSelected, year)}
                    strokeWidth={1.8}
                    dot={{ r: 3, fill: compYearColor(sortedSelected, year) }}
                    activeDot={{ r: 5 }}
                    isAnimationActive={false}
                  />
                ))}
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {sortedSelected.length > 0 && (() => {
        // Rangfolge nach Gesamt-km unter den ausgewählten Jahren – gibt den Kacheln eine
        // kleine "Wer hat am meisten geleistet"-Note statt reiner chronologischer Auflistung.
        const withStats = sortedSelected.map(year => ({ year, ...yearStats(rawData, year) }));
        const ranked = [...withStats].sort((a, b) => b.totalKm - a.totalKm);
        const medal = (year: number) => {
          const rank = ranked.findIndex(r => r.year === year);
          return rank === 0 ? '🥇' : rank === 1 ? '🥈' : rank === 2 ? '🥉' : '📅';
        };
        return (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {withStats.map(({ year, totalKm, activeMonths, avgKm }) => {
              const color = compYearColor(sortedSelected, year);
              return (
                <StatTile
                  key={year}
                  icon={medal(year)}
                  label={<span style={{ color }}>{year}</span>}
                  value={<>{totalKm.toLocaleString('de-DE')} <span className="text-xs font-normal" style={{ color }}>km</span></>}
                  valueColor={color}
                  sub={t('yearComparisonTab.activeMonthsStat', { count: activeMonths, avg: avgKm })}
                  bg={`${color}11`}
                  borderColor={`${color}44`}
                />
              );
            })}
          </div>
        );
      })()}
    </div>
  );
}
