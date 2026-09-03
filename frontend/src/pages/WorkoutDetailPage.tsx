import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { ArrowLeft, Dumbbell, Zap, Activity, Timer, HeartPulse } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceDot,
} from 'recharts';
import { api, type WorkoutDetail } from '@/lib/api';
import { fmtTime } from '@/lib/format';
import { workoutTitle } from '@/lib/activity-display';
import { useConfig } from '@/lib/config-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { ChartTooltip } from '@/components/ui/chart-tooltip';

// ─── Sport-Typ Konfiguration ──────────────────────────────────────────────────
// sport_type ist seit der i18n-Umstellung ein kanonischer Code (siehe
// backend/importer/sport_codes.py) – das Label kommt aus common.json (Namespace "sport").

interface SportConfig {
  label: string;
  icon: React.ReactNode;
  badgeCls: string;
  heroCls: string;   // gradient bg für Hero
  iconCls: string;   // Farbe des Icons
}

const SPORT_STYLE: Record<string, Omit<SportConfig, 'label'>> = {
  strength_training: { icon: <Dumbbell size={36} />, badgeCls: 'bg-orange-500/15 text-orange-500 border-orange-500/25', heroCls: 'from-orange-500/10 to-orange-500/5', iconCls: 'text-orange-500' },
  cardio:            { icon: <Activity size={36} />, badgeCls: 'bg-yellow-500/15 text-yellow-600 border-yellow-500/25', heroCls: 'from-yellow-500/10 to-yellow-500/5', iconCls: 'text-yellow-500' },
  training:          { icon: <Zap     size={36} />, badgeCls: 'bg-blue-500/15 text-blue-500 border-blue-500/25',       heroCls: 'from-blue-500/10 to-blue-500/5',   iconCls: 'text-blue-500' },
};

function getSportConfig(sportType: string, t: TFunction<'common'>): SportConfig {
  const style = SPORT_STYLE[sportType] ?? {
    icon: <Activity size={36} />,
    badgeCls: 'bg-muted text-muted-foreground border-border/60',
    heroCls: 'from-muted/30 to-muted/10',
    iconCls: 'text-muted-foreground',
  };
  return { ...style, label: t(`sport.${sportType}`, { defaultValue: sportType }) };
}

// ─── Intensitäts-Gauge ────────────────────────────────────────────────────────

function intensityColor(pct: number): string {
  if (pct < 60) return '#60a5fa';
  if (pct < 70) return '#34d399';
  if (pct < 80) return '#fbbf24';
  if (pct < 90) return '#f97316';
  return '#ef4444';
}

function intensityZone(pct: number, t: TFunction<'workoutdetail'>): string {
  if (pct < 60) return t('gauge.zones.veryEasy');
  if (pct < 70) return t('gauge.zones.easy');
  if (pct < 80) return t('gauge.zones.aerobic');
  if (pct < 90) return t('gauge.zones.threshold');
  return t('gauge.zones.max');
}

function gaugeArcPath(cx: number, cy: number, r: number, v: number): string {
  if (v <= 0) return '';
  const clamped = Math.min(v, 0.9999);
  const endAngle = (1 - clamped) * 180; // degrees from positive x-axis
  const rad = (endAngle * Math.PI) / 180;
  const endX = cx + r * Math.cos(rad);
  const endY = cy - r * Math.sin(rad);
  // Halbkreis-Gauge: der Bogen von 0% (links) bis 100% (rechts) über den Scheitel ist
  // für jeden Füllstand ≤180° – das SVG large-arc-flag muss deshalb immer 0 sein.
  // sweep-flag muss 1 sein (im Uhrzeigersinn: links → oben → rechts); bei 0 zeichnet SVG
  // stattdessen unterhalb der Grundlinie, was von der viewBox abgeschnitten wird.
  return `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${endX.toFixed(2)} ${endY.toFixed(2)}`;
}

interface IntensityGaugeProps {
  avgHr: number;
  hrMax: number;
  ratio: number;
  t: TFunction<'workoutdetail'>;
}

