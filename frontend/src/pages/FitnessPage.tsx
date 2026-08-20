import { useEffect, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from 'recharts';
import { TrendingUp, Zap, Wind, Calendar, TrendingDown, Minus } from 'lucide-react';

import { api, type FitnessFingerprint } from '@/lib/api';
import { useConfig } from '@/lib/config-context';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ChartTooltip } from '@/components/ui/chart-tooltip';

// Zählt von 0 auf target hoch (cubic ease-out)
function useCountUp(target: number, duration = 1400): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!target) { setValue(0); return; }
    let raf: number;
    const start = performance.now();
    function tick(now: number) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(eased * target));
      if (t < 1) raf = requestAnimationFrame(tick);
      else setValue(target);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

const LEVEL_CONFIG: Record<string, { color: string; bg: string; border: string; text: string }> = {
  'Einsteiger':      { color: '#ef4444', bg: 'bg-red-900/20',     border: 'border-red-700/40',     text: 'text-red-400' },
  'Aktiv':           { color: '#f97316', bg: 'bg-orange-900/20',  border: 'border-orange-700/40',  text: 'text-orange-400' },
  'Enthusiast':      { color: '#eab308', bg: 'bg-yellow-900/20',  border: 'border-yellow-700/40',  text: 'text-yellow-400' },
  'Fortgeschritten': { color: '#3b82f6', bg: 'bg-blue-900/20',    border: 'border-blue-700/40',    text: 'text-blue-400' },
  'Amateur':         { color: '#8b5cf6', bg: 'bg-violet-900/20',  border: 'border-violet-700/40',  text: 'text-violet-400' },
  'Elite':           { color: '#10b981', bg: 'bg-emerald-900/20', border: 'border-emerald-700/40', text: 'text-emerald-400' },
};

// Score-Schwellen für ReferenceLine-Marker im History-Chart
const LEVEL_THRESHOLDS = [
  { y: 30, label: 'Aktiv',           color: '#f97316' },
  { y: 45, label: 'Enthusiast',      color: '#eab308' },
  { y: 60, label: 'Fortgeschritten', color: '#3b82f6' },
  { y: 75, label: 'Amateur',         color: '#8b5cf6' },
];

const MONTHS_DE = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

function fmtMonth(m: string): string {
  const [year, month] = m.split('-');
  return `${MONTHS_DE[parseInt(month) - 1]} '${year.slice(2)}`;
}

// Kreisbogen-Gauge (Halbkreis, 180°)
const R = 90, CX = 120, CY = 118;
const HALF_CIRC = Math.PI * R; // ~282.7

function ArcGauge({ score, color }: { score: number; color: string }) {
  const animated = useCountUp(score, 1400);
  const dashLen = HALF_CIRC * (Math.max(0, Math.min(100, animated)) / 100);

  return (
    <svg viewBox="0 0 240 128" className="w-full max-w-[260px] mx-auto select-none">
      {/* Hintergrund-Bogen */}
      <path
        d={`M ${CX - R},${CY} A ${R},${R} 0 0 1 ${CX + R},${CY}`}
        fill="none"
        stroke="var(--muted)"
        strokeWidth={16}
        strokeLinecap="round"
      />
      {/* Fortschritts-Bogen */}
      <path
        d={`M ${CX - R},${CY} A ${R},${R} 0 0 1 ${CX + R},${CY}`}
        fill="none"
        stroke={color}
        strokeWidth={16}
        strokeLinecap="round"
        strokeDasharray={`${dashLen} ${HALF_CIRC}`}
        style={{ transition: 'stroke-dasharray 0.05s linear' }}
      />
      {/* Innerer Zeiger-Punkt */}
      <circle
        cx={CX + R * Math.cos(Math.PI - (dashLen / HALF_CIRC) * Math.PI)}
        cy={CY - R * Math.sin((dashLen / HALF_CIRC) * Math.PI)}
        r={6}
        fill={color}
        style={{ transition: 'cx 0.05s linear, cy 0.05s linear' }}
      />
      {/* Score-Zahl */}
      <text
        x={CX}
        y={92}
        textAnchor="middle"
        fontSize={52}
        fontWeight="700"
        fill="var(--foreground)"
        fontFamily="inherit"
      >
        {animated}
      </text>
      {/* /100 */}
      <text
        x={CX}
        y={112}
        textAnchor="middle"
        fontSize={13}
        fill="var(--muted-foreground)"
        fontFamily="inherit"
      >
        von 100 Punkten
      </text>
    </svg>
  );
}

