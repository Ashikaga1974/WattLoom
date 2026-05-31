import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type RouteCluster, type RouteClusterRide } from '@/lib/api';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { fmtDate, fmtTime } from '@/lib/format';

type SortMode = 'rides' | 'last' | 'trend';

// Hilfsfunktionen
function fmtKm(m: number) { return (m / 1000).toFixed(1); }
function fmtSpeed(ms: number | null) { return ms != null ? (ms * 3.6).toFixed(1) : '–'; }

function relativeDate(d: string): string {
  const diff = Math.floor((Date.now() - new Date(d + 'Z').getTime()) / 86400000);
  if (diff === 0) return 'heute';
  if (diff === 1) return 'gestern';
  if (diff < 7) return `vor ${diff} Tagen`;
  if (diff < 30) return `vor ${Math.floor(diff / 7)} Wo.`;
  if (diff < 365) return `vor ${Math.floor(diff / 30)} Mon.`;
  return `vor ${Math.floor(diff / 365)} J.`;
}

function trendDir(slope: number): 'up' | 'down' | 'flat' {
  if (slope < -30) return 'up';
  if (slope > 30) return 'down';
  return 'flat';
}

function trendLabel(slope: number): string {
  if (Math.abs(slope) < 30) return 'stabil';
  return `${Math.abs(slope / 60).toFixed(1)} min/Ride`;
}

// Zeit-Balkendiagramm für Cluster
function buildChart(cluster: RouteCluster) {
  const rides = cluster.rides;
  const W = Math.max(200, rides.length * 12);
  const H = 72;
  const times = rides.map(r => r.moving_time_s);
  const minT = Math.min(...times);
  const maxT = Math.max(...times);
  const range = maxT - minT || 1;
  const barW = Math.max(4, W / rides.length - 2);
  const avgNorm = range > 0 ? (cluster.avg_time_s - minT) / range : 0.5;
  const avgY = H - (10 + avgNorm * (H - 16));
  const bars = rides.map((ride, i) => {
    const norm = (ride.moving_time_s - minT) / range;
    const h = 10 + norm * (H - 16);
    return {
      x: i * (W / rides.length) + (W / rides.length - barW) / 2,
      h, barW,
      isPR: ride.id === cluster.best_time_id,
      ride,
    };
  });
  return { bars, W, H, avgY };
}

