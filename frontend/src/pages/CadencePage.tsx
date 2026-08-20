import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/ui/page-header';
import { api, type CadenceData, type CadenceZone } from '@/lib/api';

const ZONE_COLORS: Record<string, string> = {
  Schleppen: '#6b7280',
  Niedrig: '#60a5fa',
  Moderat: '#34d399',
  Optimal: '#fbbf24',
  Hoch: '#f97316',
  Sprint: '#ef4444',
};

function cadenceColor(c: number): string {
  if (c < 60) return '#6b7280';
  if (c < 70) return '#60a5fa';
  if (c < 80) return '#34d399';
  if (c < 90) return '#fbbf24';
  if (c < 100) return '#f97316';
  return '#ef4444';
}

// --- Polar-Chart-Geometrie ---
const CX = 250, CY = 250;
const R_INNER = 80;
const R_OUTER = 210;
const BAR_MAX = 130;
const CADENCE_MIN = 40;
const CADENCE_MAX = 130;
const CADENCE_COUNT = CADENCE_MAX - CADENCE_MIN + 1; // 91
const DEG_PER_STEP = 360 / CADENCE_COUNT;
const BAR_WIDTH_DEG = 2.8;

function deg2rad(d: number): number {
  return (d * Math.PI) / 180;
}

function cadenceAngleDeg(cadence: number): number {
  return -90 + (cadence - CADENCE_MIN) * DEG_PER_STEP;
}

function polar(angleDeg: number, r: number): [number, number] {
  const a = deg2rad(angleDeg);
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
}

function barPath(cadence: number, count: number, maxCount: number): string {
  const length = R_INNER + (count / maxCount) * BAR_MAX;
  const angleMid = cadenceAngleDeg(cadence);
  const angleStart = angleMid - BAR_WIDTH_DEG / 2;
  const angleEnd = angleMid + BAR_WIDTH_DEG / 2;

  const [x1i, y1i] = polar(angleStart, R_INNER);
  const [x1o, y1o] = polar(angleStart, length);
  const [x2o, y2o] = polar(angleEnd, length);
  const [x2i, y2i] = polar(angleEnd, R_INNER);

  return (
    `M${x1i.toFixed(1)},${y1i.toFixed(1)}` +
    `L${x1o.toFixed(1)},${y1o.toFixed(1)}` +
    `A${length.toFixed(1)},${length.toFixed(1)} 0 0,1 ${x2o.toFixed(1)},${y2o.toFixed(1)}` +
    `L${x2i.toFixed(1)},${y2i.toFixed(1)}` +
    `A${R_INNER},${R_INNER} 0 0,0 ${x1i.toFixed(1)},${y1i.toFixed(1)}Z`
  );
}

function zoneArcPath(zone: CadenceZone): string {
  const R = 70, R2 = 76;
  const startCad = Math.max(zone.min, CADENCE_MIN);
  const endCad = Math.min(zone.max, CADENCE_MAX);
  if (startCad > endCad) return '';

  const aStart = cadenceAngleDeg(startCad) - DEG_PER_STEP / 2;
  const aEnd = cadenceAngleDeg(endCad) + DEG_PER_STEP / 2;

  const [x1, y1] = polar(aStart, R);
  const [x2, y2] = polar(aEnd, R);
  const [x3, y3] = polar(aEnd, R2);
  const [x4, y4] = polar(aStart, R2);

  const sweep = aEnd - aStart > 180 ? 1 : 0;

  return (
    `M${x1.toFixed(1)},${y1.toFixed(1)}` +
    `A${R},${R} 0 ${sweep},1 ${x2.toFixed(1)},${y2.toFixed(1)}` +
    `L${x3.toFixed(1)},${y3.toFixed(1)}` +
    `A${R2},${R2} 0 ${sweep},0 ${x4.toFixed(1)},${y4.toFixed(1)}Z`
  );
}

// --- Monatsverlauf-Chart ---
const MW = 800, MH = 180;
const MPAD = { top: 20, right: 20, bottom: 40, left: 52 };
const mcW = MW - MPAD.left - MPAD.right;
const mcH = MH - MPAD.top - MPAD.bottom;
const CADENCE_Y_MIN = 70;
const CADENCE_Y_MAX = 95;
const cadenceYRange = CADENCE_Y_MAX - CADENCE_Y_MIN;

