import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/page-header';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { api } from '@/lib/api';
import { ChartTooltip } from '@/components/ui/chart-tooltip';
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';

// ─── Shared helpers ──────────────────────────────────────────────────────────

const MONTHS_SHORT = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];

function linReg(values: number[]): { slope: number; intercept: number } {
  const n = values.length;
  if (n < 2) return { slope: 0, intercept: values[0] ?? 0 };
  const sumX = (n * (n - 1)) / 2;
  const sumY = values.reduce((a, b) => a + b, 0);
  const sumXY = values.reduce((s, v, i) => s + i * v, 0);
  const sumXX = values.reduce((s, _, i) => s + i * i, 0);
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

// ─── HR-Kurve Tab ─────────────────────────────────────────────────────────────

interface TrendPoint {
  month: string;
  label: string;
  avg_hr: number;
  rolling_avg: number;
  trend_line: number;
}

interface CurveData {
  durations_s: number[];
  labels: string[];
  best_hr: number[];
}

// ─── Custom Tooltips ─────────────────────────────────────────────────────────

function HrVerlaufTooltip({ active, payload, label }: { active?: boolean; payload?: any[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload as TrendPoint;
  return (
    <ChartTooltip
      active={active}
      label={label}
      rows={[
        { label: 'Ø HR', value: `${d.avg_hr} bpm`, color: '#94a3b8' },
        { label: '3M-Ø', value: `${d.rolling_avg} bpm`, color: '#f87171' },
      ]}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────

const CONTEXT = [
  {
    short: 'Maximalsprint',
    long: 'Kürzestes Fenster — erfasst anaerobe Spitzen (Berg-Sprint, Attacke). Kaum trainierbar, stark genetisch.',
  },
  {
    short: 'Hartes Intervall',
    long: 'VO₂max-Bereich. Mit hochintensiven Intervallen (4×5 min) gezielt trainierbar.',
  },
  {
    short: 'Intensiv',
    long: 'Langes Intervall oder kurze Tempofahrt. Grenzbereich zwischen anaerob und aerob.',
  },
  {
    short: '≈ Schwellen-HR',
    long: 'Der wichtigste Wert: entspricht ungefähr der Laktatschwellen-HF. Liegt typischerweise bei ~85–92 % HRmax.',
  },
  {
    short: 'Dauerleistung',
    long: 'Aerober Bereich. Wie gut hältst du hohe HF über eine Stunde? Zeigt die aerobe Basis.',
  },
];

function buildAreaPath(pts: { x: number; y: number }[], baseY: number): string {
  if (!pts.length) return '';
  const first = pts[0];
  const last = pts[pts.length - 1];
  let d = `M${first.x.toFixed(1)},${baseY.toFixed(1)} L${first.x.toFixed(1)},${first.y.toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    d += ` L${pts[i].x.toFixed(1)},${pts[i].y.toFixed(1)}`;
  }
  d += ` L${last.x.toFixed(1)},${baseY.toFixed(1)} Z`;
  return d;
}

function HrKurveTab() {
  const [data, setData] = useState<CurveData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [availableYears, setAvailableYears] = useState<string[]>([]);
  const [filterYear, setFilterYear] = useState<string | null>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [trendData, setTrendData] = useState<TrendPoint[]>([]);
  const [trendBpm, setTrendBpm] = useState<number | null>(null);

  const W = 960, H = 220;
  const PAD = { top: 24, right: 32, bottom: 48, left: 52 };
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top - PAD.bottom;

  useEffect(() => {
    api.activityStats()
      .then(stats => {
        setAvailableYears(stats.available_years.filter(y => Number(y) >= 2000));
      })
      .catch(() => {});
    loadCurve(null);

    api.speedHr().then(res => {
      const byMonth: Record<string, number[]> = {};
      for (const p of res.points) {
        if (!byMonth[p.month]) byMonth[p.month] = [];
        byMonth[p.month].push(p.hr);
      }
      const sorted = Object.keys(byMonth).sort();
      const base = sorted.map(m => {
        const hrs = byMonth[m];
        const avg = hrs.reduce((a, b) => a + b, 0) / hrs.length;
        const [y, mo] = m.split('-');
        return {
          month: m,
          label: `${MONTHS_SHORT[Number(mo) - 1]} ${y.slice(2)}`,
          avg_hr: Math.round(avg),
          rolling_avg: 0,
        };
      });
      const { slope, intercept } = linReg(base.map(d => d.avg_hr));
      const withRolling: TrendPoint[] = base.map((d, i) => {
        const slice = base.slice(Math.max(0, i - 2), i + 1);
        const avg = slice.reduce((s, x) => s + x.avg_hr, 0) / slice.length;
        return { ...d, rolling_avg: Math.round(avg), trend_line: Math.round(intercept + slope * i) };
      });
      setTrendBpm(Math.round(slope * 12));
      setTrendData(withRolling);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadCurve(year: string | null) {
    setLoading(true);
    setError(null);
    try {
      const res = await api.hrCurve(year ? Number(year) : undefined);
      setData({ durations_s: res.durations_s, labels: res.labels, best_hr: res.best_hr });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler beim Laden');
    } finally {
      setLoading(false);
    }
  }

  function handleYearChange(val: string | null) {
    const y = val === 'all' ? null : val;
    setFilterYear(y);
    loadCurve(y);
  }

  const thresholdIdx = data ? data.durations_s.findIndex(d => d === 1200) : -1;
  const thresholdHR = thresholdIdx >= 0 && data ? data.best_hr[thresholdIdx] : null;

  const dropPct =
    data && data.best_hr.length >= 2
      ? (() => {
          const first = data.best_hr[0];
          const last = data.best_hr[data.best_hr.length - 1];
          return first > 0 ? Math.round((1 - last / first) * 100) : null;
        })()
      : null;

  const minHR = data ? Math.floor(Math.min(...data.best_hr) / 5) * 5 - 5 : 100;
  const maxHR = data ? Math.ceil(Math.max(...data.best_hr) / 5) * 5 + 5 : 180;
  const hrRange = maxHR - minHR;

  function xOf(i: number, n: number) { return PAD.left + (i / (n - 1)) * cW; }
  function yOf(hr: number) { return PAD.top + cH - ((hr - minHR) / hrRange) * cH; }

  const points = data
    ? data.best_hr.map((hr, i) => ({
        x: xOf(i, data.best_hr.length),
        y: yOf(hr),
        hr,
        label: data.labels[i],
        ctx: CONTEXT[i] ?? { short: '', long: '' },
        isThreshold: i === thresholdIdx,
      }))
    : [];

  const polyline = points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const areaPath = buildAreaPath(points, PAD.top + cH);

  const yTicks: number[] = [];
  for (let v = minHR; v <= maxHR; v += 10) yTicks.push(v);

  return (
    <div className="space-y-6">
      {/* Jahresfilter */}
      {availableYears.length > 0 && (
        <div className="flex justify-end">
          <Select value={filterYear ?? 'all'} onValueChange={handleYearChange}>
            <SelectTrigger className="w-36">
              <SelectValue>{filterYear ?? 'Alle Jahre'}</SelectValue>
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

      {/* Erklär-Box */}
      <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-3 text-sm space-y-1">
        <p className="font-medium text-blue-400">Was zeigt diese Kurve?</p>
        <p className="text-muted-foreground">
          Für jedes Zeitfenster (1 min bis 60 min) sucht der Algorithmus in allen deinen Rides den höchsten
          Durchschnittswert der Herzfrequenz über genau so viele aufeinanderfolgende Sekunden.
          Das Ergebnis zeigt, wie hoch deine HF bei verschiedenen Belastungsdauern maximal war —
          ähnlich einer Power-Kurve, aber ohne Leistungsmesser.
        </p>
      </div>

      {error && (
        <div className="rounded border border-destructive/50 bg-destructive/10 p-4 text-destructive text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <>
          <div className="h-32 rounded-xl bg-muted animate-pulse" />
          <div className="h-56 rounded-xl bg-muted animate-pulse" />
        </>
      ) : data ? (
        <>
          {/* Kacheln */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {points.map((p, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setHoveredIdx(hoveredIdx === i ? null : i)}
                className={[
                  'rounded-xl border text-left px-4 py-3 transition-colors',
                  p.isThreshold
                    ? 'border-orange-500/60 bg-orange-500/10'
                    : hoveredIdx === i
                    ? 'border-red-500/40 bg-red-500/10'
                    : 'border-border bg-card hover:border-border/80',
                ].join(' ')}
              >
                <p className={`text-[10px] uppercase tracking-wide ${p.isThreshold ? 'text-orange-400' : 'text-muted-foreground'}`}>
                  {p.label}
                </p>
                <p className={`text-2xl font-bold mt-0.5 ${p.isThreshold ? 'text-orange-400' : 'text-red-400'}`}>
                  {Math.round(p.hr)}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">bpm</p>
                <p className={`text-[11px] mt-2 ${p.isThreshold ? 'text-orange-300' : 'text-muted-foreground'}`}>
                  {p.ctx.short}
                </p>
              </button>
            ))}
          </div>

          {hoveredIdx !== null && (
            <div className="rounded-lg border bg-card px-4 py-3 text-sm text-foreground">
              <span className="font-medium">{points[hoveredIdx].label} — {points[hoveredIdx].ctx.short}:</span>{' '}
              {points[hoveredIdx].ctx.long}
            </div>
          )}

          {/* SVG-Chart */}
          <div className="rounded-xl border bg-card shadow-sm px-4 pt-4 pb-2">
            <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="block">
              <defs>
                <linearGradient id="hrGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f87171" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#f87171" stopOpacity={0} />
                </linearGradient>
              </defs>

              {yTicks.map(v => (
                <g key={v}>
                  <line
                    x1={PAD.left} y1={yOf(v)}
                    x2={W - PAD.right} y2={yOf(v)}
                    stroke="hsl(var(--border))" strokeWidth={1}
                  />
                  <text
                    x={PAD.left - 8} y={yOf(v) + 4}
                    fontSize={11} fill="hsl(var(--muted-foreground))" textAnchor="end"
                  >
                    {v}
                  </text>
                </g>
              ))}

              {thresholdHR !== null && (
                <>
                  <line
                    x1={PAD.left} y1={yOf(thresholdHR)}
                    x2={W - PAD.right} y2={yOf(thresholdHR)}
                    stroke="#f97316" strokeWidth={1} strokeDasharray="4,4" opacity={0.5}
                  />
                  <text x={PAD.left + 6} y={yOf(thresholdHR) - 4} fontSize={10} fill="#f97316" opacity={0.8}>
                    Schwellen-HR
                  </text>
                </>
              )}

              <line
                x1={PAD.left} y1={PAD.top + cH}
                x2={W - PAD.right} y2={PAD.top + cH}
                stroke="hsl(var(--border))" strokeWidth={1}
              />

              <path d={areaPath} fill="url(#hrGrad)" />
              <polyline
                points={polyline}
                fill="none"
                stroke="#f87171"
                strokeWidth={2.5}
                strokeLinejoin="round"
                strokeLinecap="round"
              />

              {points.map((p, i) => (
                <g key={i}>
                  <circle
                    cx={p.x} cy={p.y}
                    r={p.isThreshold ? 7 : 5}
                    fill={p.isThreshold ? '#f97316' : '#f87171'}
                    stroke={p.isThreshold ? '#f97316' : 'hsl(var(--card))'}
                    strokeWidth={2}
                  />
                  <text
                    x={p.x} y={p.y - 12}
                    fontSize={11}
                    fill={p.isThreshold ? '#f97316' : '#fca5a5'}
                    textAnchor="middle"
                    fontWeight={600}
                  >
                    {Math.round(p.hr)}
                  </text>
                  <text
                    x={p.x} y={PAD.top + cH + 16}
                    fontSize={11} fill="hsl(var(--muted-foreground))" textAnchor="middle"
                  >
                    {p.label}
                  </text>
                  <text
                    x={p.x} y={PAD.top + cH + 30}
                    fontSize={9} fill="hsl(var(--muted-foreground))" textAnchor="middle"
                  >
                    {p.ctx.short}
                  </text>
                </g>
              ))}

              <text
                x={PAD.left - 38} y={PAD.top + cH / 2}
                fontSize={11} fill="hsl(var(--muted-foreground))" textAnchor="middle"
                transform={`rotate(-90, ${PAD.left - 38}, ${PAD.top + cH / 2})`}
              >
                bpm
              </text>
            </svg>
          </div>

          {/* Interpretation */}
          <div className="grid sm:grid-cols-2 gap-4">
            {thresholdHR !== null && (
              <div className="rounded-xl border border-orange-500/30 bg-orange-500/5 px-4 py-3 space-y-1">
                <p className="text-xs text-orange-400 font-medium uppercase tracking-wide">Geschätzte Schwellen-HR</p>
                <p className="text-3xl font-bold text-orange-400">
                  {Math.round(thresholdHR)}{' '}
                  <span className="text-base font-normal text-orange-300">bpm</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  Entspricht deinem 20-min-Bestwert. Die Laktatschwelle liegt typischerweise
                  bei 85–92 % HRmax und markiert den Übergang von aerobem zu anaerobem Stoffwechsel.
                </p>
              </div>
            )}

            {dropPct !== null && (
              <div className="rounded-xl border bg-card shadow-sm px-4 py-3 space-y-1">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                  Kurvensteilheit (1 min → 60 min)
                </p>
                <p className={`text-3xl font-bold ${dropPct <= 5 ? 'text-emerald-400' : dropPct <= 10 ? 'text-yellow-400' : 'text-red-400'}`}>
                  −{dropPct}{' '}
                  <span className="text-base font-normal text-muted-foreground">%</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {dropPct <= 5
                    ? 'Sehr flach — starke aerobe Basis, du hältst hohe HF auch über lange Dauer.'
                    : dropPct <= 10
                    ? 'Moderat — gute Balance zwischen Ausdauer und Intensität.'
                    : 'Steil — große Spitze über kurz, aber HF fällt über längere Dauer stark ab. Mehr Grundlagentraining hilft.'}
                </p>
              </div>
            )}
          </div>

          <p className="text-xs text-muted-foreground/50">
            Berechnung: gleitendes Maximum der Sekunden-HR über alle FIT-Tracks. Nur Aktivitäten mit HR-Daten fließen ein.
            Kurze Fenster können durch kurze Sprints verzerrt sein — der 20-min-Wert ist am aussagekräftigsten.
          </p>

          {/* HR-Verlauf über Zeit */}
          {trendData.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">
                    Ø Herzfrequenz pro Monat
                    <span className="ml-2 text-xs font-normal text-muted-foreground">— gesamter Zeitraum</span>
                  </CardTitle>
                  {trendBpm !== null && (
                    <span className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full border ${
                      trendBpm < -1 ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400' :
                      trendBpm >  1 ? 'border-red-500/40 bg-red-500/10 text-red-400' :
                                      'border-border bg-muted text-muted-foreground'
                    }`}>
                      {trendBpm > 0 ? '↑' : trendBpm < 0 ? '↓' : '→'}{' '}
                      {trendBpm > 0 ? '+' : ''}{trendBpm} bpm/Jahr
                    </span>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <ComposedChart data={trendData} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                    <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.5} />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                      axisLine={false} tickLine={false}
                      interval={Math.max(0, Math.floor(trendData.length / 10) - 1)}
                    />
                    <YAxis
                      domain={['auto', 'auto']}
                      tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                      axisLine={false} tickLine={false}
                      width={36}
                      unit=" bpm"
                    />
                    <Tooltip content={<HrVerlaufTooltip />} />
                    {thresholdHR !== null && (
                      <ReferenceLine
                        y={Math.round(thresholdHR)}
                        stroke="#f97316"
                        strokeDasharray="4 4"
                        strokeOpacity={0.5}
                        label={{ value: 'Schwelle', position: 'insideTopRight', fontSize: 10, fill: '#f97316' }}
                      />
                    )}
                    <Line
                      dataKey="avg_hr"
                      type="monotone"
                      stroke="#94a3b8"
                      strokeWidth={1}
                      dot={{ r: 2, fill: '#94a3b8', strokeWidth: 0 }}
                      activeDot={{ r: 4 }}
                      legendType="none"
                    />
                    <Line
                      dataKey="rolling_avg"
                      type="monotone"
                      stroke="#f87171"
                      strokeWidth={2.5}
                      dot={false}
                      legendType="none"
                    />
                    <Line
                      dataKey="trend_line"
                      type="monotone"
                      stroke="#facc15"
                      strokeWidth={2}
                      strokeDasharray="8,4"
                      dot={false}
                      legendType="none"
                    />
                  </ComposedChart>
                </ResponsiveContainer>
                <p className="text-xs text-muted-foreground/60 mt-2">
                  <span style={{ color: '#94a3b8' }}>— monatlicher Ø</span>
                  {' · '}
                  <span style={{ color: '#f87171' }}>— 3M-Schnitt</span>
                  {' · '}
                  <span style={{ color: '#facc15' }}>- - Trend</span>
                  {' · Nur Rides mit HR-Daten'}
                </p>
              </CardContent>
            </Card>
          )}
        </>
      ) : null}
    </div>
  );
}

