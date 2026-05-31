import { useEffect, useState, useMemo } from 'react';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  BarChart,
  Bar,
  Area,
  AreaChart,
} from 'recharts';

// Farbpalette analog zur Svelte-Implementierung
const PALETTE = ['#fc4c02', '#60a5fa', '#4ade80', '#c084fc', '#f472b6', '#facc15'];
const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
// Tagesnummer des Monatsbeginns (1-basiert, kein Schaltjahr)
const MONTH_DOYS = [1, 32, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];

type YearData = Record<string, [number, number][]>;
type MonthlyEntry = { year: number; month: number; distance_km: number; count: number };

// Heutiger Day-of-Year (1-366)
function todayDoy(): number {
  const n = new Date();
  return Math.floor((n.getTime() - new Date(n.getFullYear(), 0, 0).getTime()) / 86_400_000);
}

// Letzter km-Wert eines Jahres bis zu einem bestimmten doy
function kmAt(pts: [number, number][], doy: number): number | null {
  let v: number | null = null;
  for (const [d, k] of pts) {
    if (d <= doy) v = k;
    else break;
  }
  return v;
}

// Farbe für ein Jahr
function yearColor(years: string[], year: string): string {
  return PALETTE[years.indexOf(year) % PALETTE.length];
}

// Recharts benötigt flache Datenpunkte – wir bauen ein Array mit doy als X-Achse
// und je Jahresschlüssel den km-Wert
function buildLineData(yearData: YearData, years: string[]) {
  // Alle doys sammeln
  const doySet = new Set<number>();
  doySet.add(1);
  for (const pts of Object.values(yearData)) {
    for (const [d] of pts) doySet.add(d);
  }
  // Monatsgrenzen ebenfalls hinzufügen für saubere X-Achsenbeschriftung
  for (const d of MONTH_DOYS) doySet.add(d);

  const sorted = [...doySet].sort((a, b) => a - b);

  return sorted.map(doy => {
    const row: Record<string, number | null> = { doy };
    for (const y of years) {
      row[y] = kmAt(yearData[y] ?? [], doy);
    }
    return row;
  });
}

// Tooltip-Formatter: doy → lesbares Datum (2024 als Referenzjahr für Monatsgrenzen)
function doyToLabel(doy: number): string {
  const d = new Date(2024, 0, doy);
  return d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
}

