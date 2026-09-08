import { useEffect, useState, useMemo, Fragment } from 'react';
import { useTranslation } from 'react-i18next';

import { api } from '@/lib/api';
import { useConfig } from '@/lib/config-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { InsightCard } from '@/components/ui/insight-card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { fmtNum, fmtTime } from '@/lib/format';
import type { Insight } from '@/lib/insights';

import { StatTile } from './shared';

// Zeitblöcke statt 24 Einzelstunden – deutlich lesbarer. Standard 3h → 8 benannte Blöcke;
// bei abweichender block_hours-Einstellung dient der Stundenbereich selbst als Label.
function pad2(n: number): string { return String(n).padStart(2, '0'); }

function buildBlocks(blockHours: number, blockLabels3h: string[]): { label: string; sub: string }[] {
  const hours = blockHours > 0 && blockHours <= 24 ? blockHours : 3;
  const count = Math.max(1, Math.floor(24 / hours));
  return Array.from({ length: count }, (_, i) => {
    const start = i * hours;
    const end = Math.min(24, start + hours);
    const sub = `${pad2(start)}–${pad2(end)}`;
    const label = hours === 3 && count === 8 ? blockLabels3h[i] : sub;
    return { label, sub };
  });
}

function blockClasses(minutes: number, maxMinutes: number): string {
  if (minutes === 0) return 'bg-muted text-muted-foreground';
  const t = minutes / maxMinutes;
  if (t <= 0.25) return 'bg-orange-200 text-orange-950';
  if (t <= 0.5)  return 'bg-orange-400 text-orange-950';
  if (t <= 0.75) return 'bg-orange-500 text-white';
  return                 'bg-primary text-primary-foreground';
}

interface BlockCell { rideCount: number; rideMinutes: number; workoutCount: number; workoutMinutes: number; }
interface TooltipState { x: number; y: number; wd: number; block: number; cell: BlockCell; }