// Einzelne Cluster-Karte (braucht eigenen State für Karteninstanz)
function ClusterCard({ cluster }: { cluster: RouteCluster }) {
  const [expanded, setExpanded] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  const dir = trendDir(cluster.trend_slope);
  const chart = buildChart(cluster);

  async function toggleMap() {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    // Karte erst nach DOM-Update initialisieren
    await new Promise(r => setTimeout(r, 60));
    const container = mapContainerRef.current;
    if (!container || mapRef.current) {
      if (mapRef.current) mapRef.current.invalidateSize();
      return;
    }
    const L = (await import('leaflet')).default;
    await import('leaflet/dist/leaflet.css');
    delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
    const map = L.map(container, { zoomControl: false });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 18,
    }).addTo(map);
    mapRef.current = map;
    try {
      const track = await api.activityTrack(cluster.representative_id, 20);
      const valid = track.points.filter(p => p.lat != null && p.lon != null);
      if (valid.length > 0) {
        const latlngs = valid.map(p => [p.lat, p.lon] as [number, number]);
        L.polyline(latlngs, { color: '#f97316', weight: 3, opacity: 0.9 }).addTo(map);
        map.fitBounds(L.polyline(latlngs).getBounds(), { padding: [16, 16] });
      }
    } catch { /* kein Track */ }
  }

  // Karte beim Unmount bereinigen
  useEffect(() => {
    return () => { if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } };
  }, []);

  return (
    <Card className="overflow-hidden hover:border-border/80 transition-colors">
      {/* Header */}
      <CardHeader className="px-4 pt-4 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="shrink-0 rounded-full bg-primary/15 px-2.5 py-1 text-sm font-bold tabular-nums text-primary">
              ~{fmtKm(cluster.avg_distance_m)} km
            </span>
            <span className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">{cluster.ride_count}</span> Rides
            </span>
          </div>
          {/* Trend */}
          <div className={`flex shrink-0 items-center gap-1 text-xs ${dir === 'up' ? 'text-emerald-600' : dir === 'down' ? 'text-destructive' : 'text-muted-foreground'}`}>
            {dir === 'up' && <span>↑</span>}
            {dir === 'down' && <span>↓</span>}
            {dir === 'flat' && <span>→</span>}
            {dir !== 'flat' ? trendLabel(cluster.trend_slope) : 'stabil'}
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-4 pb-3 pt-0 space-y-3">
        {/* Zeitchart */}
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">Zeiten (chronologisch)</p>
          <div className="overflow-x-auto">
            <svg width={chart.W} height={chart.H} className="block">
              <line x1={0} y1={chart.avgY} x2={chart.W} y2={chart.avgY} stroke="#9ca3af" strokeWidth={1} strokeDasharray="3,3" />
              {chart.bars.map((bar, i) => (
                <g key={i}>
                  <rect
                    x={bar.x} y={chart.H - bar.h}
                    width={bar.barW} height={bar.h} rx={2}
                    fill={bar.isPR ? '#f59e0b' : '#e5e7eb'} opacity={bar.isPR ? 1 : 0.7}
                  />
                  {bar.isPR && (
                    <text x={bar.x + bar.barW / 2} y={chart.H - bar.h - 4} textAnchor="middle" fontSize={8} fill="#f59e0b">★</text>
                  )}
                </g>
              ))}
            </svg>
          </div>
        </div>

        {/* Stats-Grid */}
        <div className="grid grid-cols-2 gap-0 divide-x divide-border border-t border-border sm:grid-cols-4">
          <div className="px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Bestzeit</p>
            <p className="text-sm font-bold tabular-nums text-amber-500">{fmtTime(cluster.best_time_s)}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{fmtDate(cluster.best_time_date)}</p>
          </div>
          <div className="px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Ø Zeit</p>
            <p className="text-sm font-semibold tabular-nums">{fmtTime(cluster.avg_time_s)}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {cluster.avg_time_s > cluster.best_time_s ? `+${fmtTime(cluster.avg_time_s - cluster.best_time_s)} vs. PR` : ''}
            </p>
          </div>
          <div className="px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Letzte Fahrt</p>
            <p className="text-sm font-semibold">{relativeDate(cluster.last_ridden)}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{fmtDate(cluster.last_ridden)}</p>
          </div>
          <div className="px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Ø Speed</p>
            <p className="text-sm font-semibold tabular-nums">{fmtSpeed(cluster.avg_speed_ms)} km/h</p>
            {cluster.avg_hr && <p className="text-[10px] text-muted-foreground mt-0.5">{Math.round(cluster.avg_hr)} bpm</p>}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 border-t border-border pt-2.5">
          <button
            type="button"
            onClick={toggleMap}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            {expanded ? '▼ Karte ausblenden' : '▶ Karte anzeigen'}
          </button>
          <span className="text-border">|</span>
          <Link
            to={`/strecken?ref=${cluster.representative_id}`}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            Streckenvergleich →
          </Link>
        </div>

        {/* Karte (aufklappbar) */}
        {expanded && (
          <div ref={mapContainerRef} className="h-56 rounded-lg overflow-hidden border border-border" />
        )}

        {/* Ride-Liste (letzte 5) */}
        {expanded && (
          <div className="border-t border-border pt-3 space-y-1">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2">Letzte Fahrten</p>
            {[...cluster.rides].reverse().slice(0, 5).map((ride: RouteClusterRide) => (
              <Link
                key={ride.id}
                to={`/activities/${ride.id}`}
                className="flex items-center justify-between py-1 text-xs hover:text-primary transition-colors group"
              >
                <span className="flex items-center gap-2">
                  {ride.id === cluster.best_time_id
                    ? <span className="text-amber-500">★</span>
                    : <span className="w-3" />}
                  <span className="text-muted-foreground group-hover:text-primary">{fmtDate(ride.date)}</span>
                </span>
                <span className="flex items-center gap-3 tabular-nums">
                  <span className="font-medium">{fmtTime(ride.moving_time_s)}</span>
                  {ride.avg_speed_ms && <span className="text-muted-foreground">{fmtSpeed(ride.avg_speed_ms)} km/h</span>}
                </span>
              </Link>
            ))}
            {cluster.rides.length > 5 && (
              <p className="text-center text-[10px] text-muted-foreground pt-1">+ {cluster.rides.length - 5} weitere</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function RoutesPage() {
  const [clusters, setClusters] = useState<RouteCluster[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>('rides');

  useEffect(() => {
    api.routeClusters(3)
      .then(res => setClusters(res.clusters))
      .catch(e => setError(e instanceof Error ? e.message : 'Fehler'))
      .finally(() => setLoading(false));
  }, []);

  const sorted = [...clusters].sort((a, b) => {
    if (sortMode === 'rides') return b.ride_count - a.ride_count;
    if (sortMode === 'last') return b.last_ridden.localeCompare(a.last_ridden);
    return a.trend_slope - b.trend_slope;
  });

  const totalRidesInClusters = clusters.reduce((s, c) => s + c.ride_count, 0);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <PageHeader title="Top-Strecken" subtitle="Deine Lieblingsrouten automatisch erkannt" />

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <span className="mr-3 inline-block h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          Analysiere Rides…
        </div>
      ) : clusters.length === 0 ? (
        <div className="py-20 text-center text-muted-foreground">
          <p className="text-lg">Keine Cluster gefunden.</p>
          <p className="mt-1 text-sm">Mindestens 3 Rides auf derselben Strecke nötig.</p>
        </div>
      ) : (
        <>
          {/* Zusammenfassung + Sortierung */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{clusters.length}</span> Lieblingsrouten ·{' '}
              <span className="font-semibold text-foreground">{totalRidesInClusters}</span> Rides
            </p>
            <div className="flex gap-1">
              {([
                { key: 'rides', label: 'Häufigkeit' },
                { key: 'last', label: 'Letzte Fahrt' },
                { key: 'trend', label: 'Tendenz' },
              ] as { key: SortMode; label: string }[]).map(opt => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setSortMode(opt.key)}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                    sortMode === opt.key
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:border-border/80 hover:text-foreground'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Cluster-Karten */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {sorted.map(cluster => (
              <ClusterCard key={cluster.representative_id} cluster={cluster} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
