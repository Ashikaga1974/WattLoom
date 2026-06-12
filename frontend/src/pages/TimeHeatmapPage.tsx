import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/ui/page-header';

const DAYS_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const DAYS_FULL  = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

// Gleiche Logik wie Kalender
function colorClass(count: number, maxCount: number): string {
  if (count === 0) return 'bg-muted hover:bg-muted/80';
  const t = count / maxCount;
  if (t <= 0.25) return 'bg-orange-200 hover:bg-orange-300';
  if (t <= 0.5)  return 'bg-orange-400 hover:bg-orange-500';
  if (t <= 0.75) return 'bg-orange-500 hover:bg-orange-600';
  return                 'bg-primary hover:bg-primary/80';
}

// Zellbreite 16px + gap 4px = Pitch 20px
const PITCH = 20;

interface TooltipState { x: number; y: number; wd: number; h: number; count: number; }

export default function TimeHeatmapPage() {
  const [cells, setCells] = useState<{ weekday: number; hour: number; count: number }[]>([]);
  const [availableYears, setAvailableYears] = useState<string[]>([]);
  const [selectedYear, setSelectedYear] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  async function loadData(year?: string | null) {
    setLoading(true);
    setError(null);
    // Browser-Timezone-Offset: getTimezoneOffset() gibt UTC-local in Minuten zurück → negieren und auf Stunden runden
    const tzOffset = -Math.round(new Date().getTimezoneOffset() / 60);
    try {
      const res = await api.timeHeatmap(year ? Number(year) : undefined, tzOffset);
      setCells(res.cells);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler beim Laden');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    async function init() {
      try {
        const stats = await api.activityStats();
        setAvailableYears(stats.available_years.filter((y) => Number(y) >= 2000));
      } catch { /* ignorieren */ }
      await loadData();
    }
    init();
  }, []);

  const grid: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0));
  for (const c of cells) grid[c.weekday][c.hour] = c.count;

  const maxCount = cells.length ? Math.max(...cells.map((c) => c.count)) : 1;
  const totalCount = cells.reduce((s, c) => s + c.count, 0);

  const weekdaySums = Array(7).fill(0);
  for (const c of cells) weekdaySums[c.weekday] += c.count;
  const peakDay = DAYS_FULL[weekdaySums.indexOf(Math.max(...weekdaySums))];

  const hourSums = Array(24).fill(0);
  for (const c of cells) hourSums[c.hour] += c.count;
  const peakH = hourSums.indexOf(Math.max(...hourSums));
  const peakHour = `${String(peakH).padStart(2, '0')}:00`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tageszeit-Heatmap"
        subtitle="Wann fährst du? · Aktivitätsstarts nach Wochentag und Uhrzeit"
        years={availableYears}
        selectedYear={selectedYear}
        onYearChange={(y) => {
          const val = y === 'all' ? null : y;
          setSelectedYear(val);
          loadData(val);
        }}
      />

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>
      )}

      {/* Tooltip – fixed wie Kalender */}
      {tooltip && (
        <div
          className="fixed z-50 pointer-events-none rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-xl"
          style={{ left: tooltip.x + 12, top: tooltip.y - 8 }}
        >
          <p className="font-semibold">
            {DAYS_FULL[tooltip.wd]} · {String(tooltip.h).padStart(2, '0')}:00–{String(tooltip.h + 1).padStart(2, '0')}:00
          </p>
          {tooltip.count === 0 ? (
            <p className="text-muted-foreground">Kein Start</p>
          ) : (
            <p className="text-primary mt-0.5">
              {tooltip.count} {tooltip.count === 1 ? 'Aktivität' : 'Aktivitäten'}
            </p>
          )}
        </div>
      )}

      {loading ? (
        <div className="h-40 animate-pulse rounded-xl bg-muted" />
      ) : cells.length > 0 ? (
        <>
          {/* Kennzahlen – gleich wie Kalender-Monatsübersicht */}
          <div className="flex flex-wrap gap-2">
            {[
              { label: 'Aktivitäten', value: totalCount },
              { label: 'Lieblingstag', value: peakDay },
              { label: 'Lieblingszeit', value: peakHour },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-lg bg-muted/60 p-3 text-center min-w-[7rem]">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-0.5 text-lg font-bold text-primary">{value}</p>
              </div>
            ))}
          </div>

          {/* Heatmap-Grid – exakt wie Kalender aufgebaut */}
          <div className="overflow-x-auto">
            <div className="inline-flex gap-1 min-w-max">

              {/* Wochentag-Labels links */}
              <div className="flex flex-col gap-1 mr-1 pt-6">
                {DAYS_SHORT.map((day) => (
                  <div key={day} className="h-3 w-7 text-right text-[10px] leading-3 text-muted-foreground">
                    {day}
                  </div>
                ))}
              </div>

              {/* Spalten */}
              <div className="flex flex-col">
                {/* Stunden-Labels oben (alle 3h) */}
                <div className="relative h-5 mb-1">
                  {[0, 3, 6, 9, 12, 15, 18, 21].map((h) => (
                    <span
                      key={h}
                      className="absolute text-[10px] text-muted-foreground"
                      style={{ left: h * PITCH }}
                    >
                      {String(h).padStart(2, '0')}h
                    </span>
                  ))}
                </div>

                {/* Zellen: Spalten = Stunden, Zeilen = Wochentage */}
                <div className="flex gap-1">
                  {Array.from({ length: 24 }, (_, h) => (
                    <div key={h} className="flex flex-col gap-1">
                      {DAYS_SHORT.map((_, wd) => (
                        <div
                          key={wd}
                          className={`h-3 w-4 rounded-sm cursor-default transition-colors ${colorClass(grid[wd][h], maxCount)}`}
                          onMouseEnter={(e) => setTooltip({ x: e.pageX, y: e.pageY, wd, h, count: grid[wd][h] })}
                          onMouseLeave={() => setTooltip(null)}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Legende – identisch mit Kalender */}
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>Weniger</span>
            <div className="h-3 w-3 rounded-sm bg-muted" />
            <div className="h-3 w-3 rounded-sm bg-orange-200" />
            <div className="h-3 w-3 rounded-sm bg-orange-400" />
            <div className="h-3 w-3 rounded-sm bg-orange-500" />
            <div className="h-3 w-3 rounded-sm bg-primary" />
            <span>Mehr</span>
          </div>
        </>
      ) : (
        <p className="text-muted-foreground text-sm">Keine Daten vorhanden.</p>
      )}
    </div>
  );
}
