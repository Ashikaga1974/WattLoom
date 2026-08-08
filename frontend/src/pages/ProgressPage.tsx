import { useEffect, useState, useMemo, Fragment } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, type WeeklyVolume, type FitnessFingerprint } from '@/lib/api';
import { CHART_HEIGHT, CHART_HEIGHT_DENSE } from '@/lib/config';
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
import { fmtNum, fmtTime } from '@/lib/format';
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
  const d = payload[0]?.payload as { label: string; week_start?: string; Radfahren: number; Workout: number; Kraft: number; Trend?: number };
  let weekLabel = `Woche ${d.label}`;
  if (d.week_start) {
    const date = new Date(d.week_start.endsWith('Z') ? d.week_start : d.week_start + 'Z');
    weekLabel = `Woche ${date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}`;
  }
  const rows = [
    { label: 'Radfahren', value: fmtTime(d.Radfahren * 60), color: '#fc4c02' },
    { label: 'Workout', value: fmtTime(d.Workout * 60), color: '#60a5fa' },
    { label: 'Kraft', value: fmtTime(d.Kraft * 60), color: '#4ade80' },
  ];
  if (d.Trend != null) {
    rows.push({ label: '4-Wochen-Ø', value: fmtTime(d.Trend * 60), color: '#facc15' });
  }
  return <ChartTooltip active={active} label={weekLabel} rows={rows} />;
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

function weekTotalMinutes(w: WeeklyVolume): number {
  return w.ride_minutes + w.workout_minutes + w.weight_training_minutes;
}

// Fasst langfristigen (Jahre) und kurzfristigen (12-Wochen) Trend + Fitness-Score
// zu einer Gesamteinschätzung zusammen – beantwortet "habe ich mich gesteigert?"
function buildTrendInsights(
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
          text: `Langfristig klar gesteigert: ${first} ${Math.round(firstKm)} km, ${last} bereits ${Math.round(lastKm)} km (+${diffPct}%).`,
          type: 'positive',
        });
      } else if (diffPct <= -15) {
        insights.push({
          text: `Langfristig rückläufig: ${first} noch ${Math.round(firstKm)} km, ${last} nur noch ${Math.round(lastKm)} km (${diffPct}%).`,
          type: 'warning',
        });
      } else {
        insights.push({
          text: `Langfristig auf ähnlichem Niveau: ${first} ${Math.round(firstKm)} km, ${last} ${Math.round(lastKm)} km.`,
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
        text: `Kurzfristig (letzte 12 Wochen) im Aufwärtstrend: Ø ${fmtTime(Math.round(avgLast) * 60)}/Woche, mehr als die 12 Wochen davor (${fmtTime(Math.round(avgPrev) * 60)}).`,
        type: 'positive',
      });
    } else if (diff <= -30) {
      insights.push({
        text: `Kurzfristig (letzte 12 Wochen) eher rückläufig: Ø ${fmtTime(Math.round(avgLast) * 60)}/Woche, weniger als die 12 Wochen davor (${fmtTime(Math.round(avgPrev) * 60)}).`,
        type: 'warning',
      });
    } else {
      insights.push({
        text: `Kurzfristig (letzte 12 Wochen) stabil bei Ø ${fmtTime(Math.round(avgLast) * 60)}/Woche.`,
        type: 'neutral',
      });
    }
  }

  // Fitness-Score als dritte, unabhängige Perspektive (CTL/Form/Effizienz/Kontinuität)
  if (fitness && fitness.score > 0) {
    if (fitness.trend === 'up') {
      insights.push({ text: `Fitness-Score bestätigt den Aufwärtstrend: aktuell ${fitness.score} Punkte (${fitness.level}).`, type: 'positive' });
    } else if (fitness.trend === 'down') {
      insights.push({ text: `Fitness-Score zeigt zuletzt eher abwärts: aktuell ${fitness.score} Punkte (${fitness.level}).`, type: 'warning' });
    } else {
      insights.push({ text: `Fitness-Score stabil bei ${fitness.score} Punkten (${fitness.level}).`, type: 'neutral' });
    }
  }

  return insights;
}