export function TimeOfDayTab() {
  const { t } = useTranslation('progress');
  const { block_hours } = useConfig();
  const blockLabels3h = t('timeOfDayTab.blocks', { returnObjects: true }) as string[];
  const daysShort = t('timeOfDayTab.daysShort', { returnObjects: true }) as string[];
  const daysFull = t('timeOfDayTab.daysFull', { returnObjects: true }) as string[];
  const BLOCKS = useMemo(() => buildBlocks(block_hours, blockLabels3h), [block_hours, blockLabels3h]);
  const [cells, setCells] = useState<{
    weekday: number; hour: number;
    ride_count: number; ride_minutes: number;
    workout_count: number; workout_minutes: number;
  }[]>([]);
  const [availableYears, setAvailableYears] = useState<string[]>([]);
  const [selectedYear, setSelectedYear] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  async function loadData(year?: string | null) {
    setLoading(true);
    setError(null);
    const tzOffset = -Math.round(new Date().getTimezoneOffset() / 60);
    try {
      const res = await api.timeHeatmap(year ? Number(year) : undefined, tzOffset);
      setCells(res.cells);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('timeOfDayTab.loadError'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    async function init() {
      try {
        const stats = await api.activityStats();
        setAvailableYears(stats.available_years.filter(y => Number(y) >= 2000));
      } catch { /* ignorieren */ }
      await loadData();
    }
    init();
  }, []);

  // Stunden-Zellen zu 3h-Blöcken je Wochentag aggregieren, Rad + Workout getrennt gezählt
  const grid: BlockCell[][] = Array.from({ length: 7 }, () =>
    Array.from({ length: BLOCKS.length }, () => ({ rideCount: 0, rideMinutes: 0, workoutCount: 0, workoutMinutes: 0 }))
  );
  for (const c of cells) {
    const block = Math.floor(c.hour / block_hours);
    const g = grid[c.weekday][block];
    g.rideCount += c.ride_count;
    g.rideMinutes += c.ride_minutes;
    g.workoutCount += c.workout_count;
    g.workoutMinutes += c.workout_minutes;
  }

  const totalRideMinutes = cells.reduce((s, c) => s + c.ride_minutes, 0);
  const totalWorkoutMinutes = cells.reduce((s, c) => s + c.workout_minutes, 0);
  const totalMinutes = totalRideMinutes + totalWorkoutMinutes;
  const totalCount = cells.reduce((s, c) => s + c.ride_count + c.workout_count, 0);
  const maxCellMinutes = Math.max(1, ...grid.flat().map(c => c.rideMinutes + c.workoutMinutes));

  // Aktivste Kombination aus Wochentag + Zeitblock (nach Trainingszeit, nicht nur Anzahl)
  let peakWd = 0, peakBlock = 0, peakMinutes = 0;
  grid.forEach((row, wd) => row.forEach((c, b) => {
    const m = c.rideMinutes + c.workoutMinutes;
    if (m > peakMinutes) { peakMinutes = m; peakWd = wd; peakBlock = b; }
  }));

  // Dominanter Zeitblock getrennt für Werktage/Wochenende, für den Vergleich im Insight-Text
  function dominantBlock(weekdays: number[]): number | null {
    const sums = Array(BLOCKS.length).fill(0);
    for (const wd of weekdays) grid[wd].forEach((c, b) => { sums[b] += c.rideMinutes + c.workoutMinutes; });
    const max = Math.max(...sums);
    return max > 0 ? sums.indexOf(max) : null;
  }
  const weekdayBlock = dominantBlock([0, 1, 2, 3, 4]);
  const weekendBlock = dominantBlock([5, 6]);

  const insights: Insight[] = [];
  if (peakMinutes > 0) {
    insights.push({
      text: t('timeOfDayTab.insights.peakSlot', {
        day: daysFull[peakWd].toLowerCase(),
        block: BLOCKS[peakBlock].label.toLowerCase(),
        time: fmtTime(peakMinutes * 60),
      }),
      type: 'positive',
    });
  }
  if (weekdayBlock !== null && weekendBlock !== null) {
    if (weekdayBlock !== weekendBlock) {
      insights.push({
        text: t('timeOfDayTab.insights.weekdayFocus', {
          weekdayBlock: BLOCKS[weekdayBlock].label.toLowerCase(),
          weekendBlock: BLOCKS[weekendBlock].label.toLowerCase(),
        }),
        type: 'neutral',
      });
    } else {
      insights.push({
        text: t('timeOfDayTab.insights.sameFocus', { block: BLOCKS[weekdayBlock].label.toLowerCase() }),
        type: 'neutral',
      });
    }
  }
  if (totalMinutes > 0 && totalWorkoutMinutes > 0) {
    const pct = Math.round((totalWorkoutMinutes / totalMinutes) * 100);
    insights.push({ text: t('timeOfDayTab.insights.workoutShare', { pct, ridePct: 100 - pct }), type: 'neutral' });
  }

  return (
    <div className="space-y-6">
      {/* Jahresfilter */}
      {availableYears.length > 0 && (
        <div className="flex justify-end">
          <Select
            value={selectedYear ?? 'all'}
            onValueChange={val => {
              const y = val === 'all' ? null : val;
              setSelectedYear(y);
              loadData(y);
            }}
          >
            <SelectTrigger className="w-36">
              <SelectValue>{selectedYear ?? t('timeOfDayTab.allYears')}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('timeOfDayTab.allYears')}</SelectItem>
              {availableYears.map(y => (
                <SelectItem key={y} value={y}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>
      )}

      {tooltip && (
        <div
          className="fixed z-50 pointer-events-none rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-xl"
          style={{ left: tooltip.x + 12, top: tooltip.y - 8 }}
        >
          <p className="font-semibold">
            {daysFull[tooltip.wd]} · {BLOCKS[tooltip.block].label} ({BLOCKS[tooltip.block].sub})
          </p>
          {tooltip.cell.rideCount === 0 && tooltip.cell.workoutCount === 0 ? (
            <p className="text-muted-foreground mt-0.5">{t('timeOfDayTab.noActivity')}</p>
          ) : (
            <>
              {tooltip.cell.rideCount > 0 && (
                <p className="text-primary mt-0.5">
                  {t('timeOfDayTab.rideCount', { count: tooltip.cell.rideCount, time: fmtTime(tooltip.cell.rideMinutes * 60) })}
                </p>
              )}
              {tooltip.cell.workoutCount > 0 && (
                <p className="text-violet-400 mt-0.5">
                  {t('timeOfDayTab.workoutCount', { count: tooltip.cell.workoutCount, time: fmtTime(tooltip.cell.workoutMinutes * 60) })}
                </p>
              )}
            </>
          )}
        </div>
      )}

      {loading ? (
        <div className="h-40 animate-pulse rounded-xl bg-muted" />
      ) : cells.length > 0 ? (
        <>
          <div className="flex flex-wrap gap-3">
            <StatTile icon="⏱️" label={t('timeOfDayTab.stats.totalTrainingTime')} value={fmtTime(totalMinutes * 60)} valueColor="var(--primary)" />
            <StatTile icon="🔢" label={t('timeOfDayTab.stats.activities')} value={fmtNum(totalCount)} valueColor="var(--primary)" />
            <StatTile icon="📍" label={t('timeOfDayTab.stats.mostActiveTime')} value={`${daysShort[peakWd]} · ${BLOCKS[peakBlock].label}`} valueColor="var(--primary)" />
            <StatTile
              icon="⚖️"
              label={t('timeOfDayTab.stats.rideWorkoutSplit')}
              value={`${fmtNum(Math.round(totalRideMinutes / 60))}h / ${fmtNum(Math.round(totalWorkoutMinutes / 60))}h`}
              valueColor="var(--primary)"
            />
          </div>

          <Card className="shadow-sm border">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">🗓️ {t('timeOfDayTab.heatmapTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="overflow-x-auto">
                <div
                  className="grid gap-1.5 items-center w-full min-w-[40rem]"
                  style={{ gridTemplateColumns: `3.5rem repeat(${BLOCKS.length}, minmax(3.5rem, 1fr))` }}
                >
                  <div />
                  {BLOCKS.map(b => (
                    <div key={b.label} className="text-center pb-1">
                      <p className="text-[11px] font-semibold text-muted-foreground leading-tight">{b.label}</p>
                      <p className="text-[9px] text-muted-foreground/70 leading-tight">{b.sub}</p>
                    </div>
                  ))}

                  {daysShort.map((day, wd) => (
                    <Fragment key={day}>
                      <div className="text-xs font-medium text-muted-foreground text-right pr-2">{day}</div>
                      {BLOCKS.map((_, b) => {
                        const cell = grid[wd][b];
                        const minutes = cell.rideMinutes + cell.workoutMinutes;
                        const isPeak = wd === peakWd && b === peakBlock && minutes > 0;
                        return (
                          <div
                            key={b}
                            className={`h-11 rounded-lg flex items-center justify-center text-[11px] font-semibold cursor-default transition-[filter,transform] hover:brightness-110 hover:scale-[1.03] ${blockClasses(minutes, maxCellMinutes)} ${isPeak ? 'ring-2 ring-offset-1 ring-offset-card' : ''}`}
                            style={isPeak ? { boxShadow: '0 0 0 2px var(--primary)' } : undefined}
                            onMouseEnter={e => setTooltip({ x: e.pageX, y: e.pageY, wd, block: b, cell })}
                            onMouseLeave={() => setTooltip(null)}
                          >
                            {minutes > 0 ? fmtTime(minutes * 60) : ''}
                          </div>
                        );
                      })}
                    </Fragment>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>{t('timeOfDayTab.lessTrainingTime')}</span>
                <div className="h-3 w-3 rounded-sm bg-muted" />
                <div className="h-3 w-3 rounded-sm bg-orange-200" />
                <div className="h-3 w-3 rounded-sm bg-orange-400" />
                <div className="h-3 w-3 rounded-sm bg-orange-500" />
                <div className="h-3 w-3 rounded-sm bg-primary" />
                <span>{t('timeOfDayTab.moreTrainingTime')}</span>
                <span className="ml-2 flex items-center gap-1">
                  <span className="inline-block h-3 w-3 rounded-sm ring-2 ring-primary" />
                  {t('timeOfDayTab.peakLegend')}
                </span>
              </div>
            </CardContent>
          </Card>

          <InsightCard insights={insights} />
        </>
      ) : (
        <p className="text-muted-foreground text-sm">{t('timeOfDayTab.noData')}</p>
      )}
    </div>
  );
}
