import { useEffect, useState, useRef, useCallback } from 'react';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

const PALETTE = ['#fc4c02', '#60a5fa', '#4ade80', '#c084fc', '#f472b6', '#facc15'];

interface Pt {
  temp_c: number;
  speed_kmh: number;
  hr: number;
  year: number;
  dist_km: number;
}

// Lineare Regression
function linReg(xs: number[], ys: number[]): { slope: number; intercept: number } | null {
  const n = xs.length;
  if (n < 2) return null;
  const sx  = xs.reduce((a, v) => a + v, 0);
  const sy  = ys.reduce((a, v) => a + v, 0);
  const sxy = xs.reduce((a, v, i) => a + v * ys[i], 0);
  const sxx = xs.reduce((a, v) => a + v * v, 0);
  const denom = n * sxx - sx * sx;
  if (denom === 0) return null;
  const slope = (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;
  return { slope, intercept };
}

// SVG-Layout (geteilt)
const W = 680, H = 260;
const PAD = { top: 20, right: 20, bottom: 44, left: 52 };
const cW = W - PAD.left - PAD.right;
const cH = H - PAD.top - PAD.bottom;

function ScatterChart({
  pts,
  years: _years,
  colorOf,
  title,
  yAxisLabel,
  yMin: _yMin,
  yMax: _yMax,
  yTicks,
  tMin,
  tMax,
  tTicks,
  yOf,
  reg,
}: {
  pts: Pt[];
  years?: number[];
  colorOf: (y: number) => string;
  title: string;
  yAxisLabel: string;
  yMin: number;
  yMax: number;
  yTicks: number[];
  tMin: number;
  tMax: number;
  tTicks: number[];
  yOf: (v: number) => number;
  reg: { slope: number; intercept: number } | null;
}) {
  const [hovered, setHovered] = useState<Pt | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  function tx(t: number) { return PAD.left + ((t - tMin) / (tMax - tMin)) * cW; }

  function regLinePoints() {
    if (!reg) return '';
    const y1 = reg.slope * tMin + reg.intercept;
    const y2 = reg.slope * tMax + reg.intercept;
    return `${tx(tMin).toFixed(1)},${yOf(y1).toFixed(1)} ${tx(tMax).toFixed(1)},${yOf(y2).toFixed(1)}`;
  }

  const onMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const svgX = (e.clientX - rect.left) * (W / rect.width);
    const svgY = (e.clientY - rect.top)  * (H / rect.height);
    let best: Pt | null = null;
    let bd = Infinity;
    for (const p of pts) {
      const dx = tx(p.temp_c) - svgX;
      const ptY = yAxisLabel === 'km/h' ? p.speed_kmh : p.hr;
      const actualDy = yOf(ptY) - svgY;
      const d = Math.sqrt(dx * dx + actualDy * actualDy);
      if (d < bd && d < 20) { bd = d; best = p; }
    }
    setHovered(best);
  }, [pts, yAxisLabel]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {hovered && (
          <div className="text-xs rounded border border-border bg-background px-2 py-1.5 w-fit">
            <span className="font-semibold" style={{ color: colorOf(hovered.year) }}>{hovered.year}</span>
            {' · '}
            {hovered.temp_c.toFixed(1)} °C
            {' · '}
            {yAxisLabel === 'km/h' ? `${hovered.speed_kmh.toFixed(1)} km/h` : `${hovered.hr.toFixed(0)} bpm`}
            {' · '}
            {hovered.dist_km.toFixed(0)} km
          </div>
        )}
      </CardHeader>
      <CardContent>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          style={{ height: H }}
          onMouseMove={onMouseMove}
          onMouseLeave={() => setHovered(null)}
        >
          {/* Y-Gitternetz */}
          {yTicks.map((v) => (
            <g key={v}>
              <line x1={PAD.left} y1={yOf(v)} x2={W - PAD.right} y2={yOf(v)} stroke="#e5e7eb" strokeWidth={1} strokeOpacity={0.3} />
              <text x={PAD.left - 8} y={yOf(v) + 4} fontSize={11} fill="#9ca3af" textAnchor="end">{v}</text>
            </g>
          ))}
          {/* X-Gitternetz */}
          {tTicks.map((v) => (
            <g key={v}>
              <line x1={tx(v)} y1={PAD.top} x2={tx(v)} y2={PAD.top + cH} stroke="#e5e7eb" strokeWidth={1} strokeOpacity={0.2} />
              <text x={tx(v)} y={PAD.top + cH + 16} fontSize={11} fill="#9ca3af" textAnchor="middle">{v}°</text>
            </g>
          ))}
          {/* Achsen */}
          <line x1={PAD.left} y1={PAD.top + cH} x2={W - PAD.right} y2={PAD.top + cH} stroke="#6b7280" strokeWidth={1} />
          <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + cH} stroke="#6b7280" strokeWidth={1} />
          {/* Achsenbeschriftungen */}
          <text x={PAD.left + cW / 2} y={H - 4} fontSize={11} fill="#9ca3af" textAnchor="middle">°C</text>
          <text
            x={PAD.left - 40} y={PAD.top + cH / 2}
            fontSize={11} fill="#9ca3af" textAnchor="middle"
            transform={`rotate(-90,${PAD.left - 40},${PAD.top + cH / 2})`}
          >{yAxisLabel}</text>
          {/* Regressionslinie */}
          {reg && (
            <polyline
              points={regLinePoints()}
              fill="none"
              stroke="#9ca3af"
              strokeWidth={1.5}
              strokeDasharray="6,3"
              opacity={0.7}
            />
          )}
          {/* Datenpunkte */}
          {pts.map((p, i) => {
            const ptY = yAxisLabel === 'km/h' ? p.speed_kmh : p.hr;
            const isHov = hovered === p;
            return (
              <circle
                key={i}
                cx={tx(p.temp_c)}
                cy={yOf(ptY)}
                r={5}
                fill={colorOf(p.year)}
                fillOpacity={0.6}
                stroke={isHov ? '#fff' : colorOf(p.year)}
                strokeOpacity={isHov ? 1 : 0.2}
                strokeWidth={isHov ? 1.5 : 1}
                style={{ cursor: 'default' }}
                onMouseEnter={() => setHovered(p)}
                onMouseLeave={() => setHovered(null)}
              />
            );
          })}
        </svg>
      </CardContent>
    </Card>
  );
}

