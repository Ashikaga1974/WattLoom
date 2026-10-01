import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from 'recharts';
import type { TooltipPayloadEntry } from 'recharts';
import { TrendingUp, Zap, Wind, Calendar, TrendingDown, Minus } from 'lucide-react';

import { api, type FitnessFingerprint } from '@/lib/api';
import { useConfig } from '@/lib/config-context';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ChartTooltip } from '@/components/ui/chart-tooltip';
import { EmptyState } from '@/components/ui/empty-state';
import { useCountUp } from '@/hooks/use-count-up';

// Bewusst eine Farbe statt Level-Farben: die Level-Schwellen sind selbst definierte WattLoom-Regeln,
// farbige Stufen wie "Elite" wirkten wie eine objektive Einstufung. Das Backend liefert `level` weiter.
const SCORE_COLOR = 'var(--primary)';

/**
 * Score-Veränderung gegenüber demselben Monat ein Jahr zuvor.
 * @param history Monatliche Scores (month = "YYYY-MM"), aufsteigend sortiert
 * @returns Differenz in Punkten oder null, wenn für den Vorjahresmonat kein Score vorliegt
 */
function scoreDeltaVsLastYear(history: { month: string; score: number }[]): number | null {
  const latest = history[history.length - 1];
  if (!latest) return null;
  const [year, month] = latest.month.split('-');
  const previousYearMonth = `${parseInt(year) - 1}-${month}`;
  const previous = history.find(h => h.month === previousYearMonth);
  return previous ? latest.score - previous.score : null;
}

function fmtMonth(m: string, months: string[]): string {
  const [year, month] = m.split('-');
  return `${months[parseInt(month) - 1]} '${year.slice(2)}`;
}

// Kreisbogen-Gauge (Halbkreis, 180°)
const R = 90, CX = 120, CY = 118;
const HALF_CIRC = Math.PI * R; // ~282.7

