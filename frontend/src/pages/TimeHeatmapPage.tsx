import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

const DAYS_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const DAYS_FULL  = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

// Zellfarbe: orange-Töne von dunkel nach leuchtorange
function cellColor(count: number, maxCount: number): string {
  if (count === 0) return 'hsl(var(--muted))';
  const t = count / maxCount;
  if (t <= 0.15) return '#431407';
  if (t <= 0.35) return '#7c2d12';
  if (t <= 0.55) return '#c2410c';
  if (t <= 0.75) return '#ea580c';
  return '#fc4c02';
}

// SVG-Layout
const CW = 26, CH = 32;
const PL = 44, PT = 28;
const W = PL + 24 * CW + 8;
const H = PT + 7 * CH + 20;

export default function TimeHeatmapPage() {
  const [cells, setCells] = useState<{ weekday: number; hour: number; count: number }[]>([]);
  const [availableYears, setAvailableYears] = useState<string[]>([]);
  const [selectedYear, setSelectedYear] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hovered, setHovered] = useState<{ wd: number; h: number } | null>(null);

  async function loadData(year?: string | null) {
    setLoading(true);
    setError(null);
    try {
      const res = await api.timeHeatmap(year ? Number(year) : undefined);
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
        const yrs = stats.available_years.filter((y) => Number(y) >= 2000);
        setAvailableYears(yrs);
      } catch { /* ignorieren */ }
      await loadData();
    }
    init();
  }, []);

  // 7×24 Grid
  const grid: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0));
  for (const c of cells) grid[c.weekday][c.hour] = c.count;

  const maxCount = cells.length ? Math.max(...cells.map((c) => c.count)) : 1;
  const totalCount = cells.reduce((s, c) => s + c.count, 0);

  // Lieblingstag
  const weekdaySums = Array(7).fill(0);
  for (const c of cells) weekdaySums[c.weekday] += c.count;
  const peakDay = DAYS_FULL[weekdaySums.indexOf(Math.max(...weekdaySums))];

  // Lieblingsstunde
  const hourSums = Array(24).fill(0);
  for (const c of cells) hourSums[c.hour] += c.count;
  const peakH = hourSums.indexOf(Math.max(...hourSums));
  const peakHour = `${String(peakH).padStart(2, '0')}:00`;

  const hoveredCount = hovered ? (grid[hovered.wd]?.[hovered.h] ?? 0) : 0;

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
        <div className="rounded border border-destructive/50 bg-destructive/10 p-4 text-destructive text-sm">{error}</div>
      )}

      {loading ? (
        <Card><CardContent className="pt-6"><Skeleton className="h-64 w-full" /></CardContent></Card>
      ) : cells.length > 0 ? (
        <>
          {/* Kennzahlen */}
          <div className="flex flex-wrap gap-3">
            <Card className="px-4 py-3 text-center min-w-[7rem]">
              <p className="text-xs text-muted-foreground">Aktivitäten</p>
              <p className="text-xl font-bold text-orange-500 mt-0.5">{totalCount}</p>
            </Card>
            <Card className="px-4 py-3 text-center min-w-[9rem]">
              <p className="text-xs text-muted-foreground">Lieblingstag</p>
              <p className="text-lg font-bold text-orange-500 mt-0.5">{peakDay}</p>
            </Card>
            <Card className="px-4 py-3 text-center min-w-[7rem]">
              <p className="text-xs text-muted-foreground">Lieblingszeit</p>
              <p className="text-xl font-bold text-orange-500 mt-0.5">{peakHour}</p>
            </Card>
          </div>

          {/* Heatmap */}
          <Card>
            <CardContent className="pt-4 relative overflow-x-auto">
              {/* Hover-Tooltip */}
              {hovered && (
                <div className="absolute top-4 right-4 rounded-lg border border-border bg-background px-3 py-2 text-sm pointer-events-none z-10 shadow-sm">
                  <p className="font-semibold text-foreground">
                    {DAYS_FULL[hovered.wd]} · {String(hovered.h).padStart(2, '0')}:00–{String(hovered.h + 1).padStart(2, '0')}:00
                  </p>
                  <p className="text-orange-500 mt-0.5">
                    {hoveredCount} {hoveredCount === 1 ? 'Aktivität' : 'Aktivitäten'}
                  </p>
                </div>
              )}

              <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
                {/* Stunden-Labels (alle 3h) */}
                {Array.from({ length: 9 }, (_, i) => i * 3).map((h) => (
                  <text
                    key={h}
                    x={PL + h * CW + CW / 2}
                    y={PT - 8}
                    fontSize={11}
                    fill="#9ca3af"
                    textAnchor="middle"
                  >
                    {String(h).padStart(2, '0')}:00
                  </text>
                ))}

                {/* Wochentag-Labels + Zellen */}
                {DAYS_SHORT.map((day, wd) => (
                  <g key={wd}>
                    <text
                      x={PL - 8}
                      y={PT + wd * CH + CH / 2 + 4}
                      fontSize={12}
                      fill="#9ca3af"
                      textAnchor="end"
                    >
                      {day}
                    </text>
                    {Array.from({ length: 24 }, (_, h) => {
                      const count = grid[wd][h];
                      const isHov = hovered?.wd === wd && hovered?.h === h;
                      return (
                        <rect
                          key={h}
                          x={PL + h * CW + 1}
                          y={PT + wd * CH + 1}
                          width={CW - 2}
                          height={CH - 2}
                          rx={3}
                          fill={cellColor(count, maxCount)}
                          stroke={isHov ? '#fc4c02' : 'none'}
                          strokeWidth={1.5}
                          style={{ cursor: 'default' }}
                          onMouseEnter={() => setHovered({ wd, h })}
                          onMouseLeave={() => setHovered(null)}
                        />
                      );
                    })}
                  </g>
                ))}
              </svg>
            </CardContent>
          </Card>

          {/* Legende */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>wenig</span>
            {(['hsl(var(--muted))', '#431407', '#7c2d12', '#c2410c', '#ea580c', '#fc4c02'] as const).map((col, i) => (
              <span key={i} className="w-5 h-4 rounded-sm inline-block" style={{ background: col }} />
            ))}
            <span>viel</span>
          </div>
        </>
      ) : (
        <p className="text-muted-foreground text-sm">Keine Daten vorhanden.</p>
      )}
    </div>
  );
}