function mxOf(i: number, n: number) {
  return MPAD.left + (i / Math.max(n - 1, 1)) * mcW;
}
function myOf(v: number) {
  const clamped = Math.min(Math.max(v, CADENCE_Y_MIN), CADENCE_Y_MAX);
  return MPAD.top + mcH - ((clamped - CADENCE_Y_MIN) / cadenceYRange) * mcH;
}

export default function CadencePage() {
  const { t } = useTranslation('cadence');
  const [data, setData] = useState<CadenceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [availableYears, setAvailableYears] = useState<string[]>([]);
  const [filterYear, setFilterYear] = useState<string | null>(null);
  const [hoveredCadence, setHoveredCadence] = useState<number | null>(null);
  const [hoveredMonth, setHoveredMonth] = useState<number | null>(null);
  const [tooltip, setTooltip] = useState({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    api.activityStats()
      .then(stats => setAvailableYears(stats.available_years.filter(y => Number(y) >= 2000)))
      .catch(() => {});
    load(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load(year: string | null) {
    setLoading(true);
    setError(null);
    try {
      const res = await api.cadence(year ? Number(year) : undefined);
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('loadError'));
    } finally {
      setLoading(false);
    }
  }

  function handleYearChange(year: string | null) {
    const y = year === 'all' ? null : year;
    setFilterYear(y);
    load(y);
  }

  if (!data && !loading) return null;

  const maxDistCount = data ? Math.max(...data.distribution.map(d => d.count)) : 1;
  const totalZoneCount = data ? data.zones.reduce((s, z) => s + z.count, 0) : 0;
  const favoriteZone = data?.zones.reduce((best, z) => (z.count > best.count ? z : best), data.zones[0]);

  // Sweetspot = beste speed/hr ratio
  const sweetspotIdx = data?.efficiency.length
    ? data.efficiency.reduce((bestIdx, e, i) => {
        if (e.avg_hr <= 0) return bestIdx;
        const ratio = e.avg_speed_kmh / e.avg_hr;
        const bestRatio = data.efficiency[bestIdx]?.avg_hr > 0
          ? data.efficiency[bestIdx].avg_speed_kmh / data.efficiency[bestIdx].avg_hr
          : -Infinity;
        return ratio > bestRatio ? i : bestIdx;
      }, 0)
    : -1;

  const totalPointsFmt = (() => {
    if (!data) return '–';
    const n = data.stats.total_points;
    if (n >= 1000) return t('stats.thousand', { count: Math.round(n / 1000) });
    return String(n);
  })();

  const monthlyPts = data?.monthly.map((m, i) => ({
    x: mxOf(i, data.monthly.length),
    y: myOf(m.avg_cadence),
    month: m.month,
    avg: m.avg_cadence,
    rides: m.rides,
  })) ?? [];

  const avgCadenceY = data ? myOf(data.stats.avg_cadence) : MPAD.top + mcH / 2;

  const AXIS_TICKS = [70, 75, 80, 85, 90, 95];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle', { count: data?.stats.rides_with_cadence ?? '–' })}
        years={availableYears}
        selectedYear={filterYear}
        onYearChange={handleYearChange}
      />

      {error && (
        <div className="rounded border border-destructive/50 bg-destructive/10 p-4 text-destructive text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <>
          <div className="grid grid-cols-4 gap-3">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />)}
          </div>
          <div className="h-[520px] rounded-xl bg-muted animate-pulse" />
        </>
      ) : data ? (
        <>
          {/* Stats-Leiste */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border bg-card shadow-sm px-4 py-4">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('stats.avgCadence')}</p>
              <p className="text-3xl font-bold text-amber-400 mt-1">{data.stats.avg_cadence.toFixed(1)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">rpm</p>
            </div>
            <div className="rounded-xl border bg-card shadow-sm px-4 py-4">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('stats.maxCadence')}</p>
              <p className="text-3xl font-bold text-red-400 mt-1">{data.stats.max_cadence}</p>
              <p className="text-xs text-muted-foreground mt-0.5">rpm</p>
            </div>
            {favoriteZone && (
              <div className="rounded-xl border bg-card shadow-sm px-4 py-4">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('stats.favoriteZone')}</p>
                <p className="text-2xl font-bold mt-1" style={{ color: ZONE_COLORS[favoriteZone.name] ?? '#fff' }}>
                  {t(`zones.names.${favoriteZone.name}`, { defaultValue: favoriteZone.name })}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">{favoriteZone.min}–{favoriteZone.max} rpm</p>
              </div>
            )}
            <div className="rounded-xl border bg-card shadow-sm px-4 py-4">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('stats.dataPoints')}</p>
              <p className="text-3xl font-bold text-emerald-400 mt-1">{totalPointsFmt}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{t('stats.dataPointsUnit')}</p>
            </div>
          </div>

          {/* Polar Chart + Zonen */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Radiales Verteilungsdiagramm */}
            <div className="rounded-xl border bg-card shadow-sm p-4">
              <h3 className="text-sm font-medium mb-3">{t('distribution.heading')}</h3>
              <svg
                viewBox="0 0 500 500"
                width="100%"
                className="block mx-auto"
                style={{ maxHeight: 480 }}
              >
                <defs>
                  <radialGradient id="innerGrad" cx="50%" cy="50%">
                    <stop offset="0%" stopColor="hsl(var(--card))" stopOpacity={1} />
                    <stop offset="100%" stopColor="hsl(var(--background))" stopOpacity={1} />
                  </radialGradient>
                </defs>

                {/* Referenz-Ring */}
                <circle
                  cx={CX} cy={CY} r={R_OUTER}
                  fill="none" stroke="hsl(var(--border))" strokeWidth={1} strokeDasharray="4,6"
                />

                {/* Zone-Ring */}
                {data.zones.map(zone => {
                  const path = zoneArcPath(zone);
                  if (!path) return null;
                  return (
                    <path
                      key={zone.name}
                      d={path}
                      fill={ZONE_COLORS[zone.name] ?? '#6b7280'}
                      opacity={0.7}
                    />
                  );
                })}

                {/* Radiale Balken */}
                {data.distribution.map(dp => (
                  <path
                    key={dp.cadence}
                    d={barPath(dp.cadence, dp.count, maxDistCount)}
                    fill={cadenceColor(dp.cadence)}
                    opacity={hoveredCadence === dp.cadence ? 1 : 0.75}
                    stroke={hoveredCadence === dp.cadence ? 'white' : 'none'}
                    strokeWidth={0.5}
                    onMouseEnter={() => setHoveredCadence(dp.cadence)}
                    onMouseLeave={() => setHoveredCadence(null)}
                    style={{ cursor: 'pointer' }}
                  />
                ))}

                {/* Innenkreis */}
                <circle cx={CX} cy={CY} r={R_INNER} fill="url(#innerGrad)" stroke="hsl(var(--border))" strokeWidth={1.5} />

                {/* Innenkreis-Text */}
                {hoveredCadence !== null ? (
                  (() => {
                    const bar = data.distribution.find(d => d.cadence === hoveredCadence);
                    return bar ? (
                      <>
                        <text x={CX} y={CY - 10} fontSize={16} fontWeight={700}
                          fill={cadenceColor(bar.cadence)} textAnchor="middle">
                          {bar.cadence} rpm
                        </text>
                        <text x={CX} y={CY + 12} fontSize={13} fill="hsl(var(--muted-foreground))" textAnchor="middle">
                          {bar.count.toLocaleString('de')}×
                        </text>
                      </>
                    ) : null;
                  })()
                ) : (
                  <>
                    <text x={CX} y={CY - 6} fontSize={20} fontWeight={700} fill="#fbbf24" textAnchor="middle">
                      Ø {data.stats.avg_cadence.toFixed(1)}
                    </text>
                    <text x={CX} y={CY + 14} fontSize={12} fill="hsl(var(--muted-foreground))" textAnchor="middle">
                      rpm
                    </text>
                  </>
                )}

                {/* Winkel-Beschriftungen */}
                {([
                  { cad: 40, label: '40 rpm' },
                  { cad: 62, label: '62' },
                  { cad: 85, label: '85' },
                  { cad: 108, label: '108' },
                ] as const).map(lbl => {
                  const [px, py] = polar(cadenceAngleDeg(lbl.cad), R_OUTER + 18);
                  return (
                    <text
                      key={lbl.cad}
                      x={px.toFixed(1)} y={(py + 4).toFixed(1)}
                      fontSize={11} fill="hsl(var(--muted-foreground))" textAnchor="middle"
                    >
                      {lbl.label}
                    </text>
                  );
                })}
              </svg>
            </div>

            {/* Kadenz-Zonen */}
            <div className="rounded-xl border bg-card shadow-sm p-4 flex flex-col justify-center">
              <h3 className="text-sm font-medium mb-4">{t('zones.heading')}</h3>
              <div className="space-y-3">
                {data.zones.map(zone => {
                  const pct = totalZoneCount > 0 ? (zone.count / totalZoneCount) * 100 : 0;
                  const color = ZONE_COLORS[zone.name] ?? '#6b7280';
                  const desc = t(`zones.descriptions.${zone.name}`, { defaultValue: '' });
                  return (
                    <div key={zone.name}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span
                            className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ background: color }}
                          />
                          <span className="text-sm font-medium" style={{ color }}>
                            {t(`zones.names.${zone.name}`, { defaultValue: zone.name })}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {zone.min}–{zone.max === 999 ? '∞' : zone.max} rpm
                          </span>
                        </div>
                        <span className="text-sm font-mono text-foreground">{pct.toFixed(1)} %</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${pct.toFixed(1)}%`, background: color }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 pl-5">{desc}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Monatsverlauf */}
          {data.monthly.length >= 2 && (
            <div className="rounded-xl border bg-card shadow-sm p-4">
              <h3 className="text-sm font-medium mb-3">{t('monthly.heading')}</h3>
              <div className="relative">
                <svg
                  ref={svgRef}
                  viewBox={`0 0 ${MW} ${MH}`}
                  width="100%"
                  className="block overflow-visible"
                >
                  <defs>
                    <linearGradient id="cadGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#fbbf24" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#fbbf24" stopOpacity={0} />
                    </linearGradient>
                  </defs>

                  {AXIS_TICKS.map(v => {
                    const gy = MPAD.top + mcH - ((v - CADENCE_Y_MIN) / cadenceYRange) * mcH;
                    return (
                      <g key={v}>
                        <line x1={MPAD.left} y1={gy} x2={MW - MPAD.right} y2={gy}
                          stroke="hsl(var(--border))" strokeWidth={1} />
                        <text x={MPAD.left - 8} y={gy + 4} fontSize={11}
                          fill="hsl(var(--muted-foreground))" textAnchor="end">
                          {v}
                        </text>
                      </g>
                    );
                  })}

                  {/* Ø-Linie gestrichelt */}
                  <line
                    x1={MPAD.left} y1={avgCadenceY}
                    x2={MW - MPAD.right} y2={avgCadenceY}
                    stroke="hsl(var(--muted-foreground))" strokeWidth={1} strokeDasharray="4,4"
                  />
                  <text x={MW - MPAD.right + 4} y={avgCadenceY + 4} fontSize={10}
                    fill="hsl(var(--muted-foreground))">
                    Ø
                  </text>

                  <line
                    x1={MPAD.left} y1={MPAD.top + mcH}
                    x2={MW - MPAD.right} y2={MPAD.top + mcH}
                    stroke="hsl(var(--border))" strokeWidth={1}
                  />

                  {/* Fläche */}
                  <path
                    d={`M${monthlyPts[0].x.toFixed(1)},${(MPAD.top + mcH).toFixed(1)}` +
                      monthlyPts.map(p => ` L${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('') +
                      ` L${monthlyPts[monthlyPts.length - 1].x.toFixed(1)},${(MPAD.top + mcH).toFixed(1)}Z`}
                    fill="url(#cadGrad)"
                  />
                  {/* Linie */}
                  <polyline
                    points={monthlyPts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
                    fill="none" stroke="#fbbf24" strokeWidth={2.5}
                    strokeLinecap="round" strokeLinejoin="round"
                  />

                  {/* Punkte */}
                  {monthlyPts.map((pt, i) => (
                    <g key={i}>
                      <circle
                        cx={pt.x} cy={pt.y}
                        r={hoveredMonth === i ? 6 : 4}
                        fill={hoveredMonth === i ? '#fbbf24' : '#f59e0b'}
                        stroke="hsl(var(--card))" strokeWidth={2}
                        style={{ cursor: 'pointer' }}
                        onMouseEnter={e => {
                          setHoveredMonth(i);
                          const rect = (e.currentTarget as Element).closest('svg')!.getBoundingClientRect();
                          setTooltip({ x: e.clientX - rect.left + 12, y: e.clientY - rect.top - 36 });
                        }}
                        onMouseLeave={() => setHoveredMonth(null)}
                      />
                      {i % 3 === 0 && (
                        <text x={pt.x} y={MPAD.top + mcH + 16} fontSize={10}
                          fill="hsl(var(--muted-foreground))" textAnchor="middle">
                          {pt.month.slice(0, 7)}
                        </text>
                      )}
                    </g>
                  ))}

                  <text
                    x={MPAD.left - 36} y={MPAD.top + mcH / 2}
                    fontSize={11} fill="hsl(var(--muted-foreground))" textAnchor="middle"
                    transform={`rotate(-90, ${MPAD.left - 36}, ${MPAD.top + mcH / 2})`}
                  >
                    rpm
                  </text>
                </svg>

                {/* Hover-Tooltip */}
                {hoveredMonth !== null && monthlyPts[hoveredMonth] && (
                  <div
                    className="absolute pointer-events-none z-10 bg-card border border-border rounded-lg px-3 py-2 text-xs shadow-lg"
                    style={{ left: tooltip.x, top: tooltip.y }}
                  >
                    <p className="text-muted-foreground">{monthlyPts[hoveredMonth].month}</p>
                    <p className="text-amber-400 font-bold text-sm">{monthlyPts[hoveredMonth].avg.toFixed(1)} rpm</p>
                    <p className="text-muted-foreground">
                      {t('monthly.tooltipRides', { count: monthlyPts[hoveredMonth].rides })}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Effizienz-Kacheln */}
          {data.efficiency.length > 0 && (
            <div className="rounded-xl border bg-card shadow-sm p-4">
              <h3 className="text-sm font-medium mb-1">{t('efficiency.heading')}</h3>
              <p className="text-xs text-muted-foreground mb-4">
                {t('efficiency.subtitle')}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {data.efficiency.map((eff, i) => {
                  const isSweetspot = i === sweetspotIdx;
                  const ratio = eff.avg_hr > 0 ? (eff.avg_speed_kmh / eff.avg_hr * 100).toFixed(2) : '–';
                  return (
                    <div
                      key={i}
                      className={[
                        'rounded-xl border px-3 py-3 text-center transition-colors',
                        isSweetspot
                          ? 'border-amber-400/60 bg-amber-400/10'
                          : 'border-border bg-background hover:border-border/80',
                      ].join(' ')}
                    >
                      {isSweetspot && (
                        <p className="text-[9px] text-amber-400 font-bold uppercase tracking-wide mb-1">
                          {t('efficiency.sweetspot')}
                        </p>
                      )}
                      <p className={`text-lg font-bold leading-tight ${isSweetspot ? 'text-amber-400' : 'text-foreground'}`}>
                        {eff.cadence_mid}
                      </p>
                      <p className="text-[10px] text-muted-foreground mb-2">rpm</p>
                      <div className="space-y-0.5">
                        <p className="text-xs text-emerald-400">
                          {eff.avg_speed_kmh.toFixed(1)}{' '}
                          <span className="text-muted-foreground">km/h</span>
                        </p>
                        <p className="text-xs text-red-400">
                          {Math.round(eff.avg_hr)}{' '}
                          <span className="text-muted-foreground">bpm</span>
                        </p>
                        <p className="text-[10px] text-muted-foreground">{t('efficiency.ratio', { value: ratio })}</p>
                      </div>
                      {eff.count > 0 && (
                        <p className="text-[9px] text-muted-foreground/50 mt-1">
                          {t('efficiency.points', { count: eff.count, formatted: eff.count.toLocaleString('de') })}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <p className="text-xs text-muted-foreground/50">
            {t('footer', { count: data.stats.rides_with_cadence })}
          </p>
        </>
      ) : null}
    </div>
  );
}
