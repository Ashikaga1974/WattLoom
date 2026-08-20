import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

// Mini-Routenform ohne Leaflet – sofort sichtbare Vorschau, damit eine Karte auch ohne
// Klick auf "Karte anzeigen" einer realen Strecke zuzuordnen ist (Kernproblem: reine
// Kennzahlen wie "~42 km, 15 Rides" sind ohne visuellen Anker nicht wiederzuerkennen).
export function RouteThumbnail({ activityId, size = 56 }: { activityId: number; size?: number }) {
  const [pts, setPts] = useState<[number, number][] | null>(null);

  useEffect(() => {
    let alive = true;
    api.activityTrack(activityId, 20).then(track => {
      if (!alive) return;
      const valid = track.points.filter(
        (p): p is typeof p & { lat: number; lon: number } => p.lat != null && p.lon != null
      );
      setPts(valid.map(p => [p.lat, p.lon]));
    }).catch(() => { if (alive) setPts([]); });
    return () => { alive = false; };
  }, [activityId]);

  const boxCls = `rounded-lg bg-muted/50 shrink-0 overflow-hidden`;
  const boxStyle = { width: size, height: size };

  if (pts == null) {
    return <div className="rounded-lg bg-muted animate-pulse shrink-0" style={boxStyle} />;
  }
  if (pts.length < 2) {
    return <div className="rounded-lg bg-muted shrink-0" style={boxStyle} />;
  }

  const lats = pts.map(p => p[0]);
  const lons = pts.map(p => p[1]);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLon = Math.min(...lons), maxLon = Math.max(...lons);
  const midLat = (minLat + maxLat) / 2;
  const midLon = (minLon + maxLon) / 2;
  // Längengrad-Kompression nach Breitengrad korrigieren, sonst wirkt die Form gestaucht/gestreckt
  const lonCorrection = Math.cos((midLat * Math.PI) / 180);
  const spanLat = Math.max(maxLat - minLat, 1e-6);
  const spanLon = Math.max((maxLon - minLon) * lonCorrection, 1e-6);
  const PAD = size / 9.33; // entspricht 6px bei size=56
  const scale = (size - 2 * PAD) / Math.max(spanLat, spanLon);

  const points = pts
    .map(([lat, lon]) => {
      const x = size / 2 + (lon - midLon) * lonCorrection * scale;
      const y = size / 2 - (lat - midLat) * scale;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <div className={boxCls} style={boxStyle}>
      <svg viewBox={`0 0 ${size} ${size}`} width="100%" height="100%">
        <polyline points={points} fill="none" stroke="#f97316" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
