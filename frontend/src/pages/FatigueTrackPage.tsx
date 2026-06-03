import { useEffect, useState, useMemo, lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { api, type FatigueTrackData, type FatigueRide, type RouteCluster, type TrackPoint } from '@/lib/api';

const LeafletMap = lazy(() => import('@/components/LeafletMap'));
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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

function fatigueColor(v: number): string {
  if (v <= -10) return '#3b82f6';
  if (v < 0)    return '#10b981';
  if (v < 5)    return '#22c55e';
  if (v < 10)   return '#f59e0b';
  if (v < 20)   return '#f97316';
  return '#ef4444';
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

function fmtClusterLabel(c: RouteCluster, idx: number): string {
  const km = (c.avg_distance_m / 1000).toFixed(0);
  return `Strecke ${idx + 1}: ~${km} km · ${c.ride_count} Rides`;
}

function fmtShortDate(dateStr: string): string {
  const d = new Date(dateStr.includes('T') ? dateStr + 'Z' : dateStr + 'T00:00:00Z');
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: '2-digit' });
}

// Histogramm-Daten aufbereiten
function buildHistoData(distribution: FatigueTrackData['distribution']) {
  const BUCKET_MIN = -55;
  const BUCKET_MAX = 50;
  const allBuckets: number[] = [];
  for (let b = BUCKET_MIN; b <= BUCKET_MAX; b += 5) allBuckets.push(b);

  const countMap = new Map(distribution.map(d => [d.bucket, d.count]));

  return allBuckets.map(bucket => ({
    bucket,
    label: `${bucket >= 0 ? '+' : ''}${bucket}%`,
    count: countMap.get(bucket) ?? 0,
    color: fatigueColor(bucket + 2.5),
  }));
}