// ─── Aerobe Effizienz Tab ─────────────────────────────────────────────────────

const EFF_PALETTE = ['#60a5fa', '#4ade80', '#fb923c', '#c084fc', '#facc15', '#f472b6'];

interface SpeedHrPoint {
  year: number;
  month: string;
  speed_kmh: number;
  hr: number;
  dist_km: number;
}

interface SpeedMonthAgg {
  month: string;
  label: string;
  avgSpeed: number;
  avgHr: number;
  eff: number;
  count: number;
  year: number;
}

interface SpeedYearAgg {
  year: number;
  avgSpeed: number;
  avgHr: number;
  eff: number;
  count: number;
}

function effLinePath(pts: { x: number; y: number }[]): string {
  if (!pts.length) return '';
  let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1], cur = pts[i];
    const cpx = (prev.x + cur.x) / 2;
    d += ` C${cpx.toFixed(1)},${prev.y.toFixed(1)} ${cpx.toFixed(1)},${cur.y.toFixed(1)} ${cur.x.toFixed(1)},${cur.y.toFixed(1)}`;
  }
  return d;
}

function effAreaPath(pts: { x: number; y: number }[], baseY: number): string {
  if (!pts.length) return '';
  const line = effLinePath(pts);
  const last = pts[pts.length - 1];
  const first = pts[0];
  return `${line} L${last.x.toFixed(1)},${baseY.toFixed(1)} L${first.x.toFixed(1)},${baseY.toFixed(1)} Z`;
}

