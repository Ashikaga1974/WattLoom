import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, type Activity, type BestByDistanceBucket } from '@/lib/api';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { fmtDate } from '@/lib/format';
import { rideTitle } from '@/lib/activity-display';

interface Category {
  key: string;
  label: string;
  format: (a: Activity) => string;
  items: Activity[];
}

function fmtTime(s: number | null): string {
  if (s === null) return '–';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function fmtDate2(d: string | null): string {
  if (!d) return '';
  return new Date(d.endsWith('Z') ? d : d + 'Z').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const RANK_SYMBOLS = ['🥇', '🥈', '🥉', '4.', '5.'];
const RANK_COLORS = ['text-yellow-500', 'text-slate-400', 'text-amber-600', 'text-muted-foreground', 'text-muted-foreground'];

// SVG-Chart-Konstanten
const CW = 960, CH = 170;
const PAD = { t: 14, r: 32, b: 48, l: 52 };
const innerW = CW - PAD.l - PAD.r;
const innerH = CH - PAD.t - PAD.b;

export default function BestPage() {
  const { t } = useTranslation(['best', 'common']);
  const [categories, setCategories] = useState<Category[]>([
    { key: 'distance_m',      label: t('categories.distance', { ns: 'best' }),     format: a => (a.distance_m / 1000).toFixed(1) + ' km', items: [] },
    { key: 'elevation_gain_m',label: t('categories.elevation', { ns: 'best' }), format: a => a.elevation_gain_m ? Math.round(a.elevation_gain_m) + ' m' : '-', items: [] },
    { key: 'moving_time_s',   label: t('categories.movingTime', { ns: 'best' }),  format: a => { const h = Math.floor(a.moving_time_s / 3600); const m = Math.floor((a.moving_time_s % 3600) / 60); return `${h}h ${m}m`; }, items: [] },
    { key: 'avg_speed_ms',    label: t('categories.avgSpeed', { ns: 'best' }),  format: a => a.avg_speed_ms ? (a.avg_speed_ms * 3.6).toFixed(1) + ' km/h' : '-', items: [] },
    { key: 'avg_power_w',     label: t('categories.avgPower', { ns: 'best' }),  format: a => a.avg_power_w ? Math.round(a.avg_power_w) + ' W' : '-', items: [] },
    { key: 'calories',        label: t('categories.calories', { ns: 'best' }),   format: a => a.calories ? Math.round(a.calories) + ' kcal' : '-', items: [] },
  ]);
  const [distBuckets, setDistBuckets] = useState<BestByDistanceBucket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredBucket, setHoveredBucket] = useState<number | null>(null);

  useEffect(() => {
    async function load() {
      const [catResults, distResult] = await Promise.all([
        Promise.all(categories.map(c => api.topActivities(c.key, 5))),
        api.bestByDistance(),
      ]);
      setCategories(prev => prev.map((c, i) => ({ ...c, items: catResults[i].items })));
      setDistBuckets(distResult.buckets);
    }
    load()
      .catch(e => setError(e instanceof Error ? e.message : t('error', { ns: 'best' })))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Chart-Daten berechnen
  const valid = distBuckets.filter(b => b.best_speed_kmh !== null);
  let chartData: {
    pts: { x: number; y: number | null; b: BestByDistanceBucket }[];
    valid2: { x: number; y: number; b: BestByDistanceBucket }[];
    path: string;
    minS: number; maxS: number;
    yTicks: { v: number; y: number }[];
    stepX: number;
  } | null = null;

  if (valid.length >= 2) {
    const speeds = valid.map(b => b.best_speed_kmh as number);
    const minS = Math.floor(Math.min(...speeds)) - 1;
    const maxS = Math.ceil(Math.max(...speeds)) + 1;
    const n = distBuckets.length;
    const stepX = innerW / (n - 1);

    const pts = distBuckets.map((b, i) => ({
      x: PAD.l + i * stepX,
      y: b.best_speed_kmh !== null
        ? PAD.t + innerH - ((b.best_speed_kmh - minS) / (maxS - minS)) * innerH
        : null,
      b,
    }));
    const valid2 = pts.filter(p => p.y !== null) as { x: number; y: number; b: BestByDistanceBucket }[];

    let path = '';
    if (valid2.length >= 2) {
      path = `M ${valid2[0].x} ${valid2[0].y}`;
      for (let i = 1; i < valid2.length; i++) {
        const p0 = valid2[i - 1], p1 = valid2[i];
        const cx = (p0.x + p1.x) / 2;
        path += ` C ${cx} ${p0.y} ${cx} ${p1.y} ${p1.x} ${p1.y}`;
      }
    }

    const range = maxS - minS;
    const tickStep = range <= 6 ? 1 : 2;
    const yTicks: { v: number; y: number }[] = [];
    for (let v = Math.ceil(minS / tickStep) * tickStep; v <= maxS; v += tickStep) {
      yTicks.push({ v, y: PAD.t + innerH - ((v - minS) / (maxS - minS)) * innerH });
    }

    chartData = { pts, valid2, path, minS, maxS, yTicks, stepX };
  }

  return (
    <div className="space-y-8">
      <PageHeader title={t('title', { ns: 'best' })} />

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>
      )}

      {/* Bestzeiten nach Distanz */}
      {loading ? (
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      ) : distBuckets.length > 0 && (
        <Card className="overflow-hidden shadow-sm">
          <CardHeader className="border-b border-border px-4 py-3">
            <CardTitle className="text-base">{t('distanceChart.title', { ns: 'best' })}</CardTitle>
            <p className="text-xs text-muted-foreground">{t('distanceChart.subtitle', { ns: 'best' })}</p>
          </CardHeader>
          <CardContent className="p-0">
            {chartData ? (
              <>
                <div className="px-4 pt-4 pb-2">
                  <svg viewBox={`0 0 ${CW} ${CH}`} width="100%" className="block">
                    <defs>
                      <linearGradient id="distGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#f97316" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="#f97316" stopOpacity={0} />
                      </linearGradient>
                    </defs>

                    {/* Gitternetz */}
                    {chartData.yTicks.map(tick => (
                      <g key={tick.v}>
                        <line x1={PAD.l} y1={tick.y} x2={CW - PAD.r} y2={tick.y} stroke="#e5e7eb" strokeWidth={1} />
                        <text x={PAD.l - 6} y={tick.y + 4} textAnchor="end" fontSize={10} fill="#9ca3af">{tick.v}</text>
                      </g>
                    ))}

                    {/* X-Achse */}
                    <line x1={PAD.l} y1={PAD.t + innerH} x2={CW - PAD.r} y2={PAD.t + innerH} stroke="#e5e7eb" strokeWidth={1} />

                    {/* Fläche */}
                    {chartData.valid2.length >= 2 && (
                      <path
                        d={`${chartData.path} L ${chartData.valid2[chartData.valid2.length - 1].x} ${PAD.t + innerH} L ${chartData.valid2[0].x} ${PAD.t + innerH} Z`}
                        fill="url(#distGrad)" opacity={0.4}
                      />
                    )}
                    {/* Kurvenlinie */}
                    {chartData.valid2.length >= 2 && (
                      <path d={chartData.path} fill="none" stroke="#f97316" strokeWidth={2.5} strokeLinejoin="round" />
                    )}

                    {/* Datenpunkte + Labels */}
                    {chartData.pts.map((pt, i) => (
                      <g key={i}>
                        <text x={pt.x} y={PAD.t + innerH + 16} textAnchor="middle" fontSize={10} fill="#9ca3af">
                          {pt.b.distance_km} km
                        </text>
                        {pt.y !== null && (
                          <>
                            {/* Hover-Zone */}
                            <rect
                              x={pt.x - chartData!.stepX / 2} y={PAD.t}
                              width={chartData!.stepX} height={innerH}
                              fill="transparent" style={{ cursor: 'pointer' }}
                              onMouseEnter={() => setHoveredBucket(i)}
                              onMouseLeave={() => setHoveredBucket(null)}
                            />
                            <circle
                              cx={pt.x} cy={pt.y}
                              r={hoveredBucket === i ? 6 : 4}
                              fill={hoveredBucket === i ? '#f97316' : 'white'}
                              stroke="#f97316" strokeWidth={2}
                              style={{ transition: 'r 0.15s' }}
                            />
                            {/* Tooltip (nur bei Hover – siehe dataviz-Guideline: kein Wert an jedem Punkt) */}
                            {hoveredBucket === i && (
                              <g>
                                {(() => {
                                  const bx = pt.x > CW - 180 ? pt.x - 160 : pt.x + 10;
                                  const by = Math.max(PAD.t + 4, pt.y - 50);
                                  return (
                                    <>
                                      <rect x={bx} y={by} width={155} height={56} rx={6} fill="white" stroke="#e5e7eb" />
                                      <text x={bx + 8} y={by + 15} fontSize={10} fontWeight={600} fill="#f97316">
                                        {pt.b.actual_distance_km} km · {fmtTime(pt.b.best_time_s)}
                                      </text>
                                      <text x={bx + 8} y={by + 29} fontSize={9} fill="#9ca3af">
                                        {pt.b.activity_name ?? ''}
                                      </text>
                                      <text x={bx + 8} y={by + 43} fontSize={9} fill="#6b7280">
                                        {fmtDate2(pt.b.date)}
                                      </text>
                                    </>
                                  );
                                })()}
                              </g>
                            )}
                          </>
                        )}
                      </g>
                    ))}

                    {/* Y-Achsen-Label */}
                    <text
                      x={PAD.l - 36} y={PAD.t + innerH / 2}
                      textAnchor="middle" fontSize={10} fill="#9ca3af"
                      transform={`rotate(-90, ${PAD.l - 36}, ${PAD.t + innerH / 2})`}
                    >{t('distanceChart.yAxisLabel', { ns: 'best' })}</text>
                  </svg>
                </div>

                {/* Tabelle */}
                <div className="border-t border-border overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border text-left uppercase tracking-wide text-muted-foreground">
                        <th className="px-4 py-2 font-medium">{t('distanceChart.table.distance', { ns: 'best' })}</th>
                        <th className="px-4 py-2 font-medium">{t('distanceChart.table.bestTime', { ns: 'best' })}</th>
                        <th className="px-4 py-2 font-medium">{t('distanceChart.table.avgSpeed', { ns: 'best' })}</th>
                        <th className="px-4 py-2 font-medium">{t('distanceChart.table.activity', { ns: 'best' })}</th>
                        <th className="px-4 py-2 font-medium">{t('distanceChart.table.date', { ns: 'best' })}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {distBuckets.map(b => (
                        <tr key={b.distance_km} className="hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-2 font-semibold">{b.distance_km} km</td>
                          {b.activity_id ? (
                            <>
                              <td className="px-4 py-2 font-mono font-semibold text-amber-500">{fmtTime(b.best_time_s)}</td>
                              <td className="px-4 py-2 text-muted-foreground">Ø {b.best_speed_kmh} km/h</td>
                              <td className="px-4 py-2">
                                <Link to={`/activities/${b.activity_id}`} className="block max-w-[200px] truncate text-muted-foreground hover:text-primary transition-colors">
                                  {b.activity_name}
                                </Link>
                              </td>
                              <td className="px-4 py-2 text-muted-foreground">{fmtDate2(b.date)}</td>
                            </>
                          ) : (
                            <td className="px-4 py-2 text-muted-foreground" colSpan={4}>{t('distanceChart.table.noSegment', { ns: 'best' })}</td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p className="px-4 py-6 text-sm text-muted-foreground">{t('distanceChart.noData', { ns: 'best' })}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Rekord-Kategorien */}
      {loading ? (
        <div className="grid gap-6 md:grid-cols-2">
          {[0, 1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-48 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {categories.map(cat => (
            <Card key={cat.key} className="overflow-hidden shadow-sm">
              <CardHeader className="border-b border-border px-4 py-3">
                <CardTitle className="text-base">{cat.label}</CardTitle>
              </CardHeader>
              <ol className="divide-y divide-border/50">
                {cat.items.length === 0 ? (
                  <li className="px-4 py-3 text-sm text-muted-foreground">{t('noData', { ns: 'best' })}</li>
                ) : cat.items.map((act, i) => (
                  <li key={act.id}>
                    <Link
                      to={`/activities/${act.id}`}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors"
                    >
                      <span className="w-7 shrink-0 text-center text-lg">{RANK_SYMBOLS[i]}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{rideTitle(act, t)}</p>
                        <p className="text-xs text-muted-foreground">{fmtDate(act.start_date)}</p>
                      </div>
                      <span className={`shrink-0 text-sm font-semibold ${RANK_COLORS[i]}`}>
                        {cat.format(act)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
