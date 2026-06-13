import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, type Bike, type BikeCompareData } from '@/lib/api';
import { PageHeader } from '@/components/ui/page-header';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { fmtNum } from '@/lib/format';

// ─── Vergleich-Hilfsfunktionen ────────────────────────────────────────────────

const BIKE_COLORS = ['#3b82f6', '#f97316'];
function bikeColor(idx: number) { return BIKE_COLORS[idx % BIKE_COLORS.length]; }

const BINS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
const BIN_LABELS = ['0–10', '10–20', '20–30', '30–40', '40–50', '50–60', '60–70', '70–80', '80–90', '90–100', '100+'];

function buildHistogram(dists: number[]): number[] {
  const counts = new Array(BINS.length).fill(0);
  for (const d of dists) {
    const idx = BINS.findIndex((b, i) => d >= b && (i === BINS.length - 1 || d < BINS[i + 1]));
    if (idx >= 0) counts[idx]++;
  }
  return counts;
}

function yTicks(maxVal: number, steps = 5): number[] {
  const step = Math.ceil(maxVal / steps / 5) * 5 || 5;
  const ticks: number[] = [];
  for (let v = 0; v <= maxVal; v += step) ticks.push(v);
  return ticks;
}

const ROWS = [
  { label: 'Rides',             key: 'rides',             fmt: (v: number) => fmtNum(v),    unit: '' },
  { label: 'Gesamt km',         key: 'total_km',          fmt: (v: number) => fmtNum(v, 1), unit: ' km' },
  { label: 'Gesamt Höhenmeter', key: 'total_elevation_m', fmt: (v: number) => fmtNum(v),    unit: ' m' },
  { label: 'Gesamt Stunden',    key: 'total_hours',       fmt: (v: number) => fmtNum(v, 1), unit: ' h' },
  { label: 'Ø Distanz',         key: 'avg_dist_km',       fmt: (v: number) => fmtNum(v, 1), unit: ' km' },
  { label: 'Ø Geschwindigkeit', key: 'avg_speed_kmh',     fmt: (v: number) => fmtNum(v, 1), unit: ' km/h' },
  { label: 'Ø Höhenmeter/Ride', key: 'avg_elevation_m',   fmt: (v: number) => fmtNum(v),    unit: ' m' },
];

// ─── Übersicht-Tab ────────────────────────────────────────────────────────────

function UebersichtTab() {
  const [bikes, setBikes] = useState<Bike[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.bikes()
      .then(setBikes)
      .catch(e => setError(e instanceof Error ? e.message : 'Fehler'))
      .finally(() => setLoading(false));
  }, []);

  if (error) {
    return <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>;
  }

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        {[0, 1].map(i => <div key={i} className="h-40 animate-pulse rounded-xl bg-muted" />)}
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        {bikes.map(bike => (
          <Card key={bike.id} className="shadow-sm">
            <CardContent className="p-6 flex flex-col gap-4">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-bold">{bike.name}</h2>
                  {(bike.brand || bike.model) &&
                    `${bike.brand ?? ''} ${bike.model ?? ''}`.trim() !== bike.name && (
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {[bike.brand, bike.model].filter(Boolean).join(' ')}
                      </p>
                    )}
                  {bike.description && (
                    <p className="mt-1 text-sm text-muted-foreground">{bike.description}</p>
                  )}
                </div>
                {bike.retired ? (
                  <Badge variant="secondary">Ausgemustert</Badge>
                ) : (
                  <Badge className="bg-primary/10 text-primary border-primary/20">Aktiv</Badge>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-muted/60 px-4 py-3">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Rides</p>
                  <p className="mt-0.5 text-2xl font-bold text-primary">{bike.ride_count}</p>
                </div>
                <div className="rounded-lg bg-muted/60 px-4 py-3">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Aktivitäten</p>
                  <p className="mt-0.5 text-2xl font-bold">{bike.ride_count} <span className="text-sm font-normal text-muted-foreground">Rides</span></p>
                </div>
              </div>

              <div className="flex items-center gap-4 mt-auto">
                <Link
                  to={`/activities?bike=${bike.id}`}
                  className="text-sm text-primary hover:underline"
                >
                  Alle Aktivitäten →
                </Link>
              </div>
            </CardContent>
          </Card>
        ))}

        {bikes.length === 0 && (
          <p className="col-span-2 text-muted-foreground">Keine Bikes gefunden.</p>
        )}
      </div>
    </>
  );
}

// ─── Vergleich-Tab ────────────────────────────────────────────────────────────

