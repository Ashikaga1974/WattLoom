import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/ui/page-header';
import { api } from '@/lib/api';

const PALETTE = ['#60a5fa', '#4ade80', '#fb923c', '#c084fc', '#facc15', '#f472b6'];

interface Point {
  year: number;
  month: string;
  speed_kmh: number;
  hr: number;
  dist_km: number;
}

interface MonthAgg {
  month: string;
  label: string;
  avgSpeed: number;
  avgHr: number;
  eff: number;
  count: number;
  year: number;
}

interface YearAgg {
  year: number;
  avgSpeed: number;
  avgHr: number;
  eff: number;
  count: number;
}

// Glatte SVG-Linie (Cubic Bezier)
function linePath(pts: { x: number; y: number }[]): string {
  if (!pts.length) return '';
  let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1], cur = pts[i];
    const cpx = (prev.x + cur.x) / 2;
    d += ` C${cpx.toFixed(1)},${prev.y.toFixed(1)} ${cpx.toFixed(1)},${cur.y.toFixed(1)} ${cur.x.toFixed(1)},${cur.y.toFixed(1)}`;
  }
  return d;
}

function areaPath(pts: { x: number; y: number }[], baseY: number): string {
  if (!pts.length) return '';
  const line = linePath(pts);
  const last = pts[pts.length - 1];
  const first = pts[0];
  return `${line} L${last.x.toFixed(1)},${baseY.toFixed(1)} L${first.x.toFixed(1)},${baseY.toFixed(1)} Z`;
}

// Chart-Dimensionen
const W = 900, H = 220;
const PAD = { top: 20, right: 20, bottom: 40, left: 44 };
const cW = W - PAD.left - PAD.right;
const cH = H - PAD.top - PAD.bottom;

