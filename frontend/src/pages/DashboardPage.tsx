import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';

import { api, type ActivityStats, type Bike, type Activity, type WeeklyStats, type MonthlyStats, type WeeklyVolume } from '@/lib/api';
import { fmtKm, fmtTime, fmtDate, fmtNum, fmtSpeed } from '@/lib/format';
import { SPARKLINE_WEEKS } from '@/lib/config';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const VOL_WEEKS = 8;

function StatCard({
  label,
  value,
  unit,
  loading,
}: {
  label: string;
  value?: string;
  unit?: string;
  loading: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-9 w-32" />
        ) : (
          <p className="text-3xl font-bold text-foreground">
            {value}
            {unit && <span className="text-base font-normal text-muted-foreground ml-1">{unit}</span>}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<ActivityStats | null>(null);
  const [bikes, setBikes] = useState<Bike[]>([]);
  const [recentActivities, setRecentActivities] = useState<Activity[]>([]);
  const [sparkData, setSparkData] = useState<(WeeklyStats | MonthlyStats)[]>([]);
  const [sparkLabels, setSparkLabels] = useState<string[]>([]);
  const [weeklyVol, setWeeklyVol] = useState<WeeklyVolume[]>([]);
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
        : api.weeklyStats(SPARKLINE_WEEKS);

      const [s, b, ar, sp, vol] = await Promise.all([
        api.activityStats(yearNum),
        api.bikes(),
        api.activities({ limit: 5, year: yearNum, sort_by: 'start_date', sort_dir: 'desc' }),
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
          (sp as WeeklyStats[]).map(w => (w.weeks_ago === 0 ? 'Akt. W.' : `vor ${w.weeks_ago}W`))
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unbekannter Fehler');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(null);
  }, []);

  function handleYearChange(year: string | null) {
    const next = year === 'all' ? null : year;
    setSelectedYear(next);
    load(next);
  }

  // Daten fürs Sparkline-Diagramm aufbereiten
  const chartData = sparkData.map((d, i) => ({
    label: sparkLabels[i] ?? '',
    km: Math.round(d.distance_km),
    count: d.count,
    hm: Math.round(d.elevation_m),
  }));

  // Gesamttraining-Daten aufbereiten
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
    return w.weeks_ago === 0 ? 'Akt. W.' : `vor ${w.weeks_ago}W`;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        years={stats?.available_years ?? []}
        selectedYear={selectedYear}
        onYearChange={handleYearChange}
      />

      {error && (
        <p className="text-destructive text-sm rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
          Backend nicht erreichbar: {error}
        </p>
      )}

      {/* Stats-Kacheln */}
      {loading && !stats ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-4">
                <Skeleton className="h-9 w-24" />
                <Skeleton className="h-3 w-16 mt-2" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : stats && stats.total_rides > 0 ? (
        <>
          {/* Hauptkacheln */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Aktivitäten" value={fmtNum(stats.total_rides)} loading={false} />
            <StatCard
              label="Distanz"
              value={fmtNum(Math.round(stats.total_km))}
              unit="km"
              loading={false}
            />
            <StatCard
              label="Fahrzeit"
              value={fmtTime(stats.total_moving_s)}
              loading={false}
            />
            <StatCard
              label="Höhenmeter"
              value={fmtNum(Math.round(stats.total_elevation_m))}
              unit="m"
              loading={false}
            />
          </div>

          {/* Durchschnittswerte */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Card size="sm">
              <CardContent>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">⌀ Distanz</p>
                <p className="text-xl font-semibold mt-1">{stats.avg_km.toFixed(1)} km</p>
              </CardContent>
            </Card>
            <Card size="sm">
              <CardContent>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">⌀ Geschwindigkeit</p>
                <p className="text-xl font-semibold mt-1">{stats.avg_speed_kmh.toFixed(1)} km/h</p>
              </CardContent>
            </Card>
            {stats.avg_hr ? (
              <Card size="sm">
                <CardContent>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">⌀ Herzfrequenz</p>
                  <p className="text-xl font-semibold mt-1">{Math.round(stats.avg_hr)} bpm</p>
                </CardContent>
              </Card>
            ) : stats.avg_power_w ? (
              <Card size="sm">
                <CardContent>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">⌀ Leistung</p>
                  <p className="text-xl font-semibold mt-1">{Math.round(stats.avg_power_w)} W</p>
                </CardContent>
              </Card>
            ) : null}
          </div>

          {/* Sparkline-Diagramm (Distanz je Woche/Monat) */}
          {chartData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-muted-foreground">
                  {selectedYear ? `Distanz ${selectedYear} nach Monat` : `Distanz letzte ${SPARKLINE_WEEKS} Wochen`}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
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
                    <Tooltip
                      contentStyle={{
                        background: 'var(--card)',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      formatter={(v: unknown) => `${v} km`}
                    />
                    <Bar dataKey="km" fill="var(--primary)" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Gesamttraining letzte 8 Wochen (gestapelte Balken) */}
          {hasVolData && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm text-muted-foreground">
                    Gesamttraining (letzte {VOL_WEEKS} Wochen)
                  </CardTitle>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <span className="inline-block w-2.5 h-2.5 rounded-full bg-blue-500" />
                      Radfahren
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="inline-block w-2.5 h-2.5 rounded-full bg-violet-400" />
                      Workout
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-400" />
                      Kraft
                    </span>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div
                  className="flex items-end gap-1"
                  style={{ height: `${BAR_MAX_PX + 20}px` }}
                >
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
                          title={`${volLabel(w)}: ${Math.round(total)} min gesamt`}
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
        </>
      ) : !loading ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-3">Keine Daten vorhanden.</p>
            <Link to="/settings" className="text-sm text-primary hover:underline">
              Einstellungen öffnen und Import starten →
            </Link>
          </CardContent>
        </Card>
      ) : null}

      {/* Bikes + Letzte Aktivitäten */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Bikes */}
        <section>
          <h2 className="text-lg font-semibold mb-3">Bikes</h2>
          {loading ? (
            <div className="flex gap-2 flex-wrap">
              <Skeleton className="h-9 w-36 rounded-full" />
              <Skeleton className="h-9 w-36 rounded-full" />
            </div>
          ) : bikes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Keine Bikes gefunden.</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {bikes.map(bike => (
                  <Link
                    key={bike.id}
                    to={`/bikes/${bike.id}`}
                    className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm hover:bg-muted transition-colors"
                  >
                    <span className="font-medium">{bike.name}</span>
                    <span className="text-muted-foreground">·</span>
                    <Badge variant="secondary" className="text-xs">
                      {bike.ride_count} Rides
                    </Badge>
                  </Link>
                ))}
              </div>
              <Link to="/bikes" className="block mt-3 text-xs text-muted-foreground hover:text-primary transition-colors">
                Alle Bikes →
              </Link>
            </>
          )}
        </section>

        {/* Letzte Aktivitäten */}
        <section>
          <h2 className="text-lg font-semibold mb-3">Letzte Aktivitäten</h2>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          ) : (
            <>
              <div className="space-y-2">
                {recentActivities.map(act => (
                  <Link
                    key={act.id}
                    to={`/activities/${act.id}`}
                    className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 hover:bg-muted transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="font-medium truncate text-sm">{act.name}</p>
                      <p className="text-xs text-muted-foreground">{fmtDate(act.start_date)}</p>
                    </div>
                    <div className="text-right shrink-0 ml-3 text-sm">
                      <p className="font-medium">{fmtKm(act.distance_m)} km</p>
                      {act.avg_speed_ms && (
                        <p className="text-xs text-muted-foreground">{fmtSpeed(act.avg_speed_ms)} km/h</p>
                      )}
                    </div>
                  </Link>
                ))}
                {recentActivities.length === 0 && (
                  <p className="text-sm text-muted-foreground">Keine Aktivitäten gefunden.</p>
                )}
              </div>
              <Link
                to="/activities"
                className="block mt-3 text-sm text-primary hover:underline"
              >
                Alle Aktivitäten →
              </Link>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
