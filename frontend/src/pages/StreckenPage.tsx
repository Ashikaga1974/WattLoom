import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { api, type ActivityDetail, type SimilarActivity, type TrackPoint } from '@/lib/api';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { RouteThumbnail } from '@/components/RouteThumbnail';
import { ChartTooltip } from '@/components/ui/chart-tooltip';
import { fmtDate, fmtKm, fmtTime, fmtTimeShort } from '@/lib/format';
import { rideTitle } from '@/lib/activity-display';
import { useConfig } from '@/lib/config-context';

function fmtSpeed(ms: number | null) { return ms != null ? (ms * 3.6).toFixed(1) + ' km/h' : '–'; }
function fmtHr(hr: number | null) { return hr != null ? Math.round(hr) + ' bpm' : '–'; }
function fmtElev(m: number | null) { return m != null ? Math.round(m) + ' m' : '–'; }
function fmtTemp(c: number | null) { return c != null ? Math.round(c) + '°C' : '–'; }
function fmtWind(ms: number | null) { return ms != null ? (ms * 3.6).toFixed(0) + ' km/h' : '–'; }

// Δ zur Referenz: Zeit in Sekunden, positiv = langsamer als Referenz
function fmtDeltaTime(deltaS: number): string {
  const sign = deltaS > 0 ? '+' : deltaS < 0 ? '−' : '±';
  return `${sign}${fmtTimeShort(Math.abs(deltaS))}`;
}

// Δ Speed in km/h, positiv = schneller als Referenz
function fmtDeltaSpeed(deltaMs: number): string {
  const kmh = deltaMs * 3.6;
  const sign = kmh > 0 ? '+' : kmh < 0 ? '−' : '±';
  return `${sign}${Math.abs(kmh).toFixed(1)} km/h`;
}

// Aerobe Effizienz: km/h pro Herzschlag – höher ist besser (schneller bei gleicher Anstrengung)
function efficiency(avgSpeedMs: number | null, avgHr: number | null): number | null {
  if (avgSpeedMs == null || avgHr == null || avgHr <= 0) return null;
  return (avgSpeedMs * 3.6) / avgHr;
}

// Nächsten Punkt per Binärsuche an einer Ziel-Distanz finden (max. 0.3 km Lücke, sonst null –
// verhindert, dass eine deutlich kürzere/längere Fahrt über ihr Streckenende hinaus "flach" wirkt
// bzw. der Karten-Marker am Streckenende hängen bleibt). Generisch für Speed/Höhen-Werte UND
// Lat/Lon-Punkte nutzbar (Chart-Hover→Karte).
function nearestPoint<T extends { distKm: number }>(points: T[], target: number, maxGapKm = 0.3): T | null {
  if (points.length === 0) return null;
  let lo = 0, hi = points.length - 1;
  if (target <= points[0].distKm) return Math.abs(points[0].distKm - target) <= maxGapKm ? points[0] : null;
  if (target >= points[hi].distKm) return Math.abs(points[hi].distKm - target) <= maxGapKm ? points[hi] : null;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid].distKm < target) lo = mid + 1; else hi = mid;
  }
  const after = points[lo];
  const before = points[Math.max(0, lo - 1)];
  const nearest = Math.abs(after.distKm - target) < Math.abs(before.distKm - target) ? after : before;
  return Math.abs(nearest.distKm - target) <= maxGapKm ? nearest : null;
}

function nearestAtDistance(points: { distKm: number; value: number }[], target: number, maxGapKm = 0.3): number | null {
  return nearestPoint(points, target, maxGapKm)?.value ?? null;
}

// Kürzt lange Aktivitätsnamen für den Chart-Tooltip – ChartTooltip-Zeilen sind shrink-0 und
// umbrechen nicht, ein voller Aktivitätsname lief sonst sichtbar über den Tooltip-Rahmen hinaus.
function shortLabel(s: string, max = 22): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

const PROFILE_STEP_KM = 0.1;