function EffizienzTab() {
  const EFF_W = 900, EFF_H = 220;
  const EFF_PAD = { top: 20, right: 20, bottom: 40, left: 44 };
  const EFF_CW = EFF_W - EFF_PAD.left - EFF_PAD.right;
  const EFF_CH = EFF_H - EFF_PAD.top - EFF_PAD.bottom;

  const [allPoints, setAllPoints] = useState<SpeedHrPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    api.speedHr()
      .then(res => setAllPoints(res.points.filter(p => p.year >= 2020)))
      .catch(e => setError(e instanceof Error ? e.message : 'Fehler'))
      .finally(() => setLoading(false));
  }, []);

  const years = [...new Set(allPoints.map(p => p.year))].sort();

  function yearColor(year: number): string {
    return EFF_PALETTE[years.indexOf(year) % EFF_PALETTE.length];
  }

  const monthly: SpeedMonthAgg[] = (() => {
    const groups: Record<string, SpeedHrPoint[]> = {};
    allPoints.forEach(p => { (groups[p.month] ??= []).push(p); });
    return Object.entries(groups)
      .filter(([, pts]) => pts.length >= 2)
      .map(([month, pts]) => {
        const avgSpeed = pts.reduce((s, p) => s + p.speed_kmh, 0) / pts.length;
        const avgHr = pts.reduce((s, p) => s + p.hr, 0) / pts.length;
        const [y, m] = month.split('-');
        const label = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('de-DE', {
          month: 'short', year: '2-digit',
        });
        return { month, label, avgSpeed, avgHr, eff: avgSpeed / avgHr * 100, count: pts.length, year: Number(y) };
      })
      .sort((a, b) => a.month.localeCompare(b.month));
  })();

  const yearlyAgg: SpeedYearAgg[] = years.map(y => {
    const pts = allPoints.filter(p => p.year === y);
    const avgSpeed = pts.reduce((s, p) => s + p.speed_kmh, 0) / pts.length;
    const avgHr = pts.reduce((s, p) => s + p.hr, 0) / pts.length;
    return { year: y, avgSpeed, avgHr, eff: avgSpeed / avgHr * 100, count: pts.length };
  });

  const insight: string = (() => {
    if (yearlyAgg.length < 2) return '';
    const cur = yearlyAgg[yearlyAgg.length - 1];
    const prev = yearlyAgg[yearlyAgg.length - 2];
    const dS = cur.avgSpeed - prev.avgSpeed;
    const dH = cur.avgHr - prev.avgHr;
    const dE = cur.eff - prev.eff;
    const sDir = dS >= 0.2 ? `${dS.toFixed(1)} km/h schneller` : dS <= -0.2 ? `${Math.abs(dS).toFixed(1)} km/h langsamer` : 'gleich schnell';
    const hDir = dH <= -1 ? `bei ${Math.abs(dH).toFixed(0)} bpm niedrigerem Puls` : dH >= 1 ? `bei ${dH.toFixed(0)} bpm höherem Puls` : 'bei ähnlichem Puls';
    if (dE >= 0.5) return `${cur.year} fährst du im Schnitt ${sDir} ${hDir} als ${prev.year} – deine aerobe Effizienz steigt.`;
    if (dE <= -0.5) return `${cur.year} bist du ${sDir} ${hDir} als ${prev.year} – die Effizienz ist leicht gesunken.`;
    return `${cur.year} und ${prev.year} liegen dicht beieinander – stabile Effizienz auf gutem Niveau.`;
  })();

  const effValues = monthly.map(m => m.eff);
  const effMin = effValues.length ? Math.floor(Math.min(...effValues) - 1) : 14;
  const effMax = effValues.length ? Math.ceil(Math.max(...effValues) + 1) : 22;
  const effRange = effMax - effMin;

  function xOf(i: number, n: number) { return EFF_PAD.left + (i / Math.max(n - 1, 1)) * EFF_CW; }
  function yOf(v: number) { return EFF_PAD.top + EFF_CH - ((v - effMin) / effRange) * EFF_CH; }

  const chartPoints = monthly.map((d, i) => ({ x: xOf(i, monthly.length), y: yOf(d.eff) }));

  const xLabels: { x: number; label: string; year: number }[] = [];
  {
    let lastYear = -1;
    monthly.forEach((d, i) => {
      if (d.year !== lastYear) {
        xLabels.push({ x: xOf(i, monthly.length), label: String(d.year), year: d.year });
        lastYear = d.year;
      }
    });
  }

  const yTicks: number[] = [];
  const tickStep = effRange > 6 ? 2 : 1;
  for (let v = Math.ceil(effMin); v <= effMax; v += tickStep) yTicks.push(v);

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded border border-destructive/50 bg-destructive/10 p-4 text-destructive text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="h-64 rounded-xl bg-muted animate-pulse" />
      ) : allPoints.length ? (
        <>
          {insight && (
            <div className="rounded-xl bg-primary/10 border border-primary/20 px-5 py-3">
              <p className="text-sm" style={{ color: '#fb923c' }}>{insight}</p>
            </div>
          )}

          <div className="rounded-xl border bg-card shadow-sm p-5">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Effizienz pro Monat</p>
              <p className="text-xs text-muted-foreground/50">= Ø km/h ÷ Ø bpm × 100 · mindestens 2 Rides</p>
            </div>

            <div
              className="relative"
              onMouseMove={e => {
                if (!monthly.length) return;
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                const svgX = (e.clientX - rect.left) / rect.width * EFF_W;
                const raw = (svgX - EFF_PAD.left) / EFF_CW * (monthly.length - 1);
                setHoverIdx(Math.max(0, Math.min(monthly.length - 1, Math.round(raw))));
                setTooltipPos({ x: e.clientX, y: e.clientY });
              }}
              onMouseLeave={() => setHoverIdx(null)}
            >
              <svg viewBox={`0 0 ${EFF_W} ${EFF_H}`} className="w-full" style={{ height: EFF_H }}>
                <defs>
                  <linearGradient id="effGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#fb923c" stopOpacity={0.6} />
                    <stop offset="100%" stopColor="#fb923c" stopOpacity={0} />
                  </linearGradient>
                </defs>

                {yTicks.map(v => (
                  <g key={v}>
                    <line
                      x1={EFF_PAD.left} y1={yOf(v)}
                      x2={EFF_W - EFF_PAD.right} y2={yOf(v)}
                      stroke="hsl(var(--border))" strokeWidth={0.7}
                    />
                    <text x={EFF_PAD.left - 6} y={yOf(v) + 4} fontSize={11}
                      fill="hsl(var(--muted-foreground))" textAnchor="end">
                      {v}
                    </text>
                  </g>
                ))}

                {xLabels.map((lbl, li) => {
                  const nextX = li + 1 < xLabels.length ? xLabels[li + 1].x : EFF_W - EFF_PAD.right;
                  const col = yearColor(lbl.year);
                  return (
                    <g key={lbl.year}>
                      <rect x={lbl.x} y={EFF_PAD.top} width={nextX - lbl.x} height={EFF_CH}
                        fill={col} fillOpacity={0.04} />
                      <line x1={lbl.x} y1={EFF_PAD.top} x2={lbl.x} y2={EFF_PAD.top + EFF_CH}
                        stroke={col} strokeWidth={1} strokeOpacity={0.25} />
                      <text x={lbl.x + 6} y={EFF_PAD.top + 13} fontSize={11} fontWeight={600}
                        fill={col} fillOpacity={0.7}>
                        {lbl.label}
                      </text>
                    </g>
                  );
                })}

                <path d={effAreaPath(chartPoints, EFF_PAD.top + EFF_CH)} fill="url(#effGrad)" opacity={0.35} />
                <path d={effLinePath(chartPoints)} fill="none" stroke="#fb923c" strokeWidth={2.5} strokeLinejoin="round" />

                {monthly.map((d, i) => {
                  const cx = xOf(i, monthly.length);
                  const cy = yOf(d.eff);
                  const active = hoverIdx === i;
                  return (
                    <circle
                      key={i}
                      cx={cx} cy={cy}
                      r={active ? 5 : 3}
                      fill={active ? '#fb923c' : yearColor(d.year)}
                      fillOpacity={active ? 1 : 0.5}
                      stroke={active ? 'white' : 'none'}
                      strokeWidth={1.5}
                    />
                  );
                })}

                {hoverIdx !== null && (
                  <line
                    x1={xOf(hoverIdx, monthly.length)} y1={EFF_PAD.top}
                    x2={xOf(hoverIdx, monthly.length)} y2={EFF_PAD.top + EFF_CH}
                    stroke="white" strokeWidth={1} opacity={0.2}
                  />
                )}

                <line
                  x1={EFF_PAD.left} y1={EFF_PAD.top + EFF_CH}
                  x2={EFF_W - EFF_PAD.right} y2={EFF_PAD.top + EFF_CH}
                  stroke="hsl(var(--border))" strokeWidth={1}
                />

                {xLabels.map(lbl => (
                  <text
                    key={lbl.year}
                    x={lbl.x} y={EFF_H - 8}
                    fontSize={11} fill={yearColor(lbl.year)}
                    textAnchor="middle" fontWeight={600}
                  >
                    {lbl.label}
                  </text>
                ))}

                <text
                  x={12} y={EFF_PAD.top + EFF_CH / 2}
                  fontSize={10} fill="hsl(var(--muted-foreground))"
                  textAnchor="middle"
                  transform={`rotate(-90, 12, ${EFF_PAD.top + EFF_CH / 2})`}
                >
                  Effizienz
                </text>
              </svg>
            </div>
          </div>

          {/* Jahreskarten */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {yearlyAgg.map((s, i) => {
              const col = yearColor(s.year);
              const prev = i > 0 ? yearlyAgg[i - 1] : null;
              const dS = prev ? s.avgSpeed - prev.avgSpeed : null;
              const dH = prev ? s.avgHr - prev.avgHr : null;
              const dE = prev ? s.eff - prev.eff : null;

              return (
                <div
                  key={s.year}
                  className="rounded-xl p-4 border"
                  style={{ borderColor: `${col}33`, background: `${col}0d` }}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-bold" style={{ color: col }}>{s.year}</span>
                    <span className="text-xs text-muted-foreground">{s.count} Rides</span>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between items-baseline">
                      <span className="text-muted-foreground text-xs">Ø Speed</span>
                      <span className="font-semibold text-foreground">
                        {s.avgSpeed.toFixed(1)}{' '}
                        <span className="text-xs font-normal text-muted-foreground">km/h</span>{' '}
                        {dS !== null && (
                          <span className={`text-xs ${Math.abs(dS) < 0.2 ? 'text-muted-foreground/40' : dS > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {dS > 0 ? '+' : ''}{dS.toFixed(1)}
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between items-baseline">
                      <span className="text-muted-foreground text-xs">Ø HR</span>
                      <span className="font-semibold text-foreground">
                        {s.avgHr.toFixed(0)}{' '}
                        <span className="text-xs font-normal text-muted-foreground">bpm</span>{' '}
                        {dH !== null && (
                          <span className={`text-xs ${Math.abs(dH) < 0.5 ? 'text-muted-foreground/40' : dH < 0 ? 'text-emerald-400' : 'text-orange-400'}`}>
                            {dH > 0 ? '+' : ''}{dH.toFixed(1)}
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="border-t border-border/50 pt-2 flex justify-between items-baseline">
                      <span className="text-muted-foreground text-xs">Effizienz</span>
                      <span className="font-bold" style={{ color: col }}>
                        {s.eff.toFixed(1)}{' '}
                        {dE !== null && (
                          <span className={`text-xs font-normal ${Math.abs(dE) < 0.2 ? 'text-muted-foreground/40' : dE > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {dE > 0 ? '+' : ''}{dE.toFixed(1)}
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Erklärung */}
          <div className="rounded-xl border bg-card shadow-sm px-5 py-4 text-sm text-muted-foreground space-y-1">
            <p className="text-foreground font-medium">Was ist die Effizienz-Zahl?</p>
            <p>
              <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded text-orange-400">
                Effizienz = Ø km/h ÷ Ø bpm × 100
              </span>{' '}
              – je höher, desto mehr Geschwindigkeit bekommst du pro Herzschlag.
            </p>
            <p>
              Ein Anstieg bedeutet: dein Herz-Kreislauf-System wird ökonomischer.
              Die Kurve kann trotz weniger Training steigen (bessere Erholung, leichtere Strecken) –
              deshalb immer zusammen mit den Volumen-Daten betrachten.
            </p>
          </div>
        </>
      ) : (
        <p className="text-muted-foreground text-sm">Keine Daten mit HR + Geschwindigkeit gefunden.</p>
      )}

      {hoverIdx !== null && monthly[hoverIdx] && (() => {
        const d = monthly[hoverIdx];
        return (
          <div
            className="fixed z-50 pointer-events-none rounded-lg bg-card/95 border border-border px-3 py-2.5 text-xs shadow-xl"
            style={{ left: tooltipPos.x + 14, top: tooltipPos.y - 80, minWidth: 160 }}
          >
            <p className="font-semibold text-foreground mb-2">{d.label} · {d.count} Rides</p>
            <div className="space-y-1">
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Ø Speed</span>
                <span className="text-foreground font-mono">{d.avgSpeed.toFixed(1)} km/h</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Ø HR</span>
                <span className="text-foreground font-mono">{d.avgHr.toFixed(0)} bpm</span>
              </div>
              <div className="flex justify-between gap-4 pt-1.5 border-t border-border/50">
                <span className="text-orange-400">Effizienz</span>
                <span className="text-orange-300 font-mono font-bold">{d.eff.toFixed(2)}</span>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ─── Container ────────────────────────────────────────────────────────────────

export default function HrCurvePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') ?? 'kurve';

  return (
    <div className="space-y-6">
      <PageHeader
        title="HR-Analyse"
        subtitle="Herzfrequenz-Kurve und aerobe Effizienz"
      />

      <Tabs value={tab} onValueChange={t => setSearchParams({ tab: t }, { replace: true })}>
        <TabsList>
          <TabsTrigger value="kurve">HR-Kurve</TabsTrigger>
          <TabsTrigger value="effizienz">Aerobe Effizienz</TabsTrigger>
        </TabsList>
        <TabsContent value="kurve" className="mt-6">
          <HrKurveTab />
        </TabsContent>
        <TabsContent value="effizienz" className="mt-6">
          <EffizienzTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