// Einzelne Komponenten-Karte
function ComponentCard({
  icon,
  label,
  score,
  max,
  value,
  color,
  description,
}: {
  icon: React.ReactNode;
  label: string;
  score: number;
  max: number;
  value: string;
  color: string;
  description: string;
}) {
  const pct = Math.round((score / max) * 100);
  return (
    <Card>
      <CardContent className="pt-5 pb-4 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span style={{ color }}>{icon}</span>
            <span className="text-sm font-medium leading-tight">{label}</span>
          </div>
          <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
            {score}/{max} Pkt.
          </span>
        </div>
        {/* Fortschrittsbalken */}
        <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
          <div
            className="h-2 rounded-full transition-all duration-700"
            style={{ width: `${pct}%`, backgroundColor: color }}
          />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{description}</span>
          <span className="text-sm font-semibold tabular-nums" style={{ color }}>
            {value}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

// TSB-Farbe für den Form-Balken
function tsbColor(tsb: number): string {
  if (tsb >= 5)    return '#4ade80';
  if (tsb >= 0)    return '#facc15';
  if (tsb >= -10)  return '#fb923c';
  return '#f87171';
}

// Tooltip für History-Chart
function HistoryTooltip({ active, payload }: { active?: boolean; payload?: any[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  const cfg = LEVEL_CONFIG[d?.level] ?? LEVEL_CONFIG['Einsteiger'];
  return (
    <ChartTooltip
      active={active}
      label={fmtMonth(d?.month ?? '')}
      rows={[
        {
          label: 'Score',
          value: `${d?.score} / 100`,
          color: cfg.color,
        },
        {
          label: 'Level',
          value: d?.level ?? '',
        },
      ]}
    />
  );
}

export default function FitnessPage() {
  const config = useConfig();
  const [data, setData] = useState<FitnessFingerprint | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.fitnessFingerprint()
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Fitness-Fingerprint" subtitle="Dein aktueller Fitnesszustand auf einen Blick" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-32" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Fitness-Fingerprint" />
        <Card><CardContent className="pt-6 text-muted-foreground">{error ?? 'Keine Daten.'}</CardContent></Card>
      </div>
    );
  }

  const { score, level, components, trend, insight, history } = data;
  const cfg = LEVEL_CONFIG[level] ?? LEVEL_CONFIG['Einsteiger'];

  // Radar-Daten: alle Achsen auf 0-100% normiert
  const radarData = [
    {
      axis: 'CTL',
      value: Math.round((components.ctl.score / components.ctl.max) * 100),
      fullMark: 100,
    },
    {
      axis: 'Effizienz',
      value: Math.round((components.efficiency.score / components.efficiency.max) * 100),
      fullMark: 100,
    },
    {
      axis: 'Form',
      value: Math.round((components.form.score / components.form.max) * 100),
      fullMark: 100,
    },
    {
      axis: 'Kontinuität',
      value: Math.round((components.consistency.score / components.consistency.max) * 100),
      fullMark: 100,
    },
  ];

  // Wert-Texte für die Komponenten-Karten
  const ctlVal = components.ctl.value !== null
    ? `CTL ${components.ctl.value}`
    : '—';
  const effVal = components.efficiency.value !== null
    ? `${components.efficiency.value.toFixed(1)} · P${components.efficiency.percentile ?? '—'}`
    : '—';
  const formVal = components.form.value !== null
    ? `TSB ${components.form.value >= 0 ? '+' : ''}${components.form.value}`
    : '—';
  const consVal = `${components.consistency.value}/8 Wo.`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Fitness-Fingerprint"
        subtitle="Gesamtscore aus Trainingslast, Effizienz, Form und Kontinuität"
      />

      {/* Hero: Gauge + Radar */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

        {/* Gauge-Karte */}
        <Card className="lg:col-span-3">
          <CardContent className="pt-6 flex flex-col items-center gap-4">
            <ArcGauge score={score} color={cfg.color} />

            {/* Level-Badge + Trend */}
            <div className="flex items-center gap-3">
              <span
                className={`text-sm font-semibold px-4 py-1.5 rounded-full border ${cfg.bg} ${cfg.text} ${cfg.border}`}
              >
                {level}
              </span>
              {trend === 'up' && (
                <span className="flex items-center gap-1 text-green-400 text-sm font-medium">
                  <TrendingUp size={14} /> Aufwärtstrend
                </span>
              )}
              {trend === 'down' && (
                <span className="flex items-center gap-1 text-orange-400 text-sm font-medium">
                  <TrendingDown size={14} /> Abwärtstrend
                </span>
              )}
              {trend === 'neutral' && (
                <span className="flex items-center gap-1 text-muted-foreground text-sm">
                  <Minus size={14} /> Stabil
                </span>
              )}
            </div>

            {/* Insight-Text */}
            <p className="text-sm text-muted-foreground text-center leading-relaxed max-w-sm">
              {insight}
            </p>
          </CardContent>
        </Card>

        {/* Radar-Karte */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm">Stärken-Profil</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ResponsiveContainer width="100%" height={config.chart_height}>
              <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="72%">
                <PolarGrid stroke="var(--border)" />
                <PolarAngleAxis
                  dataKey="axis"
                  tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                />
                <PolarRadiusAxis
                  domain={[0, 100]}
                  tick={false}
                  axisLine={false}
                />
                <Radar
                  dataKey="value"
                  stroke={cfg.color}
                  fill={cfg.color}
                  fillOpacity={0.18}
                  strokeWidth={2}
                />
              </RadarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Komponenten-Karten */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <ComponentCard
          icon={<TrendingUp size={16} />}
          label="Trainingslast (CTL)"
          score={components.ctl.score}
          max={components.ctl.max}
          value={ctlVal}
          color="#3b82f6"
          description="42-Tage-Ø aus hrTSS"
        />
        <ComponentCard
          icon={<Zap size={16} />}
          label="Aerobe Effizienz"
          score={components.efficiency.score}
          max={components.efficiency.max}
          value={effVal}
          color="#10b981"
          description="Speed/HR-Verhältnis, 3M-Mittel"
        />
        <ComponentCard
          icon={<Wind size={16} />}
          label="Form (TSB)"
          score={components.form.score}
          max={components.form.max}
          value={formVal}
          color={tsbColor(components.form.value ?? 0)}
          description="CTL − ATL (Frische)"
        />
        <ComponentCard
          icon={<Calendar size={16} />}
          label="Kontinuität"
          score={components.consistency.score}
          max={components.consistency.max}
          value={consVal}
          color="#8b5cf6"
          description="Aktive Wochen (letzte 8)"
        />
      </div>

      {/* Score-History */}
      {history.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Score-Verlauf (letzte 13 Monate)</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ResponsiveContainer width="100%" height={config.chart_height}>
              <LineChart data={history} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="month"
                  tickFormatter={fmtMonth}
                  tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                  width={28}
                />
                <Tooltip content={<HistoryTooltip />} />
                {/* Level-Schwellen als gestrichelte Linien */}
                {LEVEL_THRESHOLDS.map(t => (
                  <ReferenceLine
                    key={t.y}
                    y={t.y}
                    stroke={t.color}
                    strokeDasharray="4 4"
                    strokeOpacity={0.5}
                    label={{
                      value: t.label,
                      position: 'insideTopRight',
                      fontSize: 10,
                      fill: t.color,
                    }}
                  />
                ))}
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke={cfg.color}
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: cfg.color, stroke: 'var(--background)', strokeWidth: 2 }}
                  activeDot={{ r: 5, fill: cfg.color }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Legende / Erklärung */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Score-Berechnung</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-sm text-muted-foreground">
            <div className="flex justify-between gap-4">
              <span className="font-medium text-blue-400">Trainingslast (CTL)</span>
              <span>bis 35 Punkte</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="font-medium text-emerald-400">Aerobe Effizienz</span>
              <span>bis 25 Punkte</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="font-medium text-amber-400">Form (TSB)</span>
              <span>bis 20 Punkte</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="font-medium text-violet-400">Kontinuität</span>
              <span>bis 20 Punkte</span>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            {Object.entries(LEVEL_CONFIG).map(([lv, lc]) => (
              <span
                key={lv}
                className={`text-xs px-2.5 py-0.5 rounded-full border ${lc.bg} ${lc.text} ${lc.border}`}
              >
                {lv}
              </span>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
            CTL = 42-Tage-EMA aus hrTSS. Effizienz = Ø Speed (km/h) / Ø HR × 100, letzter 3-Monats-Schnitt,
            bewertet als Perzentile deiner persönlichen Geschichte.
            Form = CTL − ATL (7-Tage EMA). Kontinuität = Wochen mit mind. 1 Ride in den letzten 8 Wochen.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
