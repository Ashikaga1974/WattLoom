import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Dumbbell, Zap, Activity, Timer, HeartPulse } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceDot,
} from 'recharts';
import { api, type WorkoutDetail } from '@/lib/api';
import { fmtTime } from '@/lib/format';
import { useConfig } from '@/lib/config-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { ChartTooltip } from '@/components/ui/chart-tooltip';

// ─── Sport-Typ Konfiguration ──────────────────────────────────────────────────

interface SportConfig {
  label: string;
  icon: React.ReactNode;
  badgeCls: string;
  heroCls: string;   // gradient bg für Hero
  iconCls: string;   // Farbe des Icons
}

const SPORT_CONFIG: Record<string, SportConfig> = {
  'Krafttraining':     { label: 'Krafttraining',  icon: <Dumbbell size={36} />, badgeCls: 'bg-orange-500/15 text-orange-500 border-orange-500/25', heroCls: 'from-orange-500/10 to-orange-500/5', iconCls: 'text-orange-500' },
  'Weight Training':   { label: 'Krafttraining',  icon: <Dumbbell size={36} />, badgeCls: 'bg-orange-500/15 text-orange-500 border-orange-500/25', heroCls: 'from-orange-500/10 to-orange-500/5', iconCls: 'text-orange-500' },
  'Strength Training': { label: 'Krafttraining',  icon: <Dumbbell size={36} />, badgeCls: 'bg-orange-500/15 text-orange-500 border-orange-500/25', heroCls: 'from-orange-500/10 to-orange-500/5', iconCls: 'text-orange-500' },
  'Fitness':           { label: 'Fitness',         icon: <Activity size={36} />, badgeCls: 'bg-yellow-500/15 text-yellow-600 border-yellow-500/25', heroCls: 'from-yellow-500/10 to-yellow-500/5', iconCls: 'text-yellow-500' },
  'Workout':           { label: 'Workout',         icon: <Zap     size={36} />, badgeCls: 'bg-blue-500/15 text-blue-500 border-blue-500/25',       heroCls: 'from-blue-500/10 to-blue-500/5',   iconCls: 'text-blue-500' },
};

function getSportConfig(sportType: string): SportConfig {
  return SPORT_CONFIG[sportType] ?? {
    label: sportType,
    icon: <Activity size={36} />,
    badgeCls: 'bg-muted text-muted-foreground border-border/60',
    heroCls: 'from-muted/30 to-muted/10',
    iconCls: 'text-muted-foreground',
  };
}

// ─── Intensitäts-Gauge ────────────────────────────────────────────────────────

function intensityColor(pct: number): string {
  if (pct < 60) return '#60a5fa';
  if (pct < 70) return '#34d399';
  if (pct < 80) return '#fbbf24';
  if (pct < 90) return '#f97316';
  return '#ef4444';
}

function intensityZone(pct: number): string {
  if (pct < 60) return 'Sehr locker · Zone 1–2';
  if (pct < 70) return 'Locker · Zone 2–3';
  if (pct < 80) return 'Aerob · Zone 3';
  if (pct < 90) return 'Schwellenbereich · Zone 4';
  return 'Maximal · Zone 5';
}

function gaugeArcPath(cx: number, cy: number, r: number, v: number): string {
  if (v <= 0) return '';
  const clamped = Math.min(v, 0.9999);
  const endAngle = (1 - clamped) * 180; // degrees from positive x-axis
  const rad = (endAngle * Math.PI) / 180;
  const endX = cx + r * Math.cos(rad);
  const endY = cy - r * Math.sin(rad);
  const largeArc = clamped > 0.5 ? 1 : 0;
  return `M ${cx - r} ${cy} A ${r} ${r} 0 ${largeArc} 0 ${endX.toFixed(2)} ${endY.toFixed(2)}`;
}

interface IntensityGaugeProps {
  avgHr: number;
  maxHr: number;
}

