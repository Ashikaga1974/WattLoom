import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Activity, type OtherActivity } from '@/lib/api';
import { PageHeader } from '@/components/ui/page-header';

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const MONTHS_FULL = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

// toISOString() gibt immer UTC zurück – bei UTC+2 ist lokale Mitternacht = UTC Vortag 22:00,
// wodurch alle Kalender-Zellen einen Tag zu früh landen. Daher lokale Datumsmethoden nutzen.
function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface DayCell {
  date: string;   // YYYY-MM-DD
  km: number;
  acts: Activity[];
  workouts: OtherActivity[];
}

interface MonthLabel { label: string; weekIndex: number; }

// Farbklassen je km-Bereich; reine Workout-Tage erhalten eigene Farbe
function colorClass(day: DayCell | null): string {
  if (!day) return '';
  if (day.acts.length === 0 && day.workouts.length > 0) return 'bg-slate-300 hover:bg-slate-400 dark:bg-slate-600 dark:hover:bg-slate-500';
  if (day.acts.length === 0) return 'bg-muted hover:bg-muted/80';
  if (day.km < 15)  return 'bg-orange-200 hover:bg-orange-300';
  if (day.km < 30)  return 'bg-orange-400 hover:bg-orange-500';
  if (day.km < 50)  return 'bg-orange-500 hover:bg-orange-600';
  return              'bg-primary hover:bg-primary/80';
}