function FortschrittTab() {
  const [yearData, setYearData] = useState<YearData>({});
  const [monthlyAll, setMonthlyAll] = useState<MonthlyEntry[]>([]);
  const [weeklyData, setWeeklyData] = useState<WeeklyVolume[]>([]);
  const [fitness, setFitness] = useState<FitnessFingerprint | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const currentYear = String(new Date().getFullYear());
  const doy = todayDoy();

  useEffect(() => {
    Promise.all([api.yearProgress(), api.monthlyAll(), api.weeklyVolume(104), api.fitnessFingerprint()])
      .then(([progress, monthly, weekly, fit]) => {
        setYearData(progress.years);
        setMonthlyAll(monthly);
        setWeeklyData(weekly);
        setFitness(fit);
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

  const trendInsights = useMemo(
    () => buildTrendInsights(years, yearData, currentYear, weeklyData, fitness),
    [years, yearData, currentYear, weeklyData, fitness]
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
            <ResponsiveContainer width="100%" height={CHART_HEIGHT_DENSE}>
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
            <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
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
            <ResponsiveContainer width="100%" height={CHART_HEIGHT_DENSE}>
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

      {trendInsights.length > 0 && (
        <Card className="shadow-sm border">
          <CardHeader className="pb-1 border-b">
            <CardTitle className="text-base font-semibold">Trainingsentwicklung</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">Langfristig vs. kurzfristig – automatisch aus deinen Daten abgeleitet</p>
          </CardHeader>
          <CardContent className="pt-4">
            <ul className="space-y-2.5">
              {trendInsights.map((insight, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm">
                  <span className={`mt-0.5 shrink-0 font-bold leading-none ${
                    insight.type === 'positive' ? 'text-green-500' :
                    insight.type === 'warning'  ? 'text-orange-500' :
                    'text-muted-foreground'
                  }`}>
                    {insight.type === 'positive' ? '↑' : insight.type === 'warning' ? '↓' : '·'}
                  </span>
                  <span className="text-muted-foreground leading-snug">{insight.text}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
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
            <ResponsiveContainer width="100%" height={CHART_HEIGHT_DENSE}>
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
  const weekTotals = data.map(w => w.ride_minutes + w.workout_minutes + w.weight_training_minutes);
  const activeWeeks = weekTotals.filter(m => m > 0).length;
  const peakTotal = Math.max(...weekTotals, 0);
  const avgTotal = activeWeeks > 0 ? Math.round(weekTotals.reduce((s, m) => s + m, 0) / activeWeeks) : 0;
  return { totalRide, totalWorkout, totalWeight, activeWeeks, peakTotal, avgTotal, total: data.length };
}

// Rolling-Ø-Fenster für die Trendlinie über den Wochenbalken
const VOLUME_TREND_WEEKS = 4;

function buildVolumeInsights(
  chartData: { label: string; total: number }[],
  stats: ReturnType<typeof calcStats>
): Insight[] {
  const insights: Insight[] = [];

  if (stats.activeWeeks > 0) {
    insights.push({
      text: `Ø ${fmtTime(stats.avgTotal * 60)} Training pro aktiver Woche (${stats.activeWeeks} von ${stats.total} Wochen aktiv).`,
      type: 'neutral',
    });
  }

  if (chartData.length >= VOLUME_TREND_WEEKS * 2) {
    const last = chartData.slice(-VOLUME_TREND_WEEKS);
    const prev = chartData.slice(-VOLUME_TREND_WEEKS * 2, -VOLUME_TREND_WEEKS);
    const avgLast = last.reduce((s, w) => s + w.total, 0) / last.length;
    const avgPrev = prev.reduce((s, w) => s + w.total, 0) / prev.length;
    const diff = avgLast - avgPrev;
    if (diff >= 30) {
      insights.push({
        text: `Aufwärtstrend: ${fmtTime(Math.round(avgLast) * 60)} Ø/Woche in den letzten ${VOLUME_TREND_WEEKS} Wochen, mehr als die ${VOLUME_TREND_WEEKS} Wochen davor (${fmtTime(Math.round(avgPrev) * 60)}).`,
        type: 'positive',
      });
    } else if (diff <= -30) {
      insights.push({
        text: `Rückgang: ${fmtTime(Math.round(avgLast) * 60)} Ø/Woche in den letzten ${VOLUME_TREND_WEEKS} Wochen, weniger als davor (${fmtTime(Math.round(avgPrev) * 60)}).`,
        type: 'warning',
      });
    } else {
      insights.push({
        text: `Trainingsumfang der letzten ${VOLUME_TREND_WEEKS} Wochen ist stabil (Ø ${fmtTime(Math.round(avgLast) * 60)}/Woche).`,
        type: 'neutral',
      });
    }
  }

  if (chartData.length > 0) {
    const peak = chartData.reduce((a, b) => (b.total > a.total ? b : a));
    if (peak.total > 0) {
      insights.push({ text: `Stärkste Einzelwoche: ${peak.label} mit ${fmtTime(peak.total * 60)}.`, type: 'neutral' });
    }
  }

  if (stats.totalWorkout > 0 || stats.totalWeight > 0) {
    const totalAll = stats.totalRide + stats.totalWorkout + stats.totalWeight;
    const pctOther = totalAll > 0 ? Math.round(((stats.totalWorkout + stats.totalWeight) / totalAll) * 100) : 0;
    insights.push({ text: `Workouts & Krafttraining machen ${pctOther}% deiner erfassten Trainingszeit aus.`, type: 'neutral' });
  }

  return insights;
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
    // Rolling-Ø der letzten VOLUME_TREND_WEEKS Wochen (analog anderer Rolling-Average-Charts)
    return base.map((w, i) => {
      const window = base.slice(Math.max(0, i - (VOLUME_TREND_WEEKS - 1)), i + 1);
      const avg = window.reduce((s, x) => s + x.total, 0) / window.length;
      return { ...w, Trend: Math.round(avg) };
    });
  }, [viewData]);

  const stats = useMemo(() => calcStats(viewData), [viewData]);
  const insights = useMemo(() => buildVolumeInsights(chartData, stats), [chartData, stats]);
  const currentWeek = chartData.find(w => w.weeks_ago === 0);

  if (loading) return <div className="h-64 bg-muted animate-pulse rounded-xl" />;
  if (error) return <div className="rounded border border-destructive/50 bg-destructive/10 p-4 text-destructive text-sm">{error}</div>;

  const tiles = [
    { label: 'Rad gesamt', value: fmtTime(stats.totalRide * 60), color: '#fc4c02' },
    stats.totalWorkout > 0 ? { label: 'Workout gesamt', value: fmtTime(stats.totalWorkout * 60), color: '#60a5fa' } : null,
    stats.totalWeight > 0 ? { label: 'Kraft gesamt', value: fmtTime(stats.totalWeight * 60), color: '#4ade80' } : null,
    { label: 'Aktive Wochen', value: `${stats.activeWeeks} / ${stats.total}`, color: 'var(--foreground)' },
    { label: 'Beste Woche', value: fmtTime(stats.peakTotal * 60), color: 'var(--foreground)' },
    { label: 'Ø Woche (aktiv)', value: fmtTime(stats.avgTotal * 60), color: 'var(--foreground)' },
  ].filter((t): t is { label: string; value: string; color: string } => t !== null);

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button variant={showAll ? 'default' : 'outline'} size="sm" onClick={() => setShowAll(v => !v)}>
          {showAll ? 'Letzte 52 Wochen' : 'Alle Jahre'}
        </Button>
      </div>

      <Card className="shadow-sm border">
        <CardContent className="pt-4">
          <ResponsiveContainer width="100%" height={CHART_HEIGHT_DENSE}>
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
              <Tooltip content={<VolumenTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {currentWeek && (
                <ReferenceLine
                  x={currentWeek.week_start}
                  stroke="var(--foreground)"
                  strokeOpacity={0.4}
                  strokeDasharray="2 2"
                  label={{ value: 'Aktuell', position: 'top', fontSize: 10, fill: 'var(--muted-foreground)' }}
                />
              )}
              <Bar dataKey="Radfahren" stackId="a" fill="#fc4c02" fillOpacity={0.85} isAnimationActive={false} />
              <Bar dataKey="Workout" stackId="a" fill="#60a5fa" fillOpacity={0.85} isAnimationActive={false} />
              <Bar dataKey="Kraft" stackId="a" fill="#4ade80" fillOpacity={0.85} radius={[2, 2, 0, 0]} isAnimationActive={false} />
              <Line
                type="monotone"
                dataKey="Trend"
                name={`${VOLUME_TREND_WEEKS}-Wochen-Ø`}
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
        {tiles.map(t => (
          <Card key={t.label} className="shadow-sm border">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">{t.label}</p>
              <p className="text-2xl font-bold mt-1" style={{ color: t.color }}>{t.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {insights.length > 0 && (
        <Card className="shadow-sm border">
          <CardHeader className="pb-1 border-b">
            <CardTitle className="text-base font-semibold">Einschätzung</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">Automatisch aus deinen Daten abgeleitet</p>
          </CardHeader>
          <CardContent className="pt-4">
            <ul className="space-y-2.5">
              {insights.map((insight, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm">
                  <span className={`mt-0.5 shrink-0 font-bold leading-none ${
                    insight.type === 'positive' ? 'text-green-500' :
                    insight.type === 'warning'  ? 'text-orange-500' :
                    'text-muted-foreground'
                  }`}>
                    {insight.type === 'positive' ? '↑' : insight.type === 'warning' ? '↓' : '·'}
                  </span>
                  <span className="text-muted-foreground leading-snug">{insight.text}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Tageszeit Tab ────────────────────────────────────────────────────────────

const DAYS_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const DAYS_FULL  = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

// 3h-Blöcke statt 24 Einzelstunden – 56 statt 168 Zellen, deutlich lesbarer
const BLOCKS = [
  { label: 'Nacht',      sub: '00–03' },
  { label: 'Früh',       sub: '03–06' },
  { label: 'Morgen',     sub: '06–09' },
  { label: 'Vormittag',  sub: '09–12' },
  { label: 'Mittag',     sub: '12–15' },
  { label: 'Nachmittag', sub: '15–18' },
  { label: 'Abend',      sub: '18–21' },
  { label: 'Spätabend',  sub: '21–24' },
];
const BLOCK_HOURS = 3;

function blockClasses(minutes: number, maxMinutes: number): string {
  if (minutes === 0) return 'bg-muted text-muted-foreground';
  const t = minutes / maxMinutes;
  if (t <= 0.25) return 'bg-orange-200 text-orange-950';
  if (t <= 0.5)  return 'bg-orange-400 text-orange-950';
  if (t <= 0.75) return 'bg-orange-500 text-white';
  return                 'bg-primary text-primary-foreground';
}

interface BlockCell { rideCount: number; rideMinutes: number; workoutCount: number; workoutMinutes: number; }
interface TooltipState { x: number; y: number; wd: number; block: number; cell: BlockCell; }
type Insight = { text: string; type: 'positive' | 'neutral' | 'warning' };

function TageszeitTab() {
  const [cells, setCells] = useState<{
    weekday: number; hour: number;
    ride_count: number; ride_minutes: number;
    workout_count: number; workout_minutes: number;
  }[]>([]);
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

  // Stunden-Zellen zu 3h-Blöcken je Wochentag aggregieren, Rad + Workout getrennt gezählt
  const grid: BlockCell[][] = Array.from({ length: 7 }, () =>
    Array.from({ length: BLOCKS.length }, () => ({ rideCount: 0, rideMinutes: 0, workoutCount: 0, workoutMinutes: 0 }))
  );
  for (const c of cells) {
    const block = Math.floor(c.hour / BLOCK_HOURS);
    const g = grid[c.weekday][block];
    g.rideCount += c.ride_count;
    g.rideMinutes += c.ride_minutes;
    g.workoutCount += c.workout_count;
    g.workoutMinutes += c.workout_minutes;
  }

  const totalRideMinutes = cells.reduce((s, c) => s + c.ride_minutes, 0);
  const totalWorkoutMinutes = cells.reduce((s, c) => s + c.workout_minutes, 0);
  const totalMinutes = totalRideMinutes + totalWorkoutMinutes;
  const totalCount = cells.reduce((s, c) => s + c.ride_count + c.workout_count, 0);
  const maxCellMinutes = Math.max(1, ...grid.flat().map(c => c.rideMinutes + c.workoutMinutes));

  // Aktivste Kombination aus Wochentag + Zeitblock (nach Trainingszeit, nicht nur Anzahl)
  let peakWd = 0, peakBlock = 0, peakMinutes = 0;
  grid.forEach((row, wd) => row.forEach((c, b) => {
    const m = c.rideMinutes + c.workoutMinutes;
    if (m > peakMinutes) { peakMinutes = m; peakWd = wd; peakBlock = b; }
  }));

  // Dominanter Zeitblock getrennt für Werktage/Wochenende, für den Vergleich im Insight-Text
  function dominantBlock(weekdays: number[]): number | null {
    const sums = Array(BLOCKS.length).fill(0);
    for (const wd of weekdays) grid[wd].forEach((c, b) => { sums[b] += c.rideMinutes + c.workoutMinutes; });
    const max = Math.max(...sums);
    return max > 0 ? sums.indexOf(max) : null;
  }
  const weekdayBlock = dominantBlock([0, 1, 2, 3, 4]);
  const weekendBlock = dominantBlock([5, 6]);

  const insights: Insight[] = [];
  if (peakMinutes > 0) {
    insights.push({
      text: `Am liebsten trainierst du ${DAYS_FULL[peakWd].toLowerCase()}s ${BLOCKS[peakBlock].label.toLowerCase()} (${fmtTime(peakMinutes * 60)} insgesamt in diesem Slot).`,
      type: 'positive',
    });
  }
  if (weekdayBlock !== null && weekendBlock !== null) {
    if (weekdayBlock !== weekendBlock) {
      insights.push({
        text: `Unter der Woche liegt dein Schwerpunkt ${BLOCKS[weekdayBlock].label.toLowerCase()}, am Wochenende eher ${BLOCKS[weekendBlock].label.toLowerCase()}.`,
        type: 'neutral',
      });
    } else {
      insights.push({
        text: `Werktags wie am Wochenende trainierst du meist ${BLOCKS[weekdayBlock].label.toLowerCase()}.`,
        type: 'neutral',
      });
    }
  }
  if (totalMinutes > 0 && totalWorkoutMinutes > 0) {
    const pct = Math.round((totalWorkoutMinutes / totalMinutes) * 100);
    insights.push({ text: `Workouts machen ${pct}% deiner erfassten Trainingszeit aus, Radtouren ${100 - pct}%.`, type: 'neutral' });
  }

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
            {DAYS_FULL[tooltip.wd]} · {BLOCKS[tooltip.block].label} ({BLOCKS[tooltip.block].sub})
          </p>
          {tooltip.cell.rideCount === 0 && tooltip.cell.workoutCount === 0 ? (
            <p className="text-muted-foreground mt-0.5">Keine Aktivität</p>
          ) : (
            <>
              {tooltip.cell.rideCount > 0 && (
                <p className="text-primary mt-0.5">
                  {tooltip.cell.rideCount} {tooltip.cell.rideCount === 1 ? 'Ride' : 'Rides'} · {fmtTime(tooltip.cell.rideMinutes * 60)}
                </p>
              )}
              {tooltip.cell.workoutCount > 0 && (
                <p className="text-violet-400 mt-0.5">
                  {tooltip.cell.workoutCount} {tooltip.cell.workoutCount === 1 ? 'Workout' : 'Workouts'} · {fmtTime(tooltip.cell.workoutMinutes * 60)}
                </p>
              )}
            </>
          )}
        </div>
      )}

      {loading ? (
        <div className="h-40 animate-pulse rounded-xl bg-muted" />
      ) : cells.length > 0 ? (
        <>
          <div className="flex flex-wrap gap-2">
            {[
              { label: 'Trainingszeit gesamt', value: fmtTime(totalMinutes * 60) },
              { label: 'Aktivitäten', value: fmtNum(totalCount) },
              { label: 'Aktivste Zeit', value: `${DAYS_SHORT[peakWd]} · ${BLOCKS[peakBlock].label}` },
              { label: 'Rad / Workout', value: `${fmtNum(Math.round(totalRideMinutes / 60))}h / ${fmtNum(Math.round(totalWorkoutMinutes / 60))}h` },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-lg bg-muted/60 p-3 text-center min-w-[8rem]">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-0.5 text-lg font-bold text-primary">{value}</p>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto">
            <div
              className="inline-grid gap-1 min-w-max items-center"
              style={{ gridTemplateColumns: `3.5rem repeat(${BLOCKS.length}, 5rem)` }}
            >
              <div />
              {BLOCKS.map(b => (
                <div key={b.label} className="text-center pb-1">
                  <p className="text-[11px] font-medium text-muted-foreground leading-tight">{b.label}</p>
                  <p className="text-[9px] text-muted-foreground/70 leading-tight">{b.sub}</p>
                </div>
              ))}

              {DAYS_SHORT.map((day, wd) => (
                <Fragment key={day}>
                  <div className="text-xs text-muted-foreground text-right pr-2">{day}</div>
                  {BLOCKS.map((_, b) => {
                    const cell = grid[wd][b];
                    const minutes = cell.rideMinutes + cell.workoutMinutes;
                    return (
                      <div
                        key={b}
                        className={`h-10 rounded-md flex items-center justify-center text-[11px] font-semibold cursor-default transition-[filter] hover:brightness-110 ${blockClasses(minutes, maxCellMinutes)}`}
                        onMouseEnter={e => setTooltip({ x: e.pageX, y: e.pageY, wd, block: b, cell })}
                        onMouseLeave={() => setTooltip(null)}
                      >
                        {minutes > 0 ? fmtTime(minutes * 60) : ''}
                      </div>
                    );
                  })}
                </Fragment>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>Weniger Trainingszeit</span>
            <div className="h-3 w-3 rounded-sm bg-muted" />
            <div className="h-3 w-3 rounded-sm bg-orange-200" />
            <div className="h-3 w-3 rounded-sm bg-orange-400" />
            <div className="h-3 w-3 rounded-sm bg-orange-500" />
            <div className="h-3 w-3 rounded-sm bg-primary" />
            <span>Mehr</span>
          </div>

          {insights.length > 0 && (
            <Card className="shadow-sm border">
              <CardHeader className="pb-1 border-b">
                <CardTitle className="text-base font-semibold">Einschätzung</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">Automatisch aus deinen Daten abgeleitet</p>
              </CardHeader>
              <CardContent className="pt-4">
                <ul className="space-y-2.5">
                  {insights.map((insight, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm">
                      <span className={`mt-0.5 shrink-0 font-bold leading-none ${
                        insight.type === 'positive' ? 'text-green-500' :
                        insight.type === 'warning'  ? 'text-orange-500' :
                        'text-muted-foreground'
                      }`}>
                        {insight.type === 'positive' ? '↑' : insight.type === 'warning' ? '↓' : '·'}
                      </span>
                      <span className="text-muted-foreground leading-snug">{insight.text}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
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
