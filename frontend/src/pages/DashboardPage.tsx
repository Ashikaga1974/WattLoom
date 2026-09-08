import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { api, type ActivityStats, type Bike, type Activity, type WeeklyStats, type MonthlyStats, type WeeklyVolume, type PmcDay, type PrEvent } from '@/lib/api';
import { useConfig } from '@/lib/config-context';

import { HeroBanner } from './dashboard/HeroBanner';
import { GoalWidget } from './dashboard/GoalWidget';
import { PrWidget } from './dashboard/PrWidget';
import { WearWarnings } from './dashboard/WearWarnings';
import { TsbWidget } from './dashboard/TsbWidget';
import { KpiSection } from './dashboard/KpiSection';
import { DistanceChart } from './dashboard/DistanceChart';
import { VolumeChart } from './dashboard/VolumeChart';
import { RecentActivitiesList } from './dashboard/RecentActivitiesList';
import { BikesList } from './dashboard/BikesList';

const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const VOL_WEEKS = 8;

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

  const currentWeek = weeklyVol.find(w => w.weeks_ago === 0);
  const currentWeekHours = currentWeek
    ? (currentWeek.ride_minutes + currentWeek.workout_minutes + currentWeek.weight_training_minutes) / 60
    : null;

  const availableYears = stats?.available_years ?? [];

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
      <KpiSection
        stats={stats}
        loading={loading}
        availableYears={availableYears}
        selectedYear={selectedYear}
        onYearChange={handleYearChange}
      />

      {/* ── Distanz-Chart ── */}
      <DistanceChart
        chartData={chartData}
        selectedYear={selectedYear}
        sparklineWeeks={config.sparkline_weeks}
        chartHeight={config.chart_height_compact}
      />

      {/* ── Trainingsvolumen ── */}
      <VolumeChart weeklyVol={weeklyVol} weeks={VOL_WEEKS} />

      {/* ── Letzte Aktivitäten + Bikes ── */}
      <div className="grid md:grid-cols-2 gap-6">
        <RecentActivitiesList activities={recentActivities} loading={loading} />
        <BikesList bikes={bikes} loading={loading} />
      </div>
    </div>
  );
}
