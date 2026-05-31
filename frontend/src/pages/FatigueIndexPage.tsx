import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { api, type FatigueData, type FatigueRide } from '@/lib/api';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Cell,
  ResponsiveContainer,
} from 'recharts';
import { fmtDate } from '@/lib/format';

// Farblogik entspricht Svelte-Implementierung
function fatigueColor(v: number): string {
  if (v <= -10) return '#3b82f6';  // blau – starker Negativsplit
  if (v < 0)    return '#10b981';  // grün – leichter Negativsplit
  if (v < 5)    return '#22c55e';  // grün – fast neutral
  if (v < 10)   return '#f59e0b';  // amber – leichte Ermüdung
  if (v < 20)   return '#f97316';  // orange – mittlere Ermüdung
  return '#ef4444';                // rot – starke Ermüdung
}

function fatigueTextColor(v: number): string {
  if (v <= -10) return 'text-blue-500';
  if (v < 0)    return 'text-emerald-500';
  if (v < 5)    return 'text-green-500';
  if (v < 10)   return 'text-amber-500';
  if (v < 20)   return 'text-orange-500';
  return 'text-red-500';
}

function fmtPct(v: number): string {
  return (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
}

function splitBarWidths(h1: number, h2: number): { w1: number; w2: number } {
  const total = h1 + h2;
  if (total === 0) return { w1: 50, w2: 50 };
  return {
    w1: Math.round((h1 / total) * 100),
    w2: Math.round((h2 / total) * 100),
  };
}

// Histogramm-Daten aufbereiten
function buildHistoData(distribution: FatigueData['distribution']) {
  const BUCKET_MIN = -55;
  const BUCKET_MAX = 50;
  const allBuckets: number[] = [];
  for (let b = BUCKET_MIN; b <= BUCKET_MAX; b += 5) allBuckets.push(b);

  const countMap = new Map(distribution.map(d => [d.bucket, d.count]));

  return allBuckets.map(bucket => ({
    bucket,
    label: `${bucket >= 0 ? '+' : ''}${bucket}%`,
    count: countMap.get(bucket) ?? 0,
    color: fatigueColor(bucket + 2.5), // Mitte des Buckets für Farbzuweisung
  }));
}

export default function FatigueIndexPage() {
  const [data, setData] = useState<FatigueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [availableYears, setAvailableYears] = useState<string[]>([]);
  const [filterYear, setFilterYear] = useState<string | null>(null);

  useEffect(() => {
    // Jahre für Jahresfilter laden
    api.activityStats()
      .then(stats => {
        const years = stats.available_years.filter(y => Number(y) >= 2000);
        setAvailableYears(years);
      })
      .catch(() => {/* Jahre optional */});

    // Initialdaten laden
    api.fatigueIndex()
      .then(result => setData(result))
      .catch(e => setError(e instanceof Error ? e.message : 'Fehler beim Laden'))
      .finally(() => setLoading(false));
  }, []);

  async function loadData(year?: string | null) {
    setLoading(true);
    setError(null);
    try {
      const result = await api.fatigueIndex(year ? Number(year) : undefined);
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler beim Laden');
    } finally {
      setLoading(false);
    }
  }

  function handleYearChange(year: string | null) {
    const y = year === 'all' ? null : year;
    setFilterYear(y);
    loadData(y);
  }

  const histoData = useMemo(() =>
    data?.distribution?.length ? buildHistoData(data.distribution) : [],
    [data]
  );

  const monthData = useMemo(() =>
    data?.monthly?.map(m => ({
      month: m.month.slice(0, 7),
      avg: m.avg_fatigue_pct,
      rides: m.rides,
      neg_split_pct: m.neg_split_pct,
      color: m.avg_fatigue_pct < 0 ? '#3b82f6' : m.avg_fatigue_pct < 10 ? '#f59e0b' : '#ef4444',
    })) ?? [],
    [data]
  );

  const tableRides: FatigueRide[] = data?.rides?.slice(0, 30) ?? [];

  const avgFatigue = data?.stats.avg_fatigue_pct ?? null;

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Ermüdungsindex" subtitle="Vergleich Geschwindigkeit 1. vs. 2. Hälfte je Ride" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 bg-muted animate-pulse rounded-xl" />
          ))}
        </div>
        <div className="h-56 bg-muted animate-pulse rounded-xl" />
        <div className="h-40 bg-muted animate-pulse rounded-xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Ermüdungsindex" />
        <div className="rounded border border-destructive/50 bg-destructive/10 p-4 text-destructive text-sm">{error}</div>
      </div>
    );
  }

  if (!data || data.stats.rides_analyzed === 0) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Ermüdungsindex"
          subtitle="Vergleich Geschwindigkeit 1. vs. 2. Hälfte je Ride"
          years={availableYears}
          selectedYear={filterYear}
          onYearChange={handleYearChange}
        />
        <div className="rounded-xl border bg-card px-6 py-10 text-center text-muted-foreground text-sm">
          Keine auswertbaren Rides gefunden.
          {filterYear && ` Für ${filterYear} liegen keine Tracks mit ausreichend Datenpunkten vor.`}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ermüdungsindex"
        subtitle="Vergleich Geschwindigkeit 1. vs. 2. Hälfte je Ride"
        years={availableYears}
        selectedYear={filterYear}
        onYearChange={handleYearChange}
      />

      {/* 1. Stats-Leiste */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">

        {/* Ø Ermüdung */}
        <Card className="shadow-sm border">
          <CardContent className="px-4 py-3 space-y-1">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Ø Ermüdung</p>
            {avgFatigue !== null ? (
              <>
                <p className={`text-2xl font-bold ${fatigueTextColor(avgFatigue)}`}>{fmtPct(avgFatigue)}</p>
                <p className="text-[10px] text-muted-foreground">
                  {avgFatigue < 0
                    ? 'Im Schnitt Negativsplit'
                    : avgFatigue < 5
                    ? 'Fast kein Ermüdungseffekt'
                    : 'Durchschnittliche Ermüdung'}
                </p>
              </>
            ) : (
              <p className="text-2xl font-bold text-muted-foreground">–</p>
            )}
          </CardContent>
        </Card>

        {/* Negativsplits */}
        <Card className="shadow-sm border">
          <CardContent className="px-4 py-3 space-y-1">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Negativsplits</p>
            <p className="text-2xl font-bold text-blue-500">{data.stats.negative_split_count}</p>
            <p className="text-[10px] text-muted-foreground">von {data.stats.rides_analyzed} Rides</p>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-1">
              <div
                className="h-full bg-blue-500 rounded-full transition-all"
                style={{ width: `${Math.round(data.stats.negative_split_count / data.stats.rides_analyzed * 100)}%` }}
              />
            </div>
          </CardContent>
        </Card>

        {/* Bester Negativsplit */}
        {data.best_negative ? (
          <Card className="shadow-sm" style={{ borderColor: 'rgba(59,130,246,0.25)', background: 'rgba(59,130,246,0.05)' }}>
            <CardContent className="px-4 py-3 space-y-1">
              <p className="text-[10px] uppercase tracking-wide text-blue-500">Bester Negativsplit</p>
              <p className="text-2xl font-bold text-blue-500">{fmtPct(data.best_negative.fatigue_pct)}</p>
              <Link
                to={`/activities/${data.best_negative.activity_id}`}
                className="text-[10px] text-blue-400 hover:text-blue-300 truncate block transition-colors"
              >
                {data.best_negative.activity_name} · {fmtDate(data.best_negative.date)}
              </Link>
            </CardContent>
          </Card>
        ) : (
          <Card className="shadow-sm border">
            <CardContent className="px-4 py-3">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Bester Negativsplit</p>
              <p className="text-2xl font-bold text-muted-foreground">–</p>
            </CardContent>
          </Card>
        )}

        {/* Größte Ermüdung */}
        {data.worst_fatigue ? (
          <Card className="shadow-sm" style={{ borderColor: 'rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.05)' }}>
            <CardContent className="px-4 py-3 space-y-1">
              <p className="text-[10px] uppercase tracking-wide text-red-500">Größte Ermüdung</p>
              <p className="text-2xl font-bold text-red-500">+{data.worst_fatigue.fatigue_pct.toFixed(1)}%</p>
              <Link
                to={`/activities/${data.worst_fatigue.activity_id}`}
                className="text-[10px] text-red-400 hover:text-red-300 truncate block transition-colors"
              >
                {data.worst_fatigue.activity_name} · {fmtDate(data.worst_fatigue.date)}
              </Link>
            </CardContent>
          </Card>
        ) : (
          <Card className="shadow-sm border">
            <CardContent className="px-4 py-3">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Größte Ermüdung</p>
              <p className="text-2xl font-bold text-muted-foreground">–</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* 2. Histogramm: Verteilung */}
      {histoData.length > 0 && (
        <Card className="shadow-sm border overflow-hidden">
          <CardHeader className="pb-1 border-b">
            <CardTitle className="text-base font-semibold">Verteilung des Ermüdungsindex</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Rides je Ermüdungs-Bucket (5%-Schritte) — blau = Negativsplit, rot = Ermüdung
            </p>
          </CardHeader>
          <CardContent className="pt-4">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={histoData} margin={{ top: 8, right: 16, bottom: 24, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 9 }}
                  interval={1}
                  angle={-45}
                  textAnchor="end"
                  height={40}
                />
                <YAxis tick={{ fontSize: 11 }} width={32} />
                <Tooltip
                  formatter={(value, _name, props) => {
                    const b = props.payload.bucket;
                    const hi = b + 5;
                    return [
                      `${value} Ride${Number(value) !== 1 ? 's' : ''}`,
                      `${b >= 0 ? '+' : ''}${b}% bis ${hi >= 0 ? '+' : ''}${hi}%`,
                    ];
                  }}
                  contentStyle={{
                    fontSize: 12,
                    backgroundColor: 'hsl(var(--background))',
                    border: '1px solid hsl(var(--border))',
                  }}
                />
                {/* Nulllinie */}
                <ReferenceLine
                  x="0%"
                  stroke="hsl(var(--foreground))"
                  strokeDasharray="6 4"
                  strokeOpacity={0.6}
                  label={{ value: 'Ø-Pacing', fontSize: 9, fill: 'hsl(var(--foreground))', position: 'insideTopRight' }}
                />
                {/* Ø-Linie */}
                {avgFatigue !== null && (
                  <ReferenceLine
                    x={`${avgFatigue >= 0 ? '+' : ''}${Math.round(avgFatigue / 5) * 5}%`}
                    stroke="#f97316"
                    strokeDasharray="4 3"
                    strokeOpacity={0.8}
                    label={{ value: `Ø ${fmtPct(avgFatigue)}`, fontSize: 9, fill: '#f97316', position: 'insideBottomRight' }}
                  />
                )}
                <Bar dataKey="count" name="Rides" radius={[2, 2, 0, 0]} isAnimationActive={false}>
                  {histoData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} fillOpacity={0.85} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="flex justify-between text-[10px] text-muted-foreground px-8 mt-1">
              <span>← Negativsplit (schneller)</span>
              <span>Ermüdung (langsamer) →</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 3. Kacheln: Bester Negativsplit / Größte Ermüdung (Detail) */}
      {data.best_negative && data.worst_fatigue && (
        <div className="grid sm:grid-cols-2 gap-4">
          {/* Bester Negativsplit */}
          {(() => {
            const bn = data.best_negative!;
            const bnW = splitBarWidths(bn.spd_h1_kmh, bn.spd_h2_kmh);
            return (
              <Card className="shadow-sm" style={{ borderColor: 'rgba(59,130,246,0.25)', background: 'rgba(59,130,246,0.05)' }}>
                <CardContent className="px-5 py-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs text-blue-500 uppercase tracking-wide font-medium">Bester Negativsplit</p>
                      <p className="text-sm font-semibold text-foreground truncate mt-0.5">{bn.activity_name}</p>
                      <p className="text-xs text-muted-foreground">{fmtDate(bn.date)} · {bn.dist_km} km</p>
                    </div>
                    <span className="shrink-0 text-lg font-bold text-blue-500 tabular-nums">{fmtPct(bn.fatigue_pct)}</span>
                  </div>
                  <div className="space-y-2">
                    <div>
                      <div className="flex justify-between text-[10px] text-muted-foreground mb-0.5">
                        <span>1. Hälfte</span>
                        <span className="font-semibold text-foreground">{bn.spd_h1_kmh} km/h</span>
                      </div>
                      <div className="h-3 bg-muted rounded overflow-hidden">
                        <div className="h-full rounded transition-all" style={{ width: `${bnW.w1}%`, background: '#6366f1' }} />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-[10px] text-muted-foreground mb-0.5">
                        <span>2. Hälfte</span>
                        <span className="font-semibold text-blue-400">{bn.spd_h2_kmh} km/h</span>
                      </div>
                      <div className="h-3 bg-muted rounded overflow-hidden">
                        <div className="h-full rounded transition-all" style={{ width: `${bnW.w2}%`, background: '#3b82f6' }} />
                      </div>
                    </div>
                  </div>
                  <Link
                    to={`/activities/${bn.activity_id}`}
                    className="inline-flex items-center gap-1 text-xs text-blue-500 hover:text-blue-400 transition-colors"
                  >
                    Zur Aktivität →
                  </Link>
                </CardContent>
              </Card>
            );
          })()}

          {/* Größte Ermüdung */}
          {(() => {
            const wf = data.worst_fatigue!;
            const wfW = splitBarWidths(wf.spd_h1_kmh, wf.spd_h2_kmh);
            return (
              <Card className="shadow-sm" style={{ borderColor: 'rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.05)' }}>
                <CardContent className="px-5 py-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs text-red-500 uppercase tracking-wide font-medium">Größte Ermüdung</p>
                      <p className="text-sm font-semibold text-foreground truncate mt-0.5">{wf.activity_name}</p>
                      <p className="text-xs text-muted-foreground">{fmtDate(wf.date)} · {wf.dist_km} km</p>
                    </div>
                    <span className="shrink-0 text-lg font-bold text-red-500 tabular-nums">+{wf.fatigue_pct.toFixed(1)}%</span>
                  </div>
                  <div className="space-y-2">
                    <div>
                      <div className="flex justify-between text-[10px] text-muted-foreground mb-0.5">
                        <span>1. Hälfte</span>
                        <span className="font-semibold text-orange-400">{wf.spd_h1_kmh} km/h</span>
                      </div>
                      <div className="h-3 bg-muted rounded overflow-hidden">
                        <div className="h-full rounded transition-all" style={{ width: `${wfW.w1}%`, background: '#f97316' }} />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-[10px] text-muted-foreground mb-0.5">
                        <span>2. Hälfte</span>
                        <span className="font-semibold text-red-400">{wf.spd_h2_kmh} km/h</span>
                      </div>
                      <div className="h-3 bg-muted rounded overflow-hidden">
                        <div className="h-full rounded transition-all" style={{ width: `${wfW.w2}%`, background: '#ef4444' }} />
                      </div>
                    </div>
                  </div>
                  <Link
                    to={`/activities/${wf.activity_id}`}
                    className="inline-flex items-center gap-1 text-xs text-red-500 hover:text-red-400 transition-colors"
                  >
                    Zur Aktivität →
                  </Link>
                </CardContent>
              </Card>
            );
          })()}
        </div>
      )}

      {/* 4. Monatstrend */}
      {monthData.length > 0 && (
        <Card className="shadow-sm border overflow-hidden">
          <CardHeader className="pb-1 border-b">
            <CardTitle className="text-base font-semibold">Monatlicher Trend</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Ø Ermüdungsindex je Monat — blau = Negativsplit, orange/rot = Ermüdung
            </p>
          </CardHeader>
          <CardContent className="pt-4">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={monthData} margin={{ top: 8, right: 16, bottom: 24, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 9 }}
                  interval={2}
                  angle={-45}
                  textAnchor="end"
                  height={40}
                />
                <YAxis
                  tickFormatter={v => `${v >= 0 ? '+' : ''}${v}%`}
                  tick={{ fontSize: 10 }}
                  width={48}
                />
                <Tooltip
                  formatter={(value, _name, props) => [
                    `${fmtPct(Number(value))} · ${props.payload.rides} Rides · ${props.payload.neg_split_pct.toFixed(0)} % Neg.`,
                    props.payload.month,
                  ]}
                  contentStyle={{
                    fontSize: 12,
                    backgroundColor: 'hsl(var(--background))',
                    border: '1px solid hsl(var(--border))',
                  }}
                />
                <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} />
                <Bar dataKey="avg" name="Ø Ermüdung" radius={[2, 2, 0, 0]} isAnimationActive={false}>
                  {monthData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} fillOpacity={0.8} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* 5. Distanz-Kacheln */}
      {data.by_distance.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {data.by_distance.map(bucket => (
            <Card key={bucket.label} className="shadow-sm border">
              <CardContent className="px-4 py-3 text-center space-y-1">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{bucket.label}</p>
                {bucket.avg_fatigue_pct !== null ? (
                  <>
                    <p className={`text-2xl font-bold ${fatigueTextColor(bucket.avg_fatigue_pct)}`}>
                      {fmtPct(bucket.avg_fatigue_pct)}
                    </p>
                    <div
                      className="h-1 rounded-full mt-1"
                      style={{ background: fatigueColor(bucket.avg_fatigue_pct), opacity: 0.7 }}
                    />
                  </>
                ) : (
                  <p className="text-2xl font-bold text-muted-foreground">–</p>
                )}
                <p className="text-[10px] text-muted-foreground">{bucket.rides} Ride{bucket.rides !== 1 ? 's' : ''}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 6. Ride-Tabelle */}
      {tableRides.length > 0 && (
        <Card className="shadow-sm border overflow-hidden">
          <CardHeader className="pb-1 border-b">
            <CardTitle className="text-base font-semibold">Letzte {tableRides.length} Rides</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">Sortiert nach Datum — neueste zuerst</p>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground uppercase tracking-wide border-b">
                  <th className="px-4 py-2 font-medium">Datum</th>
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium text-right">Dist.</th>
                  <th className="px-4 py-2 font-medium text-right">H1</th>
                  <th className="px-4 py-2 font-medium text-right">H2</th>
                  <th className="px-4 py-2 font-medium">Index</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {tableRides.map(ride => {
                  const v = ride.fatigue_pct;
                  const barPct = Math.min(Math.abs(v) / 30 * 100, 100);
                  return (
                    <tr key={ride.activity_id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">{fmtDate(ride.date)}</td>
                      <td className="px-4 py-2 max-w-[200px]">
                        <Link
                          to={`/activities/${ride.activity_id}`}
                          className="text-foreground hover:text-[#fc4c02] transition-colors truncate block"
                        >
                          {ride.activity_name}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-right text-muted-foreground">{ride.dist_km} km</td>
                      <td className="px-4 py-2 text-right text-muted-foreground">{ride.spd_h1_kmh}</td>
                      <td className="px-4 py-2 text-right text-muted-foreground">{ride.spd_h2_kmh}</td>
                      <td className="px-4 py-2 min-w-[120px]">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-muted rounded overflow-hidden">
                            <div
                              className="h-full rounded"
                              style={{ width: `${barPct}%`, background: fatigueColor(v) }}
                            />
                          </div>
                          <span className={`shrink-0 font-semibold tabular-nums ${fatigueTextColor(v)}`}>
                            {fmtPct(v)}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
