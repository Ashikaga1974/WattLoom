import { useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Area, AreaChart, Cell, ReferenceLine,
} from 'recharts';
import { useConfig } from '@/lib/config-context';
import { fmtDayFull } from '@/lib/format';

// --- Wind-Impact-Typen und Hilfsfunktionen ---

interface WindPt {
  wind_ms: number;
  speed_kmh: number;
  hr: number;
  dist_km: number;
}

interface WindBucket {
  label: string;
  count: number;
  avg_speed: number;
  avg_hr: number;
  isBest: boolean;
}

const WIND_BUCKET_DEFS = [
  { label: '0–2 m/s', min: 0, max: 2 },
  { label: '2–4 m/s', min: 2, max: 4 },
  { label: '4–7 m/s', min: 4, max: 7 },
  { label: '7–10 m/s', min: 7, max: 10 },
  { label: '> 10 m/s', min: 10, max: Infinity },
];

function buildWindBuckets(pts: WindPt[]): WindBucket[] {
  const raw = WIND_BUCKET_DEFS.map(b => {
    const bPts = pts.filter(p => p.wind_ms >= b.min && p.wind_ms < b.max);
    if (bPts.length < 2) return null;
    const avg_speed = bPts.reduce((s, p) => s + p.speed_kmh, 0) / bPts.length;
    const avg_hr = bPts.reduce((s, p) => s + p.hr, 0) / bPts.length;
    return {
      label: b.label,
      count: bPts.length,
      avg_speed: +avg_speed.toFixed(1),
      avg_hr: +avg_hr.toFixed(0),
      isBest: false,
    };
  }).filter((b): b is WindBucket => b !== null);

  if (raw.length > 0) {
    const bestIdx = raw.reduce((bi, b, i) => b.avg_speed > raw[bi].avg_speed ? i : bi, 0);
    raw[bestIdx].isBest = true;
  }
  return raw;
}

function WindTooltip({ active, payload, label }: { active?: boolean; payload?: { payload: WindBucket }[]; label?: string }) {
  const { t } = useTranslation('tempcorr');
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-background/95 px-3 py-2 text-sm shadow-md backdrop-blur">
      <p className="font-semibold mb-1.5">{label}</p>
      <div className="flex flex-col gap-1 text-xs">
        <span style={{ color: 'var(--primary)' }}>{t('tooltip.avgSpeed', { value: d.avg_speed })}</span>
        <span style={{ color: 'var(--chart-2)' }}>{t('tooltip.avgHr', { value: d.avg_hr })}</span>
        <span className="text-muted-foreground">{t('tooltip.rides', { count: d.count })}</span>
      </div>
    </div>
  );
}

interface TimelinePt {
  day: string;
  ts: number;
  temp_c: number;
  wind_ms: number | null;
  rides: number;
  rained: boolean;
  rain_flag: number;
  rolling_temp_c: number | null;
  rolling_wind_ms: number | null;
}

const TIMELINE_ROLLING_WINDOW = 15;

/** Trailing gleitender Ø über die letzten n Tage mit Daten (nicht Kalendertage) – glättet die
    Tageswerte zu einer Trendlinie, ohne die Rohwerte selbst zu verändern. Wind kann pro Tag
    null sein (kein Wert von Open-Meteo) – fließt dann nicht in den Fensterschnitt ein. */
function withRollingAverage(pts: Omit<TimelinePt, 'rolling_temp_c' | 'rolling_wind_ms'>[]): TimelinePt[] {
  return pts.map((p, i) => {
    const windowSlice = pts.slice(Math.max(0, i - (TIMELINE_ROLLING_WINDOW - 1)), i + 1);
    const avg = windowSlice.reduce((s, w) => s + w.temp_c, 0) / windowSlice.length;
    const windSlice = windowSlice.filter((w): w is typeof w & { wind_ms: number } => w.wind_ms != null);
    const windAvg = windSlice.length ? windSlice.reduce((s, w) => s + w.wind_ms, 0) / windSlice.length : null;
    return { ...p, rolling_temp_c: +avg.toFixed(1), rolling_wind_ms: windAvg != null ? +windAvg.toFixed(1) : null };
  });
}