export default function SpeedHrPage() {
  const [allPoints, setAllPoints] = useState<Point[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    api.speedHr()
      .then(res => setAllPoints(res.points.filter(p => p.year >= 2020)))
      .catch(e => setError(e instanceof Error ? e.message : 'Fehler'))
      .finally(() => setLoading(false));
  }, []);

  const years = [...new Set(allPoints.map(p => p.year))].sort();

  function yearColor(year: number): string {
    return PALETTE[years.indexOf(year) % PALETTE.length];
  }

  // Monatliche Aggregation – mindestens 2 Rides
  const monthly: MonthAgg[] = (() => {
    const groups: Record<string, Point[]> = {};
    allPoints.forEach(p => {
      (groups[p.month] ??= []).push(p);
    });
    return Object.entries(groups)
      .filter(([, pts]) => pts.length >= 2)
      .map(([month, pts]) => {
        const avgSpeed = pts.reduce((s, p) => s + p.speed_kmh, 0) / pts.length;
        const avgHr = pts.reduce((s, p) => s + p.hr, 0) / pts.length;
        const [y, m] = month.split('-');
        const label = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('de-DE', {
          month: 'short',
          year: '2-digit',
        });
        return { month, label, avgSpeed, avgHr, eff: avgSpeed / avgHr * 100, count: pts.length, year: Number(y) };
      })
      .sort((a, b) => a.month.localeCompare(b.month));
  })();

  // Jahreszusammenfassung
  const yearlyAgg: YearAgg[] = years.map(y => {
    const pts = allPoints.filter(p => p.year === y);
    const avgSpeed = pts.reduce((s, p) => s + p.speed_kmh, 0) / pts.length;
    const avgHr = pts.reduce((s, p) => s + p.hr, 0) / pts.length;
    return { year: y, avgSpeed, avgHr, eff: avgSpeed / avgHr * 100, count: pts.length };
  });

  // Insight: letztes vs. vorletztes volles Jahr
  const insight: string = (() => {
    if (yearlyAgg.length < 2) return '';
    const cur = yearlyAgg[yearlyAgg.length - 1];
    const prev = yearlyAgg[yearlyAgg.length - 2];
    const dS = cur.avgSpeed - prev.avgSpeed;
    const dH = cur.avgHr - prev.avgHr;
    const dE = cur.eff - prev.eff;
    const sDir = dS >= 0.2
      ? `${dS.toFixed(1)} km/h schneller`
      : dS <= -0.2
      ? `${Math.abs(dS).toFixed(1)} km/h langsamer`
      : 'gleich schnell';
    const hDir = dH <= -1
      ? `bei ${Math.abs(dH).toFixed(0)} bpm niedrigerem Puls`
      : dH >= 1
      ? `bei ${dH.toFixed(0)} bpm höherem Puls`
      : 'bei ähnlichem Puls';
    if (dE >= 0.5) return `${cur.year} fährst du im Schnitt ${sDir} ${hDir} als ${prev.year} – deine aerobe Effizienz steigt.`;
    if (dE <= -0.5) return `${cur.year} bist du ${sDir} ${hDir} als ${prev.year} – die Effizienz ist leicht gesunken.`;
    return `${cur.year} und ${prev.year} liegen dicht beieinander – stabile Effizienz auf gutem Niveau.`;
  })();

  // Chart-Skala
  const effValues = monthly.map(m => m.eff);
  const effMin = effValues.length ? Math.floor(Math.min(...effValues) - 1) : 14;
  const effMax = effValues.length ? Math.ceil(Math.max(...effValues) + 1) : 22;
  const effRange = effMax - effMin;

  function xOf(i: number, n: number) { return PAD.left + (i / Math.max(n - 1, 1)) * cW; }
  function yOf(v: number) { return PAD.top + cH - ((v - effMin) / effRange) * cH; }

  const chartPoints = monthly.map((d, i) => ({ x: xOf(i, monthly.length), y: yOf(d.eff) }));

  // X-Labels: erster Monat pro Jahr
  const xLabels: { x: number; label: string; year: number }[] = [];
  {
    let lastYear = -1;
    monthly.forEach((d, i) => {
      if (d.year !== lastYear) {
        xLabels.push({ x: xOf(i, monthly.length), label: String(d.year), year: d.year });
        lastYear = d.year;
      }
    });
  }

  // Y-Ticks
  const yTicks: number[] = [];
  const tickStep = effRange > 6 ? 2 : 1;
  for (let v = Math.ceil(effMin); v <= effMax; v += tickStep) yTicks.push(v);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Aerobe Effizienz"
        subtitle="Wie viel Geschwindigkeit bekommst du pro Herzschlag? Steigt die Kurve → du wirst fitter."
      />

      {error && (
        <div className="rounded border border-destructive/50 bg-destructive/10 p-4 text-destructive text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="h-64 rounded-xl bg-muted animate-pulse" />
      ) : allPoints.length ? (
        <>
          {/* Insight-Banner */}
          {insight && (
            <div className="rounded-xl bg-primary/10 border border-primary/20 px-5 py-3">
              <p className="text-sm" style={{ color: '#fb923c' }}>{insight}</p>
            </div>
          )}

          {/* Effizienz-Chart */}
          <div className="rounded-xl border bg-card shadow-sm p-5">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Effizienz pro Monat</p>
              <p className="text-xs text-muted-foreground/50">= Ø km/h ÷ Ø bpm × 100 · mindestens 2 Rides</p>
            </div>

            <div
              className="relative"
              onMouseMove={e => {
                if (!monthly.length) return;
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                const svgX = (e.clientX - rect.left) / rect.width * W;
                const raw = (svgX - PAD.left) / cW * (monthly.length - 1);
                setHoverIdx(Math.max(0, Math.min(monthly.length - 1, Math.round(raw))));
                setTooltipPos({ x: e.clientX, y: e.clientY });
              }}
              onMouseLeave={() => setHoverIdx(null)}
            >
              <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
                <defs>
                  <linearGradient id="effGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#fb923c" stopOpacity={0.6} />
                    <stop offset="100%" stopColor="#fb923c" stopOpacity={0} />
                  </linearGradient>
                </defs>

                {/* Y-Gitternetz */}
                {yTicks.map(v => (
                  <g key={v}>
                    <line
                      x1={PAD.left} y1={yOf(v)}
                      x2={W - PAD.right} y2={yOf(v)}
                      stroke="hsl(var(--border))" strokeWidth={0.7}
                    />
                    <text x={PAD.left - 6} y={yOf(v) + 4} fontSize={11}
                      fill="hsl(var(--muted-foreground))" textAnchor="end">
                      {v}
                    </text>
                  </g>
                ))}

                {/* Jahreszonen */}
                {xLabels.map((lbl, li) => {
                  const nextX = li + 1 < xLabels.length ? xLabels[li + 1].x : W - PAD.right;
                  const col = yearColor(lbl.year);
                  return (
                    <g key={lbl.year}>
                      <rect x={lbl.x} y={PAD.top} width={nextX - lbl.x} height={cH}
                        fill={col} fillOpacity={0.04} />
                      <line x1={lbl.x} y1={PAD.top} x2={lbl.x} y2={PAD.top + cH}
                        stroke={col} strokeWidth={1} strokeOpacity={0.25} />
                      <text x={lbl.x + 6} y={PAD.top + 13} fontSize={11} fontWeight={600}
                        fill={col} fillOpacity={0.7}>
                        {lbl.label}
                      </text>
                    </g>
                  );
                })}

                {/* Area-Füllung */}
                <path d={areaPath(chartPoints, PAD.top + cH)} fill="url(#effGrad)" opacity={0.35} />

                {/* Haupt-Linie */}
                <path d={linePath(chartPoints)} fill="none" stroke="#fb923c" strokeWidth={2.5} strokeLinejoin="round" />

                {/* Datenpunkte */}
                {monthly.map((d, i) => {
                  const cx = xOf(i, monthly.length);
                  const cy = yOf(d.eff);
                  const active = hoverIdx === i;
                  return (
                    <circle
                      key={i}
                      cx={cx} cy={cy}
                      r={active ? 5 : 3}
                      fill={active ? '#fb923c' : yearColor(d.year)}
                      fillOpacity={active ? 1 : 0.5}
                      stroke={active ? 'white' : 'none'}
                      strokeWidth={1.5}
                    />
                  );
                })}

                {/* Hover: vertikale Linie */}
                {hoverIdx !== null && (
                  <line
                    x1={xOf(hoverIdx, monthly.length)} y1={PAD.top}
                    x2={xOf(hoverIdx, monthly.length)} y2={PAD.top + cH}
                    stroke="white" strokeWidth={1} opacity={0.2}
                  />
                )}

                {/* X-Achse Baseline */}
                <line
                  x1={PAD.left} y1={PAD.top + cH}
                  x2={W - PAD.right} y2={PAD.top + cH}
                  stroke="hsl(var(--border))" strokeWidth={1}
                />

                {/* X-Labels */}
                {xLabels.map(lbl => (
                  <text
                    key={lbl.year}
                    x={lbl.x} y={H - 8}
                    fontSize={11} fill={yearColor(lbl.year)}
                    textAnchor="middle" fontWeight={600}
                  >
                    {lbl.label}
                  </text>
                ))}

                {/* Y-Achsen-Label */}
                <text
                  x={12} y={PAD.top + cH / 2}
                  fontSize={10} fill="hsl(var(--muted-foreground))"
                  textAnchor="middle"
                  transform={`rotate(-90, 12, ${PAD.top + cH / 2})`}
                >
                  Effizienz
                </text>
              </svg>
            </div>
          </div>

          {/* Jahreskarten */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {yearlyAgg.map((s, i) => {
              const col = yearColor(s.year);
              const prev = i > 0 ? yearlyAgg[i - 1] : null;
              const dS = prev ? s.avgSpeed - prev.avgSpeed : null;
              const dH = prev ? s.avgHr - prev.avgHr : null;
              const dE = prev ? s.eff - prev.eff : null;

              return (
                <div
                  key={s.year}
                  className="rounded-xl p-4 border"
                  style={{ borderColor: `${col}33`, background: `${col}0d` }}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-bold" style={{ color: col }}>{s.year}</span>
                    <span className="text-xs text-muted-foreground">{s.count} Rides</span>
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between items-baseline">
                      <span className="text-muted-foreground text-xs">Ø Speed</span>
                      <span className="font-semibold text-foreground">
                        {s.avgSpeed.toFixed(1)}{' '}
                        <span className="text-xs font-normal text-muted-foreground">km/h</span>{' '}
                        {dS !== null && (
                          <span className={`text-xs ${Math.abs(dS) < 0.2 ? 'text-muted-foreground/40' : dS > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {dS > 0 ? '+' : ''}{dS.toFixed(1)}
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between items-baseline">
                      <span className="text-muted-foreground text-xs">Ø HR</span>
                      <span className="font-semibold text-foreground">
                        {s.avgHr.toFixed(0)}{' '}
                        <span className="text-xs font-normal text-muted-foreground">bpm</span>{' '}
                        {dH !== null && (
                          <span className={`text-xs ${Math.abs(dH) < 0.5 ? 'text-muted-foreground/40' : dH < 0 ? 'text-emerald-400' : 'text-orange-400'}`}>
                            {dH > 0 ? '+' : ''}{dH.toFixed(1)}
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="border-t border-border/50 pt-2 flex justify-between items-baseline">
                      <span className="text-muted-foreground text-xs">Effizienz</span>
                      <span className="font-bold" style={{ color: col }}>
                        {s.eff.toFixed(1)}{' '}
                        {dE !== null && (
                          <span className={`text-xs font-normal ${Math.abs(dE) < 0.2 ? 'text-muted-foreground/40' : dE > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {dE > 0 ? '+' : ''}{dE.toFixed(1)}
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Kurze Erklärung */}
          <div className="rounded-xl border bg-card shadow-sm px-5 py-4 text-sm text-muted-foreground space-y-1">
            <p className="text-foreground font-medium">Was ist die Effizienz-Zahl?</p>
            <p>
              <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded text-orange-400">
                Effizienz = Ø km/h ÷ Ø bpm × 100
              </span>{' '}
              – je höher, desto mehr Geschwindigkeit bekommst du pro Herzschlag.
            </p>
            <p>
              Ein Anstieg bedeutet: dein Herz-Kreislauf-System wird ökonomischer.
              Die Kurve kann trotz weniger Training steigen (bessere Erholung, leichtere Strecken) –
              deshalb immer zusammen mit den Volumen-Daten betrachten.
            </p>
          </div>
        </>
      ) : (
        <p className="text-muted-foreground text-sm">Keine Daten mit HR + Geschwindigkeit gefunden.</p>
      )}

      {/* Hover-Tooltip (fixed) */}
      {hoverIdx !== null && monthly[hoverIdx] && (() => {
        const d = monthly[hoverIdx];
        return (
          <div
            className="fixed z-50 pointer-events-none rounded-lg bg-card/95 border border-border px-3 py-2.5 text-xs shadow-xl"
            style={{ left: tooltipPos.x + 14, top: tooltipPos.y - 80, minWidth: 160 }}
          >
            <p className="font-semibold text-foreground mb-2">{d.label} · {d.count} Rides</p>
            <div className="space-y-1">
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Ø Speed</span>
                <span className="text-foreground font-mono">{d.avgSpeed.toFixed(1)} km/h</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Ø HR</span>
                <span className="text-foreground font-mono">{d.avgHr.toFixed(0)} bpm</span>
              </div>
              <div className="flex justify-between gap-4 pt-1.5 border-t border-border/50">
                <span className="text-orange-400">Effizienz</span>
                <span className="text-orange-300 font-mono font-bold">{d.eff.toFixed(2)}</span>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
