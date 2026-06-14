import { useEffect, useState, useMemo, lazy, Suspense } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  api,
  type FatigueData, type FatigueTrackData, type FatigueRideDetail, type FatigueRide,
  type RouteCluster, type Activity, type TrackPoint,
} from '@/lib/api';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartTooltip } from '@/components/ui/chart-tooltip';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, Cell, ResponsiveContainer, ComposedChart, Line,
} from 'recharts';
import { fmtDate } from '@/lib/format';

const LeafletMap = lazy(() => import('@/components/LeafletMap'));

// ---------------------------------------------------------------------------
// Shared helpers (Übersicht + Strecke)
// ---------------------------------------------------------------------------

function fatigueColor(v: number): string {
  if (v >= 10)  return '#3b82f6';
  if (v > 0)    return '#10b981';
  if (v > -5)   return '#22c55e';
  if (v > -10)  return '#f59e0b';
  if (v > -20)  return '#f97316';
  return '#ef4444';
}

function fatigueTextColor(v: number): string {
  if (v >= 10)  return 'text-blue-500';
  if (v > 0)    return 'text-emerald-500';
  if (v > -5)   return 'text-green-500';
  if (v > -10)  return 'text-amber-500';
  if (v > -20)  return 'text-orange-500';
  return 'text-red-500';
}

