import { useEffect, useState, useRef, useCallback, lazy, Suspense } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';

import { api, type ActivityDetail, type TrackPoint, type ActivityZones, type SimilarActivity } from '@/lib/api';
import { fmtKm, fmtTime, fmtDate, fmtSpeed, fmtHm } from '@/lib/format';
import { useConfig } from '@/lib/config-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ChartTooltip } from '@/components/ui/chart-tooltip';

import type { SetHoverFn } from '@/components/LeafletMap';

// Leaflet dynamisch laden (kein SSR-Problem, kein Bundle-Bloat)
const LeafletMap = lazy(() => import('@/components/LeafletMap'));

// --- Hilfsfunktionen ---

function StatTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <Card size="sm">
      <CardContent>
        <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
        <p className="text-2xl font-bold mt-1 text-foreground">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function StatTileSecondary({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <Card size="sm">
      <CardContent>
        <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
        <p className="text-xl font-semibold mt-1 text-foreground">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

// --- Zonen-Balken ---

function ZoneBar({ label, pct, color, seconds }: { label: string; pct: number; color: string; seconds: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-16 text-xs text-muted-foreground shrink-0">{label}</span>
      <div className="flex-1 h-4 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${Math.max(pct, pct > 0 ? 2 : 0)}%`, background: color }}
        />
      </div>
      <span className="w-12 text-xs text-muted-foreground text-right shrink-0">
        {fmtTime(seconds)}
      </span>
      <span className="w-10 text-xs text-muted-foreground text-right shrink-0">
        {pct.toFixed(0)}%
      </span>
    </div>
  );
}

// --- Höhen-/Speed-Profil ---

type HoverFn = (pt: { lat: number; lon: number } | null) => void;

// Custom Tooltips für die Profil-Charts

function ElevationTooltip({ active, payload }: { active?: boolean; payload?: any[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  return (
    <ChartTooltip
      active={active}
      label={d?.dist != null ? `${d.dist} km` : undefined}
      rows={[{ label: 'Höhe', value: d?.alt != null ? `${d.alt} m` : null }]}
    />
  );
}

function HRTooltip({ active, payload }: { active?: boolean; payload?: any[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  return (
    <ChartTooltip
      active={active}
      label={d?.dist != null ? `${d.dist} km` : undefined}
      rows={[{ label: 'Herzrate', value: d?.hr != null ? `${d.hr} bpm` : null, color: '#ef4444' }]}
    />
  );
}

function SpeedTooltip({ active, payload }: { active?: boolean; payload?: any[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  return (
    <ChartTooltip
      active={active}
      label={d?.dist != null ? `${d.dist} km` : undefined}
      rows={[{ label: 'Geschw.', value: d?.speed != null ? `${d.speed} km/h` : null }]}
    />
  );
}

function closestTrackPointIdx(points: TrackPoint[], lat: number, lon: number): number {
  let bestIdx = 0;
  let bestDist = Infinity;
  const cosLat = Math.cos(lat * Math.PI / 180);
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (p.lat == null || p.lon == null) continue;
    const dLat = p.lat - lat;
    const dLon = (p.lon - lon) * cosLat;
    const d = dLat * dLat + dLon * dLon;
    if (d < bestDist) { bestDist = d; bestIdx = i; }
  }
  return bestIdx;
}

function useChartHover(
  data: { origIdx: number }[],
  points: TrackPoint[],
  onHover?: HoverFn
) {
  function handleMouseMove(e: { activeTooltipIndex?: number }) {
    if (!onHover || e.activeTooltipIndex == null) return;
    const pt = points[data[e.activeTooltipIndex]?.origIdx];
    if (pt?.lat != null && pt?.lon != null) onHover({ lat: pt.lat, lon: pt.lon });
  }
  function handleMouseLeave() { onHover?.(null); }
  return { handleMouseMove, handleMouseLeave };
}

function ElevationChart({ points, onHover, activeDist }: { points: TrackPoint[]; onHover?: HoverFn; activeDist?: number | null }) {
  const { chart_height_mini } = useConfig();
  const valid = points.map((p, i) => ({ p, i })).filter(({ p }) => p.altitude_m != null && p.distance_m != null);
  if (valid.length < 2) return null;

  const data = valid.map(({ p, i }) => ({
    dist: Math.round((p.distance_m! / 1000) * 10) / 10,
    alt: Math.round(p.altitude_m!),
    origIdx: i,
  }));

  const { handleMouseMove, handleMouseLeave } = useChartHover(data, points, onHover);

  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Höhenprofil</p>
      <ResponsiveContainer width="100%" height={chart_height_mini}>
        <AreaChart data={data} margin={{ top: 0, right: 0, left: -30, bottom: 0 }}
          syncId="ap" syncMethod="value"
          onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}>
          <defs>
            <linearGradient id="elevGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.4} />
              <stop offset="95%" stopColor="var(--primary)" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <XAxis dataKey="dist" type="number" domain={[0, 'dataMax']} hide />
          <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
          <Tooltip content={<ElevationTooltip />} />
          {activeDist != null && (
            <ReferenceLine x={activeDist} stroke="var(--primary)" strokeWidth={1.5} strokeDasharray="4 2" />
          )}
          <Area type="monotone" dataKey="alt" stroke="var(--primary)" fill="url(#elevGrad)" strokeWidth={1.5} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function HRChart({ points, onHover, activeDist }: { points: TrackPoint[]; onHover?: HoverFn; activeDist?: number | null }) {
  const { chart_height_mini } = useConfig();
  const valid = points.map((p, i) => ({ p, i })).filter(({ p }) => p.hr != null && p.distance_m != null);
  if (valid.length < 2) return null;

  const data = valid.map(({ p, i }) => ({
    dist: Math.round((p.distance_m! / 1000) * 10) / 10,
    hr: Math.round(p.hr!),
    origIdx: i,
  }));

  const { handleMouseMove, handleMouseLeave } = useChartHover(data, points, onHover);

  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Herzfrequenz</p>
      <ResponsiveContainer width="100%" height={chart_height_mini}>
        <AreaChart data={data} margin={{ top: 0, right: 0, left: -30, bottom: 0 }}
          syncId="ap" syncMethod="value"
          onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}>
          <defs>
            <linearGradient id="hrGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#ef4444" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#ef4444" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <XAxis dataKey="dist" type="number" domain={[0, 'dataMax']} hide />
          <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
          <Tooltip content={<HRTooltip />} />
          {activeDist != null && (
            <ReferenceLine x={activeDist} stroke="#ef4444" strokeWidth={1.5} strokeDasharray="4 2" />
          )}
          <Area type="monotone" dataKey="hr" stroke="#ef4444" fill="url(#hrGrad)" strokeWidth={1.5} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// Gleiche Formel wie LeafletMap: grün(120)=langsam → rot(0)=schnell
function speedHue(kmh: number, minSpd: number, maxSpd: number): string {
  const t = maxSpd > minSpd ? Math.max(0, Math.min(1, (kmh - minSpd) / (maxSpd - minSpd))) : 0;
  return `hsl(${Math.round(120 - t * 120)},90%,50%)`;
}

function SpeedChart({ points, onHover, activeDist }: { points: TrackPoint[]; onHover?: HoverFn; activeDist?: number | null }) {
  const { chart_height_mini } = useConfig();
  const valid = points.map((p, i) => ({ p, i })).filter(({ p }) => p.speed_ms != null && p.speed_ms > 0 && p.distance_m != null);
  if (valid.length < 2) return null;

  const data = valid.map(({ p, i }) => ({
    dist: Math.round((p.distance_m! / 1000) * 10) / 10,
    speed: Math.round(p.speed_ms! * 3.6 * 10) / 10,
    origIdx: i,
  }));

  // Loop statt Spread-Operator: bei vielen Track-Punkten würde ...speeds den Call-Stack sprengen
  let minSpd = Infinity, maxSpd = -Infinity;
  for (const d of data) { if (d.speed < minSpd) minSpd = d.speed; if (d.speed > maxSpd) maxSpd = d.speed; }
  const maxDist = data[data.length - 1].dist;

  // Max. 80 Gradient-Stops – mehr wäre DOM-Overhead ohne sichtbaren Gewinn
  const stride = Math.max(1, Math.floor(data.length / 80));
  const stops = data
    .filter((_, i) => i % stride === 0 || i === data.length - 1)
    .map(d => ({
      offset: maxDist > 0 ? `${((d.dist / maxDist) * 100).toFixed(1)}%` : '0%',
      color: speedHue(d.speed, minSpd, maxSpd),
    }));

  const { handleMouseMove, handleMouseLeave } = useChartHover(data, points, onHover);

  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Geschwindigkeit</p>
      <ResponsiveContainer width="100%" height={chart_height_mini}>
        <AreaChart data={data} margin={{ top: 0, right: 0, left: -30, bottom: 0 }}
          syncId="ap" syncMethod="value"
          onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}>
          <defs>
            {/* horizontaler Gradient entlang der Distanzachse – gleiche Farbskala wie die Map */}
            <linearGradient id="speedLineGrad" x1="0" x2="1" y1="0" y2="0">
              {stops.map((s, i) => <stop key={i} offset={s.offset} stopColor={s.color} />)}
            </linearGradient>
            <linearGradient id="speedAreaGrad" x1="0" x2="1" y1="0" y2="0">
              {stops.map((s, i) => <stop key={i} offset={s.offset} stopColor={s.color} stopOpacity={0.18} />)}
            </linearGradient>
          </defs>
          <XAxis dataKey="dist" type="number" domain={[0, 'dataMax']} hide />
          <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
          <Tooltip content={<SpeedTooltip />} />
          {activeDist != null && (
            <ReferenceLine x={activeDist} stroke="var(--primary)" strokeWidth={1.5} strokeDasharray="4 2" />
          )}
          <Area type="monotone" dataKey="speed" stroke="url(#speedLineGrad)" fill="url(#speedAreaGrad)" strokeWidth={2} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// --- Leaflet-Map-Wrapper (in eigener Datei wegen lazy import) ---
// Wird als separates Component exportiert in components/LeafletMap.tsx
// Hier nur die Fallback-Ausgabe im Suspense

// Windrichtung in Grad → Kompass-Label + Unicode-Pfeil (woher der Wind kommt)
const COMPASS = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'];
const ARROWS  = ['↓', '↙', '←', '↖', '↑', '↗', '→', '↘'];

function windLabel(deg: number): string {
  return COMPASS[Math.round(deg / 45) % 8];
}
function windArrow(deg: number): string {
  return ARROWS[Math.round(deg / 45) % 8];
}

// --- Hauptseite ---

export default function ActivityDetailPage() {
  const { id } = useParams<{ id: string }>();
  const activityId = Number(id);
  const config = useConfig();

  const [activity, setActivity] = useState<ActivityDetail | null>(null);
  const [trackPoints, setTrackPoints] = useState<TrackPoint[]>([]);
  const [zones, setZones] = useState<ActivityZones | null>(null);
  const [mediaFiles, setMediaFiles] = useState<string[]>([]);
  const [similar, setSimilar] = useState<SimilarActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeDistKm, setActiveDistKm] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const navigate = useNavigate();

  // setHoverFn wird von LeafletMap via onReady gesetzt und von den Charts direkt aufgerufen
  const setHoverFnRef = useRef<SetHoverFn | null>(null);
  const onMapReady = useCallback((fn: SetHoverFn) => { setHoverFnRef.current = fn; }, []);
  const onHover = useCallback((pt: { lat: number; lon: number } | null) => {
    setHoverFnRef.current?.(pt);
  }, []);

  // Sync-Update im Render-Body – immer aktuell wenn onMapClick aufgerufen wird
  const trackPointsRef = useRef<TrackPoint[]>(trackPoints);
  trackPointsRef.current = trackPoints;

  const onMapClick = useCallback((lat: number, lon: number) => {
    const pts = trackPointsRef.current;
    const idx = closestTrackPointIdx(pts, lat, lon);
    const pt = pts[idx];
    if (pt?.distance_m != null) {
      setActiveDistKm(Math.round(pt.distance_m / 100) / 10);
    }
    // Hover-Marker auf geklickten Punkt setzen (bleibt bis nächster Chart-Hover)
    if (pt?.lat != null && pt?.lon != null) {
      setHoverFnRef.current?.({ lat: pt.lat, lon: pt.lon });
    }
  }, []);

  useEffect(() => {
    if (!activityId) return;
    load();
  }, [activityId]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const act = await api.activity(activityId);
      setActivity(act);

      const basePromises: Promise<unknown>[] = [
        api.activityMedia(activityId),
        api.similarActivities(activityId),
      ];
      if (act.has_track) {
        basePromises.push(api.activityTrack(activityId, config.track_simplify_m));
      }

      const results = await Promise.all(basePromises);
      setMediaFiles((results[0] as { files: string[] }).files);
      setSimilar((results[1] as { similar: SimilarActivity[] }).similar);
      if (act.has_track) {
        setTrackPoints((results[2] as { points: TrackPoint[] }).points);
      }

      // Zonen nicht-blockierend nachladen
      api.activityZones(activityId)
        .then(z => setZones(z))
        .catch(() => {/* Zonen optional */});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler beim Laden');
    } finally {
      setLoading(false);
    }
  }

  if (error) {
    return <p className="text-destructive text-sm">{error}</p>;
  }

  if (loading || !activity) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-80 w-full rounded-xl" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      </div>
    );
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await api.deleteActivity(activityId);
      navigate('/activities');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler beim Löschen');
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  const hasTrack = activity.has_track === 1;
  const hasElevation = trackPoints.some(p => p.altitude_m != null);
  const hasSpeed = trackPoints.some(p => p.speed_ms != null && p.speed_ms > 0);
  const hasHR = trackPoints.some(p => p.hr != null);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <Link to="/activities" className="text-sm text-muted-foreground hover:text-primary transition-colors">
            ← Aktivitäten
          </Link>
          <div className="flex items-center gap-2">
            {hasTrack && (
              <Link
                to={`/strecken?ref=${activity.id}`}
                className="text-xs px-3 py-1 rounded-lg bg-primary text-primary-foreground hover:bg-primary/80 transition-colors"
              >
                Ähnliche vergleichen
              </Link>
            )}
            {confirmDelete ? (
              <span className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Wirklich löschen?</span>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="text-xs px-3 py-1 rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/80 transition-colors disabled:opacity-50"
                >
                  {deleting ? 'Lösche…' : 'Ja, löschen'}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="text-xs px-3 py-1 rounded-lg bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
                >
                  Abbrechen
                </button>
              </span>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="text-xs px-3 py-1 rounded-lg border border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors"
              >
                Löschen
              </button>
            )}
          </div>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{activity.name}</h1>
        <div className="flex items-center gap-2 mt-1">
          <p className="text-sm text-muted-foreground">{fmtDate(activity.start_date)}</p>
          <Badge variant="outline" className="text-xs">{activity.activity_type}</Badge>
          {activity.commute === 1 && <Badge variant="secondary" className="text-xs">Weg zur Arbeit</Badge>}
          {activity.trainer === 1 && <Badge variant="secondary" className="text-xs">Trainer</Badge>}
        </div>
      </div>

      {/* Karte */}
      {hasTrack && trackPoints.length > 0 && (
        <Suspense fallback={<Skeleton className="h-80 w-full rounded-xl" />}>
          <LeafletMap
            points={trackPoints}
            speedColorBuckets={config.speed_color_buckets}
            onReady={onMapReady}
            onPointClick={onMapClick}
          />
        </Suspense>
      )}

      {/* Höhen- und Speed-Profile */}
      {trackPoints.length > 1 && (hasElevation || hasSpeed || hasHR) && (
        <Card>
          <CardContent className="space-y-4">
            {hasElevation && <ElevationChart points={trackPoints} onHover={onHover} activeDist={activeDistKm} />}
            {hasSpeed && <SpeedChart points={trackPoints} onHover={onHover} activeDist={activeDistKm} />}
            {hasHR && <HRChart points={trackPoints} onHover={onHover} activeDist={activeDistKm} />}
          </CardContent>
        </Card>
      )}

      {/* Zonen */}
      {zones && (zones.has_hr || zones.has_power) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Zeit in Zonen</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {zones.has_hr && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                    Herzfrequenz
                  </p>
                  {zones.hr_zones.map(z => (
                    <ZoneBar key={z.zone} label={z.label} pct={z.pct} color={z.color} seconds={z.seconds} />
                  ))}
                </div>
              )}
              {zones.has_power && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                    Leistung
                  </p>
                  {zones.power_zones.map(z => (
                    <ZoneBar key={z.zone} label={z.label} pct={z.pct} color={z.color} seconds={z.seconds} />
                  ))}
                </div>
              )}
            </div>
            {zones.hr_max && (
              <p className="text-xs text-muted-foreground mt-3">
                HRmax {zones.hr_max} bpm
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Hauptstats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatTile
          label="Distanz"
          value={`${(activity.distance_m / 1000).toFixed(2)} km`}
        />
        <StatTile
          label="Fahrzeit"
          value={fmtHm(activity.moving_time_s)}
        />
        <StatTile
          label="⌀ Geschw."
          value={activity.avg_speed_ms ? `${fmtSpeed(activity.avg_speed_ms)} km/h` : '–'}
        />
        <StatTile
          label="Höhenmeter"
          value={activity.elevation_gain_m ? `${Math.round(activity.elevation_gain_m)} m` : '–'}
        />
      </div>

      {/* Sekundärstats */}
      {(activity.avg_hr || activity.avg_power_w || activity.est_avg_power_w ||
        activity.max_speed_ms || activity.calories ||
        activity.avg_cadence || activity.avg_temp_c) && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {activity.avg_hr && (
            <StatTileSecondary
              label="⌀ Herzfreq."
              value={`${Math.round(activity.avg_hr)} bpm`}
              sub={activity.max_hr ? `max ${activity.max_hr} bpm` : undefined}
            />
          )}
          {activity.avg_power_w && (
            <StatTileSecondary
              label="⌀ Leistung"
              value={`${Math.round(activity.avg_power_w)} W`}
              sub={activity.max_power_w ? `max ${Math.round(activity.max_power_w)} W` : undefined}
            />
          )}
          {/* Physikalische Leistungsschätzung (immer anzeigen wenn vorhanden) */}
          {activity.est_avg_power_w && (() => {
            const parts: string[] = [];
            if (activity.est_norm_power_w)
              parts.push(`NP ~${Math.round(activity.est_norm_power_w)} W`);
            if (config.weight_kg && config.weight_kg > 0)
              parts.push(`${(activity.est_avg_power_w / config.weight_kg).toFixed(2)} W/kg`);
            return (
              <StatTileSecondary
                label="~ Leistung"
                value={`~${Math.round(activity.est_avg_power_w)} W`}
                sub={parts.length > 0 ? parts.join(' · ') : undefined}
              />
            );
          })()}
          {activity.max_speed_ms && (
            <StatTileSecondary
              label="Max. Geschw."
              value={`${fmtSpeed(activity.max_speed_ms)} km/h`}
            />
          )}
          {activity.avg_cadence && (
            <StatTileSecondary
              label="⌀ Kadenz"
              value={`${Math.round(activity.avg_cadence)} rpm`}
            />
          )}
          {activity.calories && (
            <StatTileSecondary
              label="Kalorien"
              value={`${Math.round(activity.calories)} kcal`}
            />
          )}
          {activity.elevation_loss_m && (
            <StatTileSecondary
              label="Abstieg"
              value={`${Math.round(activity.elevation_loss_m)} m`}
            />
          )}
        </div>
      )}

      {/* Wetter */}
      {(activity.weather_temp_c != null || activity.weather_wind_ms != null) && (
        <Card size="sm">
          <CardContent>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Wetter (Open-Meteo)</p>
            <div className="flex flex-wrap gap-4 text-sm">
              {activity.weather_temp_c != null && (
                <span className="text-foreground font-medium">
                  {activity.weather_temp_c.toFixed(1)} °C
                </span>
              )}
              {activity.weather_wind_ms != null && (
                <span className="text-foreground font-medium">
                  {activity.weather_wind_deg != null ? (
                    <span className="mr-1 text-muted-foreground">{windArrow(activity.weather_wind_deg)} {windLabel(activity.weather_wind_deg)}</span>
                  ) : null}
                  {(activity.weather_wind_ms * 3.6).toFixed(1)} km/h
                </span>
              )}
              {activity.weather_precip_mm != null && activity.weather_precip_mm > 0 && (
                <span className="text-foreground font-medium">
                  {activity.weather_precip_mm.toFixed(1)} mm Regen
                </span>
              )}
              {activity.weather_precip_mm === 0 && (
                <span className="text-muted-foreground text-xs">kein Regen</span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Fotos */}
      {mediaFiles.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">
            Fotos{' '}
            <span className="text-sm font-normal text-muted-foreground">({mediaFiles.length})</span>
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {mediaFiles.map(file => (
              <a key={file} href={api.mediaUrl(file)} target="_blank" rel="noopener noreferrer">
                <img
                  src={api.mediaUrl(file)}
                  alt={file}
                  className="rounded-xl object-cover w-full aspect-square hover:opacity-90 transition-opacity border border-border"
                />
              </a>
            ))}
          </div>
        </section>
      )}

      {/* Ähnliche Rides */}
      {similar.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Ähnliche Aktivitäten</h2>
          <Card className="overflow-hidden p-0 gap-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground text-xs">Datum</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground text-xs">Name</th>
                    <th className="text-right px-4 py-2 font-medium text-muted-foreground text-xs">Distanz</th>
                    <th className="text-right px-4 py-2 font-medium text-muted-foreground text-xs">Zeit</th>
                    <th className="text-right px-4 py-2 font-medium text-muted-foreground text-xs">km/h</th>
                    <th className="text-right px-4 py-2 font-medium text-muted-foreground text-xs hidden md:table-cell">HR</th>
                    <th className="text-right px-4 py-2 font-medium text-muted-foreground text-xs hidden md:table-cell">Hm</th>
                  </tr>
                </thead>
                <tbody>
                  {similar.map(act => (
                    <tr
                      key={act.id}
                      className="border-b border-border/50 hover:bg-muted/40 cursor-pointer transition-colors"
                      onClick={() => navigate(`/activities/${act.id}`)}
                    >
                      <td className="px-4 py-2 text-muted-foreground text-xs whitespace-nowrap">
                        {fmtDate(act.start_date)}
                      </td>
                      <td className="px-4 py-2 max-w-xs">
                        <span className="truncate block">{act.name}</span>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-xs">
                        {fmtKm(act.distance_m)} km
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-xs text-muted-foreground">
                        {fmtTime(act.moving_time_s)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-xs">
                        {act.avg_speed_ms ? fmtSpeed(act.avg_speed_ms) : '–'}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-xs text-muted-foreground hidden md:table-cell">
                        {act.avg_hr ? Math.round(act.avg_hr) : '–'}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-xs text-muted-foreground hidden md:table-cell">
                        {act.elevation_gain_m ? Math.round(act.elevation_gain_m) : '–'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </section>
      )}
    </div>
  );
}
