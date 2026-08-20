import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type PmcDay, type PmcResponse, type WeeklyVolume } from '@/lib/api';

// TSB-Zone → Farbe + Label (labelKey wird an den Render-Stellen mit t() übersetzt)
function tsbZone(tsb: number) {
  if (tsb > 25) return { labelKey: 'tsbZones.veryFresh', textClass: 'text-sky-300', hex: '#7dd3fc', bgClass: 'bg-sky-900/20', borderClass: 'border-sky-700/40' };
  if (tsb > 5) return { labelKey: 'tsbZones.raceForm', textClass: 'text-green-400', hex: '#4ade80', bgClass: 'bg-green-900/20', borderClass: 'border-green-700/40' };
  if (tsb > -10) return { labelKey: 'tsbZones.normal', textClass: 'text-yellow-400', hex: '#facc15', bgClass: 'bg-yellow-900/20', borderClass: 'border-yellow-700/40' };
  if (tsb > -25) return { labelKey: 'tsbZones.trainingBlock', textClass: 'text-orange-400', hex: '#fb923c', bgClass: 'bg-orange-900/20', borderClass: 'border-orange-700/40' };
  return { labelKey: 'tsbZones.overreached', textClass: 'text-red-400', hex: '#f87171', bgClass: 'bg-red-900/20', borderClass: 'border-red-700/40' };
}

function rampZone(r: number) {
  const abs = Math.abs(r);
  if (abs < 5) return { textClass: 'text-green-400', bgClass: 'bg-green-900/20', borderClass: 'border-green-700/40', suffixKey: 'rampZones.moderate' };
  if (abs < 10) return { textClass: 'text-yellow-400', bgClass: 'bg-yellow-900/20', borderClass: 'border-yellow-700/40', suffixKey: 'rampZones.buildup' };
  return { textClass: 'text-red-400', bgClass: 'bg-red-900/20', borderClass: 'border-red-700/40', suffixKey: 'rampZones.tooFast' };
}