function formatTimelineTick(ts: number): string {
  return new Date(ts).toLocaleDateString('de-DE', { month: 'short', year: '2-digit' });
}

function TimelineTooltip({ active, payload }: { active?: boolean; payload?: { payload: TimelinePt }[] }) {
  const { t } = useTranslation('tempcorr');
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-background/95 px-3 py-2 text-sm shadow-md backdrop-blur">
      <p className="font-semibold mb-1.5">{fmtDayFull(d.day)}</p>
      <div className="flex flex-col gap-1 text-xs">
        <span style={{ color: 'var(--primary)' }}>{t('timeline.temp', { value: d.temp_c })}</span>
        {d.wind_ms != null && (
          <span style={{ color: 'var(--chart-4)' }}>{t('timeline.wind', { value: d.wind_ms })}</span>
        )}
        <span style={{ color: d.rained ? 'var(--chart-2)' : 'var(--muted-foreground)' }}>
          {d.rained ? t('timeline.rained') : t('timeline.dry')}
        </span>
        <span className="text-muted-foreground">{t('tooltip.rides', { count: d.rides })}</span>
      </div>
    </div>
  );
}

interface Pt {
  temp_c: number;
  speed_kmh: number;
  hr: number;
  year: number;
  dist_km: number;
}

interface Bucket {
  label: string;
  count: number;
  avg_speed: number;
  avg_hr: number;
  efficiency: number;
  isBest: boolean;
}

const BUCKET_DEFS = [
  { label: '< 0°', min: -Infinity, max: 0 },
  { label: '0–5°', min: 0, max: 5 },
  { label: '5–10°', min: 5, max: 10 },
  { label: '10–15°', min: 10, max: 15 },
  { label: '15–20°', min: 15, max: 20 },
  { label: '20–25°', min: 20, max: 25 },
  { label: '25–30°', min: 25, max: 30 },
  { label: '> 30°', min: 30, max: Infinity },
];

function buildBuckets(pts: Pt[]): Bucket[] {
  const raw = BUCKET_DEFS.map(b => {
    const bPts = pts.filter(p => p.temp_c >= b.min && p.temp_c < b.max);
    if (bPts.length < 2) return null;
    const avg_speed = bPts.reduce((s, p) => s + p.speed_kmh, 0) / bPts.length;
    const avg_hr = bPts.reduce((s, p) => s + p.hr, 0) / bPts.length;
    return {
      label: b.label,
      count: bPts.length,
      avg_speed: +avg_speed.toFixed(1),
      avg_hr: +avg_hr.toFixed(0),
      efficiency: +(avg_speed / avg_hr * 100).toFixed(2),
      isBest: false,
    };
  }).filter((b): b is Bucket => b !== null);

  if (raw.length > 0) {
    const bestIdx = raw.reduce((bi, b, i) => b.efficiency > raw[bi].efficiency ? i : bi, 0);
    raw[bestIdx].isBest = true;
  }
  return raw;
}

function MainTooltip({ active, payload, label }: { active?: boolean; payload?: { payload: Bucket }[]; label?: string }) {
  const { t } = useTranslation('tempcorr');
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-background/95 px-3 py-2 text-sm shadow-md backdrop-blur">
      <p className="font-semibold mb-1.5">{label}</p>
      <div className="flex flex-col gap-1 text-xs">
        <span style={{ color: 'var(--primary)' }}>{t('tooltip.avgSpeed', { value: d.avg_speed })}</span>
        <span style={{ color: 'var(--chart-2)' }}>{t('tooltip.avgHr', { value: d.avg_hr })}</span>
        <span className="text-muted-foreground">{t('tooltip.rides', { count: d.count })}</span>
      </div>
    </div>
  );
}

function EffTooltip({ active, payload, label }: { active?: boolean; payload?: { value?: number }[]; label?: string }) {
  const { t } = useTranslation('tempcorr');
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-background/95 px-3 py-2 text-sm shadow-md backdrop-blur">
      <p className="font-semibold mb-1">{label}</p>
      <p className="text-xs" style={{ color: 'var(--primary)' }}>{t('tooltip.efficiency', { value: Number(payload[0].value).toFixed(2) })}</p>
    </div>
  );
}