// Baut ein gemeinsames Distanz-Raster (0.1 km-Schritte) und resampled Speed bzw. Höhe jeder
// Fahrt per Nearest-Neighbor darauf – nötig, da die Tracks unterschiedlich viele Punkte und
// leicht unterschiedliche Gesamtdistanzen haben (±3% Toleranz im Streckenvergleich).
function buildProfileData(
  tracks: TrackEntry[],
  valueOf: (p: TrackPoint) => number | null,
): Array<Record<string, number | null>> {
  const series = tracks.map(t => ({
    id: t.id,
    points: t.points
      .map(p => ({ distKm: p.distance_m != null ? p.distance_m / 1000 : null, value: valueOf(p) }))
      .filter((p): p is { distKm: number; value: number } => p.distKm != null && p.value != null)
      .sort((a, b) => a.distKm - b.distKm),
  }));
  const maxDist = Math.max(0, ...series.map(s => (s.points.length ? s.points[s.points.length - 1].distKm : 0)));
  if (maxDist <= 0) return [];
  const result: Array<Record<string, number | null>> = [];
  for (let d = 0; d <= maxDist + 1e-9; d += PROFILE_STEP_KM) {
    const row: Record<string, number | null> = { dist: Math.round(d * 100) / 100 };
    for (const s of series) row[`v_${s.id}`] = nearestAtDistance(s.points, d);
    result.push(row);
  }
  return result;
}