export default function TempCorrPage() {
  const [pts, setPts] = useState<Pt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.tempCorrelation()
      .then((res) => {
        setPts(res.points.filter((p) => p.year >= 2000));
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Fehler'))
      .finally(() => setLoading(false));
  }, []);

  const years = [...new Set(pts.map((p) => p.year))].sort();
  function colorOf(y: number) { return PALETTE[years.indexOf(y) % PALETTE.length]; }

  // Lineare Regression
  const regS = linReg(pts.map((p) => p.temp_c), pts.map((p) => p.speed_kmh));
  const regH = linReg(pts.map((p) => p.temp_c), pts.map((p) => p.hr));

  const insightSpeed = regS ? (regS.slope * 10).toFixed(1) : null;
  const insightHR = regH ? (regH.slope * 10).toFixed(1) : null;

  // Achsen-Grenzen
  const tMin = pts.length ? Math.floor(Math.min(...pts.map((p) => p.temp_c)) / 5) * 5 - 1 : 0;
  const tMax = pts.length ? Math.ceil(Math.max(...pts.map((p) => p.temp_c)) / 5) * 5 + 1 : 40;
  const sMin = pts.length ? Math.floor(Math.min(...pts.map((p) => p.speed_kmh)) / 5) * 5 - 1 : 10;
  const sMax = pts.length ? Math.ceil(Math.max(...pts.map((p) => p.speed_kmh)) / 5) * 5 + 1 : 35;
  const hMin = pts.length ? Math.floor(Math.min(...pts.map((p) => p.hr)) / 10) * 10 - 5 : 100;
  const hMax = pts.length ? Math.ceil(Math.max(...pts.map((p) => p.hr)) / 10) * 10 + 5 : 160;

  function buildTicks(min: number, max: number, step: number) {
    const t: number[] = [];
    for (let v = Math.ceil(min / step) * step; v <= max; v += step) t.push(v);
    return t;
  }

  const tTicks = buildTicks(tMin, tMax, 5);
  const sTicks = buildTicks(sMin, sMax, 5);
  const hTicks = buildTicks(hMin, hMax, 10);

  function sy(s: number) { return PAD.top + cH - ((s - sMin) / (sMax - sMin)) * cH; }
  function hy(h: number) { return PAD.top + cH - ((h - hMin) / (hMax - hMin)) * cH; }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Temperatur-Korrelation</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Wie beeinflusst die Außentemperatur Geschwindigkeit und Herzfrequenz? · {pts.length} Aktivitäten mit Temperaturdaten
        </p>
      </div>

      {error && (
        <div className="rounded border border-destructive/50 bg-destructive/10 p-4 text-destructive text-sm">{error}</div>
      )}

      {loading ? (
        <Card><CardContent className="pt-6"><Skeleton className="h-64 w-full" /></CardContent></Card>
      ) : pts.length > 0 ? (
        <>
          {/* Insight-Kacheln */}
          {insightSpeed !== null && insightHR !== null && (
            <div className="flex flex-wrap gap-3">
              <Card className="px-4 py-3 text-center">
                <p className="text-xs text-muted-foreground">Ø Δ Speed pro +10 °C</p>
                <p className={`text-xl font-bold mt-0.5 ${Number(insightSpeed) > 0 ? 'text-green-600' : Number(insightSpeed) < 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
                  {Number(insightSpeed) > 0 ? '+' : ''}{insightSpeed} km/h
                </p>
              </Card>
              <Card className="px-4 py-3 text-center">
                <p className="text-xs text-muted-foreground">Ø Δ HR pro +10 °C</p>
                <p className={`text-xl font-bold mt-0.5 ${Number(insightHR) > 0 ? 'text-red-500' : Number(insightHR) < 0 ? 'text-green-600' : 'text-muted-foreground'}`}>
                  {Number(insightHR) > 0 ? '+' : ''}{insightHR} bpm
                </p>
              </Card>
              <p className="text-xs text-muted-foreground self-center max-w-xs">
                Regressionsgerade = gestrichelt · Punkte = einzelne Aktivitäten
              </p>
            </div>
          )}

          {/* Scatter-Charts */}
          <ScatterChart
            pts={pts}
            years={years}
            colorOf={colorOf}
            title="Temperatur → Geschwindigkeit"
            yAxisLabel="km/h"
            yMin={sMin}
            yMax={sMax}
            yTicks={sTicks}
            tMin={tMin}
            tMax={tMax}
            tTicks={tTicks}
            yOf={sy}
            reg={regS}
          />
          <ScatterChart
            pts={pts}
            years={years}
            colorOf={colorOf}
            title="Temperatur → Herzfrequenz"
            yAxisLabel="bpm"
            yMin={hMin}
            yMax={hMax}
            yTicks={hTicks}
            tMin={tMin}
            tMax={tMax}
            tTicks={tTicks}
            yOf={hy}
            reg={regH}
          />

          {/* Jahres-Legende */}
          <div className="flex flex-wrap gap-3">
            {years.map((y) => (
              <span key={y} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="w-3 h-3 rounded-full inline-block" style={{ background: colorOf(y) }} />
                {y}
              </span>
            ))}
          </div>
        </>
      ) : (
        <p className="text-muted-foreground text-sm">Keine Temperaturdaten vorhanden.</p>
      )}
    </div>
  );
}