function ArcGauge({ score, color }: { score: number; color: string }) {
  const { t } = useTranslation('fitness');
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
        {t('gauge.outOf100')}
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
  const { t } = useTranslation('fitness');
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
            {t('componentCard.points', { score, max })}
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
function HistoryTooltip({ active, payload }: { active?: boolean; payload?: readonly TooltipPayloadEntry[] }) {
  const { t } = useTranslation('fitness');
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  const months = t('months', { returnObjects: true }) as string[];
  return (
    <ChartTooltip
      active={active}
      label={fmtMonth(d?.month ?? '', months)}
      rows={[
        {
          label: t('history.tooltipScore'),
          value: `${d?.score} / 100`,
          color: SCORE_COLOR,
        },
      ]}
    />
  );
}

export default function FitnessPage() {
  const { t } = useTranslation('fitness');
  const config = useConfig();
  const [data, setData] = useState<FitnessFingerprint | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const months = t('months', { returnObjects: true }) as string[];

  useEffect(() => {
    api.fitnessFingerprint()
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={t('page.title')} subtitle={t('page.subtitleLoading')} />
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
        <PageHeader title={t('page.title')} />
        <EmptyState message={error || t('page.noData')} />
      </div>
    );
  }

  const { score, components, trend, insight_parts, history } = data;

  // Frische Installation ohne Aktivitäten: Backend liefert components: {} (siehe pmc.py),
  // ohne diese Prüfung crasht der Zugriff auf components.ctl.score etc. weiter unten.
  // Alle vier Felder werden hier geprüft, damit TypeScript sie ab hier als definiert erkennt.
  if (!components.ctl || !components.efficiency || !components.form || !components.consistency) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={t('page.title')} />
        <EmptyState message={t('page.noData')} />
      </div>
    );
  }

  const insight = insight_parts.map(code => t(`insights.${code}`)).join(' ');
  const deltaVsLastYear = scoreDeltaVsLastYear(history);

  // Radar-Daten: alle Achsen auf 0-100% normiert
  const radarData = [
    {
      axis: 'CTL',
      value: Math.round((components.ctl.score / components.ctl.max) * 100),
      fullMark: 100,
    },
    {
      axis: t('radar.axisEfficiency'),
      value: Math.round((components.efficiency.score / components.efficiency.max) * 100),
      fullMark: 100,
    },
    {
      axis: t('radar.axisForm'),
      value: Math.round((components.form.score / components.form.max) * 100),
      fullMark: 100,
    },
    {
      axis: t('radar.axisConsistency'),
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
  const consVal = t('components.consistency.unit', { count: components.consistency.value });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('page.title')}
        subtitle={t('page.subtitle')}
      />

      {/* Hero: Gauge + Radar */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

        {/* Gauge-Karte */}
        <Card className="lg:col-span-3">
          <CardContent className="pt-6 flex flex-col items-center gap-4">
            <ArcGauge score={score} color={SCORE_COLOR} />

            {/* Veränderung zum Vorjahr + Trend */}
            <div className="flex items-center gap-3">
              {deltaVsLastYear !== null && (
                <span
                  className="text-sm font-semibold px-4 py-1.5 rounded-full border border-border bg-muted/40 cursor-help"
                  title={t('vsLastYearHint')}
                >
                  {t('vsLastYear', { delta: `${deltaVsLastYear >= 0 ? '+' : '−'}${Math.abs(deltaVsLastYear)}` })}
                </span>
              )}
              {trend === 'up' && (
                <span className="flex items-center gap-1 text-green-400 text-sm font-medium cursor-help" title={t('trendHint')}>
                  <TrendingUp size={14} /> {t('trend.up')}
                </span>
              )}
              {trend === 'down' && (
                <span className="flex items-center gap-1 text-orange-400 text-sm font-medium cursor-help" title={t('trendHint')}>
                  <TrendingDown size={14} /> {t('trend.down')}
                </span>
              )}
              {trend === 'neutral' && (
                <span className="flex items-center gap-1 text-muted-foreground text-sm cursor-help" title={t('trendHint')}>
                  <Minus size={14} /> {t('trend.neutral')}
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
            <CardTitle className="text-sm">{t('radar.title')}</CardTitle>
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
                  stroke={SCORE_COLOR}
                  fill={SCORE_COLOR}
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
          label={t('components.ctl.label')}
          score={components.ctl.score}
          max={components.ctl.max}
          value={ctlVal}
          color="#3b82f6"
          description={t('components.ctl.description')}
        />
        <ComponentCard
          icon={<Zap size={16} />}
          label={t('components.efficiency.label')}
          score={components.efficiency.score}
          max={components.efficiency.max}
          value={effVal}
          color="#10b981"
          description={t('components.efficiency.description')}
        />
        <ComponentCard
          icon={<Wind size={16} />}
          label={t('components.form.label')}
          score={components.form.score}
          max={components.form.max}
          value={formVal}
          color={tsbColor(components.form.value ?? 0)}
          description={t('components.form.description')}
        />
        <ComponentCard
          icon={<Calendar size={16} />}
          label={t('components.consistency.label')}
          score={components.consistency.score}
          max={components.consistency.max}
          value={consVal}
          color="#8b5cf6"
          description={t('components.consistency.description')}
        />
      </div>

      {/* Score-History */}
      {history.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t('history.title')}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ResponsiveContainer width="100%" height={config.chart_height}>
              <LineChart data={history} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="month"
                  tickFormatter={(m: string) => fmtMonth(m, months)}
                  tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                  interval={Math.max(0, Math.floor(history.length / 10) - 1)}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                  width={28}
                />
                <Tooltip content={<HistoryTooltip />} />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke={SCORE_COLOR}
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: SCORE_COLOR, stroke: 'var(--background)', strokeWidth: 2 }}
                  activeDot={{ r: 5, fill: SCORE_COLOR }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Legende / Erklärung */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t('legend.title')}</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-sm text-muted-foreground">
            <div className="flex justify-between gap-4">
              <span className="font-medium text-blue-400">{t('components.ctl.label')}</span>
              <span>{t('legend.ctlPoints')}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="font-medium text-emerald-400">{t('components.efficiency.label')}</span>
              <span>{t('legend.efficiencyPoints')}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="font-medium text-amber-400">{t('components.form.label')}</span>
              <span>{t('legend.formPoints')}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="font-medium text-violet-400">{t('components.consistency.label')}</span>
              <span>{t('legend.consistencyPoints')}</span>
            </div>
          </div>
          <p className="mt-4 text-xs text-muted-foreground leading-relaxed">
            {t('legend.explanation')}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
