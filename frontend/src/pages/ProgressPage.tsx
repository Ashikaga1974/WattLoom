import { useEffect, useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, type WeeklyVolume } from '@/lib/api';
import { PageHeader } from '@/components/ui/page-header';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceLine, ResponsiveContainer, BarChart, Bar, Area, AreaChart,
  ComposedChart,
} from 'recharts';
import { fmtNum } from '@/lib/format';
import { ChartTooltip } from '@/components/ui/chart-tooltip';

// ─── Custom Tooltips ─────────────────────────────────────────────────────────

function JahresfortschrittTooltip({ active, payload, label }: { active?: boolean; payload?: any[]; label?: string }) {
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

function JahresbalkenTooltip({ active, payload }: { active?: boolean; payload?: any[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload as { year: string; km: number; projected?: number };
  return (
    <ChartTooltip
      active={active}
      label={d.year}
      rows={[
        { label: 'Ist', value: `${d.km.toFixed(0)} km` },
        ...(d.projected != null ? [{ label: 'Prognose', value: `${d.projected.toFixed(0)} km`, color: '#fc4c02' }] : []),
      ]}
    />
  );
}

function MonatsverlaufTooltip({ active, payload, label }: { active?: boolean; payload?: any[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const km = payload.find(p => p.dataKey === 'km');
  return (
    <ChartTooltip
      active={active}
      label={label}
      rows={[
        { label: 'Distanz', value: km?.value != null ? `${Number(km.value).toFixed(0)} km` : null },
      ]}
    />
  );
}

function VergleichTooltip({ active, payload, label, years }: { active?: boolean; payload?: any[]; label?: string; years: number[] }) {
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

function VolumenTooltip({ active, payload }: { active?: boolean; payload?: any[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload as { label: string; week_start?: string; Radfahren: number; Workout: number; Kraft: number };
  let weekLabel = `Woche ${d.label}`;
  if (d.week_start) {
    const date = new Date(d.week_start.endsWith('Z') ? d.week_start : d.week_start + 'Z');
    weekLabel = `Woche ${date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}`;
  }
  return (
    <ChartTooltip
      active={active}
      label={weekLabel}
      rows={[
        { label: 'Radfahren', value: `${d.Radfahren} min`, color: '#fc4c02' },
        { label: 'Workout', value: `${d.Workout} min`, color: '#60a5fa' },
        { label: 'Kraft', value: `${d.Kraft} min`, color: '#4ade80' },
      ]}
    />
  );
}

// ─── Shared ──────────────────────────────────────────────────────────────────

const PALETTE = ['#fc4c02', '#60a5fa', '#4ade80', '#c084fc', '#f472b6', '#facc15'];
const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const MONTH_DOYS = [1, 32, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];

type MonthlyEntry = { year: number; month: number; distance_km: number; count: number };

// ─── Fortschritt Tab ─────────────────────────────────────────────────────────

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

function FortschrittTab() {
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

  if (loading) return <div className="h-80 bg-muted animate-pulse rounded-xl" />;

  if (error) return (
    <div className="rounded border border-destructive/50 bg-destructive/10 p-4 text-destructive text-sm">{error}</div>
  );

  return (
    <div className="space-y-6">
      {vsLastYear && (
        <div className="flex flex-wrap gap-3">
          <Card className="shadow-sm">
            <CardContent className="px-4 py-3 text-center min-w-36">
              <p className="text-xs text-muted-foreground">{currentYear} bis heute</p>
              <p className="text-xl font-bold text-[#fc4c02] mt-0.5">{vsLastYear.curKm.toFixed(0)} km</p>
            </CardContent>
          </Card>
          <Card className="shadow-sm">
            <CardContent className="px-4 py-3 text-center min-w-36">
              <p className="text-xs text-muted-foreground">{vsLastYear.prevYear} bis heute</p>
              <p className="text-xl font-bold text-[#60a5fa] mt-0.5">{vsLastYear.prevKm.toFixed(0)} km</p>
            </CardContent>
          </Card>
          <Card className="shadow-sm" style={{
            background: vsLastYear.diff >= 0 ? 'hsl(var(--chart-2) / 0.1)' : 'hsl(var(--destructive) / 0.1)',
            borderColor: vsLastYear.diff >= 0 ? 'hsl(var(--chart-2) / 0.3)' : 'hsl(var(--destructive) / 0.3)',
          }}>
            <CardContent className="px-4 py-3 text-center min-w-36">
              <p className="text-xs text-muted-foreground">Differenz</p>
              <p className="text-xl font-bold mt-0.5" style={{ color: vsLastYear.diff >= 0 ? '#4ade80' : '#f87171' }}>
                {vsLastYear.diff >= 0 ? '+' : ''}{vsLastYear.diff.toFixed(0)} km
              </p>
            </CardContent>
          </Card>
        </div>
      )}

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
                <Tooltip content={<JahresfortschrittTooltip />} />
                <Legend />
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
                    stroke={progYearColor(years, y)}
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
                <Tooltip content={<JahresbalkenTooltip />} />
                <Bar dataKey="km" name="km" radius={[3, 3, 0, 0]} fill="#fc4c02" isAnimationActive={false}>
                  {barData.map(entry => (
                    <rect key={entry.year} fill={entry.color} fillOpacity={entry.year === currentYear ? 1 : 0.65} />
                  ))}
                </Bar>
                <Bar dataKey="projected" name="Prognose" fill="#fc4c02" fillOpacity={0.2} radius={[3, 3, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

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
                  tickFormatter={v => { const [, m] = v.split('-'); return m === '01' ? v.slice(0, 4) : ''; }}
                />
                <YAxis
                  tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)}
                  tick={{ fontSize: 11 }}
                  width={48}
                />
                <Tooltip content={<MonatsverlaufTooltip />} />
                <Area type="monotone" dataKey="km" stroke="#fc4c02" strokeWidth={1.5} fill="url(#monthGrad)" dot={false} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

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
                <p className="text-xl font-bold text-[#fc4c02] mt-0.5">{projection.projEnd.toLocaleString('de-DE')} km</p>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardContent className="px-4 py-3 text-center min-w-36">
                <p className="text-xs text-muted-foreground">Noch {projection.remainingDays} Tage</p>
                <p className="text-xl font-bold mt-0.5">{projection.remainingKm.toLocaleString('de-DE')} km offen</p>
              </CardContent>
            </Card>
            {projection.prevEnd !== null && (
              <Card className="shadow-sm" style={{
                background: projection.projEnd >= projection.prevEnd ? 'rgba(20,83,45,0.2)' : 'rgba(127,29,29,0.2)',
                borderColor: projection.projEnd >= projection.prevEnd ? 'rgba(22,163,74,0.3)' : 'rgba(220,38,38,0.3)',
              }}>
                <CardContent className="px-4 py-3 text-center min-w-36">
                  <p className="text-xs text-muted-foreground">
                    vs. {projection.prevYear} ({Math.round(projection.prevEnd).toLocaleString('de-DE')} km)
                  </p>
                  <p className="text-xl font-bold mt-0.5" style={{ color: projection.projEnd >= projection.prevEnd ? '#4ade80' : '#f87171' }}>
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

// ─── Vergleich Tab ────────────────────────────────────────────────────────────

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

function VergleichTab() {
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
      .catch(e => setError(e instanceof Error ? e.message : 'Fehler'))
      .finally(() => setLoading(false));
  }, []);

  const sortedSelected = useMemo(() => [...selectedYears].sort((a, b) => b - a), [selectedYears]);

  function toggleYear(year: number) {
    setSelectedYears(prev => prev.includes(year) ? prev.filter(y => y !== year) : [...prev, year]);
  }

  const chartData = useMemo(() => buildMonthlyData(rawData, sortedSelected), [rawData, sortedSelected]);

  if (loading) return <div className="h-64 bg-muted animate-pulse rounded-xl" />;
  if (error) return <div className="rounded border border-destructive/50 bg-destructive/10 p-4 text-destructive text-sm">{error}</div>;

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
              className="px-3 py-1.5 rounded-full text-sm font-medium border transition-all"
              style={active
                ? { background: `${color}22`, borderColor: color, color }
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
                <Tooltip content={<VergleichTooltip years={sortedSelected} />} />
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

      {sortedSelected.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {sortedSelected.map(year => {
            const s = yearStats(rawData, year);
            const color = compYearColor(sortedSelected, year);
            return (
              <Card key={year} className="shadow-sm" style={{ borderColor: `${color}44`, background: `${color}11` }}>
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

// ─── Volumen Tab ──────────────────────────────────────────────────────────────

function weekLabel(dateStr: string): string {
  const d = new Date(dateStr.endsWith('Z') ? dateStr : dateStr + 'Z');
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
}

function calcStats(data: WeeklyVolume[]) {
  const totalRide = data.reduce((s, w) => s + w.ride_minutes, 0);
  const totalWorkout = data.reduce((s, w) => s + w.workout_minutes, 0);
  const totalWeight = data.reduce((s, w) => s + w.weight_training_minutes, 0);
  const activeWeeks = data.filter(w => w.ride_minutes + w.workout_minutes + w.weight_training_minutes > 0).length;
  const peakRide = Math.max(...data.map(w => w.ride_minutes), 0);
  const avgRide = activeWeeks > 0 ? Math.round(totalRide / activeWeeks) : 0;
  return { totalRide, totalWorkout, totalWeight, activeWeeks, peakRide, avgRide, total: data.length };
}

function VolumenTab() {
  const [allData, setAllData] = useState<WeeklyVolume[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    api.weeklyVolume(520)
      .then(data => setAllData(data))
      .catch(e => setError(e instanceof Error ? e.message : 'Fehler'))
      .finally(() => setLoading(false));
  }, []);

  const viewData = useMemo(() => showAll ? allData : allData.slice(-52), [allData, showAll]);

  const chartData = useMemo(() =>
    viewData.map(w => ({
      label: weekLabel(w.week_start),
      week_start: w.week_start,
      Radfahren: w.ride_minutes,
      Workout: w.workout_minutes,
      Kraft: w.weight_training_minutes,
    })),
    [viewData]
  );

  const stats = useMemo(() => calcStats(viewData), [viewData]);

  if (loading) return <div className="h-64 bg-muted animate-pulse rounded-xl" />;
  if (error) return <div className="rounded border border-destructive/50 bg-destructive/10 p-4 text-destructive text-sm">{error}</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button variant={showAll ? 'default' : 'outline'} size="sm" onClick={() => setShowAll(v => !v)}>
          {showAll ? 'Letzte 52 Wochen' : 'Alle Jahre'}
        </Button>
      </div>

      <Card className="shadow-sm border">
        <CardContent className="pt-4">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 8 }} barCategoryGap="15%">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10 }}
                interval={Math.max(0, Math.floor(chartData.length / 20) - 1)}
                angle={chartData.length > 30 ? -45 : 0}
                textAnchor={chartData.length > 30 ? 'end' : 'middle'}
                height={chartData.length > 30 ? 40 : 20}
              />
              <YAxis tickFormatter={v => `${v}min`} tick={{ fontSize: 11 }} width={52} />
              <Tooltip content={<VolumenTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Radfahren" stackId="a" fill="#fc4c02" fillOpacity={0.85} isAnimationActive={false} />
              <Bar dataKey="Workout" stackId="a" fill="#60a5fa" fillOpacity={0.85} isAnimationActive={false} />
              <Bar dataKey="Kraft" stackId="a" fill="#4ade80" fillOpacity={0.85} radius={[2, 2, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="shadow-sm border">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Rad gesamt</p>
            <p className="text-2xl font-bold mt-1">
              {fmtNum(Math.round(stats.totalRide / 60), 0)}{' '}
              <span className="text-sm font-normal text-muted-foreground">h</span>
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-sm border">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Aktive Wochen</p>
            <p className="text-2xl font-bold mt-1">
              {stats.activeWeeks}{' '}
              <span className="text-sm font-normal text-muted-foreground">/ {stats.total}</span>
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-sm border">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Beste Woche</p>
            <p className="text-2xl font-bold mt-1">
              {stats.peakRide}{' '}
              <span className="text-sm font-normal text-muted-foreground">min</span>
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-sm border">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">⌀ Woche (Rad)</p>
            <p className="text-2xl font-bold mt-1">
              {stats.avgRide}{' '}
              <span className="text-sm font-normal text-muted-foreground">min</span>
            </p>
          </CardContent>
        </Card>
      </div>

      {(stats.totalWorkout > 0 || stats.totalWeight > 0) && (
        <div className="flex flex-wrap gap-3">
          {stats.totalWorkout > 0 && (
            <Card className="shadow-sm border">
              <CardContent className="px-4 py-3">
                <p className="text-xs text-muted-foreground">Workout gesamt</p>
                <p className="text-lg font-bold text-[#60a5fa] mt-0.5">{fmtNum(Math.round(stats.totalWorkout / 60), 0)} h</p>
              </CardContent>
            </Card>
          )}
          {stats.totalWeight > 0 && (
            <Card className="shadow-sm border">
              <CardContent className="px-4 py-3">
                <p className="text-xs text-muted-foreground">Krafttraining gesamt</p>
                <p className="text-lg font-bold text-[#4ade80] mt-0.5">{fmtNum(Math.round(stats.totalWeight / 60), 0)} h</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Tageszeit Tab ────────────────────────────────────────────────────────────

const DAYS_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const DAYS_FULL  = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
const PITCH = 20;

function colorClass(count: number, maxCount: number): string {
  if (count === 0) return 'bg-muted hover:bg-muted/80';
  const t = count / maxCount;
  if (t <= 0.25) return 'bg-orange-200 hover:bg-orange-300';
  if (t <= 0.5)  return 'bg-orange-400 hover:bg-orange-500';
  if (t <= 0.75) return 'bg-orange-500 hover:bg-orange-600';
  return                 'bg-primary hover:bg-primary/80';
}

interface TooltipState { x: number; y: number; wd: number; h: number; count: number; }

function TageszeitTab() {
  const [cells, setCells] = useState<{ weekday: number; hour: number; count: number }[]>([]);
  const [availableYears, setAvailableYears] = useState<string[]>([]);
  const [selectedYear, setSelectedYear] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  async function loadData(year?: string | null) {
    setLoading(true);
    setError(null);
    const tzOffset = -Math.round(new Date().getTimezoneOffset() / 60);
    try {
      const res = await api.timeHeatmap(year ? Number(year) : undefined, tzOffset);
      setCells(res.cells);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler beim Laden');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    async function init() {
      try {
        const stats = await api.activityStats();
        setAvailableYears(stats.available_years.filter(y => Number(y) >= 2000));
      } catch { /* ignorieren */ }
      await loadData();
    }
    init();
  }, []);

  const grid: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0));
  for (const c of cells) grid[c.weekday][c.hour] = c.count;

  const maxCount = cells.length ? Math.max(...cells.map(c => c.count)) : 1;
  const totalCount = cells.reduce((s, c) => s + c.count, 0);

  const weekdaySums = Array(7).fill(0);
  for (const c of cells) weekdaySums[c.weekday] += c.count;
  const peakDay = DAYS_FULL[weekdaySums.indexOf(Math.max(...weekdaySums))];

  const hourSums = Array(24).fill(0);
  for (const c of cells) hourSums[c.hour] += c.count;
  const peakH = hourSums.indexOf(Math.max(...hourSums));
  const peakHour = `${String(peakH).padStart(2, '0')}:00`;

  return (
    <div className="space-y-6">
      {/* Jahresfilter */}
      {availableYears.length > 0 && (
        <div className="flex justify-end">
          <Select
            value={selectedYear ?? 'all'}
            onValueChange={val => {
              const y = val === 'all' ? null : val;
              setSelectedYear(y);
              loadData(y);
            }}
          >
            <SelectTrigger className="w-36">
              <SelectValue>{selectedYear ?? 'Alle Jahre'}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Jahre</SelectItem>
              {availableYears.map(y => (
                <SelectItem key={y} value={y}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>
      )}

      {tooltip && (
        <div
          className="fixed z-50 pointer-events-none rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-xl"
          style={{ left: tooltip.x + 12, top: tooltip.y - 8 }}
        >
          <p className="font-semibold">
            {DAYS_FULL[tooltip.wd]} · {String(tooltip.h).padStart(2, '0')}:00–{String(tooltip.h + 1).padStart(2, '0')}:00
          </p>
          {tooltip.count === 0 ? (
            <p className="text-muted-foreground">Kein Start</p>
          ) : (
            <p className="text-primary mt-0.5">
              {tooltip.count} {tooltip.count === 1 ? 'Aktivität' : 'Aktivitäten'}
            </p>
          )}
        </div>
      )}

      {loading ? (
        <div className="h-40 animate-pulse rounded-xl bg-muted" />
      ) : cells.length > 0 ? (
        <>
          <div className="flex flex-wrap gap-2">
            {[
              { label: 'Aktivitäten', value: totalCount },
              { label: 'Lieblingstag', value: peakDay },
              { label: 'Lieblingszeit', value: peakHour },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-lg bg-muted/60 p-3 text-center min-w-[7rem]">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-0.5 text-lg font-bold text-primary">{value}</p>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto">
            <div className="inline-flex gap-1 min-w-max">
              <div className="flex flex-col gap-1 mr-1 pt-6">
                {DAYS_SHORT.map(day => (
                  <div key={day} className="h-3 w-7 text-right text-[10px] leading-3 text-muted-foreground">{day}</div>
                ))}
              </div>
              <div className="flex flex-col">
                <div className="relative h-5 mb-1">
                  {[0, 3, 6, 9, 12, 15, 18, 21].map(h => (
                    <span key={h} className="absolute text-[10px] text-muted-foreground" style={{ left: h * PITCH }}>
                      {String(h).padStart(2, '0')}h
                    </span>
                  ))}
                </div>
                <div className="flex gap-1">
                  {Array.from({ length: 24 }, (_, h) => (
                    <div key={h} className="flex flex-col gap-1">
                      {DAYS_SHORT.map((_, wd) => (
                        <div
                          key={wd}
                          className={`h-3 w-4 rounded-sm cursor-default transition-colors ${colorClass(grid[wd][h], maxCount)}`}
                          onMouseEnter={e => setTooltip({ x: e.pageX, y: e.pageY, wd, h, count: grid[wd][h] })}
                          onMouseLeave={() => setTooltip(null)}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>Weniger</span>
            <div className="h-3 w-3 rounded-sm bg-muted" />
            <div className="h-3 w-3 rounded-sm bg-orange-200" />
            <div className="h-3 w-3 rounded-sm bg-orange-400" />
            <div className="h-3 w-3 rounded-sm bg-orange-500" />
            <div className="h-3 w-3 rounded-sm bg-primary" />
            <span>Mehr</span>
          </div>
        </>
      ) : (
        <p className="text-muted-foreground text-sm">Keine Daten vorhanden.</p>
      )}
    </div>
  );
}

// ─── Container ────────────────────────────────────────────────────────────────

export default function ProgressPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') ?? 'fortschritt';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Jahresübersicht"
        subtitle="Fortschritt · Jahresvergleich · Wochenvolumen · Tageszeit"
      />

      <Tabs value={tab} onValueChange={t => setSearchParams({ tab: t }, { replace: true })}>
        <TabsList>
          <TabsTrigger value="fortschritt">Fortschritt</TabsTrigger>
          <TabsTrigger value="vergleich">Jahresvergleich</TabsTrigger>
          <TabsTrigger value="volumen">Volumen</TabsTrigger>
          <TabsTrigger value="tageszeit">Tageszeit</TabsTrigger>
        </TabsList>
        <TabsContent value="fortschritt" className="mt-6">
          <FortschrittTab />
        </TabsContent>
        <TabsContent value="vergleich" className="mt-6">
          <VergleichTab />
        </TabsContent>
        <TabsContent value="volumen" className="mt-6">
          <VolumenTab />
        </TabsContent>
        <TabsContent value="tageszeit" className="mt-6">
          <TageszeitTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