function fmtDateDE(iso: string) {
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtDateLong(iso: string) {
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' });
}

const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

// Chart-Dimensionen PMC
const W = 1000, H = 220;
const PAD = { top: 20, right: 24, bottom: 46, left: 48 };
const cW = W - PAD.left - PAD.right;
const cH = H - PAD.top - PAD.bottom;

// Chart-Dimensionen Volumen
const VW = 1000, VH = 200;
const VPAD = { top: 16, right: 16, bottom: 44, left: 52 };
const vcW = VW - VPAD.left - VPAD.right;
const vcH = VH - VPAD.top - VPAD.bottom;

type ViewMode = '90' | '180' | 'all';
type VolMode = '12' | '26' | '52';

export default function FormPage() {
  const { t } = useTranslation(['form', 'common']);
  const [data, setData] = useState<PmcResponse | null>(null);
  const [weeklyVolumeData, setWeeklyVolumeData] = useState<WeeklyVolume[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('90');
  const [volMode, setVolMode] = useState<VolMode>('26');
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const svgWrapper = useRef<HTMLDivElement>(null);

  useEffect(() => {
    Promise.all([api.pmc(), api.weeklyVolume(52)])
      .then(([pmcRes, volRes]) => {
        setData(pmcRes);
        setWeeklyVolumeData(volRes);
      })
      .catch(e => setError(e instanceof Error ? e.message : t('errors.generic')))
      .finally(() => setLoading(false));
  }, []);

  // Gefilterte Tage je viewMode
  const viewDays: PmcDay[] = (() => {
    if (!data?.days.length) return [];
    const all = data.days;
    if (viewMode === '90') return all.slice(-90);
    if (viewMode === '180') return all.slice(-180);
    return [...all];
  })();

  // Ramp Rate
  const rampRate =
    data?.days && data.days.length >= 29
      ? (data.days[data.days.length - 1].ctl - data.days[data.days.length - 29].ctl) / 4
      : null;

  // Form-Summary
  function formSummary(): string {
    if (!data?.current) return '';
    const { tsb, ctl } = data.current;
    const ramp = rampRate ?? 0;
    const peak = data.peak_ctl;

    let state: string;
    if (tsb > 25) state = t('formSummary.veryFresh');
    else if (tsb > 5) state = t('formSummary.raceForm');
    else if (tsb > -10) state = t('formSummary.normal');
    else if (tsb > -25) state = t('formSummary.trainingBlock');
    else state = t('formSummary.overreached');

    let context = '';
    if (ramp >= 5) context = t('formSummary.rampVeryFast', { ramp: ramp.toFixed(1) });
    else if (ramp >= 2) context = t('formSummary.rampRising', { ramp: ramp.toFixed(1) });
    else if (ramp <= -5) context = t('formSummary.rampFalling', { ramp: ramp.toFixed(1) });
    else if (ramp <= -2) context = t('formSummary.rampSlightlyFalling', { ramp: ramp.toFixed(1) });
    else if (peak && ctl >= peak.value * 0.95) context = t('formSummary.nearPeak', { ctl: ctl.toFixed(0), peak: peak.value.toFixed(0) });
    else if (peak && ctl <= peak.value * 0.6) context = t('formSummary.potential', { pct: Math.round(ctl / peak.value * 100), peak: peak.value.toFixed(0) });

    return context ? `${state} ${context}` : state;
  }

  // Chart-Geometrie
  const maxVal = viewDays.length
    ? Math.ceil(viewDays.reduce((m, d) => Math.max(m, d.ctl, d.atl, data?.peak_ctl?.value ?? 0), 0) / 10 + 1) * 10
    : 100;
  const minVal = viewDays.length
    ? Math.floor(viewDays.reduce((m, d) => Math.min(m, d.tsb), 0) / 10 - 1) * 10
    : -30;
  const yRange = maxVal - minVal;

  function xOf(i: number) { return PAD.left + (i / Math.max(viewDays.length - 1, 1)) * cW; }
  function yOf(v: number) { return PAD.top + cH - ((v - minVal) / yRange) * cH; }

  // SVG-Pfade
  function tsbAreaPos(): string {
    if (!viewDays.length) return '';
    const z = yOf(0);
    return `M${xOf(0).toFixed(1)},${z.toFixed(1)}` +
      viewDays.map((d, i) => `L${xOf(i).toFixed(1)},${yOf(Math.max(d.tsb, 0)).toFixed(1)}`).join('') +
      `L${xOf(viewDays.length - 1).toFixed(1)},${z.toFixed(1)}Z`;
  }

  function tsbAreaNeg(): string {
    if (!viewDays.length) return '';
    const z = yOf(0);
    return `M${xOf(0).toFixed(1)},${z.toFixed(1)}` +
      viewDays.map((d, i) => `L${xOf(i).toFixed(1)},${yOf(Math.min(d.tsb, 0)).toFixed(1)}`).join('') +
      `L${xOf(viewDays.length - 1).toFixed(1)},${z.toFixed(1)}Z`;
  }

  function polyPts(key: 'ctl' | 'atl'): string {
    return viewDays.map((d, i) => `${xOf(i).toFixed(1)},${yOf(d[key]).toFixed(1)}`).join(' ');
  }

  // 28-Tage gleitender Durchschnitt über CTL
  const CTL_MA_WINDOW = 28;
  const ctlMa: number[] = viewDays.map((_, i) => {
    const slice = viewDays.slice(Math.max(0, i - CTL_MA_WINDOW + 1), i + 1);
    return slice.reduce((s, d) => s + d.ctl, 0) / slice.length;
  });
  function ctlMaPoints(): string {
    return viewDays.map((_, i) => `${xOf(i).toFixed(1)},${yOf(ctlMa[i]).toFixed(1)}`).join(' ');
  }

  // Trainingspausen ≥5 Tage
  const pauses: { x1: number; x2: number }[] = (() => {
    const result: { x1: number; x2: number }[] = [];
    let start: number | null = null;
    viewDays.forEach((d, i) => {
      if (d.tss === 0) {
        if (start === null) start = i;
      } else {
        if (start !== null && i - start >= 5) result.push({ x1: xOf(start), x2: xOf(i - 1) });
        start = null;
      }
    });
    if (start !== null && viewDays.length - start >= 5)
      result.push({ x1: xOf(start), x2: xOf(viewDays.length - 1) });
    return result;
  })();

  // Y-Achse Ticks
  const step = yRange > 200 ? 40 : yRange > 100 ? 20 : 10;
  const yTicks: number[] = [];
  for (let v = Math.ceil(minVal / step) * step; v <= maxVal; v += step) yTicks.push(v);

  // X-Achse Monats-Labels
  const xLabels: { x: number; label: string }[] = [];
  let lastMo = -1;
  const n = viewDays.length;
  viewDays.forEach((d, i) => {
    const mo = new Date(d.date).getMonth();
    const yr = new Date(d.date).getFullYear();
    if (mo !== lastMo) {
      if (n > 365 && mo % 2 !== 0) { lastMo = mo; return; }
      xLabels.push({ x: xOf(i), label: mo === 0 ? `${MONTHS[mo]} ${yr}` : MONTHS[mo] });
      lastMo = mo;
    }
  });

  // Hover
  function onMouseMove(e: React.MouseEvent) {
    if (!svgWrapper.current || !viewDays.length) return;
    setTooltipPos({ x: e.clientX, y: e.clientY });
    const rect = svgWrapper.current.getBoundingClientRect();
    const svgX = (e.clientX - rect.left) / rect.width * W;
    const raw = (svgX - PAD.left) / cW * (viewDays.length - 1);
    setHoverIdx(Math.max(0, Math.min(viewDays.length - 1, Math.round(raw))));
  }

  const hoverDay = hoverIdx !== null && viewDays.length ? viewDays[hoverIdx] : null;
  const hoverXPx = hoverIdx !== null ? xOf(hoverIdx) : 0;

  // Volumen-Chart
  const volWeeks = (() => {
    const cnt = volMode === '12' ? 12 : volMode === '26' ? 26 : 52;
    return [...weeklyVolumeData].slice(-cnt);
  })();

  const volMaxMin = (() => {
    if (!volWeeks.length) return { maxMin: 120, step: 30 };
    const maxMin = volWeeks.reduce((m, w) =>
      Math.max(m, w.ride_minutes + w.workout_minutes + w.weight_training_minutes), 0);
    const rounded = Math.ceil(maxMin / 30 + 1) * 30;
    return { maxMin: rounded, step: rounded > 300 ? 60 : 30 };
  })();

  function volXOf(i: number, total: number) {
    return VPAD.left + ((i + 0.5) / Math.max(total, 1)) * vcW;
  }
  function volYOf(minutes: number) {
    return VPAD.top + vcH - (minutes / volMaxMin.maxMin) * vcH;
  }
  // Volumen X-Labels
  const volXLabels: { x: number; label: string }[] = [];
  {
    let lastMoV = -1, moCount = 0;
    volWeeks.forEach((w, i) => {
      const mo = new Date(w.week_start).getMonth();
      const yr = new Date(w.week_start).getFullYear();
      if (mo !== lastMoV) {
        moCount++;
        const skip = volWeeks.length > 40 ? 2 : 1;
        if (moCount % skip === 0) {
          volXLabels.push({ x: volXOf(i, volWeeks.length), label: mo === 0 ? `${MONTHS[mo]} ${yr}` : MONTHS[mo] });
        }
        lastMoV = mo;
      }
    });
  }

  // Volumen Y-Ticks
  const volYTicks: number[] = [];
  for (let v = 0; v <= volMaxMin.maxMin; v += volMaxMin.step) volYTicks.push(v);

  const bW = volWeeks.length > 0 ? Math.max(2, (vcW / volWeeks.length) * 0.65) : vcW * 0.65;

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-72 rounded-xl bg-muted animate-pulse" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded border border-destructive/50 bg-destructive/10 p-4 text-destructive text-sm">
        {error}
      </div>
    );
  }

  if (!data?.current) {
    return <p className="text-muted-foreground text-sm">{t('noData')}</p>;
  }

  const cur = data.current;
  const zone = tsbZone(cur.tsb);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('header.title')}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t('header.subtitle')}
            {data && t('header.subtitleExtra', { hrMax: Math.round(data.max_hr), threshold: Math.round(data.threshold_hr) })}
          </p>
        </div>
        {/* Zeitraum-Toggle */}
        <div className="flex rounded-lg overflow-hidden border border-border text-sm">
          {(['90', '180', 'all'] as ViewMode[]).map((mode, i) => {
            const labels = [t('periodToggle.d90'), t('periodToggle.months6'), t('periodToggle.all')];
            return (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={[
                  'px-3 py-1.5 transition-colors',
                  viewMode === mode ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                ].join(' ')}
              >
                {labels[i]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Formeinschätzung */}
      <div className={`rounded-xl px-5 py-4 border ${zone.bgClass} ${zone.borderClass}`}>
        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">{t('currentAssessment')}</p>
        <p className="text-sm text-foreground leading-relaxed">{formSummary()}</p>
      </div>

      {/* Stat-Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-xl bg-card border border-blue-900/40 p-4">
          <p className="text-xs text-blue-400 uppercase tracking-wider">{t('statCards.fitnessLabel')}</p>
          <p className="text-3xl font-bold mt-1 text-blue-300">{cur.ctl.toFixed(1)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{t('statCards.fitnessSub')}</p>
        </div>
        <div className="rounded-xl bg-card border border-orange-900/40 p-4">
          <p className="text-xs text-orange-400 uppercase tracking-wider">{t('statCards.fatigueLabel')}</p>
          <p className="text-3xl font-bold mt-1 text-orange-300">{cur.atl.toFixed(1)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{t('statCards.fatigueSub')}</p>
        </div>
        <div className={`rounded-xl p-4 border ${zone.bgClass} ${zone.borderClass}`}>
          <p className={`text-xs uppercase tracking-wider ${zone.textClass}`}>{t('statCards.formLabel')}</p>
          <p className={`text-3xl font-bold mt-1 ${zone.textClass}`}>
            {cur.tsb >= 0 ? '+' : ''}{cur.tsb.toFixed(1)}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">{t(zone.labelKey)}</p>
        </div>
        {rampRate !== null && (() => {
          const rz = rampZone(rampRate);
          return (
            <div className={`rounded-xl p-4 border ${rz.bgClass} ${rz.borderClass}`}>
              <p className={`text-xs uppercase tracking-wider ${rz.textClass}`}>{t('statCards.rampLabel')}</p>
              <p className={`text-3xl font-bold mt-1 ${rz.textClass}`}>
                {rampRate >= 0 ? '+' : ''}{rampRate.toFixed(1)}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">{t(rz.suffixKey)}</p>
            </div>
          );
        })()}
      </div>

      {/* Peak CTL Info */}
      {data.peak_ctl && (
        <p className="text-sm text-muted-foreground">
          {t('peakFitness.label')}{' '}
          <span className="text-blue-400 font-medium">{data.peak_ctl.value.toFixed(1)} CTL</span>
          {' '}{t('peakFitness.on', { date: fmtDateLong(data.peak_ctl.date) })}
        </p>
      )}

      {/* PMC-Chart */}
      <div className="rounded-xl bg-card border shadow-sm p-4">
        {/* Legende */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mb-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-6 h-0.5 rounded" style={{ background: '#60a5fa' }} /> {t('chartLegend.ctl')}
          </span>
          <span className="flex items-center gap-1.5">
            <svg width="24" height="8">
              <line x1="0" y1="4" x2="24" y2="4" stroke="#22d3ee" strokeWidth="2.5" />
            </svg>
            {t('chartLegend.ctlMa')}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-6 h-0.5 rounded" style={{ background: '#fb923c' }} /> {t('chartLegend.atl')}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm bg-green-500/40" />
            <span className="inline-block w-3 h-3 rounded-sm bg-red-500/40" /> {t('chartLegend.tsb')}
          </span>
          {data.peak_ctl && (
            <span className="flex items-center gap-1.5">
              <svg width="24" height="8">
                <line x1="0" y1="4" x2="24" y2="4" stroke="#93c5fd" strokeWidth="1.5" strokeDasharray="4 3" />
              </svg>
              {t('chartLegend.peakCtl')}
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-5 h-3 rounded-sm bg-white/5 border border-white/10" /> {t('chartLegend.pause')}
          </span>
          <span className="flex items-center gap-1.5">
            <svg width="8" height="8"><circle cx="4" cy="4" r="3" fill="#60a5fa" /></svg> {t('chartLegend.ride')}
          </span>
          <span className="flex items-center gap-1.5">
            <svg width="8" height="8"><circle cx="4" cy="4" r="3" fill="#a78bfa" /></svg> {t('chartLegend.workout')}
          </span>
          <span className="flex items-center gap-1.5">
            <svg width="8" height="8"><circle cx="4" cy="4" r="3" fill="#f59e0b" /></svg> {t('chartLegend.strength')}
          </span>
        </div>

        <div
          ref={svgWrapper}
          className="relative"
          onMouseMove={onMouseMove}
          onMouseLeave={() => setHoverIdx(null)}
        >
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
            {/* Trainingspausen */}
            {pauses.map((p, i) => (
              <rect
                key={i}
                x={p.x1} y={PAD.top}
                width={Math.max(p.x2 - p.x1, 1)} height={cH}
                fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.06)" strokeWidth={0.5}
              />
            ))}

            {/* Y-Gitternetz */}
            {yTicks.map(v => (
              <g key={v}>
                <line
                  x1={PAD.left} y1={yOf(v).toFixed(1) as unknown as number}
                  x2={W - PAD.right} y2={yOf(v).toFixed(1) as unknown as number}
                  stroke="hsl(var(--border))"
                  strokeWidth={v === 0 ? 1.5 : 0.7}
                />
                <text x={PAD.left - 6} y={yOf(v) + 4} fontSize={11}
                  fill="hsl(var(--muted-foreground))" textAnchor="end">
                  {v}
                </text>
              </g>
            ))}

            {/* X-Achse Monats-Labels */}
            {xLabels.map(({ x, label }, i) => (
              <g key={i}>
                <line x1={x} y1={PAD.top} x2={x} y2={PAD.top + cH}
                  stroke="hsl(var(--border))" strokeWidth={0.5} />
                <text x={x} y={H - 8} fontSize={10}
                  fill="hsl(var(--muted-foreground))" textAnchor="middle">
                  {label}
                </text>
              </g>
            ))}

            {/* TSB-Flächen */}
            <path d={tsbAreaPos()} fill="#22c55e" opacity={0.18} />
            <path d={tsbAreaNeg()} fill="#ef4444" opacity={0.18} />

            {/* ATL-Linie */}
            <polyline points={polyPts('atl')} fill="none" stroke="#fb923c" strokeWidth={1.5} strokeLinejoin="round" />
            {/* CTL-Linie */}
            <polyline points={polyPts('ctl')} fill="none" stroke="#60a5fa" strokeWidth={2.5} strokeLinejoin="round" />
            {/* 28-Tage CTL-Durchschnitt */}
            <polyline points={ctlMaPoints()} fill="none" stroke="#22d3ee" strokeWidth={3} strokeLinejoin="round" opacity={0.85} />

            {/* Peak-CTL gestrichelt */}
            {data.peak_ctl && (
              <>
                <line
                  x1={PAD.left} y1={yOf(data.peak_ctl.value)}
                  x2={W - PAD.right} y2={yOf(data.peak_ctl.value)}
                  stroke="#93c5fd" strokeWidth={1} strokeDasharray="5 3" opacity={0.45}
                />
                <text
                  x={W - PAD.right - 3} y={yOf(data.peak_ctl.value) - 4}
                  fontSize={9} fill="#93c5fd" textAnchor="end" opacity={0.55}
                >
                  {t('chartLegend.peakValue', { value: data.peak_ctl.value.toFixed(0) })}
                </text>
              </>
            )}

            {/* Hover */}
            {hoverIdx !== null && hoverDay && (() => {
              const hz = tsbZone(hoverDay.tsb);
              return (
                <>
                  <line
                    x1={hoverXPx} y1={PAD.top}
                    x2={hoverXPx} y2={PAD.top + cH}
                    stroke="white" strokeWidth={1} opacity={0.25}
                  />
                  <circle cx={hoverXPx} cy={yOf(hoverDay.ctl)} r={4} fill="#60a5fa" stroke="hsl(var(--card))" strokeWidth={1.5} />
                  <circle cx={hoverXPx} cy={yOf(hoverDay.atl)} r={4} fill="#fb923c" stroke="hsl(var(--card))" strokeWidth={1.5} />
                  <circle cx={hoverXPx} cy={yOf(hoverDay.tsb)} r={4} fill={hz.hex} stroke="hsl(var(--card))" strokeWidth={1.5} />
                </>
              );
            })()}

            {/* Aktivitätstyp-Marker */}
            {viewDays.map((day, i) => (
              <g key={i}>
                {(day.rides ?? 0) > 0 && (
                  <circle
                    cx={xOf(i)}
                    cy={PAD.top + cH + 8}
                    r={1.5}
                    fill="#60a5fa"
                    opacity={0.7}
                  />
                )}
                {day.other?.map((o, j) => (
                  <circle
                    key={j}
                    cx={xOf(i) + (day.other!.length > 1 ? (j - (day.other!.length - 1) / 2) * 3 : 0)}
                    cy={PAD.top + cH + 15}
                    r={1.5}
                    fill={o.sport_type === 'Workout' ? '#a78bfa' : '#f59e0b'}
                    opacity={0.85}
                  />
                ))}
              </g>
            ))}

            {/* Transparentes Rect für Maus */}
            <rect x={PAD.left} y={PAD.top} width={cW} height={cH} fill="transparent" />
          </svg>
        </div>
      </div>

      {/* Wöchentliche Trainings-Zusammensetzung */}
      <section className="rounded-xl bg-card border shadow-sm p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h2 className="text-sm font-semibold">{t('volume.title')}</h2>
          <div className="flex rounded-lg overflow-hidden border border-border text-xs">
            {(['12', '26', '52'] as VolMode[]).map((mode, i) => {
              const labels = [t('volume.weeks12'), t('volume.weeks26'), t('volume.weeks52')];
              return (
                <button
                  key={mode}
                  onClick={() => setVolMode(mode)}
                  className={[
                    'px-3 py-1.5 transition-colors',
                    volMode === mode ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                  ].join(' ')}
                >
                  {labels[i]}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mb-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ background: '#60a5fa' }} /> {t('volume.cycling')}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ background: '#a78bfa' }} /> {t('volume.workout')}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ background: '#f59e0b' }} /> {t('volume.strength')}
          </span>
        </div>

        {weeklyVolumeData.length ? (
          <svg viewBox={`0 0 ${VW} ${VH}`} className="w-full">
            {volYTicks.map(v => (
              <g key={v}>
                <line
                  x1={VPAD.left} y1={volYOf(v)}
                  x2={VW - VPAD.right} y2={volYOf(v)}
                  stroke="hsl(var(--border))" strokeWidth={0.7}
                />
                <text x={VPAD.left - 4} y={volYOf(v) + 4} fontSize={10}
                  fill="hsl(var(--muted-foreground))" textAnchor="end">
                  {v}
                </text>
              </g>
            ))}

            {volXLabels.map(({ x, label }, i) => (
              <g key={i}>
                <line x1={x} y1={VPAD.top} x2={x} y2={VPAD.top + vcH}
                  stroke="hsl(var(--border))" strokeWidth={0.5} />
                <text x={x} y={VH - 6} fontSize={10}
                  fill="hsl(var(--muted-foreground))" textAnchor="middle">
                  {label}
                </text>
              </g>
            ))}

            {volWeeks.map((w, i) => {
              const totalMin = w.ride_minutes + w.workout_minutes + w.weight_training_minutes;
              if (!totalMin) return null;
              const cx = volXOf(i, volWeeks.length);
              const x0 = cx - bW / 2;
              const baseY = VPAD.top + vcH;
              const rideH = (w.ride_minutes / volMaxMin.maxMin) * vcH;
              const wkH = (w.workout_minutes / volMaxMin.maxMin) * vcH;
              const wtH = (w.weight_training_minutes / volMaxMin.maxMin) * vcH;
              return (
                <g key={i}>
                  {w.ride_minutes > 0 && (
                    <rect x={x0} y={baseY - rideH} width={bW} height={rideH} fill="#60a5fa" opacity={0.75} rx={1} />
                  )}
                  {w.workout_minutes > 0 && (
                    <rect x={x0} y={baseY - rideH - wkH} width={bW} height={wkH} fill="#a78bfa" opacity={0.75} rx={1} />
                  )}
                  {w.weight_training_minutes > 0 && (
                    <rect x={x0} y={baseY - rideH - wkH - wtH} width={bW} height={wtH} fill="#f59e0b" opacity={0.75} rx={1} />
                  )}
                </g>
              );
            })}
          </svg>
        ) : (
          <p className="text-xs text-muted-foreground">{t('volume.noData')}</p>
        )}
      </section>

      {/* TSB-Zonen-Erklärung */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
        {[
          { range: 'TSB > +25', labelKey: 'tsbZones.veryFresh', subKey: 'zoneSubs.veryFresh', color: 'text-sky-300' },
          { range: '+5 – +25', labelKey: 'tsbZones.raceForm', subKey: 'zoneSubs.raceForm', color: 'text-green-400' },
          { range: '−10 – +5', labelKey: 'tsbZones.normal', subKey: 'zoneSubs.normal', color: 'text-yellow-400' },
          { range: '−25 – −10', labelKey: 'tsbZones.trainingBlock', subKey: 'zoneSubs.trainingBlock', color: 'text-orange-400' },
          { range: 'TSB < −25', labelKey: 'tsbZones.overreached', subKey: 'zoneSubs.overreached', color: 'text-red-400' },
        ].map(z => (
          <div key={z.labelKey} className="rounded-lg bg-muted/40 p-2.5">
            <p className="font-mono text-muted-foreground">{z.range}</p>
            <p className={`font-medium ${z.color} mt-0.5`}>{t(z.labelKey)}</p>
            <p className="text-muted-foreground mt-0.5">{t(z.subKey)}</p>
          </div>
        ))}
      </div>

      {/* Lesehilfe */}
      <div className="rounded-xl border bg-card shadow-sm p-5 space-y-4 text-sm">
        <h2 className="font-semibold">{t('readingGuide.title')}</h2>

        <div className="grid md:grid-cols-3 gap-3">
          <div className="rounded-lg bg-blue-900/20 border border-blue-800/30 p-3">
            <p className="text-blue-400 font-medium mb-1">{t('readingGuide.ctl.title')}</p>
            <p className="text-muted-foreground">
              {t('readingGuide.ctl.intro')}{' '}
              <span className="text-blue-300 font-mono">{cur.ctl.toFixed(1)}</span>
              {data?.peak_ctl && (
                <> {t('readingGuide.ctl.peakPrefix')}{' '}
                  <span className="text-blue-300 font-mono">{data.peak_ctl.value.toFixed(1)}</span>{' '}
                  {t('readingGuide.ctl.peakSuffix', { date: fmtDateLong(data.peak_ctl.date) })}
                </>
              )}
            </p>
          </div>
          <div className="rounded-lg bg-orange-900/20 border border-orange-800/30 p-3">
            <p className="text-orange-400 font-medium mb-1">{t('readingGuide.atl.title')}</p>
            <p className="text-muted-foreground">
              {t('readingGuide.atl.intro')}{' '}
              <span className="text-orange-300 font-mono">{cur.atl.toFixed(1)}</span>.{' '}
              {cur.atl < cur.ctl * 0.6
                ? t('readingGuide.atl.rested')
                : cur.atl > cur.ctl * 1.2
                ? t('readingGuide.atl.overloaded')
                : t('readingGuide.atl.normal')}
            </p>
          </div>
          <div className={`rounded-lg border p-3 ${zone.bgClass} ${zone.borderClass}`}>
            <p className={`font-medium mb-1 ${zone.textClass}`}>{t('readingGuide.tsb.title')}</p>
            <p className="text-muted-foreground">
              {t('readingGuide.tsb.body')}{' '}
              <span className={`font-mono font-bold ${zone.textClass}`}>
                {cur.tsb >= 0 ? '+' : ''}{cur.tsb.toFixed(1)}
              </span>{' '}
              → <span className={zone.textClass}>{t(zone.labelKey)}</span>.
            </p>
          </div>
        </div>

        <details className="text-xs text-muted-foreground cursor-pointer">
          <summary className="hover:text-foreground transition-colors">{t('readingGuide.abbreviations.summary')}</summary>
          <dl className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
            <div><dt className="inline font-mono text-muted-foreground">CTL </dt><dd className="inline">{t('readingGuide.abbreviations.ctl')}</dd></div>
            <div><dt className="inline font-mono text-muted-foreground">ATL </dt><dd className="inline">{t('readingGuide.abbreviations.atl')}</dd></div>
            <div><dt className="inline font-mono text-muted-foreground">TSB </dt><dd className="inline">{t('readingGuide.abbreviations.tsb')}</dd></div>
            <div><dt className="inline font-mono text-muted-foreground">hrTSS </dt><dd className="inline">{t('readingGuide.abbreviations.hrtss')}</dd></div>
          </dl>
        </details>
      </div>

      {/* Hover-Tooltip (fixed) */}
      {hoverDay && (() => {
        const z = tsbZone(hoverDay.tsb);
        const ttW = 168;
        const ttH = 160;
        const ttLeft = tooltipPos.x + 14 + ttW > window.innerWidth
          ? tooltipPos.x - ttW - 8
          : tooltipPos.x + 14;
        const ttTop = tooltipPos.y - 70 < 0
          ? tooltipPos.y + 14
          : tooltipPos.y + ttH > window.innerHeight
            ? window.innerHeight - ttH - 8
            : tooltipPos.y - 70;
        return (
          <div
            className="fixed z-50 pointer-events-none rounded-lg bg-card/95 border border-border p-3 text-xs shadow-xl"
            style={{ left: ttLeft, top: ttTop, minWidth: 148 }}
          >
            <p className="font-medium text-foreground mb-2">{fmtDateDE(hoverDay.date)}</p>
            <div className="space-y-1">
              <div className="flex justify-between gap-4">
                <span style={{ color: '#60a5fa' }}>CTL</span>
                <span className="font-mono" style={{ color: '#60a5fa' }}>{hoverDay.ctl.toFixed(1)}</span>
              </div>
              {hoverIdx !== null && (
                <div className="flex justify-between gap-4">
                  <span style={{ color: '#22d3ee' }}>Ø28d</span>
                  <span className="font-mono" style={{ color: '#22d3ee' }}>{ctlMa[hoverIdx].toFixed(1)}</span>
                </div>
              )}
              <div className="flex justify-between gap-4">
                <span style={{ color: '#fb923c' }}>ATL</span>
                <span className="font-mono" style={{ color: '#fb923c' }}>{hoverDay.atl.toFixed(1)}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className={z.textClass}>TSB</span>
                <span className={`font-mono ${z.textClass}`}>{hoverDay.tsb >= 0 ? '+' : ''}{hoverDay.tsb.toFixed(1)}</span>
              </div>
              {hoverDay.tss > 0 && (
                <div className="flex justify-between gap-4 pt-1.5 border-t border-border/60">
                  <span className="text-muted-foreground">TSS</span>
                  <span className="text-foreground font-mono">{hoverDay.tss.toFixed(0)}</span>
                </div>
              )}
              {hoverDay.other?.length && (
                <div className="pt-1.5 border-t border-border/60 space-y-0.5">
                  {hoverDay.other.map((o, i) => (
                    <div key={i} className="flex justify-between gap-4">
                      <span style={{ color: o.sport_type === 'strength_training' ? '#f59e0b' : '#a78bfa' }}>
                        {t(`sport.${o.sport_type}`, { defaultValue: o.sport_type })}
                      </span>
                      <span className="text-foreground font-mono">{Math.round(o.moving_time_s / 60)} min</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <p className="mt-2 text-muted-foreground text-[10px]">{t(z.labelKey)}</p>
          </div>
        );
      })()}
    </div>
  );
}