function buildCalendar(year: number, activities: Activity[], workouts: OtherActivity[]): {
  weeks: (DayCell | null)[][];
  monthLabels: MonthLabel[];
} {
  const byDate = new Map<string, Activity[]>();
  for (const act of activities) {
    const d = new Date(act.start_date.endsWith('Z') ? act.start_date : act.start_date + 'Z');
    const key = localDateStr(d);
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key)!.push(act);
  }

  const workoutsByDate = new Map<string, OtherActivity[]>();
  for (const w of workouts) {
    // w.date ist UTC-Datum aus DB ("YYYY-MM-DD") → mittags parsen verhindert Tagsgrenzen-Probleme
    const localKey = localDateStr(new Date(w.date + 'T12:00:00Z'));
    if (!workoutsByDate.has(localKey)) workoutsByDate.set(localKey, []);
    workoutsByDate.get(localKey)!.push(w);
  }

  const end = new Date(year, 11, 31);
  const start = new Date(year, 0, 1);
  // Montag = 0
  const isoDay = (d: Date) => (d.getDay() + 6) % 7;
  const gridStart = new Date(start);
  gridStart.setDate(gridStart.getDate() - isoDay(start));

  const weeks: (DayCell | null)[][] = [];
  const monthLabels: MonthLabel[] = [];
  const seenMonths = new Set<number>();
  const cursor = new Date(gridStart);

  while (cursor <= end || weeks.length === 0) {
    const week: (DayCell | null)[] = [];
    for (let dow = 0; dow < 7; dow++) {
      const inYear = cursor.getFullYear() === year;
      if (inYear) {
        const dateStr = localDateStr(cursor);
        const acts = byDate.get(dateStr) ?? [];
        const km = acts.reduce((s, a) => s + a.distance_m / 1000, 0);
        const dayWorkouts = workoutsByDate.get(dateStr) ?? [];
        week.push({ date: dateStr, km, acts, workouts: dayWorkouts });
        const mo = cursor.getMonth();
        if (dow === 0 && !seenMonths.has(mo)) {
          seenMonths.add(mo);
          monthLabels.push({ label: MONTHS_SHORT[mo], weekIndex: weeks.length });
        }
      } else {
        week.push(null);
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
    if (cursor.getFullYear() > year) break;
  }

  return { weeks, monthLabels };
}

interface TooltipState { x: number; y: number; day: DayCell; }

export default function CalendarPage() {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [availableYears, setAvailableYears] = useState<string[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [workouts, setWorkouts]     = useState<OtherActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  useEffect(() => {
    async function init() {
      const stats = await api.activityStats();
      setAvailableYears(stats.available_years);
      const [res, wo] = await Promise.all([
        api.activities({ limit: 500, year: currentYear }),
        api.otherActivities(currentYear),
      ]);
      setActivities(res.items);
      setWorkouts(wo);
    }
    init()
      .catch(e => setError(e instanceof Error ? e.message : 'Fehler'))
      .finally(() => setLoading(false));
  }, []);

  async function reload(year: number) {
    setLoading(true);
    setError(null);
    try {
      const [res, wo] = await Promise.all([
        api.activities({ limit: 500, year }),
        api.otherActivities(year),
      ]);
      setActivities(res.items);
      setWorkouts(wo);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler');
    } finally {
      setLoading(false);
    }
  }

  function handleYearChange(y: string | null) {
    const year = y && y !== 'all' ? Number(y) : currentYear;
    setSelectedYear(year);
    reload(year);
  }

  const { weeks, monthLabels } = buildCalendar(selectedYear, activities, workouts);
  const activeDays = new Set(activities.map(a => {
    const d = new Date(a.start_date.endsWith('Z') ? a.start_date : a.start_date + 'Z');
    return localDateStr(d);
  })).size;
  const totalKm = activities.reduce((s, a) => s + a.distance_m / 1000, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Aktivitätskalender"
        subtitle={!loading ? `${activeDays} aktive Tage · ${Math.round(totalKm).toLocaleString('de-DE')} km` : undefined}
        years={availableYears}
        selectedYear={selectedYear}
        onYearChange={handleYearChange}
      />

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>
      )}

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 pointer-events-none rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-xl"
          style={{ left: tooltip.x + 12, top: tooltip.y - 8 }}
        >
          <p className="font-semibold">{tooltip.day.date}</p>
          {tooltip.day.acts.length === 0 && tooltip.day.workouts.length === 0 ? (
            <p className="text-muted-foreground">Kein Training</p>
          ) : (
            <>
              {tooltip.day.acts.length > 0 && (
                <p className="text-primary">{tooltip.day.km.toFixed(1)} km · {tooltip.day.acts.length} Ride{tooltip.day.acts.length > 1 ? 's' : ''}</p>
              )}
              {tooltip.day.acts.slice(0, 2).map(a => (
                <p key={a.id} className="max-w-48 truncate text-muted-foreground">{a.name}</p>
              ))}
              {tooltip.day.acts.length > 2 && <p className="text-muted-foreground">+ {tooltip.day.acts.length - 2} weitere</p>}
              {tooltip.day.workouts.map((w, i) => (
                <p key={i} className="text-slate-500">{w.sport_type}</p>
              ))}
            </>
          )}
        </div>
      )}

      {loading ? (
        <div className="h-40 animate-pulse rounded-xl bg-muted" />
      ) : (
        <>
          {/* Kalender-Grid */}
          <div className="overflow-x-auto">
            <div className="inline-flex gap-1 min-w-max">
              {/* Wochentag-Labels */}
              <div className="flex flex-col gap-1 mr-1 pt-6">
                {WEEKDAYS.map((wd, i) => (
                  <div key={wd} className="h-3 w-5 text-right text-[10px] leading-3 text-muted-foreground">
                    {i % 2 === 0 ? wd : ''}
                  </div>
                ))}
              </div>

              {/* Wochen-Spalten */}
              <div className="flex flex-col">
                {/* Monat-Labels */}
                <div className="relative h-5 mb-1">
                  {monthLabels.map(({ label, weekIndex }) => (
                    <span
                      key={label}
                      className="absolute text-[10px] text-muted-foreground"
                      style={{ left: weekIndex * 16 }}
                    >{label}</span>
                  ))}
                </div>

                {/* Tages-Zellen */}
                <div className="flex gap-1">
                  {weeks.map((week, wi) => (
                    <div key={wi} className="flex flex-col gap-1">
                      {week.map((day, di) => {
                        if (!day) {
                          return <div key={di} className="h-3 w-3 rounded-sm" />;
                        }
                        const hasRide    = day.acts.length > 0;
                        const hasWorkout = day.workouts.length > 0;
                        const ringClass  = hasRide && hasWorkout ? 'ring-1 ring-slate-400 ring-offset-0' : '';
                        if (hasRide) {
                          const href = day.acts.length === 1
                            ? `/activities/${day.acts[0].id}`
                            : `/activities?date=${day.date}`;
                          return (
                            <Link
                              key={di}
                              to={href}
                              className={`h-3 w-3 rounded-sm cursor-pointer transition-colors ${colorClass(day)} ${ringClass}`}
                              onMouseEnter={e => setTooltip({ x: e.pageX, y: e.pageY, day })}
                              onMouseLeave={() => setTooltip(null)}
                              aria-label={`${day.date}: ${day.km.toFixed(1)} km`}
                            />
                          );
                        }
                        return (
                          <div
                            key={di}
                            className={`h-3 w-3 rounded-sm ${colorClass(day)}`}
                            onMouseEnter={e => setTooltip({ x: e.pageX, y: e.pageY, day })}
                            onMouseLeave={() => setTooltip(null)}
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Legende */}
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>Weniger</span>
            <div className="h-3 w-3 rounded-sm bg-muted" />
            <div className="h-3 w-3 rounded-sm bg-orange-200" />
            <div className="h-3 w-3 rounded-sm bg-orange-400" />
            <div className="h-3 w-3 rounded-sm bg-orange-500" />
            <div className="h-3 w-3 rounded-sm bg-primary" />
            <span>Mehr</span>
            <span className="text-muted-foreground">(&lt;15 / 15–30 / 30–50 / 50+ km)</span>
            <span className="ml-4 flex items-center gap-1.5">
              <div className="h-3 w-3 rounded-sm bg-slate-300 dark:bg-slate-600" />
              Workout
            </span>
            <span className="flex items-center gap-1.5">
              <div className="h-3 w-3 rounded-sm bg-orange-400 ring-1 ring-slate-400" />
              Ride + Workout
            </span>
          </div>

          {/* Monatsübersicht */}
          <section>
            <h2 className="mb-3 text-lg font-semibold">Monatsübersicht</h2>
            <div className="grid grid-cols-3 gap-2 md:grid-cols-6">
              {Array.from({ length: 12 }, (_, mo) => {
                const moActs = activities.filter(a => {
                  const d = new Date(a.start_date.endsWith('Z') ? a.start_date : a.start_date + 'Z');
                  return d.getMonth() === mo;
                });
                const moKm = moActs.reduce((s, a) => s + a.distance_m / 1000, 0);
                return (
                  <div key={mo} className={`rounded-lg bg-muted/60 p-3 ${moActs.length === 0 ? 'opacity-40' : ''}`}>
                    <p className="text-xs text-muted-foreground">{MONTHS_FULL[mo]}</p>
                    <p className="mt-0.5 text-lg font-bold">
                      {moActs.length > 0 ? Math.round(moKm) : '–'}
                      <span className="text-xs font-normal text-muted-foreground">{moActs.length > 0 ? ' km' : ''}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">{moActs.length} Ride{moActs.length !== 1 ? 's' : ''}</p>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
