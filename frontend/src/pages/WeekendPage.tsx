import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, LineChart, Line, Legend,
} from 'recharts';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { fmtNum } from '@/lib/format';

type WwData = Awaited<ReturnType<typeof api.weekendWeekday>>;

const WEEKDAY_LABELS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const IS_WEEKEND = [false, false, false, false, false, true, true];

const COLOR_WEEKDAY = 'hsl(221, 83%, 53%)'; // blue
const COLOR_WEEKEND = 'hsl(24, 95%, 53%)';  // orange

// ─── Duell-Karte ──────────────────────────────────────────────────────────────

interface MetricRow {
  label: string;
  weekday: number | null;
  weekend: number | null;
  unit: string;
  higherIsBetter: boolean;
  fmt?: (v: number) => string;
}

function DuelCard({ data }: { data: WwData }) {
  const wd = data.weekday;
  const we = data.weekend;

  const metrics: MetricRow[] = [
    { label: 'Rides',          weekday: wd.rides,            weekend: we.rides,            unit: '',      higherIsBetter: true },
    { label: 'Ø Distanz',      weekday: wd.avg_km,           weekend: we.avg_km,           unit: ' km',   higherIsBetter: true },
    { label: 'Ø Geschw.',      weekday: wd.avg_kmh,          weekend: we.avg_kmh,          unit: ' km/h', higherIsBetter: true },
    { label: 'Ø Dauer',        weekday: wd.avg_duration_min, weekend: we.avg_duration_min, unit: ' min',  higherIsBetter: false },
    { label: 'Ø Höhenmeter',   weekday: wd.avg_elevation_m,  weekend: we.avg_elevation_m,  unit: ' m',    higherIsBetter: true },
    { label: 'Ø Herzfrequenz', weekday: wd.avg_hr,           weekend: we.avg_hr,           unit: ' bpm',  higherIsBetter: false },
    { label: 'Ø Kalorien',     weekday: wd.avg_calories,     weekend: we.avg_calories,     unit: ' kcal', higherIsBetter: true },
    { label: 'Gesamt-km',      weekday: wd.total_km,         weekend: we.total_km,         unit: ' km',   higherIsBetter: true,
      fmt: v => fmtNum(v, 0) },
  ];

  function winner(row: MetricRow): 'weekday' | 'weekend' | 'tie' {
    if (row.weekday == null || row.weekend == null) return 'tie';
    if (Math.abs(row.weekday - row.weekend) < 0.5) return 'tie';
    const wdWins = row.higherIsBetter ? row.weekday > row.weekend : row.weekday < row.weekend;
    return wdWins ? 'weekday' : 'weekend';
  }

  function fmt(v: number | null, row: MetricRow): string {
    if (v == null) return '–';
    return (row.fmt ? row.fmt(v) : fmtNum(v, 1)) + row.unit;
  }

  const wdWins = metrics.filter(m => winner(m) === 'weekday').length;
  const weWins = metrics.filter(m => winner(m) === 'weekend').length;

  return (
    <Card className="shadow-sm overflow-hidden">
      {/* Header-Duel */}
      <div className="grid grid-cols-[1fr_auto_1fr] border-b border-border">
        <div className="flex flex-col items-center gap-0.5 py-4" style={{ background: `${COLOR_WEEKDAY}18` }}>
          <p className="text-xs font-medium uppercase tracking-wider" style={{ color: COLOR_WEEKDAY }}>Werktag</p>
          <p className="text-3xl font-bold tabular-nums" style={{ color: COLOR_WEEKDAY }}>{wd.rides}</p>
          <p className="text-xs text-muted-foreground">Rides</p>
        </div>
        <div className="flex flex-col items-center justify-center px-4 py-4 border-x border-border">
          <p className="text-lg font-bold text-muted-foreground">vs.</p>
          <p className="text-xs text-muted-foreground mt-1">{wdWins}:{weWins}</p>
        </div>
        <div className="flex flex-col items-center gap-0.5 py-4" style={{ background: `${COLOR_WEEKEND}18` }}>
          <p className="text-xs font-medium uppercase tracking-wider" style={{ color: COLOR_WEEKEND }}>Wochenende</p>
          <p className="text-3xl font-bold tabular-nums" style={{ color: COLOR_WEEKEND }}>{we.rides}</p>
          <p className="text-xs text-muted-foreground">Rides</p>
        </div>
      </div>

      {/* Metriken-Zeilen */}
      <CardContent className="p-0">
        {metrics.slice(1).map(row => {
          const w = winner(row);
          return (
            <div key={row.label} className="grid grid-cols-[1fr_auto_1fr] border-b border-border/40 last:border-0 hover:bg-muted/20 transition-colors">
              {/* Werktag-Wert */}
              <div className={`flex items-center justify-end px-5 py-3 ${w === 'weekday' ? 'font-semibold' : ''}`}>
                {w === 'weekday' && <span className="mr-2 text-xs" style={{ color: COLOR_WEEKDAY }}>●</span>}
                <span className={w === 'weekday' ? '' : 'text-muted-foreground'}>
                  {fmt(row.weekday, row)}
                </span>
              </div>
              {/* Label */}
              <div className="flex items-center justify-center px-3 py-3">
                <span className="text-xs text-muted-foreground whitespace-nowrap">{row.label}</span>
              </div>
              {/* Wochenend-Wert */}
              <div className={`flex items-center px-5 py-3 ${w === 'weekend' ? 'font-semibold' : ''}`}>
                <span className={w === 'weekend' ? '' : 'text-muted-foreground'}>
                  {fmt(row.weekend, row)}
                </span>
                {w === 'weekend' && <span className="ml-2 text-xs" style={{ color: COLOR_WEEKEND }}>●</span>}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

// ─── Wochentag-Chart ──────────────────────────────────────────────────────────

function WochentagChart({ data }: { data: WwData['by_weekday'] }) {
  const chartData = WEEKDAY_LABELS.map((label, i) => {
    const row = data.find(r => r.weekday_idx === i);
    return {
      label,
      rides: row?.rides ?? 0,
      avg_km: row?.avg_km ?? 0,
      avg_kmh: row?.avg_kmh ?? 0,
      isWeekend: IS_WEEKEND[i],
    };
  });

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Rides pro Wochentag
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }} barCategoryGap="28%">
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.08} vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={false} width={28} />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
              formatter={(v: number, name: string) => {
                if (name === 'rides') return [`${v} Rides`, 'Anzahl'];
                return [v, name];
              }}
              labelFormatter={(label: string) => {
                const d = chartData.find(c => c.label === label);
                return `${label} · Ø ${d?.avg_km?.toFixed(1)} km · Ø ${d?.avg_kmh?.toFixed(1)} km/h`;
              }}
            />
            <Bar dataKey="rides" radius={[4, 4, 0, 0]} maxBarSize={48}>
              {chartData.map((entry, i) => (
                <Cell key={i} fill={entry.isWeekend ? COLOR_WEEKEND : COLOR_WEEKDAY}
                  fillOpacity={0.85} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>

        {/* Legende */}
        <div className="mt-3 flex justify-center gap-6 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ background: COLOR_WEEKDAY }} /> Werktag
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ background: COLOR_WEEKEND }} /> Wochenende
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Monatsverlauf ────────────────────────────────────────────────────────────

function MonatsverlaufChart({ data }: { data: WwData['monthly'] }) {
  const filtered = data.filter(d => d.month >= '2020');
  const chartData = filtered.map(d => ({
    month: d.month.slice(0, 7),
    label: d.month.slice(2, 4) + '/' + d.month.slice(5, 7),
    weekend_km: d.weekend_km,
    weekday_km: d.weekday_km,
  }));

  if (chartData.length === 0) return null;

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Monatsverlauf · km Werktag vs. Wochenende
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chartData} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.08} vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false}
              interval={Math.floor(chartData.length / 12)} />
            <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={false} width={36}
              tickFormatter={v => `${v}`} />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
              formatter={(v: number, name: string) => [
                `${fmtNum(v, 0)} km`,
                name === 'weekday_km' ? 'Werktag' : 'Wochenende',
              ]}
            />
            <Legend
              formatter={(value) => value === 'weekday_km' ? 'Werktag' : 'Wochenende'}
              wrapperStyle={{ fontSize: 12 }}
            />
            <Line type="monotone" dataKey="weekday_km" stroke={COLOR_WEEKDAY}
              strokeWidth={2} dot={false} name="weekday_km" />
            <Line type="monotone" dataKey="weekend_km" stroke={COLOR_WEEKEND}
              strokeWidth={2} dot={false} name="weekend_km" />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// ─── Haupt-Seite ──────────────────────────────────────────────────────────────

export default function WeekendPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const yearParam = searchParams.get('year');
  const filterYear = yearParam ? parseInt(yearParam) : undefined;

  const [data, setData] = useState<WwData | null>(null);
  const [loading, setLoading] = useState(true);
  const [availableYears, setAvailableYears] = useState<number[]>([]);

  useEffect(() => {
    api.activityStats().then(s => {
      setAvailableYears(s.available_years.map(Number).filter(y => y >= 2000));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    api.weekendWeekday(filterYear)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [filterYear]);

  function onYearChange(year: string | null) {
    if (year && year !== 'all') setSearchParams({ year }, { replace: true });
    else setSearchParams({}, { replace: true });
  }

  if (loading || !data) {
    return (
      <div className="space-y-6">
        <PageHeader title="Wochenend- vs. Werktagsvergleich" />
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="h-48 animate-pulse rounded-xl bg-muted" />
          <div className="h-48 animate-pulse rounded-xl bg-muted" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Wochenend- vs. Werktagsvergleich"
        subtitle="Wie unterscheiden sich Samstag/Sonntag von Montag–Freitag?"
        years={availableYears}
        selectedYear={filterYear ?? null}
        onYearChange={onYearChange}
      />

      {/* Duell-Karte */}
      <DuelCard data={data} />

      {/* Wochentag-Chart + Ø Speed/km Chart */}
      <div className="grid gap-6 lg:grid-cols-2">
        <WochentagChart data={data.by_weekday} />

        {/* Ø Distanz pro Wochentag */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Ø Distanz pro Wochentag
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart
                data={WEEKDAY_LABELS.map((label, i) => {
                  const row = data.by_weekday.find(r => r.weekday_idx === i);
                  return { label, avg_km: row?.avg_km ?? 0, avg_kmh: row?.avg_kmh ?? 0, isWeekend: IS_WEEKEND[i] };
                })}
                margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
                barCategoryGap="28%"
              >
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.08} vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={false} width={32}
                  tickFormatter={v => `${v}`} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  formatter={(v: number, name: string) => [
                    `${fmtNum(v, 1)} ${name === 'avg_km' ? 'km' : 'km/h'}`,
                    name === 'avg_km' ? 'Ø Distanz' : 'Ø Speed',
                  ]}
                />
                <Bar dataKey="avg_km" radius={[4, 4, 0, 0]} maxBarSize={48} name="avg_km">
                  {WEEKDAY_LABELS.map((_, i) => (
                    <Cell key={i} fill={IS_WEEKEND[i] ? COLOR_WEEKEND : COLOR_WEEKDAY} fillOpacity={0.85} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-1 text-center text-xs text-muted-foreground">km</div>
          </CardContent>
        </Card>
      </div>

      {/* Monatsverlauf */}
      <MonatsverlaufChart data={data.monthly} />
    </div>
  );
}
