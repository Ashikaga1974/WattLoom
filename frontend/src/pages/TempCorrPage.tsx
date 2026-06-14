import { useEffect, useState, useMemo } from 'react';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Area, AreaChart, Cell, ReferenceLine,
} from 'recharts';

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
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-background/95 px-3 py-2 text-sm shadow-md backdrop-blur">
      <p className="font-semibold mb-1.5">{label}</p>
      <div className="flex flex-col gap-1 text-xs">
        <span style={{ color: 'var(--primary)' }}>Ø Geschwindigkeit: {d.avg_speed} km/h</span>
        <span style={{ color: 'var(--chart-2)' }}>Ø Herzfrequenz: {d.avg_hr} bpm</span>
        <span className="text-muted-foreground">{d.count} Rides</span>
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
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-background/95 px-3 py-2 text-sm shadow-md backdrop-blur">
      <p className="font-semibold mb-1.5">{label}</p>
      <div className="flex flex-col gap-1 text-xs">
        <span style={{ color: 'var(--primary)' }}>Ø Geschwindigkeit: {d.avg_speed} km/h</span>
        <span style={{ color: 'var(--chart-2)' }}>Ø Herzfrequenz: {d.avg_hr} bpm</span>
        <span className="text-muted-foreground">{d.count} Rides</span>
      </div>
    </div>
  );
}

function EffTooltip({ active, payload, label }: { active?: boolean; payload?: { value?: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-background/95 px-3 py-2 text-sm shadow-md backdrop-blur">
      <p className="font-semibold mb-1">{label}</p>
      <p className="text-xs" style={{ color: 'var(--primary)' }}>Effizienz: {Number(payload[0].value).toFixed(2)}</p>
    </div>
  );
}

export default function TempCorrPage() {
  const [pts, setPts] = useState<Pt[]>([]);
  const [windPts, setWindPts] = useState<WindPt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.tempCorrelation(), api.windImpact()])
      .then(([tempRes, windRes]) => {
        setPts(tempRes.points.filter(p => p.year >= 2000));
        setWindPts(windRes.points);
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Fehler'))
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

  const speedMin = buckets.length ? Math.floor(Math.min(...buckets.map(b => b.avg_speed)) - 2) : 0;
  const speedMax = buckets.length ? Math.ceil(Math.max(...buckets.map(b => b.avg_speed)) + 2) : 40;
  const hrMin = buckets.length ? Math.floor(Math.min(...buckets.map(b => b.avg_hr)) - 5) : 100;
  const hrMax = buckets.length ? Math.ceil(Math.max(...buckets.map(b => b.avg_hr)) + 5) : 170;
  const effMin = buckets.length ? +(Math.min(...buckets.map(b => b.efficiency)) - 0.3).toFixed(1) : 0;
  const effMax = buckets.length ? +(Math.max(...buckets.map(b => b.efficiency)) + 0.3).toFixed(1) : 20;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Wetter & Leistung"
        subtitle={`Temperatur und Wind aus Open-Meteo · ${pts.length} Rides mit Wetterdaten`}
      />

      {error && (
        <div className="rounded border border-destructive/50 bg-destructive/10 p-4 text-destructive text-sm">{error}</div>
      )}

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
            Korrelation, keine Kausalität – Temperatur, Jahreszeit und Trainingsform sind eng verknüpft. Die Werte spiegeln Muster in deinen Daten wider, erlauben aber keine direkten Rückschlüsse auf den Einfluss der Temperatur allein.
          </p>

          {/* KPI-Kacheln */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="ring-2 ring-primary/30">
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-muted-foreground">Sweet Spot ★</p>
                <p className="text-2xl font-bold mt-1" style={{ color: 'var(--primary)' }}>
                  {sweet?.label ?? '–'}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Effizienz {sweet?.efficiency.toFixed(2)} · {sweet?.count} Rides
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-muted-foreground">Schnellster Bereich</p>
                <p className="text-2xl font-bold mt-1">{fastest?.label ?? '–'}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Ø {fastest?.avg_speed} km/h · {fastest?.count} Rides
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-muted-foreground">Entspanntester Bereich</p>
                <p className="text-2xl font-bold mt-1">{calmest?.label ?? '–'}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Ø {calmest?.avg_hr} bpm · {calmest?.count} Rides
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Haupt-Chart: Speed (Balken) + HR (Linie) */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">
                Ø Geschwindigkeit & Herzfrequenz je Temperaturbereich
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
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
                  Geschwindigkeit
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-4 h-0.5 inline-block rounded" style={{ background: 'var(--chart-2)' }} />
                  Herzfrequenz
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm inline-block opacity-100" style={{ background: 'var(--primary)', opacity: 1 }} />
                  = Sweet Spot
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Effizienz-Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">
                Effizienz-Index{' '}
                <span className="font-normal text-muted-foreground">(Geschwindigkeit ÷ Herzfrequenz × 100)</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
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
                Höher = mehr km/h pro Herzschlag = du fährst effizienter. ★ markiert den Sweet Spot.
              </p>
            </CardContent>
          </Card>

          {/* Detail-Tabelle */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Übersicht nach Temperaturbereich</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground border-b border-border">
                      <th className="text-left pb-2 font-medium">Temperatur</th>
                      <th className="text-right pb-2 font-medium">Rides</th>
                      <th className="text-right pb-2 font-medium">Ø Speed</th>
                      <th className="text-right pb-2 font-medium">Ø HR</th>
                      <th className="text-right pb-2 font-medium">Effizienz</th>
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
                    Wind-Impact{' '}
                    <span className="font-normal text-muted-foreground">Ø Geschwindigkeit & Herzfrequenz je Windstärke</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={260}>
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
                      Schnellstes Segment: <span className="font-medium text-foreground">{bestWind.label}</span> mit Ø {bestWind.avg_speed} km/h ({bestWind.count} Rides)
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })()}
        </>
      ) : (
        <p className="text-muted-foreground text-sm">
          Keine Wetterdaten vorhanden – bitte zuerst in den Einstellungen „Wetterdaten abrufen" starten.
        </p>
      )}
    </div>
  );
}