function fmtPct(v: number): string {
  return (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
}

function splitBarWidths(h1: number, h2: number): { w1: number; w2: number } {
  const total = h1 + h2;
  if (total === 0) return { w1: 50, w2: 50 };
  return { w1: Math.round((h1 / total) * 100), w2: Math.round((h2 / total) * 100) };
}

function fmtMonth(m: string): string {
  const names = ['Jan.', 'Feb.', 'Mär.', 'Apr.', 'Mai', 'Jun.', 'Jul.', 'Aug.', 'Sep.', 'Okt.', 'Nov.', 'Dez.'];
  const [year, month] = m.split('-');
  return `${names[parseInt(month) - 1]} ${year}`;
}

function buildHistoData(distribution: { bucket: number; count: number }[]) {
  const allBuckets: number[] = [];
  for (let b = -50; b <= 30; b += 5) allBuckets.push(b);
  const countMap = new Map(distribution.map(d => [d.bucket, d.count]));
  return allBuckets.map(bucket => ({
    bucket,
    label: `${bucket >= 0 ? '+' : ''}${bucket}%`,
    count: countMap.get(bucket) ?? 0,
    color: fatigueColor(bucket + 2.5),
  }));
}

// ---------------------------------------------------------------------------
// Shared components (Übersicht + Strecke)
// ---------------------------------------------------------------------------

function ExplanationCard() {
  return (
    <Card className="shadow-sm border bg-muted/30">
      <CardContent className="px-5 py-4 space-y-3">
        <p className="text-sm font-semibold">Was zeigt der Ermüdungsindex?</p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Jeder Ride wird an der Distanzmitte geteilt. Der Index misst, um wie viel Prozent sich deine
          Durchschnittsgeschwindigkeit von der ersten zur zweiten Hälfte verändert.
        </p>
        <p className="text-xs text-muted-foreground font-mono bg-muted rounded px-2 py-1 inline-block">
          Index = (Ø-Speed 2. Hälfte − Ø-Speed 1. Hälfte) ÷ Ø-Speed 1. Hälfte × 100
        </p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Beispiel: 1. Hälfte 28 km/h, 2. Hälfte 25 km/h →{' '}
          <span className="text-orange-500 font-semibold">−10,7 %</span> Ermüdung.
          Fährst du schneller, ist der Wert positiv — das bedeutet Steigerung und ist das beste Ergebnis.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
          {[
            { range: '> +10 %',      label: 'Starke Steigerung',          desc: 'H2 deutlich schneller',  color: 'text-blue-500',    bar: '#3b82f6' },
            { range: '0 – +10 %',    label: 'Steigerung / Ausgeglichen',  desc: 'H2 schneller oder gleich', color: 'text-emerald-500', bar: '#10b981' },
            { range: '−5 – 0 %',     label: 'Fast ausgeglichen',          desc: 'Kaum Unterschied',         color: 'text-green-500',   bar: '#22c55e' },
            { range: '−10 – −5 %',   label: 'Leichte Ermüdung',           desc: 'Noch im grünen Bereich',   color: 'text-amber-500',   bar: '#f59e0b' },
            { range: '−20 – −10 %',  label: 'Mittlere Ermüdung',          desc: 'Deutlicher Einbruch',      color: 'text-orange-500',  bar: '#f97316' },
            { range: '< −20 %',      label: 'Starke Ermüdung',            desc: 'Massiver Einbruch H2',     color: 'text-red-500',     bar: '#ef4444' },
          ].map(({ range, label, desc, color, bar }) => (
            <div key={range} className="flex items-start gap-2">
              <div className="w-1 h-full min-h-[36px] rounded-full shrink-0 mt-0.5" style={{ background: bar }} />
              <div>
                <p className={`text-[11px] font-semibold ${color}`}>{range}</p>
                <p className="text-[10px] text-foreground">{label}</p>
                <p className="text-[10px] text-muted-foreground">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

interface CommonFatigueData {
  stats: { rides_analyzed: number; avg_fatigue_pct: number | null; steigerung_count: number };
  best_steigerung: FatigueRideDetail | null;
  worst_ermuedung: FatigueRideDetail | null;
}

function HistoTooltip({ active, payload }: { active?: boolean; payload?: any[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  const b: number = d?.bucket ?? 0;
  const rangeLabel = `${b >= 0 ? '+' : ''}${b}% bis ${b + 5 >= 0 ? '+' : ''}${b + 5}%`;
  return (
    <ChartTooltip
      active={active}
      label={rangeLabel}
      rows={[
        { label: 'Rides', value: `${d?.count} Ride${d?.count !== 1 ? 's' : ''}` },
      ]}
    />
  );
}

function HistoChart({ distribution, avgFatigue }: { distribution: { bucket: number; count: number }[]; avgFatigue: number | null }) {
  const histoData = useMemo(() => buildHistoData(distribution), [distribution]);
  return (
    <Card className="shadow-sm border overflow-hidden">
      <CardHeader className="pb-1 border-b">
        <CardTitle className="text-base font-semibold">Verteilung des Ermüdungsindex</CardTitle>
        <p className="text-xs text-muted-foreground mt-0.5">Rides je Ermüdungs-Bucket (5%-Schritte) — grün/blau = Steigerung, amber/rot = Ermüdung</p>
      </CardHeader>
      <CardContent className="pt-4">
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={histoData} margin={{ top: 8, right: 16, bottom: 24, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 9 }} interval={1} angle={-45} textAnchor="end" height={40} />
            <YAxis tick={{ fontSize: 11 }} width={32} allowDecimals={false} />
            <Tooltip content={<HistoTooltip />} />
            <ReferenceLine x="0%" stroke="hsl(var(--foreground))" strokeDasharray="6 4" strokeOpacity={0.6}
              label={{ value: 'Ausgeglichenes Pacing (0 %)', fontSize: 9, fill: 'hsl(var(--foreground))', position: 'insideTopRight' }} />
            {avgFatigue !== null && (
              <ReferenceLine
                x={`${avgFatigue >= 0 ? '+' : ''}${Math.round(avgFatigue / 5) * 5}%`}
                stroke="#f97316" strokeDasharray="4 3" strokeOpacity={0.8}
                label={{ value: `Ø ${fmtPct(avgFatigue)}`, fontSize: 9, fill: '#f97316', position: 'insideBottomRight' }}
              />
            )}
            <Bar dataKey="count" name="Rides" radius={[2, 2, 0, 0]} isAnimationActive={false}>
              {histoData.map((entry, i) => <Cell key={i} fill={entry.color} fillOpacity={0.85} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="flex justify-between text-[10px] text-muted-foreground px-8 mt-1">
          <span>← Ermüdung (langsamer in H2)</span>
          <span>Steigerung (schneller) →</span>
        </div>
      </CardContent>
    </Card>
  );
}

function BestWorstDetailCards({ data }: { data: { best_steigerung: FatigueRideDetail | null; worst_ermuedung: FatigueRideDetail | null } }) {
  if (!data.worst_ermuedung) return null;
  return (
    <div className="grid sm:grid-cols-2 gap-4">
      {data.best_steigerung && (() => {
        const bn = data.best_steigerung!;
        const w = splitBarWidths(bn.spd_h1_kmh, bn.spd_h2_kmh);
        return (
          <Card className="shadow-sm" style={{ borderColor: 'rgba(59,130,246,0.25)', background: 'rgba(59,130,246,0.05)' }}>
            <CardContent className="px-5 py-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs text-blue-500 uppercase tracking-wide font-medium">Beste Steigerung</p>
                  <p className="text-sm font-semibold truncate mt-0.5">{bn.activity_name}</p>
                  <p className="text-xs text-muted-foreground">{fmtDate(bn.date)} · {bn.dist_km} km</p>
                </div>
                <span className="shrink-0 text-lg font-bold text-blue-500 tabular-nums">{fmtPct(bn.fatigue_pct)}</span>
              </div>
              <div className="space-y-2">
                {[{ label: '1. Hälfte', kmh: bn.spd_h1_kmh, w: w.w1, bg: '#6366f1', cls: 'text-foreground' },
                  { label: '2. Hälfte', kmh: bn.spd_h2_kmh, w: w.w2, bg: '#3b82f6', cls: 'text-blue-400' }].map(row => (
                  <div key={row.label}>
                    <div className="flex justify-between text-[10px] text-muted-foreground mb-0.5">
                      <span>{row.label}</span>
                      <span className={`font-semibold ${row.cls}`}>{row.kmh} km/h</span>
                    </div>
                    <div className="h-3 bg-muted rounded overflow-hidden">
                      <div className="h-full rounded transition-all" style={{ width: `${row.w}%`, background: row.bg }} />
                    </div>
                  </div>
                ))}
              </div>
              <Link to={`/activities/${bn.activity_id}`} className="inline-flex items-center gap-1 text-xs text-blue-500 hover:text-blue-400 transition-colors">
                Zur Aktivität →
              </Link>
            </CardContent>
          </Card>
        );
      })()}

      {(() => {
        const wf = data.worst_ermuedung!;
        const w = splitBarWidths(wf.spd_h1_kmh, wf.spd_h2_kmh);
        return (
          <Card className="shadow-sm" style={{ borderColor: 'rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.05)' }}>
            <CardContent className="px-5 py-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs text-red-500 uppercase tracking-wide font-medium">Größte Ermüdung</p>
                  <p className="text-sm font-semibold truncate mt-0.5">{wf.activity_name}</p>
                  <p className="text-xs text-muted-foreground">{fmtDate(wf.date)} · {wf.dist_km} km</p>
                </div>
                <span className="shrink-0 text-lg font-bold text-red-500 tabular-nums">{wf.fatigue_pct.toFixed(1)}%</span>
              </div>
              <div className="space-y-2">
                {[{ label: '1. Hälfte', kmh: wf.spd_h1_kmh, w: w.w1, bg: '#f97316', cls: 'text-orange-400' },
                  { label: '2. Hälfte', kmh: wf.spd_h2_kmh, w: w.w2, bg: '#ef4444', cls: 'text-red-400' }].map(row => (
                  <div key={row.label}>
                    <div className="flex justify-between text-[10px] text-muted-foreground mb-0.5">
                      <span>{row.label}</span>
                      <span className={`font-semibold ${row.cls}`}>{row.kmh} km/h</span>
                    </div>
                    <div className="h-3 bg-muted rounded overflow-hidden">
                      <div className="h-full rounded transition-all" style={{ width: `${row.w}%`, background: row.bg }} />
                    </div>
                  </div>
                ))}
              </div>
              <Link to={`/activities/${wf.activity_id}`} className="inline-flex items-center gap-1 text-xs text-red-500 hover:text-red-400 transition-colors">
                Zur Aktivität →
              </Link>
            </CardContent>
          </Card>
        );
      })()}
    </div>
  );
}

function RideTable({ rides, title, subtitle }: { rides: FatigueRide[]; title: string; subtitle?: string }) {
  if (!rides.length) return null;
  return (
    <Card className="shadow-sm border overflow-hidden">
      <CardHeader className="pb-1 border-b">
        <CardTitle className="text-base font-semibold">{title}</CardTitle>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </CardHeader>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-muted-foreground uppercase tracking-wide border-b">
              <th className="px-4 py-2 font-medium">Datum</th>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium text-right">Dist.</th>
              <th className="px-4 py-2 font-medium text-right">1. Hälfte</th>
              <th className="px-4 py-2 font-medium text-right">2. Hälfte</th>
              <th className="px-4 py-2 font-medium">Index</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {rides.map(ride => {
              const v = ride.fatigue_pct;
              const barPct = Math.min(Math.abs(v) / 30 * 100, 100);
              return (
                <tr key={ride.activity_id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">{fmtDate(ride.date)}</td>
                  <td className="px-4 py-2 max-w-[200px]">
                    <Link to={`/activities/${ride.activity_id}`} className="text-foreground hover:text-[#fc4c02] transition-colors truncate block">
                      {ride.activity_name}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-right text-muted-foreground">{ride.dist_km} km</td>
                  <td className="px-4 py-2 text-right text-muted-foreground">{ride.spd_h1_kmh}</td>
                  <td className="px-4 py-2 text-right text-muted-foreground">{ride.spd_h2_kmh}</td>
                  <td className="px-4 py-2 min-w-[120px]">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-muted rounded overflow-hidden">
                        <div className="h-full rounded" style={{ width: `${barPct}%`, background: fatigueColor(v) }} />
                      </div>
                      <span className={`shrink-0 font-semibold tabular-nums ${fatigueTextColor(v)}`}>{fmtPct(v)}</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Custom Tooltips
// ---------------------------------------------------------------------------

function MonthTooltip({ active, payload, label }: { active?: boolean; payload?: { dataKey: string; value: number | null; payload: { rides: number; neg_split_pct: number; avg: number } }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const bar  = payload.find(p => p.dataKey === 'avg');
  const line = payload.find(p => p.dataKey === 'rollingAvg');
  if (!bar || bar.value == null) return null;
  const d = bar.payload;
  return (
    <div className="bg-background border border-border rounded-lg px-3 py-2.5 text-xs shadow-md space-y-1.5 min-w-[160px]">
      <p className="font-semibold text-foreground border-b border-border pb-1.5 mb-1">{label}</p>
      <div className="flex justify-between gap-4">
        <span className="text-muted-foreground">Ø Ermüdung</span>
        <span className={`font-bold ${fatigueTextColor(bar.value)}`}>{fmtPct(bar.value)}</span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-muted-foreground">Rides</span>
        <span className="font-medium text-foreground">{d.rides}</span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-muted-foreground">Steigerungen</span>
        <span className="font-medium text-foreground">{d.neg_split_pct.toFixed(0)} %</span>
      </div>
      {line?.value != null && (
        <div className="flex justify-between gap-4 border-t border-border pt-1.5 mt-0.5">
          <span className="text-muted-foreground">3-Monats-Ø</span>
          <span className="font-medium" style={{ color: '#a78bfa' }}>{fmtPct(line.value)}</span>
        </div>
      )}
    </div>
  );
}

function WeatherTooltip({ active, payload }: { active?: boolean; payload?: { payload: WeatherBucket }[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d || d.avg === null) return null;
  return (
    <div className="bg-background border border-border rounded-lg px-3 py-2.5 text-xs shadow-md space-y-1.5 min-w-[140px]">
      <p className="font-semibold text-foreground border-b border-border pb-1.5 mb-1">{d.label.replace('\n', ' ')}</p>
      <div className="flex justify-between gap-4">
        <span className="text-muted-foreground">Ø Ermüdung</span>
        <span className={`font-bold ${fatigueTextColor(d.avg)}`}>{fmtPct(d.avg)}</span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-muted-foreground">Rides</span>
        <span className="font-medium text-foreground">{d.rides}</span>
      </div>
    </div>
  );
}

function TrackTrendTooltip({ active, payload }: { active?: boolean; payload?: any[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  return (
    <ChartTooltip
      active={active}
      label={d?.label}
      rows={[
        { label: 'Ermüdungsindex', value: fmtPct(Number(d?.avg)), className: fatigueTextColor(Number(d?.avg)) },
      ]}
    />
  );
}

function PacingTooltip({ active, payload }: { active?: boolean; payload?: any[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  const dev: number = d?.deviation_pct ?? 0;
  return (
    <ChartTooltip
      active={active}
      label={d?.label}
      rows={[
        { label: 'Ø Geschwindigkeit', value: `${d?.avg_kmh} km/h` },
        { label: 'vs. Start', value: `${dev >= 0 ? '+' : ''}${dev.toFixed(1)}%` },
      ]}
    />
  );
}

// ---------------------------------------------------------------------------
// Wind / Pearson helpers (nur noch intern im TrendTab genutzt)
// ---------------------------------------------------------------------------

function pearsonR(pairs: { x: number; y: number }[]): number | null {
  const n = pairs.length;
  if (n < 3) return null;
  const mx = pairs.reduce((s, p) => s + p.x, 0) / n;
  const my = pairs.reduce((s, p) => s + p.y, 0) / n;
  const num = pairs.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0);
  const den = Math.sqrt(
    pairs.reduce((s, p) => s + (p.x - mx) ** 2, 0) *
    pairs.reduce((s, p) => s + (p.y - my) ** 2, 0),
  );
  return den === 0 ? null : num / den;
}

// ---------------------------------------------------------------------------
// Tab: Trend (ehemals Übersicht)
// ---------------------------------------------------------------------------

// Wetter-Kategorien
const TEMP_CATS = [
  { label: '< 5°C',   min: -Infinity, max: 5,        color: '#60a5fa' },
  { label: '5–15°C',  min: 5,         max: 15,       color: '#10b981' },
  { label: '15–25°C', min: 15,        max: 25,       color: '#f59e0b' },
  { label: '> 25°C',  min: 25,        max: Infinity,  color: '#ef4444' },
];

const WIND_CATS = [
  { label: 'Starker\nRW',   min: -Infinity, max: -4,       color: '#3b82f6' },
  { label: 'Leichter\nRW',  min: -4,        max: -1,       color: '#10b981' },
  { label: 'Neutral',        min: -1,        max: 1,        color: '#94a3b8' },
  { label: 'Leichter\nGW',  min: 1,         max: 4,        color: '#f59e0b' },
  { label: 'Starker\nGW',   min: 4,         max: Infinity,  color: '#ef4444' },
];

const PRECIP_CATS = [
  { label: 'Trocken\n(0 mm)',   min: -0.001, max: 0.1,      color: '#60a5fa' },
  { label: 'Leichter\nRegen',   min: 0.1,    max: 3,        color: '#f59e0b' },
  { label: 'Starker\nRegen',    min: 3,      max: Infinity,  color: '#94a3b8' },
];

interface WeatherBucket { label: string; avg: number | null; rides: number; color: string }

function buildWeatherBuckets<T extends { label: string; min: number; max: number; color: string }>(
  rides: FatigueRide[],
  cats: T[],
  getValue: (r: FatigueRide) => number | null,
): WeatherBucket[] {
  const withData = rides.filter(r => getValue(r) !== null);
  return cats.map(cat => {
    const bucket = withData.filter(r => {
      const v = getValue(r) as number;
      return v >= cat.min && v < cat.max;
    });
    const avg = bucket.length > 0
      ? parseFloat((bucket.reduce((s, r) => s + r.fatigue_pct, 0) / bucket.length).toFixed(1))
      : null;
    return { label: cat.label, avg, rides: bucket.length, color: cat.color };
  });
}

function SmallBarChart({
  data, title, subtitle, extraSubtitle,
}: {
  data: WeatherBucket[];
  title: string;
  subtitle: string;
  extraSubtitle?: string;
}) {
  const withData = data.filter(d => d.avg !== null);
  if (withData.length < 2) return null;

  return (
    <Card className="shadow-sm border overflow-hidden">
      <CardHeader className="pb-1 border-b">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
        <p className="text-xs text-muted-foreground">
          {subtitle}
          {extraSubtitle && <span className="ml-1 font-medium text-foreground">{extraSubtitle}</span>}
        </p>
      </CardHeader>
      <CardContent className="pt-3 pb-3">
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={data} margin={{ top: 6, right: 12, bottom: 16, left: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 9, whiteSpace: 'pre-wrap' }}
              interval={0}
              height={36}
            />
            <YAxis
              tickFormatter={v => `${v >= 0 ? '+' : ''}${v}%`}
              tick={{ fontSize: 9 }}
              width={44}
            />
            <Tooltip content={<WeatherTooltip />} />
            <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} />
            <Bar dataKey="avg" name="Ø Ermüdung" radius={[3, 3, 0, 0]} isAnimationActive={false}>
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.color} fillOpacity={entry.avg !== null ? 0.8 : 0.25} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// Jahresvergleich aus monthly-Daten berechnen
function computeYearTrend(monthly: FatigueData['monthly'], filterYear: string | null): { arrow: string; label: string; cls: string } | null {
  if (filterYear !== null) return null;
  if (monthly.length < 2) return null;

  const byYear = new Map<string, number[]>();
  for (const m of monthly) {
    const y = m.month.slice(0, 4);
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y)!.push(m.avg_fatigue_pct);
  }
  const years = Array.from(byYear.keys()).sort();
  if (years.length < 2) return null;

  const thisYear = years[years.length - 1];
  const prevYear = years[years.length - 2];
  const avgThis = byYear.get(thisYear)!.reduce((a, b) => a + b, 0) / byYear.get(thisYear)!.length;
  const avgPrev = byYear.get(prevYear)!.reduce((a, b) => a + b, 0) / byYear.get(prevYear)!.length;
  const diff = avgThis - avgPrev;

  if (diff > 0) {
    return { arrow: '↑', label: `+${diff.toFixed(1)}% vs. ${prevYear}`, cls: 'text-emerald-500' };
  }
  return { arrow: '↓', label: `${diff.toFixed(1)}% vs. ${prevYear}`, cls: 'text-orange-500' };
}

function TrendTab() {
  const [data, setData]                     = useState<FatigueData | null>(null);
  const [loading, setLoading]               = useState(true);
  const [error, setError]                   = useState<string | null>(null);
  const [availableYears, setAvailableYears] = useState<string[]>([]);
  const [filterYear, setFilterYear]         = useState<string | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);

  useEffect(() => {
    api.activityStats()
      .then(s => setAvailableYears(s.available_years.filter(y => Number(y) >= 2000)))
      .catch(() => {});
    api.fatigueIndex()
      .then(setData)
      .catch(e => setError(e instanceof Error ? e.message : 'Fehler beim Laden'))
      .finally(() => setLoading(false));
  }, []);

  async function reload(year?: string | null) {
    setLoading(true); setError(null);
    try { setData(await api.fatigueIndex(year ? Number(year) : undefined)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Fehler beim Laden'); }
    finally { setLoading(false); }
  }

  function handleYearChange(year: string | null) {
    const y = year === 'all' ? null : year;
    setFilterYear(y);
    reload(y);
  }

  // Monatsdaten mit Rolling-Average
  const monthData = useMemo(() => {
    const base = data?.monthly?.map(m => ({
      month: m.month.slice(0, 7),
      avg: m.avg_fatigue_pct,
      rides: m.rides,
      neg_split_pct: m.neg_split_pct,
      color: m.avg_fatigue_pct > 0 ? '#3b82f6' : m.avg_fatigue_pct > -10 ? '#f59e0b' : '#ef4444',
    })) ?? [];
    return base.map((entry, i, arr) => ({
      ...entry,
      rollingAvg: i >= 2 ? (arr[i].avg + arr[i - 1].avg + arr[i - 2].avg) / 3 : null,
    }));
  }, [data]);

  // Jahresvergleichs-Delta
  const yearTrend = useMemo(
    () => (data ? computeYearTrend(data.monthly, filterYear) : null),
    [data, filterYear],
  );

  // Wetter-Buckets
  const tempBuckets  = useMemo(() => data ? buildWeatherBuckets(data.rides, TEMP_CATS,  r => r.weather_temp_c) : [], [data]);
  const windBuckets  = useMemo(() => data ? buildWeatherBuckets(data.rides, WIND_CATS,  r => r.headwind_ms)    : [], [data]);
  const precipBuckets = useMemo(() => data ? buildWeatherBuckets(data.rides, PRECIP_CATS, r => r.weather_precip_mm) : [], [data]);

  const windR = useMemo(() => {
    if (!data) return null;
    return pearsonR(data.rides.filter(r => r.headwind_ms !== null).map(r => ({ x: r.headwind_ms as number, y: r.fatigue_pct })));
  }, [data]);

  // Wetter-Block nur anzeigen wenn ≥ 2 von 3 Kategorien mindestens 3 Rides mit Daten haben
  const showWeather = useMemo(() => {
    const hasTemp   = tempBuckets.filter(b => b.rides >= 3).length > 0;
    const hasWind   = windBuckets.filter(b => b.rides >= 3).length > 0;
    const hasPrecip = precipBuckets.filter(b => b.rides >= 3).length > 0;
    return [hasTemp, hasWind, hasPrecip].filter(Boolean).length >= 2;
  }, [tempBuckets, windBuckets, precipBuckets]);

  const windRLabel = windR !== null
    ? `r = ${windR.toFixed(2)}`
    : undefined;

  // XAxis interval dynamisch
  const xAxisInterval = useMemo(
    () => monthData.length > 24 ? Math.floor(monthData.length / 12) : 2,
    [monthData.length],
  );

  if (loading) return (
    <div className="space-y-4 mt-4">
      <div className="grid grid-cols-3 gap-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-28 bg-muted animate-pulse rounded-xl" />)}</div>
      <div className="h-72 bg-muted animate-pulse rounded-xl" />
    </div>
  );
  if (error) return <div className="mt-4 rounded border border-destructive/50 bg-destructive/10 p-4 text-destructive text-sm">{error}</div>;
  if (!data || data.stats.rides_analyzed === 0) return (
    <div className="space-y-4 mt-4">
      <div className="flex flex-wrap gap-1.5">
        <button onClick={() => handleYearChange(null)} className={`px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors ${!filterYear ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>Alle</button>
        {availableYears.map(y => (
          <button key={y} onClick={() => handleYearChange(y)} className={`px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors ${filterYear === y ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>{y}</button>
        ))}
      </div>
      <div className="rounded-xl border bg-card px-6 py-10 text-center text-muted-foreground text-sm">
        Keine auswertbaren Rides gefunden.{filterYear && ` Für ${filterYear} liegen keine Tracks mit ausreichend Datenpunkten vor.`}
      </div>
    </div>
  );

  const avg = data.stats.avg_fatigue_pct;
  const steigerungPct = data.stats.rides_analyzed > 0
    ? Math.round(data.stats.steigerung_count / data.stats.rides_analyzed * 100)
    : 0;

  return (
    <div className="space-y-4 mt-4">
      {/* 1. Jahresfilter */}
      <div className="flex flex-wrap gap-1.5">
        <button onClick={() => handleYearChange(null)} className={`px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors ${!filterYear ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>Alle</button>
        {availableYears.map(y => (
          <button key={y} onClick={() => handleYearChange(y)} className={`px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors ${filterYear === y ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>{y}</button>
        ))}
      </div>

      {/* 2. Hero-Row */}
      <div className="grid grid-cols-3 gap-3">
        {/* Card 1: Ø Ermüdung */}
        <Card className="shadow-sm border">
          <CardContent className="px-4 py-3 space-y-1">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Ø Ermüdung</p>
            {avg !== null ? (
              <>
                <p className={`text-2xl font-bold ${fatigueTextColor(avg)}`}>{fmtPct(avg)}</p>
                {yearTrend ? (
                  <p className={`text-[10px] font-medium ${yearTrend.cls}`}>{yearTrend.arrow} {yearTrend.label}</p>
                ) : (
                  <p className="text-[10px] text-muted-foreground">
                    {avg > 0 ? 'Im Schnitt Steigerung' : avg > -5 ? 'Fast kein Ermüdungseffekt' : 'Durchschnittliche Ermüdung'}
                  </p>
                )}
              </>
            ) : (
              <p className="text-2xl font-bold text-muted-foreground">–</p>
            )}
          </CardContent>
        </Card>

        {/* Card 2: Steigerungen */}
        <Card className="shadow-sm border">
          <CardContent className="px-4 py-3 space-y-1">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Steigerungen</p>
            <p className="text-2xl font-bold text-blue-500">{data.stats.steigerung_count}</p>
            <p className="text-[10px] text-muted-foreground">{steigerungPct}% aller Rides</p>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-1">
              <div
                className="h-full bg-blue-500 rounded-full transition-all"
                style={{ width: `${steigerungPct}%` }}
              />
            </div>
          </CardContent>
        </Card>

        {/* Card 3: Analysierte Rides */}
        <Card className="shadow-sm border">
          <CardContent className="px-4 py-3 space-y-1">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Analysierte Rides</p>
            <p className="text-2xl font-bold">{data.stats.rides_analyzed}</p>
            <p className="text-[10px] text-muted-foreground">mit GPS-Track</p>
          </CardContent>
        </Card>
      </div>

      {/* 3. Monatlicher Trend (prominent) */}
      {monthData.length > 0 && (
        <Card className="shadow-sm border overflow-hidden">
          <CardHeader className="pb-1 border-b">
            <CardTitle className="text-base font-semibold">Monatlicher Trend</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Ø Ermüdungsindex je Monat — blau = Steigerung, amber/rot = Ermüdung ·
              <span className="ml-1" style={{ color: '#a78bfa' }}>gestrichelt = 3-Monats-Ø</span>
            </p>
          </CardHeader>
          <CardContent className="pt-4">
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={monthData} margin={{ top: 8, right: 16, bottom: 24, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 9 }}
                  interval={xAxisInterval}
                  angle={-45}
                  textAnchor="end"
                  height={40}
                />
                <YAxis tickFormatter={v => `${v >= 0 ? '+' : ''}${v}%`} tick={{ fontSize: 10 }} width={48} />
                <Tooltip content={<MonthTooltip />} />
                <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} />
                {/* Jahres-Trennlinien */}
                {monthData
                  .filter(m => m.month.slice(5, 7) === '01')
                  .map(m => (
                    <ReferenceLine
                      key={m.month}
                      x={m.month}
                      stroke="hsl(var(--border))"
                      strokeDasharray="4 3"
                      strokeOpacity={0.7}
                      label={{ value: m.month.slice(0, 4), fontSize: 9, fill: 'hsl(var(--muted-foreground))', position: 'insideTopLeft' }}
                    />
                  ))}
                <Bar dataKey="avg" name="Ø Ermüdung" radius={[2, 2, 0, 0]} isAnimationActive={false}>
                  {monthData.map((entry, i) => <Cell key={i} fill={entry.color} fillOpacity={0.8} />)}
                </Bar>
                <Line
                  type="monotone"
                  dataKey="rollingAvg"
                  stroke="#a78bfa"
                  strokeWidth={2}
                  strokeDasharray="6 3"
                  dot={false}
                  isAnimationActive={false}
                  connectNulls={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* 4. Wetter-Korrelation */}
      {showWeather && (
        <div className="space-y-2">
          <p className="text-sm font-semibold px-0.5">Wetter & Pacing</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <SmallBarChart
              data={tempBuckets}
              title="Temperatur"
              subtitle="Ø Ermüdung nach Temperatur"
            />
            <SmallBarChart
              data={windBuckets}
              title="Gegenwind"
              subtitle="Ø Ermüdung nach Gegenwind"
              extraSubtitle={windRLabel ? `· ${windRLabel}` : undefined}
            />
            <SmallBarChart
              data={precipBuckets}
              title="Niederschlag"
              subtitle="Ø Ermüdung nach Niederschlag"
            />
          </div>
        </div>
      )}

      {/* 5. Verteilung */}
      {data.distribution?.length > 0 && (
        <HistoChart distribution={data.distribution} avgFatigue={data.stats.avg_fatigue_pct} />
      )}

      {/* 6. Beste / Schlechteste Rides */}
      <BestWorstDetailCards data={data} />

      {/* 7. Distanz-Analyse (kompakt) */}
      {data.by_distance.length > 0 && (
        <Card className="shadow-sm border">
          <CardHeader className="pb-1 border-b">
            <CardTitle className="text-base font-semibold">Nach Distanz</CardTitle>
          </CardHeader>
          <div className="grid grid-cols-4 divide-x divide-border">
            {data.by_distance.map(bucket => (
              <div key={bucket.label} className="px-4 py-3 text-center space-y-0.5">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{bucket.label}</p>
                {bucket.avg_fatigue_pct !== null
                  ? <p className={`text-xl font-bold ${fatigueTextColor(bucket.avg_fatigue_pct)}`}>{fmtPct(bucket.avg_fatigue_pct)}</p>
                  : <p className="text-xl font-bold text-muted-foreground">–</p>}
                <p className="text-[10px] text-muted-foreground">{bucket.rides} Rides</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* 8. Ride-Tabelle */}
      <RideTable rides={data.rides.slice(0, 30)} title="Letzte Rides" subtitle="Sortiert nach Datum — neueste zuerst" />

      {/* 9. Erklärungsbox (ausklappbar) */}
      <div>
        <button
          onClick={() => setShowExplanation(v => !v)}
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
        >
          <span>{showExplanation ? '▾' : '▸'}</span>
          Wie wird der Ermüdungsindex berechnet?
        </button>
        {showExplanation && <div className="mt-3"><ExplanationCard /></div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Strecke
// ---------------------------------------------------------------------------

function fmtClusterLabel(c: RouteCluster, idx: number): string {
  return `Strecke ${idx + 1}: ~${(c.avg_distance_m / 1000).toFixed(0)} km · ${c.ride_count} Rides`;
}

function fmtShortDate(dateStr: string): string {
  const d = new Date(dateStr.includes('T') ? dateStr + 'Z' : dateStr + 'T00:00:00Z');
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: '2-digit' });
}

function TrackTab() {
  const [clusters, setClusters]               = useState<RouteCluster[]>([]);
  const [selectedIdx, setSelectedIdx]         = useState<number | null>(null);
  const [data, setData]                       = useState<FatigueTrackData | null>(null);
  const [loading, setLoading]                 = useState(false);
  const [loadingClusters, setLoadingClusters] = useState(true);
  const [error, setError]                     = useState<string | null>(null);
  const [allTracks, setAllTracks]             = useState<TrackPoint[][] | null>(null);

  useEffect(() => {
    api.routeClusters(3)
      .then(r => setClusters(r.clusters))
      .catch(() => {})
      .finally(() => setLoadingClusters(false));
  }, []);

  async function loadTrack(idx: number) {
    const cluster = clusters[idx];
    if (!cluster) return;
    setLoading(true); setError(null); setData(null); setAllTracks(null);
    const ids = cluster.rides.map(r => r.id);
    try {
      const result = await api.fatigueIndexTrack(ids);
      setData(result);
      const trackResults = await Promise.allSettled(ids.map(id => api.activityTrack(id, 20)));
      const tracks = trackResults
        .filter((r): r is PromiseFulfilledResult<{ points: TrackPoint[] }> => r.status === 'fulfilled')
        .map(r => r.value.points);
      setAllTracks(tracks.length > 0 ? tracks : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler beim Laden');
    } finally {
      setLoading(false);
    }
  }

  function handleClusterChange(val: string | null) {
    if (!val || val === 'none') return;
    const idx = parseInt(val, 10);
    setSelectedIdx(idx);
    loadTrack(idx);
  }

  const trendData = useMemo(() =>
    data?.rides?.map((r, i) => ({
      idx: i + 1, label: fmtShortDate(r.date), avg: r.fatigue_pct,
      color: fatigueColor(r.fatigue_pct), activity_id: r.activity_id,
    })) ?? [], [data]);

  const selectedCluster = selectedIdx !== null ? clusters[selectedIdx] : null;
  const selectLabel = selectedIdx !== null && selectedCluster
    ? fmtClusterLabel(selectedCluster, selectedIdx)
    : 'Strecke wählen…';
  const avgFatigue = data?.stats.avg_fatigue_pct ?? null;

  return (
    <div className="space-y-4 mt-4">
      <Card className="shadow-sm border">
        <CardContent className="px-5 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <p className="text-sm font-medium shrink-0">Strecke auswählen</p>
            {loadingClusters ? (
              <div className="h-9 w-64 bg-muted animate-pulse rounded-md" />
            ) : clusters.length === 0 ? (
              <p className="text-sm text-muted-foreground">Keine Strecken-Cluster gefunden (min. 3 Rides nötig).</p>
            ) : (
              <Select value={selectedIdx !== null ? String(selectedIdx) : 'none'} onValueChange={handleClusterChange}>
                <SelectTrigger className="w-72 text-sm"><SelectValue>{selectLabel}</SelectValue></SelectTrigger>
                <SelectContent>
                  {clusters.map((c, i) => <SelectItem key={i} value={String(i)}>{fmtClusterLabel(c, i)}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            {selectedCluster && <p className="text-xs text-muted-foreground">Zuletzt gefahren: {fmtDate(selectedCluster.last_ridden)}</p>}
          </div>
        </CardContent>
      </Card>

      {!selectedIdx && selectedIdx !== 0 && !loading && (
        <div className="rounded-xl border bg-card px-6 py-10 text-center text-muted-foreground text-sm">
          Wähle oben eine Strecke aus, um die Ermüdungsanalyse zu sehen.
        </div>
      )}

      {loading && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 bg-muted animate-pulse rounded-xl" />)}</div>
          <div className="h-56 bg-muted animate-pulse rounded-xl" />
        </div>
      )}

      {error && <div className="rounded border border-destructive/50 bg-destructive/10 p-4 text-destructive text-sm">{error}</div>}

      {!loading && data && data.stats.rides_analyzed === 0 && (
        <div className="rounded-xl border bg-card px-6 py-10 text-center text-muted-foreground text-sm">
          Keine auswertbaren Rides für diese Strecke gefunden.
        </div>
      )}

      {!loading && data && data.stats.rides_analyzed > 0 && (
        <>
          <ExplanationCard />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card className="shadow-sm border">
              <CardContent className="px-4 py-3 space-y-1">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Ø Ermüdung</p>
                {avgFatigue !== null ? (
                  <>
                    <p className={`text-2xl font-bold ${fatigueTextColor(avgFatigue)}`}>{fmtPct(avgFatigue)}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {avgFatigue > 0 ? 'Im Schnitt Steigerung' : avgFatigue > -5 ? 'Fast kein Ermüdungseffekt' : 'Durchschnittliche Ermüdung'}
                    </p>
                  </>
                ) : (
                  <p className="text-2xl font-bold text-muted-foreground">–</p>
                )}
              </CardContent>
            </Card>
            <Card className="shadow-sm border">
              <CardContent className="px-4 py-3 space-y-1">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Steigerungen</p>
                <p className="text-2xl font-bold text-blue-500">{data.stats.steigerung_count}</p>
                <p className="text-[10px] text-muted-foreground">von {data.stats.rides_analyzed} Rides</p>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-1">
                  <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${Math.round(data.stats.steigerung_count / data.stats.rides_analyzed * 100)}%` }} />
                </div>
              </CardContent>
            </Card>
            {data.best_steigerung ? (
              <Card className="shadow-sm" style={{ borderColor: 'rgba(59,130,246,0.25)', background: 'rgba(59,130,246,0.05)' }}>
                <CardContent className="px-4 py-3 space-y-1">
                  <p className="text-[10px] uppercase tracking-wide text-blue-500">Beste Steigerung</p>
                  <p className="text-2xl font-bold text-blue-500">{fmtPct(data.best_steigerung.fatigue_pct)}</p>
                  <Link to={`/activities/${data.best_steigerung.activity_id}`} className="text-[10px] text-blue-400 hover:text-blue-300 truncate block transition-colors">
                    {data.best_steigerung.activity_name} · {fmtDate(data.best_steigerung.date)}
                  </Link>
                </CardContent>
              </Card>
            ) : (
              <Card className="shadow-sm border"><CardContent className="px-4 py-3"><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Beste Steigerung</p><p className="text-2xl font-bold text-muted-foreground">–</p></CardContent></Card>
            )}
            {data.worst_ermuedung ? (
              <Card className="shadow-sm" style={{ borderColor: 'rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.05)' }}>
                <CardContent className="px-4 py-3 space-y-1">
                  <p className="text-[10px] uppercase tracking-wide text-red-500">Größte Ermüdung</p>
                  <p className="text-2xl font-bold text-red-500">{data.worst_ermuedung.fatigue_pct.toFixed(1)}%</p>
                  <Link to={`/activities/${data.worst_ermuedung.activity_id}`} className="text-[10px] text-red-400 hover:text-red-300 truncate block transition-colors">
                    {data.worst_ermuedung.activity_name} · {fmtDate(data.worst_ermuedung.date)}
                  </Link>
                </CardContent>
              </Card>
            ) : (
              <Card className="shadow-sm border"><CardContent className="px-4 py-3"><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Größte Ermüdung</p><p className="text-2xl font-bold text-muted-foreground">–</p></CardContent></Card>
            )}
          </div>

          {allTracks && allTracks.length > 0 && (
            <Card className="shadow-sm border overflow-hidden">
              <CardHeader className="pb-1 border-b">
                <CardTitle className="text-base font-semibold">Streckenübersicht</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">Alle {allTracks.length} Rides dieser Strecke überlagert</p>
              </CardHeader>
              <CardContent className="p-0">
                <Suspense fallback={<div className="h-64 bg-muted animate-pulse" />}>
                  <LeafletMap multiPoints={allTracks} fixedHeight={280} />
                </Suspense>
              </CardContent>
            </Card>
          )}

          <BestWorstDetailCards data={data} />

          {trendData.length > 0 && (
            <Card className="shadow-sm border overflow-hidden">
              <CardHeader className="pb-1 border-b">
                <CardTitle className="text-base font-semibold">Zeitlicher Trend</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">Ermüdungsindex je Ride auf dieser Strecke — chronologisch</p>
              </CardHeader>
              <CardContent className="pt-4">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={trendData} margin={{ top: 8, right: 16, bottom: 30, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 9 }} interval={Math.max(0, Math.floor(trendData.length / 15) - 1)} angle={-45} textAnchor="end" height={44} />
                    <YAxis tickFormatter={v => `${v >= 0 ? '+' : ''}${v}%`} tick={{ fontSize: 10 }} width={48} />
                    <Tooltip content={<TrackTrendTooltip />} />
                    <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} />
                    <Bar dataKey="avg" name="Ermüdung" radius={[2, 2, 0, 0]} isAnimationActive={false}>
                      {trendData.map((entry, i) => <Cell key={i} fill={entry.color} fillOpacity={0.85} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div className="flex justify-between text-[10px] text-muted-foreground px-8 mt-1">
                  <span>← ältere Rides</span><span>neuere Rides →</span>
                </div>
              </CardContent>
            </Card>
          )}

          {data.distribution?.length > 0 && <HistoChart distribution={data.distribution} avgFatigue={avgFatigue} />}

          <RideTable rides={data.rides.slice().reverse()} title="Alle Rides auf dieser Strecke" subtitle="Neueste zuerst" />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Einzelfahrt (sign convention: positive = Ermüdung, negative = Steigerung)
// ---------------------------------------------------------------------------

function actFatigueTextColor(v: number): string {
  if (v <= -10) return 'text-blue-500';
  if (v < 0)    return 'text-emerald-500';
  if (v < 5)    return 'text-green-500';
  if (v < 10)   return 'text-amber-500';
  if (v < 20)   return 'text-orange-500';
  return 'text-red-500';
}

function segmentColor(deviationPct: number): string {
  if (deviationPct <= -10) return '#3b82f6';
  if (deviationPct < 0)    return '#10b981';
  if (deviationPct < 5)    return '#22c55e';
  if (deviationPct < 10)   return '#f59e0b';
  if (deviationPct < 20)   return '#f97316';
  return '#ef4444';
}

function fmtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}:${String(m).padStart(2, '0')} h` : `${m} min`;
}

interface SegmentData {
  label: string; avg_kmh: number; deviation_pct: number; color: string; pts: number;
}
interface FatigueResult {
  spd_h1_kmh: number; spd_h2_kmh: number; fatigue_pct: number;
  segments: SegmentData[]; overall_avg_kmh: number;
}

function computeFatigue(points: TrackPoint[]): FatigueResult | null {
  const valid = points.filter(p => p.distance_m != null && p.speed_ms != null && p.speed_ms > 0);
  if (valid.length < 20) return null;
  const maxDist = Math.max(...valid.map(p => p.distance_m!));
  const segSize = maxDist / 10;

  const segs: SegmentData[] = [];
  for (let i = 0; i < 10; i++) {
    const pts = valid.filter(p => p.distance_m! >= i * segSize && p.distance_m! < (i + 1) * segSize);
    const avg = pts.length > 0 ? pts.reduce((s, p) => s + p.speed_ms!, 0) / pts.length : 0;
    segs.push({ label: `${i * 10}–${(i + 1) * 10}%`, avg_kmh: Math.round(avg * 3.6 * 10) / 10, deviation_pct: 0, color: '#22c55e', pts: pts.length });
  }
  const ref = segs.find(s => s.avg_kmh > 0)?.avg_kmh ?? 1;
  for (const s of segs) {
    s.deviation_pct = s.avg_kmh > 0 ? (ref - s.avg_kmh) / ref * 100 : 0;
    s.color = segmentColor(s.deviation_pct);
  }
  const h1 = valid.filter(p => p.distance_m! <= maxDist / 2);
  const h2 = valid.filter(p => p.distance_m! > maxDist / 2);
  const spd_h1 = h1.length > 0 ? h1.reduce((s, p) => s + p.speed_ms!, 0) / h1.length : 0;
  const spd_h2 = h2.length > 0 ? h2.reduce((s, p) => s + p.speed_ms!, 0) / h2.length : 0;
  const fatigue_pct = spd_h1 > 0 ? (spd_h1 - spd_h2) / spd_h1 * 100 : 0;
  const overall_avg_kmh = Math.round((valid.reduce((s, p) => s + p.speed_ms!, 0) / valid.length) * 3.6 * 10) / 10;
  return {
    spd_h1_kmh: Math.round(spd_h1 * 3.6 * 10) / 10,
    spd_h2_kmh: Math.round(spd_h2 * 3.6 * 10) / 10,
    fatigue_pct: Math.round(fatigue_pct * 10) / 10,
    segments: segs, overall_avg_kmh,
  };
}

function ActivityTab() {
  const [availableYears, setAvailableYears] = useState<string[]>([]);
  const [filterYear, setFilterYear]         = useState<string | null>(null);
  const [activities, setActivities]         = useState<Activity[]>([]);
  const [loadingActs, setLoadingActs]       = useState(false);
  const [selectedId, setSelectedId]         = useState<number | null>(null);
  const [points, setPoints]                 = useState<TrackPoint[] | null>(null);
  const [loadingTrack, setLoadingTrack]     = useState(false);
  const [error, setError]                   = useState<string | null>(null);

  useEffect(() => {
    api.activityStats()
      .then(s => setAvailableYears(s.available_years.filter(y => Number(y) >= 2000)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoadingActs(true); setSelectedId(null); setPoints(null);
    api.activities({ has_track: 1, limit: 500, sort_by: 'date', sort_dir: 'desc', year: filterYear ?? undefined })
      .then(r => setActivities(r.items))
      .catch(() => setActivities([]))
      .finally(() => setLoadingActs(false));
  }, [filterYear]);

  async function handleActivityChange(val: string | null) {
    if (!val || val === 'none') return;
    const id = parseInt(val, 10);
    setSelectedId(id); setPoints(null); setError(null); setLoadingTrack(true);
    try {
      const r = await api.activityTrack(id, 1);
      setPoints(r.points);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler beim Laden des Tracks');
    } finally {
      setLoadingTrack(false);
    }
  }

  const selectedActivity = useMemo(() => activities.find(a => a.id === selectedId) ?? null, [activities, selectedId]);
  const fatigueResult    = useMemo(() => (points ? computeFatigue(points) : null), [points]);
  const selectLabel      = selectedActivity
    ? `${selectedActivity.name.slice(0, 50)} · ${fmtDate(selectedActivity.start_date)}`
    : 'Aktivität wählen…';

  return (
    <div className="space-y-4 mt-4">
      <Card className="shadow-sm border">
        <CardContent className="px-5 py-4 space-y-3">
          {availableYears.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <button onClick={() => setFilterYear(null)} className={`px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors ${!filterYear ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>Alle</button>
              {availableYears.map(y => (
                <button key={y} onClick={() => setFilterYear(y)} className={`px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors ${filterYear === y ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>{y}</button>
              ))}
            </div>
          )}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <p className="text-sm font-medium shrink-0">Aktivität</p>
            {loadingActs ? (
              <div className="h-9 w-80 bg-muted animate-pulse rounded-md" />
            ) : activities.length === 0 ? (
              <p className="text-sm text-muted-foreground">Keine Aktivitäten mit Track-Daten{filterYear ? ` für ${filterYear}` : ''} gefunden.</p>
            ) : (
              <Select value={selectedId !== null ? String(selectedId) : 'none'} onValueChange={handleActivityChange}>
                <SelectTrigger className="w-full max-w-lg text-sm"><SelectValue>{selectLabel}</SelectValue></SelectTrigger>
                <SelectContent>
                  {activities.map(a => (
                    <SelectItem key={a.id} value={String(a.id)}>
                      {a.name.slice(0, 60)} · {(a.distance_m / 1000).toFixed(0)} km · {fmtDate(a.start_date)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </CardContent>
      </Card>

      {selectedId === null && !loadingActs && (
        <div className="rounded-xl border bg-card px-6 py-10 text-center text-muted-foreground text-sm">
          Wähle oben eine Aktivität aus, um die Pacing-Analyse zu sehen.
        </div>
      )}

      {loadingTrack && (
        <div className="space-y-4">
          <div className="h-56 bg-muted animate-pulse rounded-xl" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 bg-muted animate-pulse rounded-xl" />)}</div>
          <div className="h-64 bg-muted animate-pulse rounded-xl" />
        </div>
      )}

      {error && <div className="rounded border border-destructive/50 bg-destructive/10 p-4 text-destructive text-sm">{error}</div>}

      {!loadingTrack && points && !fatigueResult && (
        <div className="rounded-xl border bg-card px-6 py-10 text-center text-muted-foreground text-sm">
          Nicht genug Track-Punkte für eine Segment-Analyse (mindestens 20 gültige Punkte benötigt).
        </div>
      )}

      {!loadingTrack && fatigueResult && selectedActivity && (
        <>
          <div className="grid md:grid-cols-2 gap-3">
            <Card className="shadow-sm border overflow-hidden h-full">
              {points && points.some(p => p.lat != null && p.lon != null) ? (
                <Suspense fallback={<div className="h-full min-h-[176px] bg-muted animate-pulse" />}>
                  <LeafletMap points={points} fullHeight />
                </Suspense>
              ) : (
                <div className="h-full min-h-[176px] flex items-center justify-center text-xs text-muted-foreground">Kein GPS-Track verfügbar</div>
              )}
            </Card>

            <div className="grid grid-cols-2 gap-3">
              <Card className="shadow-sm border">
                <CardContent className="px-4 py-3 space-y-1">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Ermüdungsindex</p>
                  <p className={`text-2xl font-bold ${actFatigueTextColor(fatigueResult.fatigue_pct)}`}>{fmtPct(fatigueResult.fatigue_pct)}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {fatigueResult.fatigue_pct < 0 ? 'Steigerung in H2' : fatigueResult.fatigue_pct < 5 ? 'Sehr ausgeglichenes Pacing' : fatigueResult.fatigue_pct < 10 ? 'Leichte Ermüdung' : fatigueResult.fatigue_pct < 20 ? 'Mittlere Ermüdung' : 'Starke Ermüdung'}
                  </p>
                </CardContent>
              </Card>
              <Card className="shadow-sm border">
                <CardContent className="px-4 py-3 space-y-1">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Ø Geschwindigkeit</p>
                  <p className="text-2xl font-bold">{fatigueResult.overall_avg_kmh} km/h</p>
                  <p className="text-[10px] text-muted-foreground">{(selectedActivity.distance_m / 1000).toFixed(1)} km</p>
                </CardContent>
              </Card>
              <Card className="shadow-sm border">
                <CardContent className="px-4 py-3 space-y-1">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">1. Hälfte</p>
                  <p className="text-2xl font-bold">{fatigueResult.spd_h1_kmh} km/h</p>
                  <p className="text-[10px] text-muted-foreground">Ø erste 50 % der Distanz</p>
                </CardContent>
              </Card>
              <Card className="shadow-sm border">
                <CardContent className="px-4 py-3 space-y-1">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">2. Hälfte</p>
                  <p className={`text-2xl font-bold ${fatigueResult.spd_h2_kmh >= fatigueResult.spd_h1_kmh ? 'text-blue-500' : 'text-orange-500'}`}>{fatigueResult.spd_h2_kmh} km/h</p>
                  <p className="text-[10px] text-muted-foreground">
                    {fatigueResult.spd_h2_kmh >= fatigueResult.spd_h1_kmh
                      ? `+${(fatigueResult.spd_h2_kmh - fatigueResult.spd_h1_kmh).toFixed(1)} km/h ggü. H1`
                      : `−${(fatigueResult.spd_h1_kmh - fatigueResult.spd_h2_kmh).toFixed(1)} km/h ggü. H1`}
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>

          <div className="flex items-center justify-between px-1">
            <Link to={`/activities/${selectedActivity.id}`} className="text-sm text-[#fc4c02] hover:underline">{selectedActivity.name} →</Link>
            <span className="text-xs text-muted-foreground">{fmtDate(selectedActivity.start_date)} · {fmtTime(selectedActivity.moving_time_s)}</span>
          </div>

          <Card className="shadow-sm border overflow-hidden">
            <CardHeader className="pb-1 border-b">
              <CardTitle className="text-base font-semibold">Pacing-Profil: 10 Abschnitte</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Ø-Geschwindigkeit je 10-%-Abschnitt — Farbe zeigt Abweichung vom Startabschnitt</p>
            </CardHeader>
            <CardContent className="pt-4">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={fatigueResult.segments} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={v => `${v} km/h`} tick={{ fontSize: 10 }} width={64}
                    domain={[(dataMin: number) => Math.max(0, Math.floor(dataMin * 0.9)), (dataMax: number) => Math.ceil(dataMax * 1.05)]} />
                  <Tooltip content={<PacingTooltip />} />
                  <ReferenceLine y={fatigueResult.overall_avg_kmh} stroke="hsl(var(--muted-foreground))" strokeDasharray="5 3" strokeWidth={1.5}
                    label={{ value: `Ø ${fatigueResult.overall_avg_kmh} km/h`, fontSize: 9, fill: 'hsl(var(--muted-foreground))', position: 'insideTopRight' }} />
                  <Bar dataKey="avg_kmh" name="Ø Speed" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                    {fatigueResult.segments.map((s, i) => <Cell key={i} fill={s.color} fillOpacity={0.85} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="flex justify-between text-[10px] text-muted-foreground px-4 mt-1">
                <span>← Startabschnitt (Referenz)</span><span>Zielabschnitt →</span>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm border">
            <CardContent className="px-5 py-4 space-y-4">
              <p className="text-sm font-semibold">Hälften-Vergleich</p>
              {[
                { label: '1. Hälfte (0–50 %)',   kmh: fatigueResult.spd_h1_kmh, color: '#6366f1' },
                { label: '2. Hälfte (50–100 %)', kmh: fatigueResult.spd_h2_kmh, color: fatigueResult.spd_h2_kmh >= fatigueResult.spd_h1_kmh ? '#3b82f6' : '#f97316' },
              ].map(({ label, kmh, color }) => {
                const max = Math.max(fatigueResult.spd_h1_kmh, fatigueResult.spd_h2_kmh);
                const pct = max > 0 ? Math.round((kmh / max) * 100) : 0;
                return (
                  <div key={label}>
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>{label}</span><span className="font-semibold text-foreground">{kmh} km/h</span>
                    </div>
                    <div className="h-4 bg-muted rounded overflow-hidden">
                      <div className="h-full rounded transition-all" style={{ width: `${pct}%`, background: color }} />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

type FatigueTab = 'trend' | 'strecke' | 'einzelfahrt';

export default function FatiguePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = (searchParams.get('tab') as FatigueTab) ?? 'trend';

  function changeTab(tab: string) {
    if (tab === 'trend') setSearchParams({});
    else setSearchParams({ tab });
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Ermüdung" subtitle="Pacing-Analyse: erste vs. zweite Hälfte deiner Rides" />
      <Tabs value={activeTab} onValueChange={changeTab}>
        <TabsList>
          <TabsTrigger value="trend">Trend</TabsTrigger>
          <TabsTrigger value="strecke">Strecke</TabsTrigger>
          <TabsTrigger value="einzelfahrt">Einzelfahrt</TabsTrigger>
        </TabsList>
        <TabsContent value="trend"><TrendTab /></TabsContent>
        <TabsContent value="strecke"><TrackTab /></TabsContent>
        <TabsContent value="einzelfahrt"><ActivityTab /></TabsContent>
      </Tabs>
    </div>
  );
}