function ProfileTooltip({
  active, payload, label, tracks, unit,
}: {
  active?: boolean;
  payload?: Array<{ payload: Record<string, number | null> }>;
  label?: number;
  tracks: TrackEntry[];
  unit: string;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const rows = tracks.map(t => {
    const v = row[`v_${t.id}`];
    return { label: shortLabel(t.label), value: v != null ? `${v.toFixed(1)} ${unit}` : null, color: t.color };
  });
  return <ChartTooltip active={active} label={label != null ? `${label.toFixed(1)} km` : null} rows={rows} />;
}

interface TrackEntry {
  id: number;
  label: string;
  color: string;
  points: TrackPoint[];
}

export default function StreckenPage() {
  const { t } = useTranslation(['strecken', 'common']);
  const config = useConfig();
  const { id: paramId } = useParams<{ id?: string }>();
  const [searchParams] = useSearchParams();
  const refParam = searchParams.get('ref');

  // Referenz-ID: aus URL-Param oder Query-Param
  const refId = paramId ? Number(paramId) : (refParam ? Number(refParam) : null);

  const [refActivity, setRefActivity] = useState<ActivityDetail | null>(null);
  const [similarList, setSimilarList] = useState<SimilarActivity[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [tracksData, setTracksData] = useState<Record<number, TrackPoint[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingIds, setLoadingIds] = useState<Set<number>>(new Set());
  // Distanz (km) unter dem Mauszeiger im Speed-/Höhenprofil – zeigt die Position aller Tracks auf der Karte
  const [hoverDistKm, setHoverDistKm] = useState<number | null>(null);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leafletRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const polylineMapRef = useRef<Record<number, any>>({});
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hoverMarkersRef = useRef<Record<number, any>>({});

  // Karte beim Unmount bereinigen
  useEffect(() => {
    return () => {
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
  }, []);

  // Referenz laden wenn ID bekannt
  useEffect(() => {
    if (!refId) return;
    loadReference(refId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refId]);

  async function loadReference(id: number) {
    setLoading(true);
    setError(null);
    setRefActivity(null);
    setSimilarList([]);
    setSelectedIds([]);
    setTracksData({});
    if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    polylineMapRef.current = {};
    hoverMarkersRef.current = {};
    setHoverDistKm(null);
    try {
      const [act, similar] = await Promise.all([
        api.activity(id),
        api.similarActivities(id, 20),
      ]);
      setRefActivity(act);
      setSimilarList(similar.similar);
      if (act.has_track) {
        const track = await api.activityTrack(id, config.comparison_simplify);
        setTracksData({ [id]: track.points });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t('errors.loadFailed'));
    } finally {
      setLoading(false);
    }
  }

  async function toggleSelect(id: number) {
    if (selectedIds.includes(id)) {
      setSelectedIds(prev => prev.filter(s => s !== id));
      setTracksData(prev => { const copy = { ...prev }; delete copy[id]; return copy; });
    } else {
      if (selectedIds.length >= 4) return;
      setSelectedIds(prev => [...prev, id]);
      if (!tracksData[id]) {
        setLoadingIds(prev => new Set([...prev, id]));
        try {
          const track = await api.activityTrack(id, config.comparison_simplify);
          setTracksData(prev => ({ ...prev, [id]: track.points }));
        } catch { /* Track nicht verfügbar */ }
        finally {
          setLoadingIds(prev => { const s = new Set(prev); s.delete(id); return s; });
        }
      }
    }
  }

  // Chart-Tracks zusammenbauen
  const chartTracks: TrackEntry[] = [];
  if (refActivity && tracksData[refActivity.id]) {
    chartTracks.push({ id: refActivity.id, label: rideTitle(refActivity, t), color: config.comparison_colors[0], points: tracksData[refActivity.id] });
  }
  selectedIds.forEach((id, i) => {
    if (tracksData[id]) {
      const act = similarList.find(a => a.id === id);
      chartTracks.push({ id, label: act?.name ?? `#${id}`, color: config.comparison_colors[(i + 1) % config.comparison_colors.length], points: tracksData[id] });
    }
  });

  // Speed-/Höhenprofil über die Distanz (nur wenn mind. 1 Track zusätzlich zur Referenz geladen ist)
  const speedProfileData = chartTracks.length > 1 ? buildProfileData(chartTracks, p => (p.speed_ms != null && p.speed_ms > 0 ? p.speed_ms * 3.6 : null)) : [];
  const elevationProfileData = chartTracks.length > 1 ? buildProfileData(chartTracks, p => p.altitude_m) : [];
  const hrProfileData = chartTracks.length > 1 ? buildProfileData(chartTracks, p => p.hr) : [];

  // Bestwerte unter Referenz + Auswahl ermitteln (für Highlight in der Stats-Tabelle)
  const compareRows = refActivity
    ? [
        { id: refActivity.id, avg_speed_ms: refActivity.avg_speed_ms, avg_hr: refActivity.avg_hr },
        ...selectedIds.map(id => similarList.find(a => a.id === id)).filter((a): a is SimilarActivity => a != null),
      ]
    : [];
  const bestSpeedRow = compareRows.reduce<{ id: number; v: number } | null>((best, r) => {
    if (r.avg_speed_ms == null) return best;
    return !best || r.avg_speed_ms > best.v ? { id: r.id, v: r.avg_speed_ms } : best;
  }, null);
  const effRows = compareRows
    .map(r => ({ id: r.id, eff: efficiency(r.avg_speed_ms, r.avg_hr) }))
    .filter((r): r is { id: number; eff: number } => r.eff != null);
  const bestEfficiencyRow = effRows.length >= 2
    ? effRows.reduce((best, r) => (r.eff > best.eff ? r : best))
    : null;

  // Karte synchronisieren wenn Tracks sich ändern
  const chartTrackIds = chartTracks.map(t => t.id).join(',');
  useEffect(() => {
    if (chartTracks.length === 0) return;
    syncMapPolylines(chartTracks);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartTrackIds]);

  // Lat/Lon je Track nach Distanz sortiert – Basis für den Karten-Marker beim Chart-Hover
  const latLonSeriesByTrack = useMemo(() => {
    const map: Record<number, { distKm: number; lat: number; lon: number }[]> = {};
    for (const t of chartTracks) {
      map[t.id] = t.points
        .filter((p): p is TrackPoint & { distance_m: number; lat: number; lon: number } =>
          p.distance_m != null && p.lat != null && p.lon != null)
        .map(p => ({ distKm: p.distance_m / 1000, lat: p.lat, lon: p.lon }))
        .sort((a, b) => a.distKm - b.distKm);
    }
    return map;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartTrackIds]);

  function handleChartHover(state: { activeLabel?: string | number }) {
    if (state?.activeLabel != null) setHoverDistKm(Number(state.activeLabel));
  }
  function handleChartLeave() {
    setHoverDistKm(null);
  }

  // Hover-Position aller Tracks als Marker auf der Karte anzeigen – so sieht man beim Vergleichen
  // von Speed/Höhe direkt, WO auf der Strecke dieser Punkt liegt (statt nur die Zahl zu lesen).
  useEffect(() => {
    if (!mapRef.current || !leafletRef.current) return;
    const L = leafletRef.current;

    if (hoverDistKm == null) {
      Object.values(hoverMarkersRef.current).forEach(m => m.remove());
      hoverMarkersRef.current = {};
      return;
    }

    const activeIds = new Set(chartTracks.map(t => t.id));
    for (const idStr of Object.keys(hoverMarkersRef.current)) {
      if (!activeIds.has(Number(idStr))) {
        hoverMarkersRef.current[Number(idStr)].remove();
        delete hoverMarkersRef.current[Number(idStr)];
      }
    }

    for (const track of chartTracks) {
      const series = latLonSeriesByTrack[track.id];
      const pt = series ? nearestPoint(series, hoverDistKm) : null;
      if (!pt) continue;
      if (!hoverMarkersRef.current[track.id]) {
        hoverMarkersRef.current[track.id] = L.circleMarker([pt.lat, pt.lon], {
          radius: 7,
          color: '#1a1a1a',
          weight: 2,
          fillColor: track.color,
          fillOpacity: 1,
        }).addTo(mapRef.current);
      } else {
        hoverMarkersRef.current[track.id].setLatLng([pt.lat, pt.lon]);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoverDistKm, chartTrackIds]);

  async function syncMapPolylines(tracks: TrackEntry[]) {
    if (!leafletRef.current) {
      leafletRef.current = (await import('leaflet')).default;
      await import('leaflet/dist/leaflet.css');
      delete (leafletRef.current.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
    }
    const L = leafletRef.current;
    const container = mapContainerRef.current;
    if (!container) return;

    if (!mapRef.current) {
      mapRef.current = L.map(container);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 18,
      }).addTo(mapRef.current);
    }

    // Veraltete Polylines entfernen
    const newIds = new Set(tracks.map(t => t.id));
    for (const idStr of Object.keys(polylineMapRef.current)) {
      const numId = Number(idStr);
      if (!newIds.has(numId)) {
        polylineMapRef.current[numId].remove();
        delete polylineMapRef.current[numId];
      }
    }

    // Neue Polylines hinzufügen
    const allLatLngs: [number, number][] = [];
    for (const track of tracks) {
      const valid = track.points.filter(p => p.lat != null && p.lon != null);
      if (valid.length === 0) continue;
      const latlngs = valid.map(p => [p.lat, p.lon] as [number, number]);
      allLatLngs.push(...latlngs);
      if (!polylineMapRef.current[track.id]) {
        polylineMapRef.current[track.id] = L.polyline(latlngs, { color: track.color, weight: 3, opacity: 0.85 }).addTo(mapRef.current);
      }
    }
    if (allLatLngs.length > 0) {
      mapRef.current.fitBounds(L.polyline(allLatLngs).getBounds(), { padding: [20, 20] });
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('header.title')} />

      {refActivity && (
        <p className="mt-0.5 text-sm text-muted-foreground">
          {t('reference.prefix')} {rideTitle(refActivity, t)} · {fmtDate(refActivity.start_date)}
        </p>
      )}

      {!refId && !loading && (
        <div className="py-16 text-center text-muted-foreground">
          <p className="text-lg">{t('emptyState.noActivitySelected')}</p>
          <p className="mt-2 text-sm">
            {t('emptyState.hintPrefix')}{' '}
            <span className="font-medium text-primary">{t('emptyState.hintButton')}</span> {t('emptyState.hintSuffix')}
          </p>
          <Link
            to="/activities"
            className="mt-4 inline-block rounded-md border border-primary/40 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/5 transition-colors"
          >
            {t('emptyState.toActivities')}
          </Link>
        </div>
      )}

      {loading && (
        <div className="py-16 text-center text-muted-foreground">{t('loading')}</div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>
      )}

      {refActivity && !loading && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Linke Spalte: Auswahlliste */}
          <div className="space-y-4">
            {/* Referenz-Aktivität */}
            <Card className="border-primary/40">
              <CardContent className="p-3">
                <div className="mb-1 flex items-center gap-2">
                  <span className="inline-block h-3 w-3 shrink-0 rounded-full" style={{ background: config.comparison_colors[0] }} />
                  <span className="text-xs font-medium uppercase tracking-wide text-primary">{t('list.referenceLabel')}</span>
                </div>
                <div className="flex items-start gap-3">
                  <RouteThumbnail activityId={refActivity.id} size={48} />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold leading-snug">{rideTitle(refActivity, t)}</p>
                    <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                      <span className="rounded-full bg-primary/15 px-2.5 py-1 text-sm font-bold tabular-nums text-primary">
                        {fmtKm(refActivity.distance_m)} km
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {fmtDate(refActivity.start_date)} · {fmtTime(refActivity.moving_time_s)}
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Ähnliche Aktivitäten */}
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t('list.similarLabel', { count: similarList.length })}
                {selectedIds.length > 0 && (
                  <span className="ml-1 text-primary">{t('list.selectedSuffix', { count: selectedIds.length })}</span>
                )}
              </p>
              {similarList.length === 0 && (
                <p className="text-sm italic text-muted-foreground">{t('list.noneFound')}</p>
              )}
              <div className="max-h-[60vh] space-y-1.5 overflow-y-auto pr-1">
                {[...similarList].sort((a, b) => b.distance_m - a.distance_m).map(act => {
                  const isSelected = selectedIds.includes(act.id);
                  const isLoadingItem = loadingIds.has(act.id);
                  const colorIdx = isSelected ? (selectedIds.indexOf(act.id) + 1) % config.comparison_colors.length : null;
                  const isDisabled = isLoadingItem || (!isSelected && selectedIds.length >= 4);
                  return (
                    <button
                      key={act.id}
                      type="button"
                      onClick={() => toggleSelect(act.id)}
                      disabled={isDisabled}
                      className={`w-full rounded-lg border p-2.5 text-left text-sm transition-colors ${
                        isSelected ? 'border-primary/50 bg-primary/5' : 'border-border hover:border-border/80'
                      } ${isLoadingItem ? 'cursor-wait opacity-60' : ''} ${!isLoadingItem && isDisabled ? 'cursor-not-allowed opacity-40' : ''}`}
                    >
                      <div className="flex items-start gap-2">
                        {isLoadingItem ? (
                          <span className="mt-0.5 inline-block h-2.5 w-2.5 shrink-0 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                        ) : colorIdx !== null ? (
                          <span className="mt-0.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: config.comparison_colors[colorIdx] }} />
                        ) : (
                          <span className="mt-0.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-border" />
                        )}
                        <RouteThumbnail activityId={act.id} size={40} />
                        <div className="min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate font-medium leading-snug">{rideTitle(act, t)}</p>
                            {act.path_match_pct != null && (
                              <span
                                className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums"
                                style={
                                  act.path_match_pct >= 90
                                    ? { background: 'rgba(34,197,94,0.15)', color: '#22c55e' }
                                    : act.path_match_pct >= 75
                                    ? { background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }
                                    : { background: 'var(--muted)', color: 'var(--muted-foreground)' }
                                }
                                title={t('list.pathMatchTooltip')}
                              >
                                {act.path_match_pct}%
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 flex items-baseline gap-1.5">
                            <span className="text-sm font-bold tabular-nums text-primary">{fmtKm(act.distance_m)} km</span>
                            <span className="text-xs text-muted-foreground">{fmtDate(act.start_date)}</span>
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {fmtSpeed(act.avg_speed_ms)}
                            {act.avg_hr ? ` · ${Math.round(act.avg_hr)} bpm` : ''}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Rechte Spalte: Karte + Tabelle */}
          <div className="space-y-4 lg:col-span-2">
            {/* Karte */}
            <div ref={mapContainerRef} className="h-72 overflow-hidden rounded-xl border border-border" />

            {/* Legende */}
            {chartTracks.length > 0 && (
              <div className="flex flex-wrap gap-3">
                {chartTracks.map(t => (
                  <div key={t.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="inline-block h-1.5 w-3 rounded-full" style={{ background: t.color }} />
                    <span className="max-w-[160px] truncate">{t.label}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Speed-/Höhenprofil über die Distanz */}
            {speedProfileData.length > 0 && (
              <Card>
                <CardContent className="p-3 space-y-4">
                  <div>
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {t('profile.speedTitle')}
                    </p>
                    <ResponsiveContainer width="100%" height={config.chart_height}>
                      <LineChart data={speedProfileData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}
                        syncId="strecken-profil" syncMethod="value"
                        onMouseMove={handleChartHover} onMouseLeave={handleChartLeave}>
                        <XAxis dataKey="dist" type="number" domain={[0, 'dataMax']} tick={{ fontSize: 11 }} unit=" km" />
                        <YAxis tick={{ fontSize: 11 }} width={40} />
                        <Tooltip content={<ProfileTooltip tracks={chartTracks} unit="km/h" />} />
                        {chartTracks.map(t => (
                          <Line key={t.id} dataKey={`v_${t.id}`} stroke={t.color} strokeWidth={2}
                            dot={false} isAnimationActive={false} connectNulls />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {t('profile.elevationTitle')}
                    </p>
                    <ResponsiveContainer width="100%" height={config.chart_height_compact}>
                      <LineChart data={elevationProfileData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}
                        syncId="strecken-profil" syncMethod="value"
                        onMouseMove={handleChartHover} onMouseLeave={handleChartLeave}>
                        <XAxis dataKey="dist" type="number" domain={[0, 'dataMax']} tick={{ fontSize: 11 }} unit=" km" />
                        <YAxis tick={{ fontSize: 11 }} width={40} />
                        <Tooltip content={<ProfileTooltip tracks={chartTracks} unit="m" />} />
                        {chartTracks.map(t => (
                          <Line key={t.id} dataKey={`v_${t.id}`} stroke={t.color} strokeWidth={2}
                            dot={false} isAnimationActive={false} connectNulls />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  {hrProfileData.length > 0 && (
                    <div>
                      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {t('profile.hrTitle')}
                      </p>
                      <ResponsiveContainer width="100%" height={config.chart_height_compact}>
                        <LineChart data={hrProfileData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}
                          syncId="strecken-profil" syncMethod="value"
                          onMouseMove={handleChartHover} onMouseLeave={handleChartLeave}>
                          <XAxis dataKey="dist" type="number" domain={[0, 'dataMax']} tick={{ fontSize: 11 }} unit=" km" />
                          <YAxis tick={{ fontSize: 11 }} width={40} />
                          <Tooltip content={<ProfileTooltip tracks={chartTracks} unit="bpm" />} />
                          {chartTracks.map(t => (
                            <Line key={t.id} dataKey={`v_${t.id}`} stroke={t.color} strokeWidth={2}
                              dot={false} isAnimationActive={false} connectNulls />
                          ))}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Stats-Tabelle */}
            {selectedIds.length > 0 && (
              <Card className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-2 font-medium">{t('table.activity')}</th>
                      <th className="px-3 py-2 font-medium">{t('table.date')}</th>
                      <th className="px-3 py-2 font-medium">{t('table.distance')}</th>
                      <th className="px-3 py-2 font-medium">{t('table.time')}</th>
                      <th className="px-3 py-2 font-medium">{t('table.deltaTime')}</th>
                      <th className="px-3 py-2 font-medium">{t('table.avgSpeed')}</th>
                      <th className="px-3 py-2 font-medium">{t('table.deltaSpeed')}</th>
                      <th className="px-3 py-2 font-medium">{t('table.avgHr')}</th>
                      <th className="px-3 py-2 font-medium">{t('table.elevation')}</th>
                      <th className="px-3 py-2 font-medium">{t('table.temp')}</th>
                      <th className="px-3 py-2 font-medium">{t('table.wind')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Referenz */}
                    <tr className="border-b border-border/50 bg-primary/5">
                      <td className="flex items-center gap-2 px-3 py-2">
                        <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: config.comparison_colors[0] }} />
                        <Link to={`/activities/${refActivity.id}`} className="max-w-[140px] truncate font-medium hover:text-primary">
                          {rideTitle(refActivity, t)}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{fmtDate(refActivity.start_date)}</td>
                      <td className="px-3 py-2 font-bold tabular-nums text-primary">{fmtKm(refActivity.distance_m)} km</td>
                      <td className="px-3 py-2 text-muted-foreground">{fmtTime(refActivity.moving_time_s)}</td>
                      <td className="px-3 py-2 text-muted-foreground" title={t('table.referenceNoDeltaTooltip')}>–</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {fmtSpeed(refActivity.avg_speed_ms)}
                        {bestSpeedRow?.id === refActivity.id && <span title={t('table.bestSpeedTooltip')} className="ml-1">🏆</span>}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground" title={t('table.referenceNoDeltaTooltip')}>–</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {fmtHr(refActivity.avg_hr)}
                        {bestEfficiencyRow?.id === refActivity.id && <span title={t('table.bestEfficiencyTooltip')} className="ml-1">⚡</span>}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{fmtElev(refActivity.elevation_gain_m)}</td>
                      <td className="px-3 py-2 text-muted-foreground">{fmtTemp(refActivity.weather_temp_c)}</td>
                      <td className="px-3 py-2 text-muted-foreground">{fmtWind(refActivity.weather_wind_ms)}</td>
                    </tr>
                    {/* Ausgewählte */}
                    {selectedIds.map((id, i) => {
                      const act = similarList.find(a => a.id === id);
                      if (!act) return null;
                      const deltaTime = act.moving_time_s - refActivity.moving_time_s;
                      const deltaSpeed = act.avg_speed_ms != null && refActivity.avg_speed_ms != null
                        ? act.avg_speed_ms - refActivity.avg_speed_ms
                        : null;
                      return (
                        <tr key={id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: config.comparison_colors[(i + 1) % config.comparison_colors.length] }} />
                              <Link to={`/activities/${act.id}`} className="max-w-[140px] truncate hover:text-primary">
                                {rideTitle(act, t)}
                              </Link>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">{fmtDate(act.start_date)}</td>
                          <td className="px-3 py-2 font-bold tabular-nums text-primary">{fmtKm(act.distance_m)} km</td>
                          <td className="px-3 py-2 text-muted-foreground">{fmtTime(act.moving_time_s)}</td>
                          <td className={`px-3 py-2 font-medium ${deltaTime < 0 ? 'text-green-600' : deltaTime > 0 ? 'text-orange-500' : 'text-muted-foreground'}`}>
                            {fmtDeltaTime(deltaTime)}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {fmtSpeed(act.avg_speed_ms)}
                            {bestSpeedRow?.id === act.id && <span title={t('table.bestSpeedTooltip')} className="ml-1">🏆</span>}
                          </td>
                          <td className={`px-3 py-2 font-medium ${deltaSpeed == null ? 'text-muted-foreground' : deltaSpeed > 0 ? 'text-green-600' : deltaSpeed < 0 ? 'text-orange-500' : 'text-muted-foreground'}`}>
                            {deltaSpeed != null ? fmtDeltaSpeed(deltaSpeed) : '–'}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {fmtHr(act.avg_hr)}
                            {bestEfficiencyRow?.id === act.id && <span title={t('table.bestEfficiencyTooltip')} className="ml-1">⚡</span>}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">{fmtElev(act.elevation_gain_m)}</td>
                          <td className="px-3 py-2 text-muted-foreground">{fmtTemp(act.weather_temp_c)}</td>
                          <td className="px-3 py-2 text-muted-foreground">{fmtWind(act.weather_wind_ms)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
