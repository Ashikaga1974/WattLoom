import { useEffect, useState } from 'react';
import { api, type Activity } from '@/lib/api';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent } from '@/components/ui/card';

interface Bucket { label: string; count: number; pct: number; }

function buildBuckets(values: number[], min: number, max: number, step: number): Bucket[] {
  const out: Bucket[] = [];
  for (let v = min; v < max; v += step) {
    const count = values.filter(x => x >= v && x < v + step).length;
    out.push({ label: String(v), count, pct: 0 });
  }
  const peak = Math.max(...out.map(b => b.count), 1);
  return out.map(b => ({ ...b, pct: b.count / peak }));
}

function avg(arr: number[]) { return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0; }
function median(arr: number[]) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

// SVG-Grundmaße
const W = 500, H = 200;
const PAD = { top: 12, right: 8, bottom: 30, left: 8 };
const cW = W - PAD.left - PAD.right;
const cH = H - PAD.top - PAD.bottom;

function bw(n: number) { return cW / n; }
function barX(i: number, n: number) { return PAD.left + i * bw(n); }
function barYTop(pct: number) { return PAD.top + cH - pct * cH; }
function barHeight(pct: number) { return pct * cH; }
function avgLineX(value: number, min: number, step: number, n: number) {
  return PAD.left + ((value - min) / step) * bw(n);
}
function baselineY() { return PAD.top + cH; }

interface HistogramCardProps {
  title: string;
  subtitle: string;
  buckets: Bucket[];
  color: string;
  unit: string;
  avgValue: number;
  medianValue: number;
  min: number;
  step: number;
  count: number;
  showEvery?: number;
}

function HistogramCard({ title, subtitle, buckets, color, unit, avgValue, medianValue, min, step, count, showEvery = 2 }: HistogramCardProps) {
  return (
    <Card className="shadow-sm">
      <CardContent className="p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground">
            <span className="font-semibold" style={{ color }}>{subtitle}</span>
            {medianValue > 0 && ` · Median ${medianValue.toFixed(typeof medianValue === 'number' && medianValue % 1 !== 0 ? 1 : 0)}`}
          </p>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 190 }}>
          <line x1={PAD.left} y1={baselineY()} x2={W - PAD.right} y2={baselineY()} stroke="#e5e7eb" strokeWidth={1} />
          {buckets.map((b, i) => (
            <g key={i}>
              <rect
                x={barX(i, buckets.length) + 1}
                y={barYTop(b.pct)}
                width={bw(buckets.length) - 2}
                height={barHeight(b.pct)}
                fill={color} opacity={0.2 + b.pct * 0.75} rx={2}
              />
              {i % showEvery === 0 && (
                <text
                  x={barX(i, buckets.length) + bw(buckets.length) / 2}
                  y={H - 4}
                  fontSize={10} fill="#9ca3af" textAnchor="middle"
                >{b.label}</text>
              )}
            </g>
          ))}
          {/* Durchschnittslinie */}
          <line
            x1={avgLineX(avgValue, min, step, buckets.length)}
            y1={PAD.top}
            x2={avgLineX(avgValue, min, step, buckets.length)}
            y2={baselineY()}
            stroke={color} strokeWidth={1.5} strokeDasharray="4,3"
          />
          <text x={avgLineX(avgValue, min, step, buckets.length) + 3} y={PAD.top + 11} fontSize={10} fill={color}>Ø</text>
          <text x={W / 2} y={H + 2} fontSize={10} fill="#9ca3af" textAnchor="middle">{unit}</text>
        </svg>
        <p className="mt-1 text-xs text-muted-foreground">{count} Rides</p>
      </CardContent>
    </Card>
  );
}

export default function StatsPage() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterYear, setFilterYear] = useState<string | null>(null);
  const [availableYears, setAvailableYears] = useState<string[]>([]);

  useEffect(() => {
    async function init() {
      const [res, stats] = await Promise.all([
        api.activities({ limit: 2000 }),
        api.activityStats(),
      ]);
      setActivities(res.items);
      setAvailableYears(stats.available_years.filter(y => Number(y) >= 2000));
    }
    init()
      .catch(e => setError(e instanceof Error ? e.message : 'Fehler'))
      .finally(() => setLoading(false));
  }, []);

  async function reload(year: string | null) {
    setFilterYear(year);
    setLoading(true);
    try {
      const res = await api.activities({ limit: 2000, year: year ? Number(year) : undefined });
      setActivities(res.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler');
    } finally {
      setLoading(false);
    }
  }

  // Verteilungs-Daten berechnen
  const speeds = activities.filter(a => a.avg_speed_ms != null).map(a => (a.avg_speed_ms as number) * 3.6);
  const hrs = activities.filter(a => a.avg_hr != null).map(a => a.avg_hr as number);
  const distances = activities.map(a => a.distance_m / 1000);
  const elevations = activities.filter(a => a.elevation_gain_m != null && a.elevation_gain_m > 0).map(a => a.elevation_gain_m as number);

  const speedBuckets = buildBuckets(speeds, 10, 44, 1);
  const hrBuckets = buildBuckets(hrs, 85, 175, 5);
  const distBuckets = buildBuckets(distances, 0, 130, 5);
  const elevBuckets = buildBuckets(elevations, 0, 2500, 100);

  const avgSpeed = avg(speeds);
  const avgHr = avg(hrs);
  const avgDist = avg(distances);
  const avgElev = avg(elevations);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Verteilungen"
        subtitle="Statistische Verteilung deiner Rides"
        years={availableYears}
        selectedYear={filterYear}
        onYearChange={y => reload(y === 'all' ? null : y)}
      />

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>
      )}

      {loading ? (
        <div className="grid gap-6 md:grid-cols-2">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="h-56 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          <HistogramCard
            title="Ø Geschwindigkeit"
            subtitle={`${avgSpeed.toFixed(1)} km/h`}
            buckets={speedBuckets}
            color="#f97316"
            unit="km/h"
            avgValue={avgSpeed}
            medianValue={median(speeds)}
            min={10} step={1}
            count={speeds.length}
          />
          <HistogramCard
            title="Ø Herzfrequenz"
            subtitle={`${avgHr.toFixed(0)} bpm`}
            buckets={hrBuckets}
            color="#3b82f6"
            unit="bpm"
            avgValue={avgHr}
            medianValue={median(hrs)}
            min={85} step={5}
            count={hrs.length}
          />
          <HistogramCard
            title="Distanz-Verteilung"
            subtitle={`${avgDist.toFixed(1)} km Schnitt`}
            buckets={distBuckets}
            color="#22c55e"
            unit="km"
            avgValue={avgDist}
            medianValue={median(distances)}
            min={0} step={5}
            count={distances.length}
            showEvery={4}
          />
          <HistogramCard
            title="Höhenmeter-Verteilung"
            subtitle={`${Math.round(avgElev)} m Schnitt`}
            buckets={elevBuckets}
            color="#a855f7"
            unit="Hm"
            avgValue={avgElev}
            medianValue={median(elevations)}
            min={0} step={100}
            count={elevations.length}
            showEvery={3}
          />
        </div>
      )}
    </div>
  );
}
