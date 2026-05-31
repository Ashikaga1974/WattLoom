import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/ui/page-header';
import { api } from '@/lib/api';

interface CurveData {
  durations_s: number[];
  labels: string[];
  best_hr: number[];
}

// Kontext je Zeitfenster (5 feste Fenster)
const CONTEXT = [
  {
    short: 'Maximalsprint',
    long: 'Kürzestes Fenster — erfasst anaerobe Spitzen (Berg-Sprint, Attacke). Kaum trainierbar, stark genetisch.',
  },
  {
    short: 'Hartes Intervall',
    long: 'VO₂max-Bereich. Mit hochintensiven Intervallen (4×5 min) gezielt trainierbar.',
  },
  {
    short: 'Intensiv',
    long: 'Langes Intervall oder kurze Tempofahrt. Grenzbereich zwischen anaerob und aerob.',
  },
  {
    short: '≈ Schwellen-HR',
    long: 'Der wichtigste Wert: entspricht ungefähr der Laktatschwellen-HF. Liegt typischerweise bei ~85–92 % HRmax.',
  },
  {
    short: 'Dauerleistung',
    long: 'Aerober Bereich. Wie gut hältst du hohe HF über eine Stunde? Zeigt die aerobe Basis.',
  },
];

function buildAreaPath(pts: { x: number; y: number }[], baseY: number): string {
  if (!pts.length) return '';
  const first = pts[0];
  const last = pts[pts.length - 1];
  let d = `M${first.x.toFixed(1)},${baseY.toFixed(1)} L${first.x.toFixed(1)},${first.y.toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    d += ` L${pts[i].x.toFixed(1)},${pts[i].y.toFixed(1)}`;
  }
  d += ` L${last.x.toFixed(1)},${baseY.toFixed(1)} Z`;
  return d;
}

export default function HrCurvePage() {
  const [data, setData] = useState<CurveData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [availableYears, setAvailableYears] = useState<string[]>([]);
  const [filterYear, setFilterYear] = useState<string | null>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  useEffect(() => {
    api.activityStats()
      .then(stats => {
        setAvailableYears(stats.available_years.filter(y => Number(y) >= 2000));
      })
      .catch(() => {});
    loadCurve(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadCurve(year: string | null) {
    setLoading(true);
    setError(null);
    try {
      const res = await api.hrCurve(year ? Number(year) : undefined);
      setData({ durations_s: res.durations_s, labels: res.labels, best_hr: res.best_hr });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler beim Laden');
    } finally {
      setLoading(false);
    }
  }

  function handleYearChange(year: string | null) {
    const y = year === 'all' ? null : year;
    setFilterYear(y);
    loadCurve(y);
  }

  // Index des 20-min-Fensters (1200s)
  const thresholdIdx = data ? data.durations_s.findIndex(d => d === 1200) : -1;
  const thresholdHR = thresholdIdx >= 0 && data ? data.best_hr[thresholdIdx] : null;

  const dropPct =
    data && data.best_hr.length >= 2
      ? (() => {
          const first = data.best_hr[0];
          const last = data.best_hr[data.best_hr.length - 1];
          return first > 0 ? Math.round((1 - last / first) * 100) : null;
        })()
      : null;

  // Chart-Geometrie
  const W = 960, H = 220;
  const PAD = { top: 24, right: 32, bottom: 48, left: 52 };
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top - PAD.bottom;

  const minHR = data ? Math.floor(Math.min(...data.best_hr) / 5) * 5 - 5 : 100;
  const maxHR = data ? Math.ceil(Math.max(...data.best_hr) / 5) * 5 + 5 : 180;
  const hrRange = maxHR - minHR;

  function xOf(i: number, n: number) {
    return PAD.left + (i / (n - 1)) * cW;
  }
  function yOf(hr: number) {
    return PAD.top + cH - ((hr - minHR) / hrRange) * cH;
  }

  const points = data
    ? data.best_hr.map((hr, i) => ({
        x: xOf(i, data.best_hr.length),
        y: yOf(hr),
        hr,
        label: data.labels[i],
        ctx: CONTEXT[i] ?? { short: '', long: '' },
        isThreshold: i === thresholdIdx,
      }))
    : [];

  const polyline = points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const areaPath = buildAreaPath(points, PAD.top + cH);

  const yTicks: number[] = [];
  for (let v = minHR; v <= maxHR; v += 10) yTicks.push(v);

  return (
    <div className="space-y-6">
      <PageHeader
        title="HR-Kurve"
        subtitle="Beste Herzfrequenz je Zeitfenster — gleitendes Maximum über alle Aktivitäten"
        years={availableYears}
        selectedYear={filterYear}
        onYearChange={handleYearChange}
      />

      {/* Erklär-Box */}
      <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-3 text-sm space-y-1">
        <p className="font-medium text-blue-400">Was zeigt diese Kurve?</p>
        <p className="text-muted-foreground">
          Für jedes Zeitfenster (1 min bis 60 min) sucht der Algorithmus in allen deinen Rides den höchsten
          Durchschnittswert der Herzfrequenz über genau so viele aufeinanderfolgende Sekunden.
          Das Ergebnis zeigt, wie hoch deine HF bei verschiedenen Belastungsdauern maximal war —
          ähnlich einer Power-Kurve, aber ohne Leistungsmesser.
        </p>
      </div>

      {error && (
        <div className="rounded border border-destructive/50 bg-destructive/10 p-4 text-destructive text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <>
          <div className="h-32 rounded-xl bg-muted animate-pulse" />
          <div className="h-56 rounded-xl bg-muted animate-pulse" />
        </>
      ) : data ? (
        <>
          {/* Kacheln */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {points.map((p, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setHoveredIdx(hoveredIdx === i ? null : i)}
                className={[
                  'rounded-xl border text-left px-4 py-3 transition-colors',
                  p.isThreshold
                    ? 'border-orange-500/60 bg-orange-500/10'
                    : hoveredIdx === i
                    ? 'border-red-500/40 bg-red-500/10'
                    : 'border-border bg-card hover:border-border/80',
                ].join(' ')}
              >
                <p className={`text-[10px] uppercase tracking-wide ${p.isThreshold ? 'text-orange-400' : 'text-muted-foreground'}`}>
                  {p.label}
                </p>
                <p className={`text-2xl font-bold mt-0.5 ${p.isThreshold ? 'text-orange-400' : 'text-red-400'}`}>
                  {Math.round(p.hr)}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">bpm</p>
                <p className={`text-[11px] mt-2 ${p.isThreshold ? 'text-orange-300' : 'text-muted-foreground'}`}>
                  {p.ctx.short}
                </p>
              </button>
            ))}
          </div>

          {/* Erklärtext der angeklickten Kachel */}
          {hoveredIdx !== null && (
            <div className="rounded-lg border bg-card px-4 py-3 text-sm text-foreground">
              <span className="font-medium">{points[hoveredIdx].label} — {points[hoveredIdx].ctx.short}:</span>{' '}
              {points[hoveredIdx].ctx.long}
            </div>
          )}

          {/* SVG-Chart */}
          <div className="rounded-xl border bg-card shadow-sm px-4 pt-4 pb-2">
            <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="block">
              <defs>
                <linearGradient id="hrGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f87171" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#f87171" stopOpacity={0} />
                </linearGradient>
              </defs>

              {yTicks.map(v => (
                <g key={v}>
                  <line
                    x1={PAD.left} y1={yOf(v)}
                    x2={W - PAD.right} y2={yOf(v)}
                    stroke="hsl(var(--border))" strokeWidth={1}
                  />
                  <text
                    x={PAD.left - 8} y={yOf(v) + 4}
                    fontSize={11} fill="hsl(var(--muted-foreground))" textAnchor="end"
                  >
                    {v}
                  </text>
                </g>
              ))}

              {thresholdHR !== null && (
                <>
                  <line
                    x1={PAD.left} y1={yOf(thresholdHR)}
                    x2={W - PAD.right} y2={yOf(thresholdHR)}
                    stroke="#f97316" strokeWidth={1} strokeDasharray="4,4" opacity={0.5}
                  />
                  <text x={PAD.left + 6} y={yOf(thresholdHR) - 4} fontSize={10} fill="#f97316" opacity={0.8}>
                    Schwellen-HR
                  </text>
                </>
              )}

              <line
                x1={PAD.left} y1={PAD.top + cH}
                x2={W - PAD.right} y2={PAD.top + cH}
                stroke="hsl(var(--border))" strokeWidth={1}
              />

              <path d={areaPath} fill="url(#hrGrad)" />
              <polyline
                points={polyline}
                fill="none"
                stroke="#f87171"
                strokeWidth={2.5}
                strokeLinejoin="round"
                strokeLinecap="round"
              />

              {points.map((p, i) => (
                <g key={i}>
                  <circle
                    cx={p.x} cy={p.y}
                    r={p.isThreshold ? 7 : 5}
                    fill={p.isThreshold ? '#f97316' : '#f87171'}
                    stroke={p.isThreshold ? '#f97316' : 'hsl(var(--card))'}
                    strokeWidth={2}
                  />
                  <text
                    x={p.x} y={p.y - 12}
                    fontSize={11}
                    fill={p.isThreshold ? '#f97316' : '#fca5a5'}
                    textAnchor="middle"
                    fontWeight={600}
                  >
                    {Math.round(p.hr)}
                  </text>
                  <text
                    x={p.x} y={PAD.top + cH + 16}
                    fontSize={11} fill="hsl(var(--muted-foreground))" textAnchor="middle"
                  >
                    {p.label}
                  </text>
                  <text
                    x={p.x} y={PAD.top + cH + 30}
                    fontSize={9} fill="hsl(var(--muted-foreground))" textAnchor="middle"
                  >
                    {p.ctx.short}
                  </text>
                </g>
              ))}

              <text
                x={PAD.left - 38} y={PAD.top + cH / 2}
                fontSize={11} fill="hsl(var(--muted-foreground))" textAnchor="middle"
                transform={`rotate(-90, ${PAD.left - 38}, ${PAD.top + cH / 2})`}
              >
                bpm
              </text>
            </svg>
          </div>

          {/* Interpretation */}
          <div className="grid sm:grid-cols-2 gap-4">
            {thresholdHR !== null && (
              <div className="rounded-xl border border-orange-500/30 bg-orange-500/5 px-4 py-3 space-y-1">
                <p className="text-xs text-orange-400 font-medium uppercase tracking-wide">Geschätzte Schwellen-HR</p>
                <p className="text-3xl font-bold text-orange-400">
                  {Math.round(thresholdHR)}{' '}
                  <span className="text-base font-normal text-orange-300">bpm</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  Entspricht deinem 20-min-Bestwert. Die Laktatschwelle liegt typischerweise
                  bei 85–92 % HRmax und markiert den Übergang von aerobem zu anaerobem Stoffwechsel.
                </p>
              </div>
            )}

            {dropPct !== null && (
              <div className="rounded-xl border bg-card shadow-sm px-4 py-3 space-y-1">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                  Kurvensteilheit (1 min → 60 min)
                </p>
                <p className={`text-3xl font-bold ${dropPct <= 5 ? 'text-emerald-400' : dropPct <= 10 ? 'text-yellow-400' : 'text-red-400'}`}>
                  −{dropPct}{' '}
                  <span className="text-base font-normal text-muted-foreground">%</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {dropPct <= 5
                    ? 'Sehr flach — starke aerobe Basis, du hältst hohe HF auch über lange Dauer.'
                    : dropPct <= 10
                    ? 'Moderat — gute Balance zwischen Ausdauer und Intensität.'
                    : 'Steil — große Spitze über kurz, aber HF fällt über längere Dauer stark ab. Mehr Grundlagentraining hilft.'}
                </p>
              </div>
            )}
          </div>

          <p className="text-xs text-muted-foreground/50">
            Berechnung: gleitendes Maximum der Sekunden-HR über alle FIT-Tracks. Nur Aktivitäten mit HR-Daten fließen ein.
            Kurze Fenster können durch kurze Sprints verzerrt sein — der 20-min-Wert ist am aussagekräftigsten.
          </p>
        </>
      ) : null}
    </div>
  );
}
