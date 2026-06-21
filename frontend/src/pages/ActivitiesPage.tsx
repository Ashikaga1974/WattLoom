import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { api, type Activity, type Bike, type OtherActivity } from '@/lib/api';
import { fmtKm, fmtTime, fmtDate, fmtClock, fmtWeekday, fmtSpeed } from '@/lib/format';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

const PAGE_SIZE = 50;

type Tab = 'rides' | 'workouts';

// Sport-Typ → deutsches Label + Badge-Farbe
const SPORT_MAP: Record<string, { label: string; cls: string }> = {
  'Weight Training':   { label: 'Krafttraining', cls: 'bg-orange-500/15 text-orange-500 dark:text-orange-400 border border-orange-500/20' },
  'Krafttraining':     { label: 'Krafttraining', cls: 'bg-orange-500/15 text-orange-500 dark:text-orange-400 border border-orange-500/20' },
  'Strength Training': { label: 'Krafttraining', cls: 'bg-orange-500/15 text-orange-500 dark:text-orange-400 border border-orange-500/20' },
  'Fitness':           { label: 'Fitness',        cls: 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border border-yellow-500/20' },
  'Run':               { label: 'Laufen',         cls: 'bg-green-500/15 text-green-600 dark:text-green-400 border border-green-500/20' },
  'Trail Run':         { label: 'Trail Run',       cls: 'bg-green-600/15 text-green-700 dark:text-green-400 border border-green-600/20' },
  'Walk':              { label: 'Wandern',         cls: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20' },
  'Hike':              { label: 'Wandern',         cls: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20' },
  'Swim':              { label: 'Schwimmen',       cls: 'bg-blue-500/15 text-blue-500 dark:text-blue-400 border border-blue-500/20' },
  'Yoga':              { label: 'Yoga',            cls: 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/20' },
};

function getSport(sportType: string) {
  return SPORT_MAP[sportType] ?? {
    label: sportType,
    cls: 'bg-muted text-muted-foreground border border-border/60',
  };
}

// Kalorien → Farb-Klasse (kühle Töne = wenig, warm = viel)
function calColor(kcal: number): string {
  if (kcal < 380) return 'text-sky-500 dark:text-sky-400';
  if (kcal < 480) return 'text-emerald-500 dark:text-emerald-400';
  if (kcal < 560) return 'text-yellow-500 dark:text-yellow-400';
  return 'text-orange-500 dark:text-orange-400';
}

// YYYY-MM-DD → "15.01.2024" / "Mo."  (noon UTC → kein TZ-Datumssprung)
function fmtWorkoutDate(d: string) { return fmtDate(d + 'T12:00:00'); }
function fmtWorkoutDay(d: string)  { return fmtWeekday(d + 'T12:00:00'); }

export default function ActivitiesPage() {
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<Tab>('rides');

  // Radtouren
  const [activities, setActivities]   = useState<Activity[]>([]);
  const [total, setTotal]             = useState(0);
  const [offset, setOffset]           = useState(0);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);

  // Workouts
  const [workouts, setWorkouts]             = useState<OtherActivity[]>([]);
  const [loadingWorkouts, setLoadingWorkouts] = useState(false);

  // Filter
  const [filterYear, setFilterYear]         = useState('');
  const [filterBike, setFilterBike]         = useState('');
  const [filterHasTrack, setFilterHasTrack] = useState(false);
  const [sortBy, setSortBy]                 = useState('start_date');

  const [availableYears, setAvailableYears] = useState<string[]>([]);
  const [bikes, setBikes]                   = useState<Bike[]>([]);

  // Inline-Aktionen
  const [confirmingId, setConfirmingId]     = useState<number | null>(null);
  const [deletingId, setDeletingId]         = useState<number | null>(null);
  const [editingPowerId, setEditingPowerId] = useState<number | null>(null);
  const [editingPowerValue, setEditingPowerValue] = useState('');

  const sortLabels: Record<string, string> = {
    start_date: 'Datum', distance_m: 'Distanz', moving_time_s: 'Zeit',
    avg_speed_ms: 'Geschwindigkeit', elevation_gain_m: 'Höhenmeter',
  };

  async function loadMeta() {
    try {
      const [s, b] = await Promise.all([api.activityStats(), api.bikes()]);
      setAvailableYears(s.available_years);
      setBikes(b);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Filterdaten konnten nicht geladen werden');
    }
  }

  async function load(newOffset = offset) {
    setLoading(true);
    setError(null);
    try {
      const res = await api.activities({
        limit: PAGE_SIZE, offset: newOffset,
        year: filterYear || undefined,
        bike_id: filterBike || undefined,
        has_track: filterHasTrack ? true : undefined,
        sort_by: sortBy, sort_dir: 'desc',
      });
      setActivities(res.items);
      setTotal(res.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unbekannter Fehler');
    } finally {
      setLoading(false);
    }
  }

  async function loadWorkouts() {
    setLoadingWorkouts(true);
    try {
      const data = await api.otherActivities(filterYear ? parseInt(filterYear) : undefined);
      setWorkouts(data);
    } catch {
      // Fehler stillschweigend ignorieren
    } finally {
      setLoadingWorkouts(false);
    }
  }

  useEffect(() => {
    loadMeta().then(() => {
      load(0);
      loadWorkouts();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyFilters() {
    setOffset(0);
    load(0);
    loadWorkouts();
  }

  function prevPage() {
    const newOffset = Math.max(0, offset - PAGE_SIZE);
    setOffset(newOffset);
    load(newOffset);
  }

  function nextPage() {
    const newOffset = offset + PAGE_SIZE;
    setOffset(newOffset);
    load(newOffset);
  }

  function startEditPower(act: Activity, e: React.MouseEvent) {
    e.stopPropagation();
    setEditingPowerId(act.id);
    setEditingPowerValue(act.avg_power_w != null ? String(Math.round(act.avg_power_w)) : '');
  }

  async function savePower(actId: number) {
    const parsed = editingPowerValue.trim() === '' ? null : parseFloat(editingPowerValue);
    if (parsed !== null && isNaN(parsed)) { setEditingPowerId(null); return; }
    try {
      await api.updateActivityPower(actId, parsed);
      setActivities(prev => prev.map(a => a.id === actId ? { ...a, avg_power_w: parsed } : a));
    } catch { /* Fehler ignorieren */ }
    setEditingPowerId(null);
  }

  async function handleDelete(id: number) {
    setDeletingId(id);
    try {
      await api.deleteActivity(id);
      setActivities(prev => prev.filter(a => a.id !== id));
      setTotal(prev => prev - 1);
      setConfirmingId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler beim Löschen');
    } finally {
      setDeletingId(null);
    }
  }

  const totalPages  = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  // Workout-Statistik: Label → Anzahl (für die Chip-Leiste)
  const workoutStats = workouts.reduce((acc, w) => {
    const key = getSport(w.sport_type).label;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Neueste zuerst
  const workoutsSorted = [...workouts].reverse();

  return (
    <div className="space-y-4">
      <PageHeader title="Aktivitäten" />

      {/* ── Tab-Leiste ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-8 border-b border-border">
        {(['rides', 'workouts'] as Tab[]).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'pb-3 text-sm font-medium transition-colors relative flex items-center gap-2 whitespace-nowrap',
              activeTab === tab
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {tab === 'rides' ? 'Radtouren' : 'Workouts'}
            <span className={cn(
              'text-xs px-2 py-0.5 rounded-full font-normal transition-colors',
              activeTab === tab
                ? 'bg-primary/15 text-primary'
                : 'bg-muted text-muted-foreground',
            )}>
              {tab === 'rides'
                ? total.toLocaleString('de-DE')
                : workouts.length.toLocaleString('de-DE')}
            </span>
            {activeTab === tab && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* ── Filterleiste ───────────────────────────────────────────── */}
      <Card>
        <CardContent className="py-3">
          <div className="flex flex-wrap gap-3 items-center">
            <Select value={filterYear || 'all'} onValueChange={v => setFilterYear(!v || v === 'all' ? '' : v)}>
              <SelectTrigger className="w-32 h-8 text-sm">
                <SelectValue>{filterYear || 'Alle Jahre'}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Jahre</SelectItem>
                {availableYears.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
              </SelectContent>
            </Select>

            {activeTab === 'rides' && (
              <>
                <Select value={filterBike || 'all'} onValueChange={v => setFilterBike(!v || v === 'all' ? '' : v)}>
                  <SelectTrigger className="w-40 h-8 text-sm">
                    <SelectValue>
                      {filterBike ? (bikes.find(b => b.id === filterBike)?.name ?? filterBike) : 'Alle Bikes'}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alle Bikes</SelectItem>
                    {bikes.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>

                <Select value={sortBy} onValueChange={v => setSortBy(v ?? 'start_date')}>
                  <SelectTrigger className="w-44 h-8 text-sm">
                    <SelectValue>{sortLabels[sortBy] ?? sortBy}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="start_date">Datum</SelectItem>
                    <SelectItem value="distance_m">Distanz</SelectItem>
                    <SelectItem value="moving_time_s">Zeit</SelectItem>
                    <SelectItem value="avg_speed_ms">Geschwindigkeit</SelectItem>
                    <SelectItem value="elevation_gain_m">Höhenmeter</SelectItem>
                  </SelectContent>
                </Select>

                <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={filterHasTrack}
                    onChange={e => setFilterHasTrack(e.target.checked)}
                    className="accent-primary w-4 h-4"
                  />
                  Nur mit Track
                </label>
              </>
            )}

            <Button size="sm" onClick={applyFilters}>Anwenden</Button>

            <span className="ml-auto text-sm text-muted-foreground">
              {activeTab === 'rides'
                ? `${total.toLocaleString('de-DE')} Radtouren`
                : `${workouts.length.toLocaleString('de-DE')} Workouts`}
            </span>
          </div>
        </CardContent>
      </Card>

      {error && <p className="text-destructive text-sm px-2">{error}</p>}

      {/* ── RADTOUREN ──────────────────────────────────────────────── */}
      {activeTab === 'rides' && (
        <>
          <Card className="overflow-hidden p-0 gap-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Datum</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider hidden sm:table-cell">Uhrzeit</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Name</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Distanz</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Dauer</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">km/h</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider hidden md:table-cell">Hm</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider hidden md:table-cell">HR</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider hidden lg:table-cell">Watt</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    Array.from({ length: 10 }).map((_, i) => (
                      <tr key={i} className="border-b border-border/50">
                        <td colSpan={10} className="px-4 py-3">
                          <Skeleton className="h-4" style={{ width: `${60 + (i % 5) * 8}%` }} />
                        </td>
                      </tr>
                    ))
                  ) : activities.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-10 text-center text-muted-foreground">
                        Keine Aktivitäten gefunden.
                      </td>
                    </tr>
                  ) : (
                    activities.map(act => (
                      <tr
                        key={act.id}
                        className="border-b border-border/50 hover:bg-muted/40 cursor-pointer transition-colors"
                        onClick={() => navigate(`/activities/${act.id}`)}
                      >
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap text-xs">
                          <div className="flex items-center gap-1">
                            <span>{fmtDate(act.start_date)}</span>
                            <span className="text-muted-foreground/50">{fmtWeekday(act.start_date)}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap text-xs hidden sm:table-cell">
                          {fmtClock(act.start_date)}
                        </td>
                        <td className="px-4 py-3 max-w-xs">
                          <span className="truncate block font-medium">{act.name}</span>
                          <span className="flex items-center gap-1.5 flex-wrap">
                            {act.bike_id && (
                              <span className="text-xs text-muted-foreground">
                                {bikes.find(b => b.id === act.bike_id)?.name ?? act.bike_id}
                              </span>
                            )}
                            {act.smart_device && (
                              <span className="text-xs px-1.5 py-0 rounded-full bg-muted text-muted-foreground border border-border/60 leading-5">
                                {act.smart_device}
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmtKm(act.distance_m)} km</td>
                        <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{fmtTime(act.moving_time_s)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{act.avg_speed_ms ? fmtSpeed(act.avg_speed_ms) : '–'}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-muted-foreground hidden md:table-cell">
                          {act.elevation_gain_m ? Math.round(act.elevation_gain_m) : '–'}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-muted-foreground hidden md:table-cell">
                          {act.avg_hr ? Math.round(act.avg_hr) : '–'}
                        </td>
                        <td
                          className="px-4 py-3 text-right tabular-nums text-muted-foreground hidden lg:table-cell"
                          onClick={act.manual ? e => startEditPower(act, e) : undefined}
                        >
                          {act.manual && editingPowerId === act.id ? (
                            <input
                              autoFocus type="number" min={0} max={2000}
                              value={editingPowerValue}
                              onChange={e => setEditingPowerValue(e.target.value)}
                              onBlur={() => savePower(act.id)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') savePower(act.id);
                                if (e.key === 'Escape') setEditingPowerId(null);
                              }}
                              className="w-16 text-right bg-muted border border-border rounded px-1 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                            />
                          ) : act.manual ? (
                            <span className="cursor-pointer underline decoration-dotted hover:text-foreground" title="Klicken zum Bearbeiten">
                              {act.avg_power_w != null ? `${Math.round(act.avg_power_w)} W` : '+ W'}
                            </span>
                          ) : act.avg_power_w ? (
                            <span className="flex flex-col items-end leading-tight">
                              <span>{Math.round(act.avg_power_w)} W</span>
                              {act.est_norm_power_w && (
                                <span className="text-muted-foreground/60 text-xs" title="Normalized Power (Schätzung)">
                                  NP ~{Math.round(act.est_norm_power_w)}
                                </span>
                              )}
                            </span>
                          ) : act.est_avg_power_w ? (
                            <span className="flex flex-col items-end leading-tight" title="Physikalische Schätzung">
                              <span className="text-muted-foreground">~{Math.round(act.est_avg_power_w)} W</span>
                              {act.est_norm_power_w && (
                                <span className="text-muted-foreground/60 text-xs">
                                  NP ~{Math.round(act.est_norm_power_w)}
                                </span>
                              )}
                            </span>
                          ) : '–'}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                          {confirmingId === act.id ? (
                            <span className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => handleDelete(act.id)}
                                disabled={deletingId === act.id}
                                className="text-xs px-2 py-0.5 rounded bg-destructive text-destructive-foreground hover:bg-destructive/80 disabled:opacity-50"
                              >
                                {deletingId === act.id ? '…' : 'Ja'}
                              </button>
                              <button
                                onClick={() => setConfirmingId(null)}
                                className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground hover:bg-muted/80"
                              >
                                Nein
                              </button>
                            </span>
                          ) : (
                            <button
                              onClick={() => setConfirmingId(act.id)}
                              className="text-muted-foreground/30 hover:text-destructive transition-colors p-1 rounded hover:bg-destructive/10"
                              title="Löschen"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm">
              <Button variant="outline" size="sm" onClick={prevPage} disabled={offset === 0}>
                ← Zurück
              </Button>
              <span className="text-muted-foreground">Seite {currentPage} / {totalPages}</span>
              <Button variant="outline" size="sm" onClick={nextPage} disabled={offset + PAGE_SIZE >= total}>
                Weiter →
              </Button>
            </div>
          )}
        </>
      )}

      {/* ── WORKOUTS ───────────────────────────────────────────────── */}
      {activeTab === 'workouts' && (
        <>
          {/* Sportart-Chips mit Anzahl */}
          {!loadingWorkouts && workouts.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {Object.entries(workoutStats)
                .sort(([, a], [, b]) => b - a)
                .map(([label, count]) => {
                  const entry = Object.values(SPORT_MAP).find(s => s.label === label);
                  const cls = entry?.cls ?? 'bg-muted text-muted-foreground border border-border/60';
                  return (
                    <span key={label} className={cn('inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium', cls)}>
                      {label}
                      <span className="opacity-60 text-xs font-normal">{count}×</span>
                    </span>
                  );
                })}
            </div>
          )}

          <Card className="overflow-hidden p-0 gap-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Datum</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider hidden sm:table-cell">Tag</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Sportart</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Dauer</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">kcal</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingWorkouts ? (
                    Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i} className="border-b border-border/50">
                        <td colSpan={5} className="px-4 py-3">
                          <Skeleton className="h-4" style={{ width: `${50 + (i % 4) * 10}%` }} />
                        </td>
                      </tr>
                    ))
                  ) : workoutsSorted.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                        Keine Workouts gefunden.
                      </td>
                    </tr>
                  ) : (
                    workoutsSorted.map((w, i) => {
                      const sport = getSport(w.sport_type);
                      return (
                        <tr key={i} onClick={() => navigate(`/workouts/${w.id}`)} className="border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer">
                          <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">
                            {fmtWorkoutDate(w.date)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground hidden sm:table-cell">
                            {fmtWorkoutDay(w.date)}
                          </td>
                          <td className="px-4 py-3">
                            <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium', sport.cls)}>
                              {sport.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                            {fmtTime(w.moving_time_s)}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums font-medium">
                            {w.calories != null
                              ? <span className={calColor(w.calories)}>{Math.round(w.calories)}</span>
                              : <span className="text-muted-foreground">–</span>}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