export default function TempCorrPage() {
  const { t } = useTranslation('tempcorr');
  const config = useConfig();
  const [pts, setPts] = useState<Pt[]>([]);
  const [windPts, setWindPts] = useState<WindPt[]>([]);
  const [timelinePts, setTimelinePts] = useState<TimelinePt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.tempCorrelation(), api.windImpact(), api.weatherTimeline()])
      .then(([tempRes, windRes, timelineRes]) => {
        setPts(tempRes.points.filter(p => p.year >= 2000));
        setWindPts(windRes.points);
        const withTs = timelineRes.points.map(p => ({
          day: p.day,
          ts: new Date(`${p.day}T00:00:00`).getTime(),
          temp_c: p.temp_c,
          wind_ms: p.wind_ms,
          rides: p.rides,
          rained: p.rained,
          rain_flag: p.rained ? 1 : 0,
        }));
        setTimelinePts(withRollingAverage(withTs));
      })
      .catch(e => setError(e instanceof Error ? e.message : t('errorFallback')))
      .finally(() => setLoading(false));
  }, []);

  const buckets = useMemo(() => pts.length ? buildBuckets(pts) : [], [pts]);
  const windBuckets = useMemo(() => windPts.length ? buildWindBuckets(windPts) : [], [windPts]);

  const sweet = buckets.find(b => b.isBest);
  const fastest = buckets.length
    ? buckets.reduce((a, b) => b.avg_speed > a.avg_speed ? b : a, buckets[0])
    : null;
  const calmest = buckets.length
    ? buckets.reduce((a, b) => b.avg_hr < a.avg_hr ? b : a, buckets[0])
    : null;

  const timelineTempMin = timelinePts.length ? Math.floor(Math.min(...timelinePts.map(p => p.temp_c)) / 5) * 5 - 5 : -5;
  const timelineTempMax = timelinePts.length ? Math.ceil(Math.max(...timelinePts.map(p => p.temp_c)) / 5) * 5 + 5 : 30;
  const timelineTempTicks = useMemo(() => {
    const ticks: number[] = [];
    for (let v = timelineTempMin; v <= timelineTempMax; v += 5) ticks.push(v);
    return ticks;
  }, [timelineTempMin, timelineTempMax]);
  const timelineMaxWind = useMemo(() => {
    const winds = timelinePts.map(p => p.wind_ms).filter((w): w is number => w != null);
    return winds.length ? Math.max(...winds) : 1;
  }, [timelinePts]);

  const speedMin = buckets.length ? Math.floor(Math.min(...buckets.map(b => b.avg_speed)) - 2) : 0;
  const speedMax = buckets.length ? Math.ceil(Math.max(...buckets.map(b => b.avg_speed)) + 2) : 40;
  const hrMin = buckets.length ? Math.floor(Math.min(...buckets.map(b => b.avg_hr)) - 5) : 100;
  const hrMax = buckets.length ? Math.ceil(Math.max(...buckets.map(b => b.avg_hr)) + 5) : 170;
  const effMin = buckets.length ? +(Math.min(...buckets.map(b => b.efficiency)) - 0.3).toFixed(1) : 0;
  const effMax = buckets.length ? +(Math.max(...buckets.map(b => b.efficiency)) + 0.3).toFixed(1) : 20;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle', { count: pts.length })}
      />

      {error && <EmptyState message={error} />}

      {loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            {[0, 1, 2].map(i => (
              <Card key={i}><CardContent className="pt-6"><Skeleton className="h-16 w-full" /></CardContent></Card>
            ))}
          </div>
          <Card><CardContent className="pt-6"><Skeleton className="h-64 w-full" /></CardContent></Card>
        </div>
      ) : buckets.length > 0 ? (
        <>
          {/* Disclaimer */}
          <p className="text-xs text-muted-foreground border border-border rounded-md px-3 py-2">
            {t('disclaimer')}
          </p>

          {/* Temperatur-, Wind- & Regenverlauf über alle Jahre – ein Wert je Tag (kein Monats-Ø).
              Drei eng zusammenhängende Reihen mit gemeinsamer Zeitachse statt eines
              Dual-Axis-Charts: °C, m/s und "hat es geregnet" sind unterschiedliche Skalen –
              eine zweite Achse auf demselben Plot würde eine Korrelation vortäuschen, die so
              nicht in den Daten steckt (Dataviz-Regel "kein Dual-Axis-Chart"). Regen läuft
              dafür als eigener schmaler „Barcode"-Streifen statt als Punktfarbe auf der
              Temperaturlinie – das hatte zuvor unruhig gewirkt. */}
          {timelinePts.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">
                  {t('timeline.title')}{' '}
                  <span className="font-normal text-muted-foreground">{t('timeline.subtitle')}</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {/* Reihe 1: Temperatur (Rolling-Ø als Trendfläche + Tageswerte als dezente Punkte) */}
                <ResponsiveContainer width="100%" height={config.chart_height}>
                  <ComposedChart data={timelinePts} margin={{ top: 8, right: 10, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="timelineTempGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.22} />
                        <stop offset="95%" stopColor="var(--primary)" stopOpacity={0.01} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.5} />
                    <XAxis dataKey="ts" type="number" domain={['dataMin', 'dataMax']} hide />
                    <YAxis
                      domain={[timelineTempMin, timelineTempMax]}
                      ticks={timelineTempTicks}
                      tickFormatter={v => `${v}°`}
                      tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                      axisLine={false}
                      tickLine={false}
                      width={36}
                    />
                    <Tooltip content={<TimelineTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="rolling_temp_c"
                      stroke="var(--primary)"
                      strokeWidth={2.5}
                      fill="url(#timelineTempGrad)"
                      dot={false}
                      activeDot={false}
                      connectNulls
                      isAnimationActive={false}
                    />
                    <Line
                      dataKey="temp_c"
                      stroke="none"
                      isAnimationActive={false}
                      dot={{ r: 2, fill: 'var(--muted-foreground)', fillOpacity: 0.35, strokeWidth: 0 }}
                      activeDot={{ r: 5, fill: 'var(--primary)', stroke: 'var(--background)', strokeWidth: 2 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>

                {/* Reihe 2: Regen-Streifen – "Barcode" statt Punktfarbe, nur wo es tatsächlich geregnet hat */}
                <ResponsiveContainer width="100%" height={48}>
                  <ComposedChart data={timelinePts} margin={{ top: 0, right: 10, bottom: 0, left: 0 }}>
                    <XAxis dataKey="ts" type="number" domain={['dataMin', 'dataMax']} hide />
                    <YAxis domain={[0, 1]} hide />
                    <Tooltip content={<TimelineTooltip />} />
                    <Bar dataKey="rain_flag" fill="var(--chart-2)" maxBarSize={16} isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>

                {/* Reihe 3: Wind-Streifen – Intensität (Opacity) statt eigener Achse, trägt die Zeitachse,
                    plus gleitender Ø als durchgängige Linie über den Balken */}
                <ResponsiveContainer width="100%" height={100}>
                  <ComposedChart data={timelinePts} margin={{ top: 2, right: 10, bottom: 0, left: 0 }}>
                    <XAxis
                      dataKey="ts"
                      type="number"
                      domain={['dataMin', 'dataMax']}
                      scale="time"
                      tickCount={8}
                      tickFormatter={formatTimelineTick}
                      tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                      axisLine={false}
                      tickLine={false}
                      height={28}
                    />
                    <YAxis domain={[0, timelineMaxWind]} hide />
                    <Tooltip content={<TimelineTooltip />} />
                    <Bar dataKey="wind_ms" maxBarSize={16} isAnimationActive={false}>
                      {timelinePts.map((p, i) => (
                        <Cell
                          key={i}
                          fill="var(--chart-4)"
                          fillOpacity={p.wind_ms == null ? 0 : 0.15 + 0.65 * (p.wind_ms / timelineMaxWind)}
                        />
                      ))}
                    </Bar>
                    <Line
                      type="monotone"
                      dataKey="rolling_wind_ms"
                      stroke="var(--chart-4)"
                      strokeWidth={2}
                      dot={false}
                      activeDot={false}
                      connectNulls
                      isAnimationActive={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>

                <div className="flex items-center gap-5 justify-end text-xs text-muted-foreground mt-2 pr-1">
                  <span className="flex items-center gap-1.5">
                    <span className="w-4 h-0.5 inline-block rounded" style={{ background: 'var(--primary)' }} />
                    {t('timeline.legendTrend')}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: 'var(--chart-2)' }} />
                    {t('timeline.legendRain')}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: 'var(--chart-4)' }} />
                    {t('timeline.legendWind')}
                  </span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* KPI-Kacheln */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="ring-2 ring-primary/30">
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-muted-foreground">{t('kpi.sweetSpot')}</p>
                <p className="text-2xl font-bold mt-1" style={{ color: 'var(--primary)' }}>
                  {sweet?.label ?? '–'}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t('kpi.sweetSpotDetail', { efficiency: sweet?.efficiency.toFixed(2), count: sweet?.count })}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-muted-foreground">{t('kpi.fastestRange')}</p>
                <p className="text-2xl font-bold mt-1">{fastest?.label ?? '–'}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t('kpi.fastestDetail', { speed: fastest?.avg_speed, count: fastest?.count })}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-muted-foreground">{t('kpi.calmestRange')}</p>
                <p className="text-2xl font-bold mt-1">{calmest?.label ?? '–'}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t('kpi.calmestDetail', { hr: calmest?.avg_hr, count: calmest?.count })}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Haupt-Chart: Speed (Balken) + HR (Linie) */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">
                {t('chart.mainTitle')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={config.chart_height_dense}>
                <ComposedChart data={buckets} margin={{ top: 8, right: 48, bottom: 0, left: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.5} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="speed"
                    domain={[speedMin, speedMax]}
                    tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={v => `${v}`}
                    width={36}
                    label={{ value: 'km/h', angle: -90, position: 'insideLeft', offset: 10, fill: 'var(--muted-foreground)', fontSize: 11 }}
                  />
                  <YAxis
                    yAxisId="hr"
                    orientation="right"
                    domain={[hrMin, hrMax]}
                    tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                    axisLine={false}
                    tickLine={false}
                    width={42}
                    label={{ value: 'bpm', angle: 90, position: 'insideRight', offset: 10, fill: 'var(--muted-foreground)', fontSize: 11 }}
                  />
                  <Tooltip content={<MainTooltip />} />
                  <Bar yAxisId="speed" dataKey="avg_speed" radius={[4, 4, 0, 0]} maxBarSize={52}>
                    {buckets.map((b, i) => (
                      <Cell
                        key={i}
                        fill="var(--primary)"
                        fillOpacity={b.isBest ? 1 : 0.45}
                      />
                    ))}
                  </Bar>
                  <Line
                    yAxisId="hr"
                    dataKey="avg_hr"
                    stroke="var(--chart-2)"
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: 'var(--chart-2)', strokeWidth: 0 }}
                    activeDot={{ r: 6 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
              <div className="flex gap-5 justify-end text-xs text-muted-foreground mt-3 pr-1">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm inline-block" style={{ background: 'var(--primary)' }} />
                  {t('chart.legendSpeed')}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-4 h-0.5 inline-block rounded" style={{ background: 'var(--chart-2)' }} />
                  {t('chart.legendHeartRate')}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm inline-block opacity-100" style={{ background: 'var(--primary)', opacity: 1 }} />
                  {t('chart.legendSweetSpot')}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Effizienz-Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">
                {t('chart.efficiencyTitle')}{' '}
                <span className="font-normal text-muted-foreground">{t('chart.efficiencyFormula')}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={config.chart_height}>
                <AreaChart data={buckets} margin={{ top: 8, right: 10, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="effGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="var(--primary)" stopOpacity={0.03} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.5} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[effMin, effMax]}
                    tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                    axisLine={false}
                    tickLine={false}
                    width={36}
                  />
                  <Tooltip content={<EffTooltip />} />
                  {sweet && (
                    <ReferenceLine
                      x={sweet.label}
                      stroke="var(--primary)"
                      strokeDasharray="4 3"
                      strokeOpacity={0.8}
                      label={{ value: '★', position: 'insideTopRight', fill: 'var(--primary)', fontSize: 14 }}
                    />
                  )}
                  <Area
                    dataKey="efficiency"
                    stroke="var(--primary)"
                    strokeWidth={2.5}
                    fill="url(#effGrad)"
                    dot={{ r: 4, fill: 'var(--primary)', strokeWidth: 0 }}
                    activeDot={{ r: 6 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
              <p className="text-xs text-muted-foreground mt-2">
                {t('chart.efficiencyCaption')}
              </p>
            </CardContent>
          </Card>

          {/* Detail-Tabelle */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">{t('table.title')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground border-b border-border">
                      <th className="text-left pb-2 font-medium">{t('table.temperature')}</th>
                      <th className="text-right pb-2 font-medium">{t('table.rides')}</th>
                      <th className="text-right pb-2 font-medium">{t('table.avgSpeed')}</th>
                      <th className="text-right pb-2 font-medium">{t('table.avgHr')}</th>
                      <th className="text-right pb-2 font-medium">{t('table.efficiency')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {buckets.map(b => (
                      <tr
                        key={b.label}
                        className={`border-b border-border/50 last:border-0 transition-colors ${b.isBest ? 'bg-primary/5' : ''}`}
                      >
                        <td className="py-2 font-medium">
                          <span className="flex items-center gap-1.5">
                            {b.isBest && <span style={{ color: 'var(--primary)' }}>★</span>}
                            {b.label}
                          </span>
                        </td>
                        <td className="py-2 text-right text-muted-foreground">{b.count}</td>
                        <td className="py-2 text-right">{b.avg_speed} km/h</td>
                        <td className="py-2 text-right">{b.avg_hr} bpm</td>
                        <td
                          className="py-2 text-right font-medium tabular-nums"
                          style={b.isBest ? { color: 'var(--primary)' } : {}}
                        >
                          {b.efficiency.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
          {/* Wind-Impact */}
          {windBuckets.length > 0 && (() => {
            const windSpeedMin = Math.floor(Math.min(...windBuckets.map(b => b.avg_speed)) - 2);
            const windSpeedMax = Math.ceil(Math.max(...windBuckets.map(b => b.avg_speed)) + 2);
            const windHrMin = Math.floor(Math.min(...windBuckets.map(b => b.avg_hr)) - 5);
            const windHrMax = Math.ceil(Math.max(...windBuckets.map(b => b.avg_hr)) + 5);
            const bestWind = windBuckets.find(b => b.isBest);
            return (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">
                    {t('wind.title')}{' '}
                    <span className="font-normal text-muted-foreground">{t('wind.subtitle')}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={config.chart_height_dense}>
                    <ComposedChart data={windBuckets} margin={{ top: 8, right: 48, bottom: 0, left: 0 }}>
                      <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.5} />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        yAxisId="speed"
                        domain={[windSpeedMin, windSpeedMax]}
                        tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                        axisLine={false}
                        tickLine={false}
                        width={36}
                        label={{ value: 'km/h', angle: -90, position: 'insideLeft', offset: 10, fill: 'var(--muted-foreground)', fontSize: 11 }}
                      />
                      <YAxis
                        yAxisId="hr"
                        orientation="right"
                        domain={[windHrMin, windHrMax]}
                        tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                        axisLine={false}
                        tickLine={false}
                        width={42}
                        label={{ value: 'bpm', angle: 90, position: 'insideRight', offset: 10, fill: 'var(--muted-foreground)', fontSize: 11 }}
                      />
                      <Tooltip content={<WindTooltip />} />
                      <Bar yAxisId="speed" dataKey="avg_speed" radius={[4, 4, 0, 0]} maxBarSize={52}>
                        {windBuckets.map((b, i) => (
                          <Cell key={i} fill="var(--primary)" fillOpacity={b.isBest ? 1 : 0.45} />
                        ))}
                      </Bar>
                      <Line
                        yAxisId="hr"
                        dataKey="avg_hr"
                        stroke="var(--chart-2)"
                        strokeWidth={2.5}
                        dot={{ r: 4, fill: 'var(--chart-2)', strokeWidth: 0 }}
                        activeDot={{ r: 6 }}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                  {bestWind && (
                    <p className="text-xs text-muted-foreground mt-2">
                      {t('wind.fastestSegmentPrefix')} <span className="font-medium text-foreground">{bestWind.label}</span> {t('wind.fastestSegmentSuffix', { speed: bestWind.avg_speed, count: bestWind.count })}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })()}
        </>
      ) : (
        <p className="text-muted-foreground text-sm">
          {t('emptyState')}
        </p>
      )}
    </div>
  );
}
