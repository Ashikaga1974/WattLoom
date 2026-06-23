import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { api, type ActivityDetail, type SimilarActivity, type TrackPoint } from '@/lib/api';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { fmtDate, fmtKm, fmtTime } from '@/lib/format';
import { COMPARISON_SIMPLIFY } from '@/lib/config';
const COMPARISON_COLORS = ['#f97316', '#3b82f6', '#22c55e', '#a855f7', '#eab308'];

function fmtSpeed(ms: number | null) { return ms != null ? (ms * 3.6).toFixed(1) + ' km/h' : '–'; }
function fmtHr(hr: number | null) { return hr != null ? Math.round(hr) + ' bpm' : '–'; }
function fmtElev(m: number | null) { return m != null ? Math.round(m) + ' m' : '–'; }

interface TrackEntry {
  id: number;
  label: string;
  color: string;
  points: TrackPoint[];
}

export default function StreckenPage() {
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

  const mapContainerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leafletRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const polylineMapRef = useRef<Record<number, any>>({});

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
    try {
      const [act, similar] = await Promise.all([
        api.activity(id),
        api.similarActivities(id, 20),
      ]);
      setRefActivity(act);
      setSimilarList(similar.similar);
      if (act.has_track) {
        const track = await api.activityTrack(id, COMPARISON_SIMPLIFY);
        setTracksData({ [id]: track.points });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler beim Laden');
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
          const track = await api.activityTrack(id, COMPARISON_SIMPLIFY);
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
    chartTracks.push({ id: refActivity.id, label: refActivity.name, color: COMPARISON_COLORS[0], points: tracksData[refActivity.id] });
  }
  selectedIds.forEach((id, i) => {
    if (tracksData[id]) {
      const act = similarList.find(a => a.id === id);
      chartTracks.push({ id, label: act?.name ?? `#${id}`, color: COMPARISON_COLORS[(i + 1) % COMPARISON_COLORS.length], points: tracksData[id] });
    }
  });

  // Karte synchronisieren wenn Tracks sich ändern
  const chartTrackIds = chartTracks.map(t => t.id).join(',');
  useEffect(() => {
    if (chartTracks.length === 0) return;
    syncMapPolylines(chartTracks);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartTrackIds]);

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
    <div className="max-w-7xl mx-auto space-y-6">
      <PageHeader title="Streckenvergleich" />

      {refActivity && (
        <p className="mt-0.5 text-sm text-muted-foreground">
          Referenz: {refActivity.name} · {fmtDate(refActivity.start_date)}
        </p>
      )}

      {!refId && !loading && (
        <div className="py-16 text-center text-muted-foreground">
          <p className="text-lg">Keine Aktivität ausgewählt.</p>
          <p className="mt-2 text-sm">
            Öffne eine Aktivität und klicke auf{' '}
            <span className="font-medium text-primary">Ähnliche vergleichen</span>.
          </p>
        </div>
      )}

      {loading && (
        <div className="py-16 text-center text-muted-foreground">Lade…</div>
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
                  <span className="inline-block h-3 w-3 shrink-0 rounded-full" style={{ background: COMPARISON_COLORS[0] }} />
                  <span className="text-xs font-medium uppercase tracking-wide text-primary">Referenz</span>
                </div>
                <p className="text-sm font-semibold leading-snug">{refActivity.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {fmtDate(refActivity.start_date)} · {fmtKm(refActivity.distance_m)} km · {fmtTime(refActivity.moving_time_s)}
                </p>
              </CardContent>
            </Card>

            {/* Ähnliche Aktivitäten */}
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Ähnliche ({similarList.length})
                {selectedIds.length > 0 && (
                  <span className="ml-1 text-primary">· {selectedIds.length} ausgewählt</span>
                )}
              </p>
              {similarList.length === 0 && (
                <p className="text-sm italic text-muted-foreground">Keine ähnlichen Aktivitäten gefunden.</p>
              )}
              <div className="max-h-[60vh] space-y-1.5 overflow-y-auto pr-1">
                {similarList.map(act => {
                  const isSelected = selectedIds.includes(act.id);
                  const isLoadingItem = loadingIds.has(act.id);
                  const colorIdx = isSelected ? (selectedIds.indexOf(act.id) + 1) % COMPARISON_COLORS.length : null;
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
                          <span className="mt-0.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: COMPARISON_COLORS[colorIdx] }} />
                        ) : (
                          <span className="mt-0.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-border" />
                        )}
                        <div className="min-w-0">
                          <p className="truncate font-medium leading-snug">{act.name}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {fmtDate(act.start_date)} · {fmtKm(act.distance_m)} km
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

            {/* Stats-Tabelle */}
            {selectedIds.length > 0 && (
              <Card className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-2 font-medium">Aktivität</th>
                      <th className="px-3 py-2 font-medium">Datum</th>
                      <th className="px-3 py-2 font-medium">Distanz</th>
                      <th className="px-3 py-2 font-medium">Zeit</th>
                      <th className="px-3 py-2 font-medium">Ø Speed</th>
                      <th className="px-3 py-2 font-medium">Ø HR</th>
                      <th className="px-3 py-2 font-medium">Hm</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Referenz */}
                    <tr className="border-b border-border/50 bg-primary/5">
                      <td className="flex items-center gap-2 px-3 py-2">
                        <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: COMPARISON_COLORS[0] }} />
                        <Link to={`/activities/${refActivity.id}`} className="max-w-[140px] truncate font-medium hover:text-primary">
                          {refActivity.name}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{fmtDate(refActivity.start_date)}</td>
                      <td className="px-3 py-2 text-muted-foreground">{fmtKm(refActivity.distance_m)} km</td>
                      <td className="px-3 py-2 text-muted-foreground">{fmtTime(refActivity.moving_time_s)}</td>
                      <td className="px-3 py-2 text-muted-foreground">{fmtSpeed(refActivity.avg_speed_ms)}</td>
                      <td className="px-3 py-2 text-muted-foreground">{fmtHr(refActivity.avg_hr)}</td>
                      <td className="px-3 py-2 text-muted-foreground">{fmtElev(refActivity.elevation_gain_m)}</td>
                    </tr>
                    {/* Ausgewählte */}
                    {selectedIds.map((id, i) => {
                      const act = similarList.find(a => a.id === id);
                      if (!act) return null;
                      return (
                        <tr key={id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: COMPARISON_COLORS[(i + 1) % COMPARISON_COLORS.length] }} />
                              <Link to={`/activities/${act.id}`} className="max-w-[140px] truncate hover:text-primary">
                                {act.name}
                              </Link>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">{fmtDate(act.start_date)}</td>
                          <td className="px-3 py-2 text-muted-foreground">{fmtKm(act.distance_m)} km</td>
                          <td className="px-3 py-2 text-muted-foreground">{fmtTime(act.moving_time_s)}</td>
                          <td className="px-3 py-2 text-muted-foreground">{fmtSpeed(act.avg_speed_ms)}</td>
                          <td className="px-3 py-2 text-muted-foreground">{fmtHr(act.avg_hr)}</td>
                          <td className="px-3 py-2 text-muted-foreground">{fmtElev(act.elevation_gain_m)}</td>
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
