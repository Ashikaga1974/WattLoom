/**
 * LeafletMap – dynamisch geladene Karte für die Aktivitäts-Detailseite.
 * Wird per React.lazy() importiert, um Leaflet aus dem Initial-Bundle auszulagern.
 *
 * Hover-Synchronisation: nach Karteninitialisierung ruft die Komponente onReady(fn) auf.
 * Die Page speichert fn in einem Ref; Charts rufen fn() direkt auf – kein State, kein Re-render.
 */
import { useEffect, useRef, useMemo } from 'react';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

import type { TrackPoint } from '@/lib/api';

export type SetHoverFn = (pt: { lat: number; lon: number } | null) => void;

interface LeafletMapProps {
  points: TrackPoint[];
  speedColorBuckets?: number;
  onReady?: (fn: SetHoverFn) => void;
  onPointClick?: (lat: number, lon: number) => void;
}

// Fix für Standard-Marker-Icons
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

export default function LeafletMap({ points, speedColorBuckets = 20, onReady, onPointClick }: LeafletMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const hoverMarkerRef = useRef<L.CircleMarker | null>(null);
  const clickMarkerRef = useRef<L.CircleMarker | null>(null);
  // Ref statt Closure – damit der Klick-Handler immer die aktuelle Callback-Version nutzt
  const onPointClickRef = useRef(onPointClick);
  useEffect(() => { onPointClickRef.current = onPointClick; });

  // Kartenhöhe aus GPS-Bounds berechnen (Mercator-korrigiert).
  // CSS aspect-ratio + max-height beißen sich → Höhe direkt in px setzen.
  const mapStyle = useMemo(() => {
    const validPts = points.filter(p => p.lat != null && p.lon != null);
    if (validPts.length < 2) return { zIndex: 0, height: '240px' };
    const lats = validPts.map(p => p.lat);
    const lons = validPts.map(p => p.lon);
    const latRange = Math.max(...lats) - Math.min(...lats);
    const lonRange = Math.max(...lons) - Math.min(...lons);
    const avgLat = ((Math.max(...lats) + Math.min(...lats)) / 2) * (Math.PI / 180);
    // Visuelle Breite/Höhe im Mercator-Maßstab
    const geoRatio = (lonRange * Math.cos(avgLat)) / Math.max(latRange, 0.00001);
    // Containerbreite = Viewport - Sidebar - Padding (Schätzung)
    const containerW = Math.max(400, window.innerWidth - 256);
    const height = Math.max(160, Math.min(480, Math.round(containerW / geoRatio)));
    return { zIndex: 0, height: `${height}px` };
  }, [points]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || points.length === 0) return;

    const map = L.map(container);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);

    const validPts = points.filter(p => p.lat != null && p.lon != null);
    if (validPts.length === 0) return;

    const latLngs = validPts.map(p => [p.lat, p.lon] as L.LatLngTuple);
    const speeds = validPts.map(p => (p.speed_ms ?? 0) * 3.6);
    const validSpeeds = speeds.filter(s => s > 0);
    const hasSpeed = validSpeeds.length > 10;

    const lineOpts = { lineCap: 'round' as const, lineJoin: 'round' as const };

    // Zoom-adaptive Linienbreite: skaliert mit dem Zoom-Level
    function lineWeight(zoom: number) {
      return Math.max(3, Math.min(10, zoom - 7));
    }

    // Alle Polylines (Halo + Farbe) für späteres Resizing sammeln
    const haloLines: L.Polyline[] = [];
    const colorLines: L.Polyline[] = [];

    function updateWeights() {
      const cw = lineWeight(map.getZoom());
      haloLines.forEach(l => l.setStyle({ weight: cw + 4 }));
      colorLines.forEach(l => l.setStyle({ weight: cw }));
    }

    if (!hasSpeed) {
      const halo = L.polyline(latLngs, { ...lineOpts, color: '#1a1a1a', weight: lineWeight(map.getZoom()) + 4, opacity: 0.55 }).addTo(map);
      const poly = L.polyline(latLngs, { ...lineOpts, color: '#fc4c02', weight: lineWeight(map.getZoom()), opacity: 1.0 }).addTo(map);
      haloLines.push(halo);
      colorLines.push(poly);
    } else {
      const minSpd = Math.min(...validSpeeds);
      const maxSpd = Math.max(...validSpeeds);

      function speedColor(kmh: number): string {
        const t = maxSpd > minSpd ? Math.max(0, Math.min(1, (kmh - minSpd) / (maxSpd - minSpd))) : 0;
        const hue = Math.round(240 - t * 240);
        return `hsl(${hue},90%,50%)`;
      }

      function bucket(kmh: number): number {
        if (maxSpd <= minSpd) return 0;
        return Math.floor(
          Math.max(0, Math.min(0.9999, (kmh - minSpd) / (maxSpd - minSpd))) * speedColorBuckets
        );
      }

      // Segmente sammeln, dann 2 Durchläufe: erst Halos, dann farbige Linien
      const segments: { lls: L.LatLngTuple[]; color: string }[] = [];
      let segStart = 0;
      let curBucket = bucket(speeds[0]);
      for (let i = 1; i < validPts.length; i++) {
        const b = bucket(speeds[i]);
        if (b !== curBucket) {
          segments.push({ lls: latLngs.slice(segStart, i + 1), color: speedColor(speeds[segStart]) });
          segStart = i;
          curBucket = b;
        }
      }
      segments.push({ lls: latLngs.slice(segStart), color: speedColor(speeds[segStart]) });

      const cw = lineWeight(map.getZoom());
      for (const seg of segments) {
        haloLines.push(L.polyline(seg.lls, { ...lineOpts, color: '#1a1a1a', weight: cw + 4, opacity: 0.55 }).addTo(map));
      }
      for (const seg of segments) {
        colorLines.push(L.polyline(seg.lls, { ...lineOpts, color: seg.color, weight: cw, opacity: 1.0 }).addTo(map));
      }

      const legend = (L.control as unknown as (opts: object) => L.Control)({ position: 'bottomright' });
      (legend as L.Control & { onAdd: () => HTMLElement }).onAdd = () => {
        const div = L.DomUtil.create('div');
        div.style.cssText =
          'background:rgba(255,255,255,0.92);padding:7px 10px;border-radius:8px;font-size:11px;color:#374151;border:1px solid rgba(0,0,0,0.1);pointer-events:none';
        div.innerHTML = `
          <div style="margin-bottom:4px;font-weight:600">Geschwindigkeit</div>
          <div style="display:flex;align-items:center;gap:6px">
            <span>${minSpd.toFixed(0)}</span>
            <div style="height:7px;width:80px;background:linear-gradient(to right,hsl(240,80%,55%),hsl(120,80%,55%),hsl(60,80%,55%),hsl(0,80%,55%));border-radius:4px"></div>
            <span>${maxSpd.toFixed(0)} km/h</span>
          </div>`;
        return div;
      };
      legend.addTo(map);
    }

    // invalidateSize muss vor fitBounds kommen – Leaflet kennt sonst die Container-Größe nicht.
    // updateWeights danach explizit aufrufen, da getZoom() beim Polyline-Erstellen noch 0 war.
    requestAnimationFrame(() => {
      map.invalidateSize(false);
      map.fitBounds(L.polyline(latLngs).getBounds(), { padding: [6, 6] });
      updateWeights();
    });

    map.on('zoomend', updateWeights);

    map.on('click', (e) => {
      const { lat, lng } = e.latlng;
      onPointClickRef.current?.(lat, lng);
      if (clickMarkerRef.current) {
        clickMarkerRef.current.setLatLng([lat, lng]);
      } else {
        clickMarkerRef.current = L.circleMarker([lat, lng], {
          radius: 8,
          color: '#ffffff',
          fillColor: '#facc15',
          fillOpacity: 1,
          weight: 2.5,
        }).addTo(map);
      }
    });

    // Hover-Funktion an die Page übergeben – direkt nach Karteninitialisierung
    onReady?.((pt) => {
      if (!pt) {
        hoverMarkerRef.current?.remove();
        hoverMarkerRef.current = null;
        return;
      }
      if (hoverMarkerRef.current) {
        hoverMarkerRef.current.setLatLng([pt.lat, pt.lon]);
      } else {
        hoverMarkerRef.current = L.circleMarker([pt.lat, pt.lon], {
          radius: 7,
          color: '#ffffff',
          fillColor: '#fc4c02',
          fillOpacity: 1,
          weight: 2,
        }).addTo(map);
      }
    });

    return () => {
      hoverMarkerRef.current = null;
      clickMarkerRef.current = null;
      map.remove();
    };
  // onReady bewusst nicht in deps – stabile useCallback-Referenz vorausgesetzt
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, speedColorBuckets]);

  return (
    <div
      ref={containerRef}
      className="w-full rounded-xl overflow-hidden border border-border"
      style={mapStyle}
    />
  );
}