function IntensityGauge({ avgHr, maxHr }: IntensityGaugeProps) {
  const pct = Math.round((avgHr / maxHr) * 100);
  const v = avgHr / maxHr;
  const color = intensityColor(pct);
  const zone = intensityZone(pct);
  const CX = 110, CY = 105, R = 88;

  return (
    <div className="flex flex-col items-center gap-3">
      <svg viewBox="0 0 220 120" className="w-full max-w-xs">
        {/* Hintergrund-Track */}
        <path
          d={`M ${CX - R} ${CY} A ${R} ${R} 0 1 0 ${CX + R} ${CY}`}
          fill="none" stroke="currentColor" strokeWidth="16"
          strokeLinecap="round" className="text-muted/60"
        />
        {/* Füll-Track */}
        {v > 0 && (
          <path
            d={gaugeArcPath(CX, CY, R, v)}
            fill="none" stroke={color} strokeWidth="16"
            strokeLinecap="round"
          />
        )}
        {/* Wert */}
        <text x={CX} y={CY - 18} textAnchor="middle" fontSize="30" fontWeight="700" fill={color}>
          {pct}%
        </text>
        <text x={CX} y={CY - 2} textAnchor="middle" fontSize="11" fill="#9ca3af">
          Intensität
        </text>
        {/* Skalen-Labels */}
        <text x={CX - R - 4} y={CY + 16} textAnchor="middle" fontSize="10" fill="#9ca3af">0%</text>
        <text x={CX + R + 4} y={CY + 16} textAnchor="middle" fontSize="10" fill="#9ca3af">100%</text>
      </svg>

      <div className="text-center">
        <p className="text-sm font-semibold" style={{ color }}>{zone}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Ø {Math.round(avgHr)} bpm · Max {Math.round(maxHr)} bpm
        </p>
      </div>
    </div>
  );
}

// ─── Datum-Formatierung ───────────────────────────────────────────────────────

function fmtFullDate(iso: string): { weekday: string; date: string; time: string } {
  const d = new Date(iso + (iso.includes('Z') ? '' : 'Z'));
  const weekday = d.toLocaleDateString('de-DE', { weekday: 'long' });
  const date = d.toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' });
  const time = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + ' Uhr';
  return { weekday, date, time };
}

