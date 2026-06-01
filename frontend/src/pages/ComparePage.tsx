import { useEffect, useState, useMemo } from 'react';
import { api } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Area,
  ComposedChart,
  ResponsiveContainer,
} from 'recharts';

// Farbpalette: neuestes Jahr = Orange
const PALETTE = ['#fc4c02', '#60a5fa', '#4ade80', '#c084fc', '#f472b6', '#facc15'];
const MONTH_LABELS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

function yearColor(years: number[], year: number): string {
  const idx = years.indexOf(year);
  return PALETTE[idx % PALETTE.length];
}

type MonthlyEntry = { year: number; month: number; distance_km: number; count: number };

// Baut ein Array mit 12 Einträgen (Monat 1–12), je Jahr als eigene Spalte
function buildMonthlyData(data: MonthlyEntry[], selectedYears: number[]) {
  return MONTH_LABELS.map((label, i) => {
    const month = i + 1;
    const row: Record<string, number | string> = { month: label };
    for (const y of selectedYears) {
      const entry = data.find(d => d.year === y && d.month === month);
      row[String(y)] = entry?.distance_km ?? 0;
    }
    return row;
  });
}

// Summen-Stats je Jahr
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

export default function ComparePage() {
  const [rawData, setRawData] = useState<MonthlyEntry[]>([]);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [selectedYears, setSelectedYears] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.monthlyAll()
      .then(data => {
        setRawData(data);
        // Verfügbare Jahre ermitteln (>2000, absteigend)
        const years = [...new Set(data.map(d => d.year))]
          .filter(y => y > 2000)
          .sort((a, b) => b - a);
        setAvailableYears(years);
        // Standard: aktuelle und vorjährige Jahr
        setSelectedYears(years.slice(0, 2).sort((a, b) => b - a));
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Fehler'))
      .finally(() => setLoading(false));
  }, []);

  // Jahre in absteigender Reihenfolge für konsistente Reihenfolge
  const sortedSelected = useMemo(() =>
    [...selectedYears].sort((a, b) => b - a),
    [selectedYears]
  );

  function toggleYear(year: number) {
    setSelectedYears(prev =>
      prev.includes(year)
        ? prev.filter(y => y !== year)
        : [...prev, year]
    );
  }

  const chartData = useMemo(() =>
    buildMonthlyData(rawData, sortedSelected),
    [rawData, sortedSelected]
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 bg-muted animate-pulse rounded w-48" />
        <div className="h-64 bg-muted animate-pulse rounded-xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded border border-destructive/50 bg-destructive/10 p-4 text-destructive text-sm">{error}</div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header mit Jahres-Toggles */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Jahresvergleich</h1>
          <p className="text-sm text-muted-foreground mt-0.5">km pro Monat je Kalenderjahr</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {availableYears.map(year => {
            const active = selectedYears.includes(year);
            const color = yearColor(sortedSelected, year);
            return (
              <button
                key={year}
                onClick={() => toggleYear(year)}
                className="px-3 py-1.5 rounded-full text-sm font-medium border transition-all"
                style={active
                  ? {
                    background: `${color}22`,
                    borderColor: color,
                    color,
                  }
                  : {
                    background: 'transparent',
                    borderColor: 'hsl(var(--border))',
                    color: 'hsl(var(--muted-foreground))',
                  }
                }
              >
                {year}
              </button>
            );
          })}
        </div>
      </div>

      {/* Liniendiagramm: km/Monat je Jahr */}
      {sortedSelected.length > 0 && (
        <Card className="shadow-sm border">
          <CardContent className="pt-4">
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis
                  tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)}
                  tick={{ fontSize: 11 }}
                  width={48}
                  unit=" km"
                />
                <Tooltip
                  formatter={(value, name) => [`${Number(value).toFixed(0)} km`, name]}
                  contentStyle={{
                    fontSize: 12,
                    backgroundColor: 'hsl(var(--background))',
                    border: '1px solid hsl(var(--border))',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {sortedSelected.map(year => (
                  <Area
                    key={`area-${year}`}
                    type="monotone"
                    dataKey={String(year)}
                    name={String(year)}
                    fill={yearColor(sortedSelected, year)}
                    fillOpacity={0.08}
                    stroke={yearColor(sortedSelected, year)}
                    strokeWidth={1.8}
                    dot={{ r: 3, fill: yearColor(sortedSelected, year) }}
                    activeDot={{ r: 5 }}
                    isAnimationActive={false}
                  />
                ))}
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Statistik-Kacheln pro Jahr */}
      {sortedSelected.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {sortedSelected.map(year => {
            const s = yearStats(rawData, year);
            const color = yearColor(sortedSelected, year);
            return (
              <Card
                key={year}
                className="shadow-sm"
                style={{
                  borderColor: `${color}44`,
                  background: `${color}11`,
                }}
              >
                <CardContent className="p-4">
                  <p className="text-sm font-semibold" style={{ color }}>{year}</p>
                  <p className="text-2xl font-bold mt-1">
                    {s.totalKm.toLocaleString('de-DE')}{' '}
                    <span className="text-xs font-normal text-muted-foreground">km</span>
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {s.activeMonths} aktive Monate · ⌀ {s.avgKm} km/M
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