export default function ProgressPage() {
  const [yearData, setYearData] = useState<YearData>({});
  const [monthlyAll, setMonthlyAll] = useState<MonthlyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const currentYear = String(new Date().getFullYear());
  const doy = todayDoy();

  useEffect(() => {
    Promise.all([api.yearProgress(), api.monthlyAll()])
      .then(([progress, monthly]) => {
        setYearData(progress.years);
        setMonthlyAll(monthly);
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Fehler'))
      .finally(() => setLoading(false));
  }, []);

  const years = useMemo(() => Object.keys(yearData).sort(), [yearData]);

  // Jahresvergleich aktuell vs. Vorjahr
  const vsLastYear = useMemo(() => {
    const prevYear = String(Number(currentYear) - 1);
    const cur = yearData[currentYear];
    const prev = yearData[prevYear];
    if (!cur || !prev) return null;
    const curKm = kmAt(cur, doy) ?? 0;
    const prevKm = kmAt(prev, doy) ?? 0;
    return { curKm, prevKm, diff: curKm - prevKm, prevYear };
  }, [yearData, currentYear, doy]);

  // Jahresprognose
  const projection = useMemo(() => {
    const cur = yearData[currentYear];
    if (!cur || cur.length === 0) return null;
    const kmToday = kmAt(cur, doy) ?? 0;
    if (kmToday <= 0 || doy <= 1) return null;
    const dailyRate = kmToday / doy;
    const projEnd = Math.round(dailyRate * 365);
    const prevYear = String(Number(currentYear) - 1);
    const prevEnd = yearData[prevYear]?.at(-1)?.[1] ?? null;
    return {
      kmToday,
      dailyRate,
      projEnd,
      remainingDays: 365 - doy,
      remainingKm: Math.round(projEnd - kmToday),
      prevEnd,
      prevYear,
    };
  }, [yearData, currentYear, doy]);

  // Liniendiagramm-Daten
  const lineData = useMemo(() => buildLineData(yearData, years), [yearData, years]);

  // Balkendiagramm: km pro Jahr
  const barData = useMemo(() =>
    years.map(y => ({
      year: y,
      km: y === currentYear
        ? (kmAt(yearData[y] ?? [], doy) ?? 0)
        : (yearData[y]?.at(-1)?.[1] ?? 0),
      projected: y === currentYear && projection ? projection.projEnd : undefined,
      color: yearColor(years, y),
    })),
    [years, yearData, currentYear, doy, projection]
  );

  // Monatlicher Gesamtverlauf
  const areaData = useMemo(() =>
    monthlyAll.map(d => ({
      label: `${d.year}-${String(d.month).padStart(2, '0')}`,
      km: d.distance_km,
      year: d.year,
    })),
    [monthlyAll]
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Jahresfortschritt" subtitle="Kumulierte Kilometer je Kalenderjahr" />
        <div className="h-80 bg-muted animate-pulse rounded-xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Jahresfortschritt" />
        <div className="rounded border border-destructive/50 bg-destructive/10 p-4 text-destructive text-sm">{error}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Jahresfortschritt"
        subtitle="Kumulierte Kilometer je Kalenderjahr · gestrichelt = Prognose"
      />

      {/* Jahresvergleich-Kacheln */}
      {vsLastYear && (
        <div className="flex flex-wrap gap-3">
          <Card className="shadow-sm">
            <CardContent className="px-4 py-3 text-center min-w-36">
              <p className="text-xs text-muted-foreground">{currentYear} bis heute</p>
              <p className="text-xl font-bold text-[#fc4c02] mt-0.5">
                {vsLastYear.curKm.toFixed(0)} km
              </p>
            </CardContent>
          </Card>
          <Card className="shadow-sm">
            <CardContent className="px-4 py-3 text-center min-w-36">
              <p className="text-xs text-muted-foreground">{vsLastYear.prevYear} bis heute</p>
              <p className="text-xl font-bold text-[#60a5fa] mt-0.5">
                {vsLastYear.prevKm.toFixed(0)} km
              </p>
            </CardContent>
          </Card>
          <Card
            className="shadow-sm"
            style={{
              background: vsLastYear.diff >= 0 ? 'hsl(var(--chart-2) / 0.1)' : 'hsl(var(--destructive) / 0.1)',
              borderColor: vsLastYear.diff >= 0 ? 'hsl(var(--chart-2) / 0.3)' : 'hsl(var(--destructive) / 0.3)',
            }}
          >
            <CardContent className="px-4 py-3 text-center min-w-36">
              <p className="text-xs text-muted-foreground">Differenz</p>
              <p
                className="text-xl font-bold mt-0.5"
                style={{ color: vsLastYear.diff >= 0 ? '#4ade80' : '#f87171' }}
              >
                {vsLastYear.diff >= 0 ? '+' : ''}{vsLastYear.diff.toFixed(0)} km
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Kumuliertes Liniendiagramm */}
      {years.length > 0 && (
        <Card className="shadow-sm border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Kumulierte km je Jahr</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={lineData} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
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
                <Tooltip
                  labelFormatter={v => doyToLabel(Number(v))}
                  formatter={(value, name) => [
                    `${Number(value).toFixed(0)} km`,
                    name,
                  ]}
                  contentStyle={{
                    fontSize: 12,
                    backgroundColor: 'hsl(var(--background))',
                    border: '1px solid hsl(var(--border))',
                  }}
                />
                <Legend />
                {/* Heute-Referenzlinie */}
                <ReferenceLine
                  x={doy}
                  stroke="hsl(var(--muted-foreground))"
                  strokeDasharray="5 3"
                  label={{ value: 'heute', fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                />
                {years.map(y => (
                  <Line
                    key={y}
                    dataKey={y}
                    name={y}
                    stroke={yearColor(years, y)}
                    strokeWidth={y === currentYear ? 2.5 : 1.8}
                    strokeOpacity={y === currentYear ? 1 : 0.7}
                    dot={false}
                    connectNulls
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* km pro Jahr (Balkendiagramm) */}
      {years.length > 0 && (
        <Card className="shadow-sm border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">km pro Jahr</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={210}>
              <BarChart data={barData} margin={{ top: 16, right: 16, bottom: 8, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="year" tick={{ fontSize: 12 }} />
                <YAxis
                  tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                  tick={{ fontSize: 11 }}
                  width={48}
                />
                <Tooltip
                  formatter={(value, name) => [`${Number(value).toFixed(0)} km`, name === 'km' ? 'Ist' : 'Prognose']}
                  contentStyle={{
                    fontSize: 12,
                    backgroundColor: 'hsl(var(--background))',
                    border: '1px solid hsl(var(--border))',
                  }}
                />
                <Bar
                  dataKey="km"
                  name="km"
                  radius={[3, 3, 0, 0]}
                  // Jeder Balken bekommt seine eigene Farbe via cell
                  fill="#fc4c02"
                  isAnimationActive={false}
                >
                  {barData.map(entry => (
                    <rect key={entry.year} fill={entry.color} fillOpacity={entry.year === currentYear ? 1 : 0.65} />
                  ))}
                </Bar>
                {/* Prognose-Overlay */}
                <Bar
                  dataKey="projected"
                  name="Prognose"
                  fill="#fc4c02"
                  fillOpacity={0.2}
                  radius={[3, 3, 0, 0]}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Monatlicher Gesamtverlauf */}
      {areaData.length > 1 && (
        <Card className="shadow-sm border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Monatlicher Gesamtverlauf</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
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
                  tickFormatter={v => {
                    // Nur Jahr-Start anzeigen
                    const [, m] = v.split('-');
                    return m === '01' ? v.slice(0, 4) : '';
                  }}
                />
                <YAxis
                  tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)}
                  tick={{ fontSize: 11 }}
                  width={48}
                />
                <Tooltip
                  formatter={(value) => [`${Number(value).toFixed(0)} km`, 'Distanz']}
                  contentStyle={{
                    fontSize: 12,
                    backgroundColor: 'hsl(var(--background))',
                    border: '1px solid hsl(var(--border))',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="km"
                  stroke="#fc4c02"
                  strokeWidth={1.5}
                  fill="url(#monthGrad)"
                  dot={false}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Jahresprognose */}
      {projection && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">
            Jahresprognose {currentYear}
            <span className="text-xs font-normal text-muted-foreground ml-2">
              auf Basis ⌀ {projection.dailyRate.toFixed(1)} km/Tag
            </span>
          </h2>
          <div className="flex flex-wrap gap-3">
            <Card className="shadow-sm">
              <CardContent className="px-4 py-3 text-center min-w-36">
                <p className="text-xs text-muted-foreground">Prognose Jahresende</p>
                <p className="text-xl font-bold text-[#fc4c02] mt-0.5">
                  {projection.projEnd.toLocaleString('de-DE')} km
                </p>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardContent className="px-4 py-3 text-center min-w-36">
                <p className="text-xs text-muted-foreground">Noch {projection.remainingDays} Tage</p>
                <p className="text-xl font-bold mt-0.5">
                  {projection.remainingKm.toLocaleString('de-DE')} km offen
                </p>
              </CardContent>
            </Card>
            {projection.prevEnd !== null && (
              <Card
                className="shadow-sm"
                style={{
                  background: projection.projEnd >= projection.prevEnd
                    ? 'rgba(20,83,45,0.2)'
                    : 'rgba(127,29,29,0.2)',
                  borderColor: projection.projEnd >= projection.prevEnd
                    ? 'rgba(22,163,74,0.3)'
                    : 'rgba(220,38,38,0.3)',
                }}
              >
                <CardContent className="px-4 py-3 text-center min-w-36">
                  <p className="text-xs text-muted-foreground">
                    vs. {projection.prevYear} ({Math.round(projection.prevEnd).toLocaleString('de-DE')} km)
                  </p>
                  <p
                    className="text-xl font-bold mt-0.5"
                    style={{ color: projection.projEnd >= projection.prevEnd ? '#4ade80' : '#f87171' }}
                  >
                    {projection.projEnd >= projection.prevEnd ? '+' : ''}
                    {(projection.projEnd - projection.prevEnd).toFixed(0)} km
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
