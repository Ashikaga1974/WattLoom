import { useEffect, useState, useMemo, lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { api, type Activity, type TrackPoint } from '@/lib/api';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const LeafletMap = lazy(() => import('@/components/LeafletMap'));
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

// Abweichung vom ersten Segment → Farbe
function segmentColor(deviationPct: number): string {
  if (deviationPct <= -10) return '#3b82f6'; // deutlich schneller als Start → blau
  if (deviationPct < 0)    return '#10b981'; // leicht schneller → grün
  if (deviationPct < 5)    return '#22c55e'; // fast gleich → grün
  if (deviationPct < 10)   return '#f59e0b'; // leicht langsamer → amber
  if (deviationPct < 20)   return '#f97316'; // spürbar langsamer → orange
  return '#ef4444';                           // stark langsamer → rot
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

function fmtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}:${String(m).padStart(2, '0')} h` : `${m} min`;
}

interface SegmentData {
  label: string;
  avg_kmh: number;
  deviation_pct: number; // Abweichung vom ersten Segment
  color: string;
  pts: number;
}

interface FatigueResult {
  spd_h1_kmh: number;
  spd_h2_kmh: number;
  fatigue_pct: number;
  segments: SegmentData[];
  overall_avg_kmh: number;
}

// 10 gleich-große Distanzabschnitte berechnen
function computeFatigue(points: TrackPoint[]): FatigueResult | null {
  const valid = points.filter(
    p => p.distance_m != null && p.speed_ms != null && p.speed_ms > 0
  );
  if (valid.length < 20) return null;

  const maxDist = Math.max(...valid.map(p => p.distance_m!));
  const segSize  = maxDist / 10;

  const segs: SegmentData[] = [];
  for (let i = 0; i < 10; i++) {
    const lo = i * segSize;
    const hi = (i + 1) * segSize;
    const pts = valid.filter(p => p.distance_m! >= lo && p.distance_m! < hi);
    const avg = pts.length > 0 ? pts.reduce((s, p) => s + p.speed_ms!, 0) / pts.length : 0;
    segs.push({
      label:         `${i * 10}–${(i + 1) * 10}%`,
      avg_kmh:       Math.round(avg * 3.6 * 10) / 10,
      deviation_pct: 0, // wird unten gesetzt
      color:         '#22c55e',
      pts:           pts.length,
    });
  }

  // Abweichung relativ zum ersten gültigen Segment berechnen
  const ref = segs.find(s => s.avg_kmh > 0)?.avg_kmh ?? 1;
  for (const s of segs) {
    s.deviation_pct = s.avg_kmh > 0 ? (ref - s.avg_kmh) / ref * 100 : 0;
    s.color = segmentColor(s.deviation_pct);
  }

  // H1/H2
  const h1 = valid.filter(p => p.distance_m! <= maxDist / 2);
  const h2 = valid.filter(p => p.distance_m! > maxDist / 2);
  const spd_h1 = h1.length > 0 ? h1.reduce((s, p) => s + p.speed_ms!, 0) / h1.length : 0;
  const spd_h2 = h2.length > 0 ? h2.reduce((s, p) => s + p.speed_ms!, 0) / h2.length : 0;
  const fatigue_pct = spd_h1 > 0 ? (spd_h1 - spd_h2) / spd_h1 * 100 : 0;

  const overall_avg_kmh = Math.round(
    (valid.reduce((s, p) => s + p.speed_ms!, 0) / valid.length) * 3.6 * 10
  ) / 10;

  return {
    spd_h1_kmh: Math.round(spd_h1 * 3.6 * 10) / 10,
    spd_h2_kmh: Math.round(spd_h2 * 3.6 * 10) / 10,
    fatigue_pct: Math.round(fatigue_pct * 10) / 10,
    segments:    segs,
    overall_avg_kmh,
  };
}

export default function FatigueActivityPage() {
  const [availableYears, setAvailableYears] = useState<string[]>([]);
  const [filterYear, setFilterYear]         = useState<string | null>(null);
  const [activities, setActivities]         = useState<Activity[]>([]);
  const [loadingActs, setLoadingActs]       = useState(false);
  const [selectedId, setSelectedId]         = useState<number | null>(null);
  const [points, setPoints]                 = useState<TrackPoint[] | null>(null);
  const [loadingTrack, setLoadingTrack]     = useState(false);
  const [error, setError]                   = useState<string | null>(null);

  // Jahre laden
  useEffect(() => {
    api.activityStats()
      .then(s => setAvailableYears(s.available_years.filter(y => Number(y) >= 2000)))
      .catch(() => {});
  }, []);

  // Aktivitäten laden wenn Jahr wechselt
  useEffect(() => {
    setLoadingActs(true);
    setSelectedId(null);
    setPoints(null);
    api.activities({ has_track: 1, limit: 500, sort_by: 'date', sort_dir: 'desc', year: filterYear ?? undefined })
      .then(r => setActivities(r.items))
      .catch(() => setActivities([]))
      .finally(() => setLoadingActs(false));
  }, [filterYear]);

  async function handleActivityChange(val: string | null) {
    if (!val || val === 'none') return;
    const id = parseInt(val, 10);
    setSelectedId(id);
    setPoints(null);
    setError(null);
    setLoadingTrack(true);
    try {
      // Minimale Vereinfachung für genaue Segment-Berechnung
      const r = await api.activityTrack(id, 1);
      setPoints(r.points);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler beim Laden des Tracks');
    } finally {
      setLoadingTrack(false);
    }
  }

  const selectedActivity = useMemo(
    () => activities.find(a => a.id === selectedId) ?? null,
    [activities, selectedId]
  );

  const fatigueResult = useMemo(
    () => (points ? computeFatigue(points) : null),
    [points]
  );

  const selectLabel = selectedActivity
    ? `${selectedActivity.name.slice(0, 50)} · ${fmtDate(selectedActivity.start_date)}`
    : 'Aktivität wählen…';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ermüdungsindex: Einzelfahrt"
        subtitle="Detaillierte Pacing-Analyse einer einzelnen Aktivität"
      />

      {/* Auswahl */}
      <Card className="shadow-sm border">
        <CardContent className="px-5 py-4 space-y-3">
          {/* Jahresfilter */}
          {availableYears.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setFilterYear(null)}
                className={`px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors ${
                  !filterYear
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                Alle
              </button>
              {availableYears.map(y => (
                <button
                  key={y}
                  onClick={() => setFilterYear(y)}
                  className={`px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors ${
                    filterYear === y
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  {y}
                </button>
              ))}
            </div>
          )}

          {/* Aktivitäten-Select */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <p className="text-sm font-medium shrink-0">Aktivität</p>
            {loadingActs ? (
              <div className="h-9 w-80 bg-muted animate-pulse rounded-md" />
            ) : activities.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Keine Aktivitäten mit Track-Daten{filterYear ? ` für ${filterYear}` : ''} gefunden.
              </p>
            ) : (
              <Select
                value={selectedId !== null ? String(selectedId) : 'none'}
                onValueChange={handleActivityChange}
              >
                <SelectTrigger className="w-full max-w-lg text-sm">
                  <SelectValue>{selectLabel}</SelectValue>
                </SelectTrigger>
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

      {/* Noch keine Auswahl */}
      {selectedId === null && !loadingActs && (
        <div className="rounded-xl border bg-card px-6 py-10 text-center text-muted-foreground text-sm">
          Wähle oben eine Aktivität aus, um die Pacing-Analyse zu sehen.
        </div>
      )}

      {/* Track lädt */}
      {loadingTrack && (
        <div className="space-y-4">
          <div className="h-56 bg-muted animate-pulse rounded-xl" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 bg-muted animate-pulse rounded-xl" />
            ))}
          </div>
          <div className="h-64 bg-muted animate-pulse rounded-xl" />
        </div>
      )}

      {/* Fehler */}
      {error && (
        <div className="rounded border border-destructive/50 bg-destructive/10 p-4 text-destructive text-sm">{error}</div>
      )}

      {/* Kein Track */}
      {!loadingTrack && points && !fatigueResult && (
        <div className="rounded-xl border bg-card px-6 py-10 text-center text-muted-foreground text-sm">
          Nicht genug Track-Punkte für eine Segment-Analyse (mindestens 20 gültige Punkte benötigt).
        </div>
      )}

      {/* Analyse */}
      {!loadingTrack && fatigueResult && selectedActivity && (
        <>
          {/* Karte + KPI-Kacheln nebeneinander */}
          <div className="grid md:grid-cols-2 gap-3">

            {/* Karte links – füllt die gleiche Höhe wie die KPI-Kacheln rechts */}
            <Card className="shadow-sm border overflow-hidden h-full">
              {points && points.some(p => p.lat != null && p.lon != null) ? (
                <Suspense fallback={<div className="h-full min-h-[176px] bg-muted animate-pulse" />}>
                  <LeafletMap points={points} fullHeight />
                </Suspense>
              ) : (
                <div className="h-full min-h-[176px] flex items-center justify-center text-xs text-muted-foreground">
                  Kein GPS-Track verfügbar
                </div>
              )}
            </Card>

            {/* KPI-Kacheln rechts: 2×2 */}
            <div className="grid grid-cols-2 gap-3">

              {/* Ermüdungsindex */}
              <Card className="shadow-sm border">
                <CardContent className="px-4 py-3 space-y-1">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Ermüdungsindex</p>
                  <p className={`text-2xl font-bold ${fatigueTextColor(fatigueResult.fatigue_pct)}`}>
                    {fmtPct(fatigueResult.fatigue_pct)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {fatigueResult.fatigue_pct < 0
                      ? 'Steigerung in H2'
                      : fatigueResult.fatigue_pct < 5
                      ? 'Sehr ausgeglichenes Pacing'
                      : fatigueResult.fatigue_pct < 10
                      ? 'Leichte Ermüdung'
                      : fatigueResult.fatigue_pct < 20
                      ? 'Mittlere Ermüdung'
                      : 'Starke Ermüdung'}
                  </p>
                </CardContent>
              </Card>

              {/* Ø Speed */}
              <Card className="shadow-sm border">
                <CardContent className="px-4 py-3 space-y-1">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Ø Geschwindigkeit</p>
                  <p className="text-2xl font-bold text-foreground">{fatigueResult.overall_avg_kmh} km/h</p>
                  <p className="text-[10px] text-muted-foreground">{(selectedActivity.distance_m / 1000).toFixed(1)} km</p>
                </CardContent>
              </Card>

              {/* 1. Hälfte */}
              <Card className="shadow-sm border">
                <CardContent className="px-4 py-3 space-y-1">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">1. Hälfte</p>
                  <p className="text-2xl font-bold text-foreground">{fatigueResult.spd_h1_kmh} km/h</p>
                  <p className="text-[10px] text-muted-foreground">Ø erste 50 % der Distanz</p>
                </CardContent>
              </Card>

              {/* 2. Hälfte */}
              <Card className="shadow-sm border">
                <CardContent className="px-4 py-3 space-y-1">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">2. Hälfte</p>
                  <p className={`text-2xl font-bold ${fatigueResult.spd_h2_kmh >= fatigueResult.spd_h1_kmh ? 'text-blue-500' : 'text-orange-500'}`}>
                    {fatigueResult.spd_h2_kmh} km/h
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {fatigueResult.spd_h2_kmh >= fatigueResult.spd_h1_kmh
                      ? `+${(fatigueResult.spd_h2_kmh - fatigueResult.spd_h1_kmh).toFixed(1)} km/h gegenüber H1`
                      : `−${(fatigueResult.spd_h1_kmh - fatigueResult.spd_h2_kmh).toFixed(1)} km/h gegenüber H1`}
                  </p>
                </CardContent>
              </Card>

            </div>
          </div>

          {/* Aktivitäts-Link + Zeit */}
          <div className="flex items-center justify-between px-1">
            <Link
              to={`/activities/${selectedActivity.id}`}
              className="text-sm text-[#fc4c02] hover:underline"
            >
              {selectedActivity.name} →
            </Link>
            <span className="text-xs text-muted-foreground">
              {fmtDate(selectedActivity.start_date)} · {fmtTime(selectedActivity.moving_time_s)}
            </span>
          </div>

          {/* Segment-Chart */}
          <Card className="shadow-sm border overflow-hidden">
            <CardHeader className="pb-1 border-b">
              <CardTitle className="text-base font-semibold">Pacing-Profil: 10 Abschnitte</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Ø-Geschwindigkeit je 10-%-Abschnitt — Farbe zeigt Abweichung vom Startabschnitt
              </p>
            </CardHeader>
            <CardContent className="pt-4">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart
                  data={fatigueResult.segments}
                  margin={{ top: 8, right: 16, bottom: 8, left: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis
                    tickFormatter={v => `${v} km/h`}
                    tick={{ fontSize: 10 }}
                    width={64}
                    domain={[
                      (dataMin: number) => Math.max(0, Math.floor(dataMin * 0.9)),
                      (dataMax: number) => Math.ceil(dataMax * 1.05),
                    ]}
                  />
                  <Tooltip
                    formatter={(value, _name, props) => [
                      `${value} km/h (${props.payload.deviation_pct >= 0 ? '+' : ''}${props.payload.deviation_pct.toFixed(1)}% vs. Start)`,
                      props.payload.label,
                    ]}
                    contentStyle={{
                      fontSize: 12,
                      backgroundColor: 'hsl(var(--background))',
                      border: '1px solid hsl(var(--border))',
                    }}
                  />
                  {/* Ø-Linie */}
                  <ReferenceLine
                    y={fatigueResult.overall_avg_kmh}
                    stroke="hsl(var(--muted-foreground))"
                    strokeDasharray="5 3"
                    strokeWidth={1.5}
                    label={{
                      value: `Ø ${fatigueResult.overall_avg_kmh} km/h`,
                      fontSize: 9,
                      fill: 'hsl(var(--muted-foreground))',
                      position: 'insideTopRight',
                    }}
                  />
                  <Bar dataKey="avg_kmh" name="Ø Speed" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                    {fatigueResult.segments.map((s, i) => (
                      <Cell key={i} fill={s.color} fillOpacity={0.85} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="flex justify-between text-[10px] text-muted-foreground px-4 mt-1">
                <span>← Startabschnitt (Referenz)</span>
                <span>Zielabschnitt →</span>
              </div>
            </CardContent>
          </Card>

          {/* H1 vs H2 Detail */}
          <Card className="shadow-sm border">
            <CardContent className="px-5 py-4 space-y-4">
              <p className="text-sm font-semibold">Hälften-Vergleich</p>
              {[
                { label: '1. Hälfte (0–50 %)', kmh: fatigueResult.spd_h1_kmh, color: '#6366f1' },
                { label: '2. Hälfte (50–100 %)', kmh: fatigueResult.spd_h2_kmh, color: fatigueResult.spd_h2_kmh >= fatigueResult.spd_h1_kmh ? '#3b82f6' : '#f97316' },
              ].map(({ label, kmh, color }) => {
                const max = Math.max(fatigueResult.spd_h1_kmh, fatigueResult.spd_h2_kmh);
                const pct = max > 0 ? Math.round((kmh / max) * 100) : 0;
                return (
                  <div key={label}>
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>{label}</span>
                      <span className="font-semibold text-foreground">{kmh} km/h</span>
                    </div>
                    <div className="h-4 bg-muted rounded overflow-hidden">
                      <div
                        className="h-full rounded transition-all"
                        style={{ width: `${pct}%`, background: color }}
                      />
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