// avgHr ist der roh gemessene Wert (Anzeige-Text) – ratio kommt separat, da sie bei
// aktivierter Betablocker-Korrektur (backend/api/zones.py: corrected_hr()) höher liegt
// als avgHr/hrMax. Analog zum Rest der App fließt die Korrektur nur unsichtbar in die
// Zonen-/Prozent-Einordnung ein, angezeigte bpm-Werte bleiben immer die echte Messung.
function IntensityGauge({ avgHr, hrMax, ratio, t }: IntensityGaugeProps) {
  const pct = Math.round(ratio * 100);
  const v = ratio;
  const color = intensityColor(pct);
  const zone = intensityZone(pct, t);
  const CX = 110, CY = 105, R = 88;

  return (
    <div className="flex flex-col items-center gap-3">
      <svg viewBox="0 0 220 120" className="w-full max-w-xs">
        {/* Hintergrund-Track */}
        <path
          d={`M ${CX - R} ${CY} A ${R} ${R} 0 1 1 ${CX + R} ${CY}`}
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
          {t('gauge.label')}
        </text>
        {/* Skalen-Labels */}
        <text x={CX - R - 4} y={CY + 16} textAnchor="middle" fontSize="10" fill="#9ca3af">0%</text>
        <text x={CX + R + 4} y={CY + 16} textAnchor="middle" fontSize="10" fill="#9ca3af">100%</text>
      </svg>

      <div className="text-center">
        <p className="text-sm font-semibold" style={{ color }}>{zone}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {t('gauge.statsHrMax', { avgHr: Math.round(avgHr), hrMax: Math.round(hrMax) })}
        </p>
      </div>
    </div>
  );
}

// ─── Datum-Formatierung ───────────────────────────────────────────────────────

function fmtFullDate(iso: string, timeSuffix: string): { weekday: string; date: string; time: string } {
  const d = new Date(iso + (iso.includes('Z') ? '' : 'Z'));
  const weekday = d.toLocaleDateString('de-DE', { weekday: 'long' });
  const date = d.toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' });
  const time = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + timeSuffix;
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

function Delta({ label, current, avg, unit, isTime = false, t }: {
  label: string; current: number; avg: number; unit: string; isTime?: boolean; t: TFunction<'workoutdetail'>;
}) {
  const diff = current - avg;
  const pct = avg !== 0 ? Math.round((diff / avg) * 100) : 0;
  const pos = diff > 0;
  const neutral = Math.abs(diff) < avg * 0.02; // < 2% → neutral
  const color = neutral ? 'text-muted-foreground' : pos ? 'text-emerald-500' : 'text-orange-500';
  const arrow = neutral ? '·' : pos ? '↑' : '↓';
  const displayDiff = isTime
    ? `${pos ? '+' : ''}${Math.round(diff / 60)} ${t('comparison.minutesShort')}`
    : `${pos ? '+' : ''}${Math.round(diff)} ${unit}`;

  return (
    <div className="flex flex-col items-center gap-0.5 rounded-lg bg-muted/40 px-4 py-3 text-center">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('text-lg font-bold', color)}>{arrow} {isTime ? fmtTime(current) : `${Math.round(current)} ${unit}`}</p>
      <p className={cn('text-xs', color)}>{displayDiff} {t('comparison.vsAvg')} {pct !== 0 && `(${pct > 0 ? '+' : ''}${pct}%)`}</p>
    </div>
  );
}

// ─── Verlauf-Chart ────────────────────────────────────────────────────────────

type ChartMetric = 'dauer' | 'kalorien';

function VerlaufTooltip({ active, payload, metric, t }: { active?: boolean; payload?: readonly any[]; metric: ChartMetric; t: TFunction<'workoutdetail'> }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  const value = metric === 'dauer'
    ? (d?.dauer != null ? `${d.dauer} min` : null)
    : (d?.kalorien != null ? `${d.kalorien} kcal` : null);
  return (
    <ChartTooltip
      active={active}
      label={d?.date ?? undefined}
      rows={[{ label: metric === 'dauer' ? t('history.duration') : t('history.calories'), value }]}
    />
  );
}