function VergleichTab() {
  const [data, setData] = useState<BikeCompareData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.bikeCompare()
      .then(setData)
      .catch(e => setError(e instanceof Error ? e.message : 'Fehler'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        {[0, 1, 2].map(i => <div key={i} className="h-48 animate-pulse rounded-xl bg-muted" />)}
      </div>
    );
  }

  if (error || !data?.summary.length) {
    return error
      ? <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>
      : <p className="text-sm text-muted-foreground">Keine Bike-Daten vorhanden. Erst importieren.</p>;
  }

  const filteredYearly = data.yearly.filter(y => parseInt(y.year) >= 2000);
  const histograms = Object.fromEntries(
    data.summary.map(b => [b.id, buildHistogram(data.distances[b.id] ?? [])])
  );

  // Balkendiagramm: Rides pro Jahr
  const BAR_W = 900, BAR_H = 240;
  const BAR_PAD = { top: 16, right: 16, bottom: 40, left: 48 };
  const barChartW = BAR_W - BAR_PAD.left - BAR_PAD.right;
  const barChartH = BAR_H - BAR_PAD.top - BAR_PAD.bottom;

  let maxRides = 0;
  for (const y of filteredYearly)
    for (const b of data.summary) {
      const r = y.bikes[b.id]?.rides ?? 0;
      if (r > maxRides) maxRides = r;
    }
  maxRides = Math.ceil(maxRides / 10) * 10 || 10;

  function barGroupW() { return barChartW / (filteredYearly.length || 1); }
  function barX(yi: number, bi: number) {
    const gw = barGroupW();
    const margin = gw * 0.1;
    const avail = gw - margin * 2;
    const bw = avail / data!.summary.length;
    return BAR_PAD.left + yi * gw + margin + bi * bw;
  }
  function barBW() {
    const gw = barGroupW();
    const margin = gw * 0.1;
    return (gw - margin * 2) / data!.summary.length - 1;
  }
  function barY(v: number) { return BAR_PAD.top + barChartH - (v / maxRides) * barChartH; }
  function barH(v: number) { return (v / maxRides) * barChartH; }

  // Liniendiagramm: Ø Speed
  const LINE_W = 900, LINE_H = 220;
  const LINE_PAD = { top: 16, right: 16, bottom: 36, left: 52 };
  const lineChartW = LINE_W - LINE_PAD.left - LINE_PAD.right;
  const lineChartH = LINE_H - LINE_PAD.top - LINE_PAD.bottom;

  const allSpeeds = filteredYearly.flatMap(y =>
    data.summary.map(b => y.bikes[b.id]?.avg_speed_kmh ?? null).filter((v): v is number => v !== null)
  );
  const minSpeed = allSpeeds.length ? Math.floor(Math.min(...allSpeeds) - 1) : 0;
  const maxSpeed = allSpeeds.length ? Math.ceil(Math.max(...allSpeeds) + 1) : 40;

  function lineX(i: number) {
    if (filteredYearly.length <= 1) return LINE_PAD.left + lineChartW / 2;
    return LINE_PAD.left + (i / (filteredYearly.length - 1)) * lineChartW;
  }
  function lineY(v: number) {
    const range = maxSpeed - minSpeed || 1;
    return LINE_PAD.top + lineChartH - ((v - minSpeed) / range) * lineChartH;
  }
  function speedYTicks() {
    const range = maxSpeed - minSpeed;
    const step = range > 10 ? 2 : 1;
    const ticks: number[] = [];
    for (let v = Math.ceil(minSpeed); v <= maxSpeed; v += step) ticks.push(v);
    return ticks;
  }

  // Histogramm: Distanzverteilung
  const HIST_W = 900, HIST_H = 220;
  const HIST_PAD = { top: 16, right: 16, bottom: 40, left: 52 };
  const histChartW = HIST_W - HIST_PAD.left - HIST_PAD.right;
  const histChartH = HIST_H - HIST_PAD.top - HIST_PAD.bottom;

  let maxHistCount = 0;
  for (const b of data.summary) {
    const h = buildHistogram(data.distances[b.id] ?? []);
    for (const c of h) if (c > maxHistCount) maxHistCount = c;
  }
  maxHistCount = Math.ceil(maxHistCount / 5) * 5 || 5;

  function histBarX(binIdx: number, bi: number) {
    const gw = histChartW / BINS.length;
    const margin = gw * 0.08;
    const avail = gw - margin * 2;
    const bw = avail / data!.summary.length;
    return HIST_PAD.left + binIdx * gw + margin + bi * bw;
  }
  function histBW() {
    const gw = histChartW / BINS.length;
    const margin = gw * 0.08;
    return (gw - margin * 2) / data!.summary.length - 1;
  }
  function histBarY(v: number) { return HIST_PAD.top + histChartH - (v / maxHistCount) * histChartH; }
  function histBarH(v: number) { return (v / maxHistCount) * histChartH; }
  function histGroupCenter(binIdx: number) {
    const gw = histChartW / BINS.length;
    return HIST_PAD.left + binIdx * gw + gw / 2;
  }

  return (
    <div className="space-y-8">
      {/* Kennzahlen-Tabelle */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Kennzahlen</h2>
        <Card className="overflow-x-auto shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="py-2 pr-4 text-left text-xs font-normal text-muted-foreground" />
                {data.summary.map((bike, i) => (
                  <th key={bike.id} className="px-3 py-2 text-right font-semibold" style={{ color: bikeColor(i) }}>
                    {bike.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {ROWS.map(row => (
                <tr key={row.key} className="hover:bg-muted/30 transition-colors">
                  <td className="py-2.5 pr-4 text-xs text-muted-foreground">{row.label}</td>
                  {data.summary.map((bike, i) => {
                    const val = (bike as unknown as Record<string, number>)[row.key];
                    return (
                      <td key={bike.id} className="px-3 py-2.5 text-right font-mono tabular-nums">
                        <span style={{ color: bikeColor(i) }}>{row.fmt(val)}</span>
                        <span className="text-xs text-muted-foreground">{row.unit}</span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>

      {/* Rides pro Jahr */}
      {filteredYearly.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Aktivitäten pro Jahr</h2>
          <Card className="shadow-sm">
            <CardContent className="p-4">
              <div className="mb-3 flex gap-5 text-xs text-muted-foreground">
                {data.summary.map((bike, i) => (
                  <span key={bike.id} className="flex items-center gap-1.5">
                    <span className="inline-block h-3 w-3 rounded-sm" style={{ background: bikeColor(i) }} />
                    {bike.name}
                  </span>
                ))}
              </div>
              <svg viewBox={`0 0 ${BAR_W} ${BAR_H}`} className="w-full" style={{ height: BAR_H }}>
                {yTicks(maxRides).map(v => (
                  <g key={v}>
                    <line x1={BAR_PAD.left} y1={barY(v)} x2={BAR_W - BAR_PAD.right} y2={barY(v)} stroke="#e5e7eb" strokeWidth={v === 0 ? 1 : 0.7} />
                    <text x={BAR_PAD.left - 6} y={barY(v) + 4} fontSize={11} fill="#9ca3af" textAnchor="end">{v}</text>
                  </g>
                ))}
                {filteredYearly.map((yearEntry, yi) => (
                  <g key={yearEntry.year}>
                    {data.summary.map((bike, bi) => {
                      const rides = yearEntry.bikes[bike.id]?.rides ?? 0;
                      if (rides === 0) return null;
                      return (
                        <rect
                          key={bike.id}
                          x={barX(yi, bi).toFixed(1)}
                          y={barY(rides).toFixed(1)}
                          width={Math.max(barBW(), 2).toFixed(1)}
                          height={barH(rides).toFixed(1)}
                          fill={bikeColor(bi)} opacity={0.85} rx={2}
                        />
                      );
                    })}
                    <text
                      x={(BAR_PAD.left + yi * barGroupW() + barGroupW() / 2).toFixed(1)}
                      y={BAR_H - 8}
                      fontSize={10} fill="#9ca3af" textAnchor="middle"
                    >{yearEntry.year}</text>
                  </g>
                ))}
                <line x1={BAR_PAD.left} y1={BAR_PAD.top + barChartH} x2={BAR_W - BAR_PAD.right} y2={BAR_PAD.top + barChartH} stroke="#e5e7eb" strokeWidth={1} />
              </svg>
            </CardContent>
          </Card>
        </section>
      )}

      {/* Ø Geschwindigkeit über Jahre */}
      {filteredYearly.length > 1 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Ø Geschwindigkeit über Jahre</h2>
          <Card className="shadow-sm">
            <CardContent className="p-4">
              <div className="mb-3 flex gap-5 text-xs text-muted-foreground">
                {data.summary.map((bike, i) => (
                  <span key={bike.id} className="flex items-center gap-1.5">
                    <span className="inline-block h-0.5 w-6 rounded" style={{ background: bikeColor(i) }} />
                    {bike.name}
                  </span>
                ))}
              </div>
              <svg viewBox={`0 0 ${LINE_W} ${LINE_H}`} className="w-full" style={{ height: LINE_H }}>
                {speedYTicks().map(v => (
                  <g key={v}>
                    <line x1={LINE_PAD.left} y1={lineY(v)} x2={LINE_W - LINE_PAD.right} y2={lineY(v)} stroke="#e5e7eb" strokeWidth={0.7} />
                    <text x={LINE_PAD.left - 6} y={lineY(v) + 4} fontSize={11} fill="#9ca3af" textAnchor="end">{v}</text>
                  </g>
                ))}
                <text x={10} y={LINE_PAD.top + lineChartH / 2} fontSize={10} fill="#9ca3af" textAnchor="middle" transform={`rotate(-90, 10, ${LINE_PAD.top + lineChartH / 2})`}>km/h</text>
                {filteredYearly.map((ye, i) => (
                  <text key={ye.year} x={lineX(i)} y={LINE_H - 8} fontSize={10} fill="#9ca3af" textAnchor="middle">{ye.year}</text>
                ))}
                <line x1={LINE_PAD.left} y1={LINE_PAD.top + lineChartH} x2={LINE_W - LINE_PAD.right} y2={LINE_PAD.top + lineChartH} stroke="#e5e7eb" strokeWidth={1} />
                {data.summary.map((bike, bi) => {
                  const pts = filteredYearly
                    .map((ye, i) => {
                      const speed = ye.bikes[bike.id]?.avg_speed_kmh;
                      return speed != null ? `${lineX(i).toFixed(1)},${lineY(speed).toFixed(1)}` : null;
                    })
                    .filter(Boolean)
                    .join(' ');
                  return (
                    <g key={bike.id}>
                      {pts && (
                        <polyline points={pts} fill="none" stroke={bikeColor(bi)} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                      )}
                      {filteredYearly.map((ye, i) => {
                        const speed = ye.bikes[bike.id]?.avg_speed_kmh;
                        if (speed == null) return null;
                        return (
                          <circle key={ye.year} cx={lineX(i)} cy={lineY(speed)} r={3.5} fill={bikeColor(bi)} stroke="white" strokeWidth={1.5} />
                        );
                      })}
                    </g>
                  );
                })}
              </svg>
            </CardContent>
          </Card>
        </section>
      )}

      {/* Distanzverteilung */}
      {Object.keys(data.distances).length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Distanzverteilung</h2>
          <Card className="shadow-sm">
            <CardContent className="p-4">
              <div className="mb-3 flex gap-5 text-xs text-muted-foreground">
                {data.summary.map((bike, i) => (
                  <span key={bike.id} className="flex items-center gap-1.5">
                    <span className="inline-block h-3 w-3 rounded-sm" style={{ background: bikeColor(i) }} />
                    {bike.name}
                  </span>
                ))}
              </div>
              <svg viewBox={`0 0 ${HIST_W} ${HIST_H}`} className="w-full" style={{ height: HIST_H }}>
                {yTicks(maxHistCount).map(v => (
                  <g key={v}>
                    <line x1={HIST_PAD.left} y1={histBarY(v)} x2={HIST_W - HIST_PAD.right} y2={histBarY(v)} stroke="#e5e7eb" strokeWidth={v === 0 ? 1 : 0.7} />
                    <text x={HIST_PAD.left - 6} y={histBarY(v) + 4} fontSize={11} fill="#9ca3af" textAnchor="end">{v}</text>
                  </g>
                ))}
                {BINS.map((_, binIdx) => (
                  <g key={binIdx}>
                    {data.summary.map((bike, bi) => {
                      const count = (histograms[bike.id] ?? [])[binIdx] ?? 0;
                      if (count === 0) return null;
                      return (
                        <rect
                          key={bike.id}
                          x={histBarX(binIdx, bi).toFixed(1)}
                          y={histBarY(count).toFixed(1)}
                          width={Math.max(histBW(), 2).toFixed(1)}
                          height={histBarH(count).toFixed(1)}
                          fill={bikeColor(bi)} opacity={0.85} rx={2}
                        />
                      );
                    })}
                    <text x={histGroupCenter(binIdx)} y={HIST_H - 8} fontSize={9} fill="#9ca3af" textAnchor="middle">{BIN_LABELS[binIdx]}</text>
                  </g>
                ))}
                <line x1={HIST_PAD.left} y1={HIST_PAD.top + histChartH} x2={HIST_W - HIST_PAD.right} y2={HIST_PAD.top + histChartH} stroke="#e5e7eb" strokeWidth={1} />
                <text x={HIST_PAD.left + histChartW / 2} y={HIST_H} fontSize={10} fill="#9ca3af" textAnchor="middle">Distanz (km)</text>
              </svg>
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  );
}

// ─── Haupt-Seite ──────────────────────────────────────────────────────────────

export default function BikesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') ?? 'übersicht';

  function handleTabChange(value: string) {
    setSearchParams({ tab: value }, { replace: true });
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Bikes" />

      <Tabs value={tab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="übersicht">Übersicht</TabsTrigger>
          <TabsTrigger value="vergleich">Vergleich</TabsTrigger>
        </TabsList>

        <TabsContent value="übersicht" className="mt-6">
          <UebersichtTab />
        </TabsContent>

        <TabsContent value="vergleich" className="mt-6">
          <VergleichTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
