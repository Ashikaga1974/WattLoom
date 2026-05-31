import { useEffect, useState } from 'react';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Area,
  AreaChart,
} from 'recharts';
import { PageHeader } from '@/components/ui/page-header';
import { api } from '@/lib/api';
import { Settings } from 'lucide-react';
import { Link } from 'react-router-dom';

interface FtpData {
  trend: { label: string; best_w: number }[];
  profile: { label: string; best_w: number; count: number }[];
  current_ftp: number | null;
  best_ever: { w: number; date: string } | null;
}

function shortLabel(lbl: string): string {
  // "2023-Q2" → "Q2'23"
  const [y, q] = lbl.split('-');
  return `${q}'${y.slice(2)}`;
}

function wkg(watts: number, weight: number): string {
  return (watts / weight).toFixed(2) + ' w/kg';
}

function vo2max(watts: number, weight: number): number {
  return (watts / weight) * 10.8 + 7;
}

function vo2maxCategory(v: number): string {
  if (v >= 55) return 'Exzellent';
  if (v >= 46) return 'Sehr gut';
  if (v >= 38) return 'Gut';
  if (v >= 30) return 'Befriedigend';
  return 'Verbesserungswürdig';
}

export default function FtpPage() {
  const [data, setData] = useState<FtpData | null>(null);
  const [weightKg, setWeightKg] = useState<number | null>(null);
  const [birthYear, setBirthYear] = useState<number | null>(null);
  const [ftpManual, setFtpManual] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.ftp(), api.getSettings()])
      .then(([res, cfg]) => {
        setData(res);
        setWeightKg(cfg.weight_kg);
        setBirthYear(cfg.birth_year);
        setFtpManual(cfg.ftp_manual);
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Fehler'))
      .finally(() => setLoading(false));
  }, []);

  // Primärer FTP: manuell wenn vorhanden, sonst berechnet
  const primaryFtp = ftpManual ?? data?.current_ftp ?? null;

  const chartData = data?.trend.map(p => ({
    label: shortLabel(p.label),
    watt: Math.round(p.best_w),
    fullLabel: p.label,
  })) ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="FTP-Analyse"
        subtitle="HR-korrigierte Schätzung · avg_power × 0,90 ÷ (avg_hr / HRmax) · exakte FTP per 20-min-Test in Einstellungen hinterlegen"
      />

      {error && (
        <div className="rounded border border-destructive/50 bg-destructive/10 p-4 text-destructive text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {/* Kennzahlen */}
          <div className="flex flex-wrap gap-3">
            {/* Primäre FTP */}
            <div className="rounded-xl border bg-card shadow-sm px-4 py-3 text-center min-w-36">
              {ftpManual ? (
                <>
                  <p className="text-xs text-muted-foreground">FTP (manuell)</p>
                  <p className="text-2xl font-bold text-orange-500 mt-0.5">
                    {ftpManual} <span className="text-base font-normal text-muted-foreground">W</span>
                  </p>
                  {weightKg && (
                    <p className="text-xs text-orange-400/70 mt-0.5">{wkg(ftpManual, weightKg)}</p>
                  )}
                </>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">Geschätzt (90 Tage)</p>
                  <p className="text-2xl font-bold text-orange-500 mt-0.5">
                    {data?.current_ftp != null ? Math.round(data.current_ftp) : '–'}{' '}
                    <span className="text-base font-normal text-muted-foreground">W</span>
                  </p>
                  {data?.current_ftp && weightKg && (
                    <p className="text-xs text-orange-400/70 mt-0.5">{wkg(data.current_ftp, weightKg)}</p>
                  )}
                </>
              )}
            </div>

            {/* VO2max */}
            {primaryFtp && weightKg && (
              <div className="rounded-xl border bg-card shadow-sm px-4 py-3 text-center min-w-36">
                {(() => {
                  const v = vo2max(primaryFtp, weightKg);
                  const ageYrs = birthYear ? new Date().getFullYear() - birthYear : null;
                  return (
                    <>
                      <p className="text-xs text-muted-foreground">
                        VO2max (Schätzung{ageYrs ? `, ${ageYrs} J.` : ''})
                      </p>
                      <p className="text-2xl font-bold text-sky-500 mt-0.5">
                        {v.toFixed(1)}{' '}
                        <span className="text-base font-normal text-muted-foreground">ml/kg/min</span>
                      </p>
                      <p className="text-xs text-sky-400/70 mt-0.5">{vo2maxCategory(v)}</p>
                    </>
                  );
                })()}
              </div>
            )}

            {/* Bestes je */}
            {data?.best_ever && (
              <div className="rounded-xl border bg-card shadow-sm px-4 py-3 text-center min-w-36">
                <p className="text-xs text-muted-foreground">Bestes Ø je (45–75 min)</p>
                <p className="text-2xl font-bold text-yellow-500 mt-0.5">
                  {Math.round(data.best_ever.w)}{' '}
                  <span className="text-base font-normal text-muted-foreground">W</span>
                </p>
                {weightKg && (
                  <p className="text-xs text-yellow-400/70 mt-0.5">{wkg(data.best_ever.w, weightKg)}</p>
                )}
                <p className="text-xs text-muted-foreground mt-0.5">
                  {new Date(data.best_ever.date).toLocaleDateString('de-DE', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </p>
              </div>
            )}

            {/* Hinweis / Link zu Einstellungen */}
            {(!weightKg || !ftpManual) && (
              <Link
                to="/settings"
                className="rounded-xl border bg-card shadow-sm px-4 py-3 max-w-xs text-xs text-muted-foreground flex items-start gap-2 hover:border-primary/50 transition-colors"
              >
                <Settings className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  {!ftpManual && !weightKg
                    ? 'FTP und Gewicht in Einstellungen hinterlegen'
                    : !ftpManual
                    ? 'Eigene FTP in Einstellungen hinterlegen (20-min-Test × 0,95)'
                    : 'Gewicht für w/kg hinterlegen'}
                </span>
              </Link>
            )}

            {/* Schätz-Hinweis wenn manuell gesetzt */}
            {ftpManual && data?.current_ftp && (
              <div className="rounded-xl border bg-card shadow-sm px-4 py-3 max-w-xs text-xs text-muted-foreground">
                HR-korrigierte Schätzung (90 Tage): ~{Math.round(data.current_ftp)} W
                <span className="text-muted-foreground/60 block mt-0.5">
                  avg_power × 0,90 ÷ (avg_hr / HRmax)
                </span>
              </div>
            )}
          </div>

          {/* FTP-Trend Chart */}
          {chartData.length > 0 && (
            <div className="rounded-xl border bg-card shadow-sm p-4">
              <p className="text-sm font-medium mb-4">Trend (quartalsweise)</p>
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={chartData} margin={{ top: 16, right: 16, bottom: 24, left: 40 }}>
                  <defs>
                    <linearGradient id="ftpGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#fc4c02" stopOpacity={0.2} />
                      <stop offset="100%" stopColor="#fc4c02" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    tickLine={false}
                    axisLine={{ stroke: 'hsl(var(--border))' }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    tickLine={false}
                    axisLine={false}
                    label={{
                      value: 'Watt',
                      angle: -90,
                      position: 'insideLeft',
                      offset: -24,
                      style: { fontSize: 11, fill: 'hsl(var(--muted-foreground))' },
                    }}
                    domain={['auto', 'auto']}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      fontSize: 12,
                    }}
                    formatter={(v: unknown) => `${v} W`}
                    labelFormatter={(_label: unknown, payload: readonly { payload?: { fullLabel?: string } }[]) =>
                      payload?.[0]?.payload?.fullLabel ?? ''
                    }
                  />
                  {/* Best-ever Referenzlinie */}
                  {data?.best_ever && (
                    <ReferenceLine
                      y={Math.round(data.best_ever.w)}
                      stroke="#eab308"
                      strokeDasharray="6 3"
                      strokeOpacity={0.5}
                      label={{
                        value: `Best: ${Math.round(data.best_ever.w)} W`,
                        position: 'right',
                        fontSize: 10,
                        fill: '#eab308',
                      }}
                    />
                  )}
                  <Area
                    type="monotone"
                    dataKey="watt"
                    stroke="#fc4c02"
                    strokeWidth={2.5}
                    fill="url(#ftpGrad)"
                    dot={{ fill: '#fc4c02', r: 4, strokeWidth: 0 }}
                    activeDot={{ fill: '#fc4c02', r: 6, stroke: 'white', strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </div>
  );
}