function VerlaufChart({ history, currentId, t }: { history: WorkoutDetail['history']; currentId: number; t: TFunction<'workoutdetail'> }) {
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
            {t('history.title', { count: history.length })}
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
                {m === 'dauer' ? t('history.duration') : t('history.calories')}
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
            <Tooltip content={(props) => <VerlaufTooltip {...props} metric={metric} t={t} />} />
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
  const { t } = useTranslation(['workoutdetail', 'common']);
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<WorkoutDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api.workout(parseInt(id))
      .then(setData)
      .catch(e => setError(e instanceof Error ? e.message : t('error')))
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
          <ArrowLeft size={14} /> {t('back')}
        </button>
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {error ?? t('notFound')}
        </div>
      </div>
    );
  }

  const sport = getSportConfig(data.sport_type, t);
  const dt = fmtFullDate(data.start_date_local, t('dateTime.timeSuffix'));
  const kcalPerHour = data.calories && data.moving_time_s
    ? Math.round(data.calories / (data.moving_time_s / 3600))
    : null;
  const hasIntensity = data.avg_hr != null && data.hr_max > 0;
  const hasHistory = data.history.length > 1;
  const hasExtraKpis = data.min_hr != null || data.avg_cadence != null || data.max_cadence != null
    || data.training_effect != null || data.anaerobic_training_effect != null;

  return (
    <div className="space-y-6">
      {/* Zurück */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft size={14} /> {t('backButton')}
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
              <h1 className="mt-1.5 truncate text-xl font-bold leading-tight">{workoutTitle(data, t)}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {dt.weekday}, {dt.date} · {dt.time}
              </p>
              <div className="mt-3 flex items-center gap-1.5 text-muted-foreground">
                <Timer size={14} />
                <span className="text-sm font-medium">{fmtTime(data.moving_time_s)}</span>
                {data.moving_time_s !== data.elapsed_time_s && (
                  <span className="text-xs text-muted-foreground/60">
                    {t('totalTime', { time: fmtTime(data.elapsed_time_s) })}
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
          label={t('kpi.duration')}
          value={fmtTime(data.moving_time_s)}
          sub={t('kpi.durationSub', { minutes: durationMin })}
        />
        <KpiCard
          label={t('kpi.calories')}
          value={data.calories != null ? `${calories}` : '–'}
          unit={data.calories != null ? 'kcal' : undefined}
          sub={kcalPerHour != null ? t('kpi.caloriesPerHour', { value: kcalPerHour }) : undefined}
        />
        <KpiCard
          label={t('kpi.avgHr')}
          value={data.avg_hr != null ? `${avgHr}` : '–'}
          unit={data.avg_hr != null ? 'bpm' : undefined}
        />
        <KpiCard
          label={t('kpi.maxHr')}
          value={data.max_hr != null ? `${maxHr}` : '–'}
          unit={data.max_hr != null ? 'bpm' : undefined}
        />
      </div>

      {/* Zusätzliche Kennzahlen – nur wenn das importierte Gerät/Format sie liefert */}
      {hasExtraKpis && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {data.min_hr != null && (
            <KpiCard label={t('kpi.minHr')} value={`${data.min_hr}`} unit="bpm" />
          )}
          {data.avg_cadence != null && (
            <KpiCard label={t('kpi.avgCadence')} value={`${data.avg_cadence}`} unit="rpm" />
          )}
          {data.max_cadence != null && (
            <KpiCard label={t('kpi.maxCadence')} value={`${data.max_cadence}`} unit="rpm" />
          )}
          {data.training_effect != null && (
            <KpiCard label={t('kpi.trainingEffect')} value={data.training_effect.toFixed(1)} />
          )}
          {data.anaerobic_training_effect != null && (
            <KpiCard label={t('kpi.anaerobicTrainingEffect')} value={data.anaerobic_training_effect.toFixed(1)} />
          )}
        </div>
      )}

      {/* Intensität + Verlauf nebeneinander wenn beides vorhanden */}
      <div className={cn('grid gap-6', hasIntensity && hasHistory ? 'lg:grid-cols-2' : '')}>
        {/* Intensitätsgauge */}
        {hasIntensity && (
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                <HeartPulse size={14} /> {t('gauge.title')}
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-6">
              <IntensityGauge
                avgHr={data.avg_hr!}
                hrMax={data.hr_max}
                ratio={(data.avg_hr_corrected ?? data.avg_hr!) / data.hr_max}
                t={t}
              />
            </CardContent>
          </Card>
        )}

        {/* Verlauf-Chart */}
        {hasHistory && (
          <VerlaufChart history={data.history} currentId={data.id} t={t} />
        )}
      </div>

      {/* Vergleich mit Ø */}
      {hasHistory && (
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              {t('comparison.title', { sport: sport.label })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {data.avg_moving_time_s != null && (
                <Delta
                  label={t('comparison.duration')} current={data.moving_time_s}
                  avg={data.avg_moving_time_s} unit="s" isTime t={t}
                />
              )}
              {data.avg_calories != null && data.calories != null && (
                <Delta
                  label={t('comparison.calories')} current={data.calories}
                  avg={data.avg_calories} unit="kcal" t={t}
                />
              )}
              {data.avg_hr != null && (() => {
                const avgHrHistory = data.history.filter(h => h.avg_hr != null);
                if (avgHrHistory.length < 2) return null;
                const meanHr = avgHrHistory.reduce((s, h) => s + h.avg_hr!, 0) / avgHrHistory.length;
                return (
                  <Delta label={t('comparison.avgHr')} current={data.avg_hr!} avg={meanHr} unit="bpm" t={t} />
                );
              })()}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
