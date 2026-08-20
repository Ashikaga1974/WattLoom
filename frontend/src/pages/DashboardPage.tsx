import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';

import { api, type ActivityStats, type Bike, type BikeComponent, type Activity, type WeeklyStats, type MonthlyStats, type WeeklyVolume, type PmcDay, type PrEvent } from '@/lib/api';
import { fmtKm, fmtTime, fmtDate, fmtNum, fmtSpeed, fmtWeekday } from '@/lib/format';
import { rideTitle } from '@/lib/activity-display';
import { useConfig } from '@/lib/config-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ChartTooltip } from '@/components/ui/chart-tooltip';

const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const VOL_WEEKS = 8;

// Zählt cubic-ease-out von 0 zum Zielwert hoch
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

// Einzelne animierte KPI-Kachel
function KpiTile({
  label,
  target,
  unit,
  loading,
}: {
  label: string;
  target: number;
  unit: string;
  loading: boolean;
}) {
  const [started, setStarted] = useState(false);
  useEffect(() => {
    if (loading) { setStarted(false); return; }
    const t = setTimeout(() => setStarted(true), 100);
    return () => clearTimeout(t);
  }, [loading]);

  const animated = useCountUp(started ? Math.round(target) : 0);

  if (loading) {
    return (
      <div className="flex flex-col items-center py-8 px-4">
        <Skeleton className="h-14 w-32 mb-3" />
        <Skeleton className="h-3 w-16" />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center py-8 px-4 text-center">
      <p
        className="text-5xl md:text-6xl font-black tabular-nums leading-none tracking-tight"
        style={{ color: 'var(--primary)' }}
      >
        {fmtNum(animated)}
      </p>
      <p className="text-sm font-semibold text-foreground mt-2">{unit}</p>
      <p className="text-[11px] text-muted-foreground mt-0.5 uppercase tracking-wider">{label}</p>
    </div>
  );
}

// Ein einzelner Stat im Hero
function HeroStat({ value, label, primary = false }: { value: string; label: string; primary?: boolean }) {
  return (
    <div>
      <p
        className={primary ? 'text-3xl font-black leading-none' : 'text-xl font-bold text-foreground leading-none'}
        style={primary ? { color: 'var(--primary)' } : undefined}
      >
        {value}
      </p>
      <p className="text-[11px] text-muted-foreground mt-1 uppercase tracking-wider">{label}</p>
    </div>
  );
}

// Hero-Banner: letzter Ride, immer ungefiltert
function HeroBanner({ activity, loading }: { activity: Activity | null; loading: boolean }) {
  const { t } = useTranslation(['dashboard', 'common']);
  if (loading) {
    return <Skeleton className="h-44 w-full rounded-2xl" />;
  }
  if (!activity) return null;

  const km = (activity.distance_m / 1000).toFixed(1);
  const speed = activity.avg_speed_ms ? fmtSpeed(activity.avg_speed_ms) : null;
  const hm = activity.elevation_gain_m ? Math.round(activity.elevation_gain_m) : null;

  return (
    <Link to={`/activities/${activity.id}`} className="block group">
      <div
        className="rounded-2xl border border-border/40 overflow-hidden relative"
        style={{
          background:
            'linear-gradient(135deg, rgba(252,76,2,0.18) 0%, rgba(252,76,2,0.06) 40%, var(--card) 70%)',
        }}
      >
        {/* Hover-Glow */}
        <div
          className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse at 8% 50%, rgba(252,76,2,0.14) 0%, transparent 65%)',
          }}
        />

        <div className="relative px-6 py-5">
          {/* Kopfzeile */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span
                className="w-2 h-2 rounded-full animate-pulse shrink-0"
                style={{ background: 'var(--primary)' }}
              />
              <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                {t('hero.lastRide')}
              </span>
            </div>
            <span className="text-xs text-muted-foreground">
              {fmtWeekday(activity.start_date)}, {fmtDate(activity.start_date)}
            </span>
          </div>

          {/* Titel + Link */}
          <div className="flex items-start justify-between gap-4 mb-5">
            <h2 className="text-xl md:text-2xl font-bold text-foreground leading-snug group-hover:text-primary transition-colors duration-200 truncate">
              {rideTitle(activity, t)}
            </h2>
            <span
              className="text-sm font-semibold shrink-0 mt-0.5 group-hover:translate-x-0.5 transition-transform duration-200"
              style={{ color: 'var(--primary)' }}
            >
              {t('hero.details')}
            </span>
          </div>

          {/* Stats-Zeile */}
          <div className="flex items-end flex-wrap gap-y-3">
            <HeroStat value={km} label="km" primary />
            <div className="w-px h-9 bg-border/60 mx-5 shrink-0" />
            <HeroStat value={fmtTime(activity.moving_time_s)} label={t('hero.movingTime')} />
            {speed && (
              <>
                <div className="w-px h-9 bg-border/60 mx-5 shrink-0" />
                <HeroStat value={speed} label="km/h" />
              </>
            )}
            {hm != null && (
              <>
                <div className="w-px h-9 bg-border/60 mx-5 shrink-0" />
                <HeroStat value={fmtNum(hm)} label="Hm" />
              </>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

function tsbInfo(tsb: number, t: (key: string) => string): { label: string; text: string; color: string; bg: string } {
  if (tsb >= 10)  return { label: t('tsb.status.fresh.label'),     text: t('tsb.status.fresh.text'),     color: '#22c55e', bg: 'rgba(34,197,94,0.07)'  };
  if (tsb >= 0)   return { label: t('tsb.status.recovered.label'), text: t('tsb.status.recovered.text'), color: '#3b82f6', bg: 'rgba(59,130,246,0.07)' };
  if (tsb >= -10) return { label: t('tsb.status.tired.label'),     text: t('tsb.status.tired.text'),     color: '#f59e0b', bg: 'rgba(245,158,11,0.07)' };
  return              { label: t('tsb.status.exhausted.label'), text: t('tsb.status.exhausted.text'), color: '#ef4444', bg: 'rgba(239,68,68,0.07)'  };
}

function TsbWidget({ current }: { current: PmcDay }) {
  const { t } = useTranslation('dashboard');
  const info = tsbInfo(current.tsb, t);
  const tsbStr = current.tsb > 0 ? `+${current.tsb}` : String(current.tsb);
  return (
    <div
      className="rounded-2xl border px-5 py-4 flex items-center justify-between gap-4 flex-wrap"
      style={{ borderColor: `${info.color}50`, background: info.bg }}
    >
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-0.5">
          {t('tsb.title')}
        </p>
        <p className="text-sm font-semibold" style={{ color: info.color }}>{info.label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{info.text}</p>
      </div>
      <div className="flex items-center gap-6 shrink-0">
        <div className="text-center">
          <p className="text-2xl font-black tabular-nums" style={{ color: info.color }}>{tsbStr}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">TSB</p>
        </div>
        <div className="text-center">
          <p className="text-xl font-bold tabular-nums text-foreground">{Math.round(current.ctl)}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">CTL</p>
        </div>
        <div className="text-center">
          <p className="text-xl font-bold tabular-nums text-foreground">{Math.round(current.atl)}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">ATL</p>
        </div>
      </div>
    </div>
  );
}

// Aktive Komponenten nahe/über dem Verschleiß-Schwellwert, absteigend nach pct_used
function wearWarnings(bikes: Bike[], wearWarningPct: number): { bike: Bike; comp: BikeComponent }[] {
  return bikes
    .flatMap(bike => bike.components
      .filter(c => c.retired_at == null && (c.pct_used ?? 0) >= wearWarningPct)
      .map(comp => ({ bike, comp })))
    .sort((a, b) => (b.comp.pct_used ?? 0) - (a.comp.pct_used ?? 0));
}

function WearWarnings({ bikes }: { bikes: Bike[] }) {
  const { t } = useTranslation('dashboard');
  const { wear_warning_pct } = useConfig();
  const warnings = wearWarnings(bikes, wear_warning_pct);
  if (warnings.length === 0) return null;
  return (
    <div className="rounded-2xl border px-5 py-4" style={{ borderColor: '#ef444450', background: 'rgba(239,68,68,0.07)' }}>
      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-2.5">
        {t('wear.title')}
      </p>
      <div className="space-y-2">
        {warnings.map(({ bike, comp }) => (
          <Link
            key={comp.id}
            to={`/bikes/${bike.id}`}
            className="flex items-center justify-between gap-3 text-sm hover:opacity-80 transition-opacity"
          >
            <span className="text-foreground">
              <span className="font-semibold">{comp.type}</span>
              <span className="text-muted-foreground"> · {bike.name}</span>
            </span>
            <span className="font-bold tabular-nums shrink-0" style={{ color: '#ef4444' }}>
              {Math.round(comp.pct_used ?? 0)} %
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function fmtPrTime(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

const GOAL_COLOR = '#3b82f6';

// Anteil des Kalenderjahres, der bereits verstrichen ist (0–1) – Vergleichsbasis für "im Plan"
function yearProgressFraction(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1).getTime();
  const end = new Date(now.getFullYear() + 1, 0, 1).getTime();
  return (now.getTime() - start) / (end - start);
}

function GoalRow({
  icon,
  label,
  current,
  target,
  unit,
  paceHint,
}: {
  icon: string;
  label: string;
  current: number;
  target: number;
  unit: string;
  paceHint?: { diffPct: number };
}) {
  const { t } = useTranslation('dashboard');
  const pct = Math.min(100, Math.round((current / target) * 100));
  const paceColor = paceHint == null ? GOAL_COLOR : paceHint.diffPct >= 0 ? '#22c55e' : '#f59e0b';
  return (
    <div className="flex items-center gap-4">
      <div className="text-2xl font-black tabular-nums shrink-0 w-16 text-right" style={{ color: paceColor }}>
        {pct}%
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between mb-1.5 gap-2">
          <span className="text-sm font-semibold text-foreground whitespace-nowrap">{icon} {label}</span>
          <span className="text-xs text-muted-foreground tabular-nums shrink-0">
            {current.toFixed(0)} / {target.toFixed(0)} {unit}
          </span>
        </div>
        <div className="h-2.5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${pct}%`, background: paceColor }}
          />
        </div>
        {paceHint && (
          <p className="text-[11px] mt-1" style={{ color: paceColor }}>
            {paceHint.diffPct >= 0 ? t('goals.onPlan') : t('goals.behindPlan', { pct: Math.abs(paceHint.diffPct) })}
          </p>
        )}
      </div>
    </div>
  );
}

function GoalWidget({
  yearlyKmGoal,
  weeklyHoursGoal,
  yearKm,
  weekHours,
}: {
  yearlyKmGoal: number | null;
  weeklyHoursGoal: number | null;
  yearKm: number | null;
  weekHours: number | null;
}) {
  const { t } = useTranslation('dashboard');
  if (yearlyKmGoal == null && weeklyHoursGoal == null) return null;
  const showYear = yearlyKmGoal != null && yearKm != null;
  const showWeek = weeklyHoursGoal != null && weekHours != null;
  const yearPct = showYear ? Math.min(100, Math.round((yearKm! / yearlyKmGoal!) * 100)) : 0;
  const expectedPct = Math.round(yearProgressFraction() * 100);

  return (
    <div className="rounded-2xl border px-5 py-4 space-y-4" style={{ borderColor: `${GOAL_COLOR}50`, background: `${GOAL_COLOR}0d` }}>
      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        {t('goals.title')}
      </p>
      {showYear && (
        <GoalRow
          icon="🎯"
          label={t('goals.yearlyLabel', { year: new Date().getFullYear() })}
          current={yearKm!}
          target={yearlyKmGoal!}
          unit="km"
          paceHint={{ diffPct: yearPct - expectedPct }}
        />
      )}
      {showWeek && (
        <GoalRow icon="📅" label={t('goals.weeklyLabel')} current={weekHours!} target={weeklyHoursGoal!} unit="h" />
      )}
    </div>
  );
}

function PrWidget({ events, onDismiss }: { events: PrEvent[]; onDismiss: (id: number) => void }) {
  const { t } = useTranslation('dashboard');
  if (events.length === 0) return null;
  return (
    <div className="rounded-2xl border px-5 py-4" style={{ borderColor: '#f59e0b50', background: 'rgba(245,158,11,0.07)' }}>
      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-2.5">
        {t('pr.title')}
      </p>
      <div className="space-y-2">
        {events.map(e => (
          <div key={e.id} className="flex items-center justify-between gap-3 text-sm">
            <Link to={`/activities/${e.activity_id}`} className="min-w-0 hover:opacity-80 transition-opacity">
              <span className="font-semibold">{e.distance_km} km</span>
              <span className="text-muted-foreground"> {t('pr.in')} </span>
              <span className="font-bold tabular-nums" style={{ color: '#f59e0b' }}>{fmtPrTime(e.best_time_s)}</span>
              <span className="text-muted-foreground"> · {e.activity_name}</span>
            </Link>
            <button
              onClick={() => onDismiss(e.id)}
              className="shrink-0 text-muted-foreground hover:text-foreground transition-colors text-xs"
              title={t('pr.dismiss')}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function DistanzSparkTooltip({ active, payload, label }: { active?: boolean; payload?: any[]; label?: string }) {
  const { t } = useTranslation('dashboard');
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  return (
    <ChartTooltip
      active={active}
      label={label}
      rows={[
        { label: t('sparkTooltip.distance'), value: `${d?.km ?? 0} km` },
        { label: t('sparkTooltip.rides'), value: `${d?.count ?? 0}` },
        ...(d?.hm > 0 ? [{ label: t('sparkTooltip.elevation'), value: `${fmtNum(d.hm)} m` }] : []),
      ]}
    />
  );
}

export default function DashboardPage() {
  const { t } = useTranslation(['dashboard', 'common']);
  const config = useConfig();
  const [stats, setStats] = useState<ActivityStats | null>(null);
  const [bikes, setBikes] = useState<Bike[]>([]);
  const [recentActivities, setRecentActivities] = useState<Activity[]>([]);
  const [sparkData, setSparkData] = useState<(WeeklyStats | MonthlyStats)[]>([]);
  const [sparkLabels, setSparkLabels] = useState<string[]>([]);
  const [weeklyVol, setWeeklyVol] = useState<WeeklyVolume[]>([]);
  const [pmcCurrent, setPmcCurrent] = useState<PmcDay | null>(null);
  const [prEventList, setPrEventList] = useState<PrEvent[]>([]);
  const [yearlyKmGoal, setYearlyKmGoal] = useState<number | null>(null);
  const [weeklyHoursGoal, setWeeklyHoursGoal] = useState<number | null>(null);
  const [currentYearKm, setCurrentYearKm] = useState<number | null>(null);
  const [selectedYear, setSelectedYear] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load(year: string | null) {
    setLoading(true);
    setError(null);
    try {
      const yearNum = year ? Number(year) : undefined;
      const sparkPromise = year
        ? api.monthlyStats(Number(year))
        : api.weeklyStats(config.sparkline_weeks);

      const [s, b, ar, sp, vol] = await Promise.all([
        api.activityStats(yearNum),
        api.bikes(),
        // Letzte 5 global – kein Jahresfilter, Hero soll immer den echten letzten Ride zeigen
        api.activities({ limit: 5, sort_by: 'start_date', sort_dir: 'desc' }),
        sparkPromise,
        api.weeklyVolume(VOL_WEEKS),
      ]);

      setStats(s);
      setBikes(b);
      setRecentActivities(ar.items);
      setSparkData(sp);
      setWeeklyVol(vol);

      if (year) {
        setSparkLabels(MONTHS);
      } else {
        setSparkLabels(
          (sp as WeeklyStats[]).map(w => (w.weeks_ago === 0 ? t('charts.current') : t('charts.weeksAgo', { weeks: w.weeks_ago })))
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t('error.unknown'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(null); }, []);
  // PMC einmalig laden – unabhängig vom Jahresfilter
  useEffect(() => {
    api.pmc().then(d => setPmcCurrent(d.current)).catch(() => {});
  }, []);
  // Neue Bestzeiten einmalig laden – unabhängig vom Jahresfilter
  useEffect(() => {
    api.prEvents().then(setPrEventList).catch(() => {});
  }, []);
  // Trainingsziele: Settings + aktuelles Kalenderjahr laden – unabhängig vom Jahresfilter der Seite
  useEffect(() => {
    api.getSettings().then(s => {
      setYearlyKmGoal(s.yearly_km_goal);
      setWeeklyHoursGoal(s.weekly_hours_goal);
    }).catch(() => {});
    api.activityStats(new Date().getFullYear()).then(s => setCurrentYearKm(s.total_km)).catch(() => {});
  }, []);

  function dismissPrEvent(id: number) {
    setPrEventList(list => list.filter(e => e.id !== id));
    api.dismissPrEvent(id).catch(() => {});
  }

  function handleYearChange(year: string | null) {
    setSelectedYear(year);
    load(year);
  }

  const chartData = sparkData.map((d, i) => ({
    label: sparkLabels[i] ?? '',
    km: Math.round(d.distance_km),
    count: d.count,
    hm: Math.round(d.elevation_m),
  }));

  const maxVolMin = Math.max(
    1,
    ...weeklyVol.map(w => w.ride_minutes + w.workout_minutes + w.weight_training_minutes)
  );
  const BAR_MAX_PX = 64;
  const hasVolData = weeklyVol.some(
    w => w.ride_minutes + w.workout_minutes + w.weight_training_minutes > 0
  );

  function barPx(minutes: number) {
    return Math.round((minutes / maxVolMin) * BAR_MAX_PX);
  }

  function volLabel(w: WeeklyVolume) {
    return w.weeks_ago === 0 ? t('charts.current') : t('charts.weeksAgo', { weeks: w.weeks_ago });
  }

  const currentWeek = weeklyVol.find(w => w.weeks_ago === 0);
  const currentWeekHours = currentWeek
    ? (currentWeek.ride_minutes + currentWeek.workout_minutes + currentWeek.weight_training_minutes) / 60
    : null;

  const availableYears = stats?.available_years ?? [];
  const hasData = !loading && stats != null && stats.total_rides > 0;

  return (
    <div className="space-y-6">
      {error && (
        <p className="text-destructive text-sm rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
          {t('error.backendUnreachable', { message: error })}
        </p>
      )}

      {/* ── Hero: Letzter Ride ── */}
      <HeroBanner activity={recentActivities[0] ?? null} loading={loading} />

      {/* ── Trainingsziele ── */}
      <GoalWidget
        yearlyKmGoal={yearlyKmGoal}
        weeklyHoursGoal={weeklyHoursGoal}
        yearKm={currentYearKm}
        weekHours={currentWeekHours}
      />

      {/* ── Neue Bestzeit ── */}
      <PrWidget events={prEventList} onDismiss={dismissPrEvent} />

      {/* ── Verschleiß-Warnung ── */}
      {!loading && <WearWarnings bikes={bikes} />}

      {/* ── Trainingsform (TSB) ── */}
      {pmcCurrent && pmcCurrent.ctl > 0 && <TsbWidget current={pmcCurrent} />}

      {/* ── KPI-Block ── */}
      <Card className="overflow-hidden p-0 gap-0">
        {/* Jahr-Selector */}
        {availableYears.length > 0 && (
          <div className="flex items-center gap-1.5 px-5 pt-4 pb-0 flex-wrap">
            <span className="text-[11px] text-muted-foreground mr-1 uppercase tracking-wider">{t('period.label')}</span>
            {[null, ...availableYears].map(y => {
              const active = y === selectedYear;
              return (
                <button
                  key={y ?? 'all'}
                  onClick={() => handleYearChange(y)}
                  className="text-xs px-3 py-1 rounded-full font-medium transition-all duration-150"
                  style={
                    active
                      ? { background: 'var(--primary)', color: 'var(--primary-foreground)' }
                      : { background: 'var(--muted)', color: 'var(--muted-foreground)' }
                  }
                >
                  {y ?? t('period.all')}
                </button>
              );
            })}
          </div>
        )}

        {/* 4 KPI-Tiles */}
        {hasData ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 divide-border mt-3">
              <KpiTile label={t('kpi.activities')} target={stats.total_rides} unit="Rides" loading={loading} />
              <KpiTile label={t('kpi.totalDistance')} target={Math.round(stats.total_km)} unit="km" loading={loading} />
              <KpiTile label={t('kpi.movingTime')} target={Math.round(stats.total_moving_s / 3600)} unit={t('kpi.hours')} loading={loading} />
              <KpiTile label={t('kpi.elevation')} target={Math.round(stats.total_elevation_m)} unit="Hm" loading={loading} />
            </div>

            {/* Durchschnitts-Strip */}
            <div className="grid grid-cols-3 divide-x divide-border border-t border-border">
              <div className="flex flex-col items-center py-3 px-4">
                <p className="text-base font-bold text-foreground tabular-nums">{stats.avg_km.toFixed(1)} km</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{t('kpi.avgRide')}</p>
              </div>
              <div className="flex flex-col items-center py-3 px-4">
                <p className="text-base font-bold text-foreground tabular-nums">{stats.avg_speed_kmh.toFixed(1)} km/h</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{t('kpi.avgSpeed')}</p>
              </div>
              <div className="flex flex-col items-center py-3 px-4">
                {stats.avg_hr ? (
                  <>
                    <p className="text-base font-bold text-foreground tabular-nums">{Math.round(stats.avg_hr)} bpm</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{t('kpi.avgHr')}</p>
                  </>
                ) : stats.avg_power_w ? (
                  <>
                    <p className="text-base font-bold text-foreground tabular-nums">{Math.round(stats.avg_power_w)} W</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{t('kpi.avgPower')}</p>
                  </>
                ) : (
                  <>
                    <p className="text-base font-bold text-foreground tabular-nums">
                      {fmtTime(Math.round(stats.total_moving_s / stats.total_rides))}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{t('kpi.avgDuration')}</p>
                  </>
                )}
              </div>
            </div>
          </>
        ) : loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 mt-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex flex-col items-center py-8 px-4">
                <Skeleton className="h-14 w-32 mb-3" />
                <Skeleton className="h-3 w-16" />
              </div>
            ))}
          </div>
        ) : (
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-3">{t('kpi.noData')}</p>
            <Link to="/settings" className="text-sm text-primary hover:underline">
              {t('kpi.openSettings')}
            </Link>
          </CardContent>
        )}
      </Card>

      {/* ── Distanz-Chart ── */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground font-medium">
              {selectedYear
                ? t('charts.distanceYear', { year: selectedYear })
                : t('charts.distanceWeeks', { weeks: config.sparkline_weeks })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={config.chart_height_compact}>
              <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--primary)" stopOpacity={1} />
                    <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.3} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<DistanzSparkTooltip />} />
                <Bar dataKey="km" fill="url(#barGrad)" radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* ── Trainingsvolumen ── */}
      {hasVolData && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-sm text-muted-foreground font-medium">
                {t('charts.volumeTitle', { weeks: VOL_WEEKS })}
              </CardTitle>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full inline-block" style={{ background: '#3b82f6' }} />
                  {t('charts.legendRide')}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full inline-block" style={{ background: '#a78bfa' }} />
                  {t('charts.legendWorkout')}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full inline-block" style={{ background: '#f59e0b' }} />
                  {t('charts.legendStrength')}
                </span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-1" style={{ height: `${BAR_MAX_PX + 20}px` }}>
              {weeklyVol.map((w, i) => {
                const total = w.ride_minutes + w.workout_minutes + w.weight_training_minutes;
                const ridePx = barPx(w.ride_minutes);
                const workoutPx = barPx(w.workout_minutes);
                const weightPx = barPx(w.weight_training_minutes);
                return (
                  <div key={i} className="flex flex-col items-center flex-1 min-w-0">
                    <div
                      className="w-full flex flex-col-reverse rounded-sm overflow-hidden"
                      style={{ height: `${barPx(total)}px` }}
                      title={t('charts.totalMinutesTooltip', { label: volLabel(w), minutes: Math.round(total) })}
                    >
                      {w.weight_training_minutes > 0 && (
                        <div style={{ height: `${weightPx}px`, background: '#f59e0b', flexShrink: 0 }} />
                      )}
                      {w.workout_minutes > 0 && (
                        <div style={{ height: `${workoutPx}px`, background: '#a78bfa', flexShrink: 0 }} />
                      )}
                      {w.ride_minutes > 0 && (
                        <div style={{ height: `${ridePx}px`, background: '#3b82f6', flexShrink: 0 }} />
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1 truncate w-full text-center">
                      {volLabel(w)}
                    </p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Letzte Aktivitäten + Bikes ── */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Letzte Aktivitäten */}
        <section>
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-3 px-1">
            {t('recent.title')}
          </h2>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-xl" />
              ))}
            </div>
          ) : (
            <div className="space-y-1.5">
              {recentActivities.map((act, i) => (
                <Link
                  key={act.id}
                  to={`/activities/${act.id}`}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-3 hover:bg-muted transition-all duration-200 hover:border-primary/40 group"
                >
                  {/* farbige Akzent-Linie – leichte Variation über die 5 Einträge */}
                  <div
                    className="w-1 h-9 rounded-full shrink-0 transition-opacity duration-200 opacity-50 group-hover:opacity-90"
                    style={{ background: `hsl(${220 - i * 28},75%,55%)` }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm leading-snug truncate group-hover:text-primary transition-colors">
                      {rideTitle(act, t)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {fmtWeekday(act.start_date)}, {fmtDate(act.start_date)}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-sm tabular-nums">{fmtKm(act.distance_m)} km</p>
                    {act.avg_speed_ms && (
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {fmtSpeed(act.avg_speed_ms)} km/h
                      </p>
                    )}
                  </div>
                </Link>
              ))}
              {recentActivities.length === 0 && (
                <p className="text-sm text-muted-foreground px-1">{t('recent.empty')}</p>
              )}
              <Link to="/activities" className="block pt-1 px-1 text-xs text-primary hover:underline">
                {t('recent.viewAll')}
              </Link>
            </div>
          )}
        </section>

        {/* Bikes */}
        <section>
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-3 px-1">
            {t('bikes.title')}
          </h2>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full rounded-xl" />
              <Skeleton className="h-16 w-full rounded-xl" />
            </div>
          ) : bikes.length === 0 ? (
            <p className="text-sm text-muted-foreground px-1">{t('bikes.empty')}</p>
          ) : (
            <div className="space-y-1.5">
              {bikes.map(bike => {
                const maxRides = Math.max(...bikes.map(b => b.ride_count));
                const pct = maxRides > 0 ? (bike.ride_count / maxRides) * 100 : 0;
                return (
                  <Link
                    key={bike.id}
                    to={`/bikes/${bike.id}`}
                    className="block rounded-xl border border-border bg-card px-4 py-3 hover:bg-muted transition-all duration-200 hover:border-primary/40 group"
                  >
                    <div className="flex items-center justify-between mb-2.5">
                      <p className="font-semibold text-sm group-hover:text-primary transition-colors">
                        {bike.name}
                      </p>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {bike.ride_count} Rides
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${pct}%`, background: 'var(--primary)' }}
                      />
                    </div>
                  </Link>
                );
              })}
              <Link to="/bikes" className="block pt-1 px-1 text-xs text-primary hover:underline">
                {t('bikes.viewAll')}
              </Link>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
