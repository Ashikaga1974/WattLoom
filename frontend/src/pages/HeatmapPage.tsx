import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/ui/page-header';

export default function HeatmapPage() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const heatLayerRef = useRef<any>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pointCount, setPointCount] = useState(0);
  const [selectedYear, setSelectedYear] = useState<string>('');
  const [availableYears, setAvailableYears] = useState<string[]>([]);

  async function loadAndRender(year?: string) {
    setLoading(true);
    setError(null);
    try {
      const yearNum = year ? Number(year) : undefined;
      const data = await api.heatmap(20, yearNum);
      setPointCount(data.count);

      // Leaflet dynamisch laden
      const L = (await import('leaflet')).default;
      await import('leaflet/dist/leaflet.css');

      const container = mapContainerRef.current;
      if (!container) return;

      // Alten Heat-Layer / Layer-Gruppe entfernen
      if (heatLayerRef.current && mapRef.current) {
        mapRef.current.removeLayer(heatLayerRef.current);
        heatLayerRef.current = null;
      }

      // Karte einmalig erstellen
      if (!mapRef.current) {
        delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
        mapRef.current = L.map(container, { zoomControl: true });
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap',
          maxZoom: 19,
        }).addTo(mapRef.current);
        mapRef.current.invalidateSize();
      }

      if (data.points.length === 0) {
        mapRef.current.setView([51.0, 10.0], 6);
        return;
      }

      // Bounding Box mit Median ±5° Toleranz (GPS-Ausreißer herausfiltern)
      const lats = [...data.points.map((p: [number, number]) => p[0])].sort((a, b) => a - b);
      const lons = [...data.points.map((p: [number, number]) => p[1])].sort((a, b) => a - b);
      const medLat = lats[Math.floor(lats.length / 2)];
      const medLon = lons[Math.floor(lons.length / 2)];
      const tolerance = 5;
      let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
      for (const [lat, lon] of data.points) {
        if (Math.abs(lat - medLat) > tolerance || Math.abs(lon - medLon) > tolerance) continue;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
        if (lon < minLon) minLon = lon;
        if (lon > maxLon) maxLon = lon;
      }
      mapRef.current.fitBounds([[minLat, minLon], [maxLat, maxLon]], { padding: [40, 40] });

      // leaflet.heat versuchen – Fallback: CircleMarker-Gruppe
      let heatAdded = false;
      try {
        await import('leaflet.heat');
        // @ts-expect-error L.heatLayer von leaflet.heat
        heatLayerRef.current = L.heatLayer(data.points, {
          radius: 8, blur: 12, maxZoom: 17,
          gradient: { 0.2: '#1e40af', 0.4: '#0ea5e9', 0.6: '#22c55e', 0.8: '#eab308', 1.0: '#ef4444' },
        }).addTo(mapRef.current);
        heatAdded = true;
      } catch { /* leaflet.heat nicht installiert */ }

      if (!heatAdded) {
        // Fallback: gefilterte Punkte als CircleMarker mit niedriger Opacity
        // Maximal 8000 Punkte für Performance
        const stride = Math.max(1, Math.floor(data.points.length / 8000));
        const layerGroup = L.layerGroup();
        for (let i = 0; i < data.points.length; i += stride) {
          const [lat, lon] = data.points[i];
          if (Math.abs(lat - medLat) > tolerance || Math.abs(lon - medLon) > tolerance) continue;
          L.circleMarker([lat, lon], {
            radius: 3, color: '#f97316', fillColor: '#f97316',
            fillOpacity: 0.35, weight: 0,
          }).addTo(layerGroup);
        }
        layerGroup.addTo(mapRef.current);
        heatLayerRef.current = layerGroup;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler beim Laden');
    } finally {
      setLoading(false);
    }
  }

  // Jahre laden + initiales Rendern
  useEffect(() => {
    async function init() {
      const stats = await api.activityStats();
      setAvailableYears(stats.available_years);
      await loadAndRender('');
    }
    init().catch(e => {
      setError(e instanceof Error ? e.message : 'Fehler');
      setLoading(false);
    });

    return () => {
      // Leaflet-Karte beim Unmount bereinigen
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleYearChange(year: string | null) {
    const y = year === 'all' ? '' : (year ?? '');
    setSelectedYear(y);
    loadAndRender(y);
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Heatmap"
        subtitle={!loading ? `${pointCount.toLocaleString('de-DE')} GPS-Punkte` : undefined}
        years={availableYears}
        selectedYear={selectedYear || null}
        onYearChange={handleYearChange}
      />

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="relative">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-background/70">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              Lade Track-Daten…
            </div>
          </div>
        )}
        <div
          ref={mapContainerRef}
          className="h-[calc(100vh-12rem)] min-h-96 rounded-xl overflow-hidden border border-border"
        />
      </div>
    </div>
  );
}