function fmtShortDate(iso: string): string {
  const d = new Date(iso + (iso.includes('Z') ? '' : 'Z'));
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

// ─── Count-Up Hook ────────────────────────────────────────────────────────────

function useCountUp(target: number, duration = 900): number {
  const [val, setVal] = useState(0);
  const ref = useRef<number | null>(null);
  useEffect(() => {
    const start = performance.now();
    function tick(now: number) {
      const t = Math.min((now - start) / duration, 1);
      const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      setVal(Math.round(ease * target));
      if (t < 1) ref.current = requestAnimationFrame(tick);
    }
    ref.current = requestAnimationFrame(tick);
    return () => { if (ref.current !== null) cancelAnimationFrame(ref.current); };
  }, [target, duration]);
  return val;
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, unit, sub }: { label: string; value: string; unit?: string; sub?: string }) {
  return (
    <Card className="shadow-sm">
      <CardContent className="p-5 flex flex-col gap-1">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold tabular-nums">
          {value}
          {unit && <span className="ml-1 text-sm font-normal text-muted-foreground">{unit}</span>}
        </p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

// ─── Delta Badge ──────────────────────────────────────────────────────────────

function Delta({ label, current, avg, unit, isTime = false }: {
  label: string; current: number; avg: number; unit: string; isTime?: boolean;
}) {
  const diff = current - avg;
  const pct = avg !== 0 ? Math.round((diff / avg) * 100) : 0;
  const pos = diff > 0;
  const neutral = Math.abs(diff) < avg * 0.02; // < 2% → neutral
  const color = neutral ? 'text-muted-foreground' : pos ? 'text-emerald-500' : 'text-orange-500';
  const arrow = neutral ? '·' : pos ? '↑' : '↓';
  const displayDiff = isTime
    ? `${pos ? '+' : ''}${Math.round(diff / 60)} min`
    : `${pos ? '+' : ''}${Math.round(diff)} ${unit}`;

  return (
    <div className="flex flex-col items-center gap-0.5 rounded-lg bg-muted/40 px-4 py-3 text-center">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('text-lg font-bold', color)}>{arrow} {isTime ? fmtTime(current) : `${Math.round(current)} ${unit}`}</p>
      <p className={cn('text-xs', color)}>{displayDiff} vs. Ø {pct !== 0 && `(${pct > 0 ? '+' : ''}${pct}%)`}</p>
    </div>
  );
}

// ─── Verlauf-Chart ────────────────────────────────────────────────────────────

type ChartMetric = 'dauer' | 'kalorien';

function VerlaufTooltip({ active, payload, metric }: { active?: boolean; payload?: any[]; metric: ChartMetric }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  const value = metric === 'dauer'
    ? (d?.dauer != null ? `${d.dauer} min` : null)
    : (d?.kalorien != null ? `${d.kalorien} kcal` : null);
  return (
    <ChartTooltip
      active={active}
      label={d?.date ?? undefined}
      rows={[{ label: metric === 'dauer' ? 'Dauer' : 'Kalorien', value }]}
    />
  );
}

function VerlaufChart({ history, currentId }: { history: WorkoutDetail['history']; currentId: number }) {
  const { chart_height_compact } = useConfig();
  const [metric, setMetric] = useState<ChartMetric>('dauer');

  const data = history.map(h => ({
    id: h.id,
    date: fmtShortDate(h.start_date_local),
    fullDate: h.start_date_local,
    dauer: Math.round(h.moving_time_s / 60),
    kalorien: h.calories != null ? Math.round(h.calories) : null,
    isCurrent: h.id === currentId,
  }));

  const currentIdx = data.findIndex(d => d.isCurrent);
  const yKey = metric === 'dauer' ? 'dauer' : 'kalorien';
  const currentVal = currentIdx >= 0 ? data[currentIdx][yKey] : null;

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Verlauf · {history.length} Einheiten
          </CardTitle>
          <div className="flex gap-1 rounded-md bg-muted p-1">
            {(['dauer', 'kalorien'] as ChartMetric[]).map(m => (
              <button
                key={m}
                onClick={() => setMetric(m)}
                className={cn(
                  'rounded px-2.5 py-0.5 text-xs font-medium transition-colors capitalize',
                  metric === m ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {m === 'dauer' ? 'Dauer' : 'Kalorien'}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <ResponsiveContainer width="100%" height={chart_height_compact}>
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.1} />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} width={36}
              tickFormatter={v => metric === 'dauer' ? `${v}m` : `${v}`} />
            <Tooltip content={(props) => <VerlaufTooltip {...props} metric={metric} />} />
            <Line
              type="monotone" dataKey={yKey} dot={false}
              stroke="hsl(var(--primary))" strokeWidth={2}
              connectNulls={false}
            />
            {currentVal != null && currentIdx >= 0 && (
              <ReferenceDot
                x={data[currentIdx].date} y={currentVal}
                r={5} fill="hsl(var(--primary))" stroke="white" strokeWidth={2}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// ─── Haupt-Seite ──────────────────────────────────────────────────────────────

export default function WorkoutDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<WorkoutDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api.workout(parseInt(id))
      .then(setData)
      .catch(e => setError(e instanceof Error ? e.message : 'Fehler'))
      .finally(() => setLoading(false));
  }, [id]);

  const durationMin = useCountUp(data ? Math.round(data.moving_time_s / 60) : 0);
  const calories = useCountUp(data?.calories ? Math.round(data.calories) : 0);
  const avgHr = useCountUp(data?.avg_hr ? Math.round(data.avg_hr) : 0);
  const maxHr = useCountUp(data?.max_hr ? Math.round(data.max_hr) : 0);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-32 animate-pulse rounded bg-muted" />
        <div className="h-36 animate-pulse rounded-xl bg-muted" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[0, 1, 2, 3].map(i => <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />)}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft size={14} /> Zurück
        </button>
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {error ?? 'Workout nicht gefunden'}
        </div>
      </div>
    );
  }

  const sport = getSportConfig(data.sport_type);
  const dt = fmtFullDate(data.start_date_local);
  const kcalPerHour = data.calories && data.moving_time_s
    ? Math.round(data.calories / (data.moving_time_s / 3600))
    : null;
  const hasIntensity = data.avg_hr != null && data.max_hr != null && data.max_hr > 0;
  const hasHistory = data.history.length > 1;

  return (
    <div className="space-y-6">
      {/* Zurück */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft size={14} /> Zurück zur Liste
      </button>

      {/* Hero */}
      <Card className={cn('overflow-hidden shadow-sm bg-gradient-to-br', sport.heroCls)}>
        <CardContent className="p-6">
          <div className="flex items-start gap-5">
            <div className={cn('flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-background/80 shadow-sm', sport.iconCls)}>
              {sport.icon}
            </div>
            <div className="min-w-0 flex-1">
              <span className={cn('inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium', sport.badgeCls)}>
                {sport.label}
              </span>
              <h1 className="mt-1.5 truncate text-xl font-bold leading-tight">{data.name}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {dt.weekday}, {dt.date} · {dt.time}
              </p>
              <div className="mt-3 flex items-center gap-1.5 text-muted-foreground">
                <Timer size={14} />
                <span className="text-sm font-medium">{fmtTime(data.moving_time_s)}</span>
                {data.moving_time_s !== data.elapsed_time_s && (
                  <span className="text-xs text-muted-foreground/60">
                    ({fmtTime(data.elapsed_time_s)} gesamt)
                  </span>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard
          label="Dauer"
          value={fmtTime(data.moving_time_s)}
          sub={`${durationMin} Minuten`}
        />
        <KpiCard
          label="Kalorien"
          value={data.calories != null ? `${calories}` : '–'}
          unit={data.calories != null ? 'kcal' : undefined}
          sub={kcalPerHour != null ? `≈ ${kcalPerHour} kcal/h` : undefined}
        />
        <KpiCard
          label="Ø Herzfrequenz"
          value={data.avg_hr != null ? `${avgHr}` : '–'}
          unit={data.avg_hr != null ? 'bpm' : undefined}
        />
        <KpiCard
          label="Max Herzfrequenz"
          value={data.max_hr != null ? `${maxHr}` : '–'}
          unit={data.max_hr != null ? 'bpm' : undefined}
        />
      </div>

      {/* Intensität + Verlauf nebeneinander wenn beides vorhanden */}
      <div className={cn('grid gap-6', hasIntensity && hasHistory ? 'lg:grid-cols-2' : '')}>
        {/* Intensitätsgauge */}
        {hasIntensity && (
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                <HeartPulse size={14} /> Intensität
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-6">
              <IntensityGauge avgHr={data.avg_hr!} maxHr={data.max_hr!} />
            </CardContent>
          </Card>
        )}

        {/* Verlauf-Chart */}
        {hasHistory && (
          <VerlaufChart history={data.history} currentId={data.id} />
        )}
      </div>

      {/* Vergleich mit Ø */}
      {hasHistory && (
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Diese Einheit vs. Ø aller {sport.label}-Einheiten
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {data.avg_moving_time_s != null && (
                <Delta
                  label="Dauer" current={data.moving_time_s}
                  avg={data.avg_moving_time_s} unit="s" isTime
                />
              )}
              {data.avg_calories != null && data.calories != null && (
                <Delta
                  label="Kalorien" current={data.calories}
                  avg={data.avg_calories} unit="kcal"
                />
              )}
              {data.avg_hr != null && (() => {
                const avgHrHistory = data.history.filter(h => h.avg_hr != null);
                if (avgHrHistory.length < 2) return null;
                const meanHr = avgHrHistory.reduce((s, h) => s + h.avg_hr!, 0) / avgHrHistory.length;
                return (
                  <Delta label="Ø HR" current={data.avg_hr!} avg={meanHr} unit="bpm" />
                );
              })()}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