export default function FatigueTrackPage() {
  const [clusters, setClusters]       = useState<RouteCluster[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [data, setData]               = useState<FatigueTrackData | null>(null);
  const [loading, setLoading]         = useState(false);
  const [loadingClusters, setLoadingClusters] = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [allTracks, setAllTracks]     = useState<TrackPoint[][] | null>(null);

  useEffect(() => {
    api.routeClusters(3)
      .then(r => setClusters(r.clusters))
      .catch(() => {/* Cluster optional */})
      .finally(() => setLoadingClusters(false));
  }, []);

  async function loadTrack(idx: number) {
    const cluster = clusters[idx];
    if (!cluster) return;

    setLoading(true);
    setError(null);
    setData(null);
    setAllTracks(null);

    const ids = cluster.rides.map(r => r.id);
    try {
      const result = await api.fatigueIndexTrack(ids);
      setData(result);

      // Tracks für Heatmap-Karte parallel laden (stark vereinfacht → schnell)
      const trackResults = await Promise.allSettled(
        ids.map(id => api.activityTrack(id, 20))
      );
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

  const histoData = useMemo(() =>
    data?.distribution?.length ? buildHistoData(data.distribution) : [],
    [data]
  );

  // Zeitlicher Trend: Rides chronologisch (bereits ASC vom Backend)
  const trendData = useMemo(() =>
    data?.rides?.map((r, i) => ({
      idx:   i + 1,
      label: fmtShortDate(r.date),
      avg:   r.fatigue_pct,
      color: fatigueColor(r.fatigue_pct),
      activity_id: r.activity_id,
    })) ?? [],
    [data]
  );

  const tableRides: FatigueRide[] = data?.rides?.slice().reverse() ?? []; // neueste zuerst
  const avgFatigue = data?.stats.avg_fatigue_pct ?? null;
  const selectedCluster = selectedIdx !== null ? clusters[selectedIdx] : null;

  const selectLabel = selectedIdx !== null && selectedCluster
    ? fmtClusterLabel(selectedCluster, selectedIdx)
    : 'Strecke wählen…';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ermüdungsindex: Strecke"
        subtitle="Analyse einer bestimmten Strecke über alle Rides"
      />

      {/* Strecken-Auswahl */}
      <Card className="shadow-sm border">
        <CardContent className="px-5 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <p className="text-sm font-medium shrink-0">Strecke auswählen</p>
            {loadingClusters ? (
              <div className="h-9 w-64 bg-muted animate-pulse rounded-md" />
            ) : clusters.length === 0 ? (
              <p className="text-sm text-muted-foreground">Keine Strecken-Cluster gefunden (min. 3 Rides nötig).</p>
            ) : (
              <Select
                value={selectedIdx !== null ? String(selectedIdx) : 'none'}
                onValueChange={handleClusterChange}
              >
                <SelectTrigger className="w-72 text-sm">
                  <SelectValue>{selectLabel}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {clusters.map((c, i) => (
                    <SelectItem key={i} value={String(i)}>
                      {fmtClusterLabel(c, i)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {selectedCluster && (
              <p className="text-xs text-muted-foreground">
                Zuletzt gefahren: {fmtDate(selectedCluster.last_ridden)}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Noch keine Auswahl */}
      {!selectedIdx && selectedIdx !== 0 && !loading && (
        <div className="rounded-xl border bg-card px-6 py-10 text-center text-muted-foreground text-sm">
          Wähle oben eine Strecke aus, um die Ermüdungsanalyse zu sehen.
        </div>
      )}

      {/* Laden */}
      {loading && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 bg-muted animate-pulse rounded-xl" />
            ))}
          </div>
          <div className="h-56 bg-muted animate-pulse rounded-xl" />
          <div className="h-40 bg-muted animate-pulse rounded-xl" />
        </div>
      )}

      {/* Fehler */}
      {error && (
        <div className="rounded border border-destructive/50 bg-destructive/10 p-4 text-destructive text-sm">{error}</div>
      )}

      {/* Keine Daten nach Laden */}
      {!loading && data && data.stats.rides_analyzed === 0 && (
        <div className="rounded-xl border bg-card px-6 py-10 text-center text-muted-foreground text-sm">
          Keine auswertbaren Rides für diese Strecke gefunden (Track-Punkte benötigt).
        </div>
      )}

      {/* Inhalte */}
      {!loading && data && data.stats.rides_analyzed > 0 && (
        <>
          {/* Erklärungsbox */}
          <Card className="shadow-sm border bg-muted/30">
            <CardContent className="px-5 py-4 space-y-3">
              <p className="text-sm font-semibold">Was zeigt der Ermüdungsindex?</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Jeder Ride wird an der Distanzmitte geteilt. Der Index misst, um wie viel Prozent sich deine
                Durchschnittsgeschwindigkeit von der ersten zur zweiten Hälfte verändert.
              </p>
              <p className="text-xs text-muted-foreground font-mono bg-muted rounded px-2 py-1 inline-block">
                Index = (Ø-Speed 1. Hälfte − Ø-Speed 2. Hälfte) ÷ Ø-Speed 1. Hälfte × 100
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                {[
                  { range: '< 0 %', label: 'Steigerung', desc: 'Du wirst in H2 schneller', color: 'text-blue-500', bar: '#3b82f6' },
                  { range: '0 – 5 %', label: 'Ausgeglichenes Pacing', desc: 'Sehr gleichmäßig', color: 'text-green-500', bar: '#22c55e' },
                  { range: '5 – 10 %', label: 'Leichte Ermüdung', desc: 'Noch im grünen Bereich', color: 'text-amber-500', bar: '#f59e0b' },
                  { range: '10 – 20 %', label: 'Mittlere Ermüdung', desc: 'Deutlicher Einbruch', color: 'text-orange-500', bar: '#f97316' },
                  { range: '> 20 %', label: 'Starke Ermüdung', desc: 'Massiver Einbruch H2', color: 'text-red-500', bar: '#ef4444' },
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

          {/* Stats-Kacheln */}
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

            {/* Steigerungen */}
            <Card className="shadow-sm border">
              <CardContent className="px-4 py-3 space-y-1">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Steigerungen</p>
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

            {/* Beste Steigerung */}
            {data.best_negative ? (
              <Card className="shadow-sm" style={{ borderColor: 'rgba(59,130,246,0.25)', background: 'rgba(59,130,246,0.05)' }}>
                <CardContent className="px-4 py-3 space-y-1">
                  <p className="text-[10px] uppercase tracking-wide text-blue-500">Beste Steigerung</p>
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
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Beste Steigerung</p>
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

          {/* Strecken-Heatmap */}
          {allTracks && allTracks.length > 0 && (
            <Card className="shadow-sm border overflow-hidden">
              <CardHeader className="pb-1 border-b">
                <CardTitle className="text-base font-semibold">Streckenübersicht</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Alle {allTracks.length} Rides dieser Strecke überlagert
                </p>
              </CardHeader>
              <CardContent className="p-0">
                <Suspense fallback={<div className="h-64 bg-muted animate-pulse" />}>
                  <LeafletMap multiPoints={allTracks} fixedHeight={280} />
                </Suspense>
              </CardContent>
            </Card>
          )}

          {/* Beste / Größte Detail-Kacheln */}
          {data.best_negative && data.worst_fatigue && (
            <div className="grid sm:grid-cols-2 gap-4">
              {(() => {
                const bn = data.best_negative!;
                const bnW = splitBarWidths(bn.spd_h1_kmh, bn.spd_h2_kmh);
                return (
                  <Card className="shadow-sm" style={{ borderColor: 'rgba(59,130,246,0.25)', background: 'rgba(59,130,246,0.05)' }}>
                    <CardContent className="px-5 py-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs text-blue-500 uppercase tracking-wide font-medium">Beste Steigerung</p>
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
                            <div className="h-full rounded" style={{ width: `${bnW.w1}%`, background: '#6366f1' }} />
                          </div>
                        </div>
                        <div>
                          <div className="flex justify-between text-[10px] text-muted-foreground mb-0.5">
                            <span>2. Hälfte</span>
                            <span className="font-semibold text-blue-400">{bn.spd_h2_kmh} km/h</span>
                          </div>
                          <div className="h-3 bg-muted rounded overflow-hidden">
                            <div className="h-full rounded" style={{ width: `${bnW.w2}%`, background: '#3b82f6' }} />
                          </div>
                        </div>
                      </div>
                      <Link to={`/activities/${bn.activity_id}`} className="inline-flex items-center gap-1 text-xs text-blue-500 hover:text-blue-400 transition-colors">
                        Zur Aktivität →
                      </Link>
                    </CardContent>
                  </Card>
                );
              })()}

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
                            <div className="h-full rounded" style={{ width: `${wfW.w1}%`, background: '#f97316' }} />
                          </div>
                        </div>
                        <div>
                          <div className="flex justify-between text-[10px] text-muted-foreground mb-0.5">
                            <span>2. Hälfte</span>
                            <span className="font-semibold text-red-400">{wf.spd_h2_kmh} km/h</span>
                          </div>
                          <div className="h-3 bg-muted rounded overflow-hidden">
                            <div className="h-full rounded" style={{ width: `${wfW.w2}%`, background: '#ef4444' }} />
                          </div>
                        </div>
                      </div>
                      <Link to={`/activities/${wf.activity_id}`} className="inline-flex items-center gap-1 text-xs text-red-500 hover:text-red-400 transition-colors">
                        Zur Aktivität →
                      </Link>
                    </CardContent>
                  </Card>
                );
              })()}
            </div>
          )}

          {/* Zeitlicher Trend */}
          {trendData.length > 0 && (
            <Card className="shadow-sm border overflow-hidden">
              <CardHeader className="pb-1 border-b">
                <CardTitle className="text-base font-semibold">Zeitlicher Trend</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Ermüdungsindex je Ride auf dieser Strecke — chronologisch
                </p>
              </CardHeader>
              <CardContent className="pt-4">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={trendData} margin={{ top: 8, right: 16, bottom: 30, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 9 }}
                      interval={Math.max(0, Math.floor(trendData.length / 15) - 1)}
                      angle={-45}
                      textAnchor="end"
                      height={44}
                    />
                    <YAxis
                      tickFormatter={v => `${v >= 0 ? '+' : ''}${v}%`}
                      tick={{ fontSize: 10 }}
                      width={48}
                    />
                    <Tooltip
                      formatter={(value, _name, props) => [
                        fmtPct(Number(value)),
                        props.payload.label,
                      ]}
                      contentStyle={{
                        fontSize: 12,
                        backgroundColor: 'hsl(var(--background))',
                        border: '1px solid hsl(var(--border))',
                      }}
                    />
                    <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} />
                    <Bar dataKey="avg" name="Ermüdung" radius={[2, 2, 0, 0]} isAnimationActive={false}>
                      {trendData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} fillOpacity={0.85} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div className="flex justify-between text-[10px] text-muted-foreground px-8 mt-1">
                  <span>← ältere Rides</span>
                  <span>neuere Rides →</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Verteilung */}
          {histoData.length > 0 && (
            <Card className="shadow-sm border overflow-hidden">
              <CardHeader className="pb-1 border-b">
                <CardTitle className="text-base font-semibold">Verteilung des Ermüdungsindex</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Rides je Ermüdungs-Bucket (5%-Schritte)
                </p>
              </CardHeader>
              <CardContent className="pt-4">
                <ResponsiveContainer width="100%" height={200}>
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
                    <YAxis tick={{ fontSize: 11 }} width={32} allowDecimals={false} />
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
                    <ReferenceLine
                      x="0%"
                      stroke="hsl(var(--foreground))"
                      strokeDasharray="6 4"
                      strokeOpacity={0.6}
                      label={{ value: 'Ausgeglichenes Pacing', fontSize: 9, fill: 'hsl(var(--foreground))', position: 'insideTopRight' }}
                    />
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
                  <span>← Steigerung (schneller in H2)</span>
                  <span>Ermüdung (langsamer) →</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Ride-Tabelle */}
          {tableRides.length > 0 && (
            <Card className="shadow-sm border overflow-hidden">
              <CardHeader className="pb-1 border-b">
                <CardTitle className="text-base font-semibold">Alle Rides auf dieser Strecke</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">Neueste zuerst</p>
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
        </>
      )}
    </div>
  );
}
