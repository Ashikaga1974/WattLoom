import { useEffect, useState, useMemo } from 'react';
import { api, type WeeklyVolume } from '@/lib/api';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { fmtNum } from '@/lib/format';

// week_start (ISO-Datum) → lesbares Label
function weekLabel(dateStr: string): string {
  const d = new Date(dateStr.endsWith('Z') ? dateStr : dateStr + 'Z');
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
}

// Gesamtstats einer Wochenauswahl
function calcStats(data: WeeklyVolume[]) {
  const totalRide = data.reduce((s, w) => s + w.ride_minutes, 0);
  const totalWorkout = data.reduce((s, w) => s + w.workout_minutes, 0);
  const totalWeight = data.reduce((s, w) => s + w.weight_training_minutes, 0);
  const activeWeeks = data.filter(w => w.ride_minutes + w.workout_minutes + w.weight_training_minutes > 0).length;
  const peakRide = Math.max(...data.map(w => w.ride_minutes), 0);
  const avgRide = activeWeeks > 0 ? Math.round(totalRide / activeWeeks) : 0;
  return { totalRide, totalWorkout, totalWeight, activeWeeks, peakRide, avgRide, total: data.length };
}

export default function TrainingPage() {
  const [allData, setAllData] = useState<WeeklyVolume[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    api.weeklyVolume(520) // viele Wochen laden, dann client-seitig filtern
      .then(data => setAllData(data))
      .catch(e => setError(e instanceof Error ? e.message : 'Fehler'))
      .finally(() => setLoading(false));
  }, []);

  // Sichtbare Wochen: alle oder letzte 52
  const viewData = useMemo(() => {
    if (showAll) return allData;
    return allData.slice(-52);
  }, [allData, showAll]);

  // Chart-Daten: Sekunden → Minuten
  const chartData = useMemo(() =>
    viewData.map(w => ({
      label: weekLabel(w.week_start),
      week_start: w.week_start,
      Radfahren: w.ride_minutes,
      Workout: w.workout_minutes,
      Kraft: w.weight_training_minutes,
    })),
    [viewData]
  );

  const stats = useMemo(() => calcStats(viewData), [viewData]);

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Trainingsverlauf" />
        <div className="h-64 bg-muted animate-pulse rounded-xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Trainingsverlauf" />
        <div className="rounded border border-destructive/50 bg-destructive/10 p-4 text-destructive text-sm">{error}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Trainingsverlauf</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Wochenvolumen gestapelt nach Aktivitätstyp</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={showAll ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowAll(v => !v)}
          >
            {showAll ? 'Letzte 52 Wochen' : 'Alle Jahre'}
          </Button>
        </div>
      </div>

      {/* Gestapelter Balken-Chart */}
      <Card className="shadow-sm border">
        <CardContent className="pt-4">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart
              data={chartData}
              margin={{ top: 8, right: 16, bottom: 8, left: 8 }}
              barCategoryGap="15%"
            >
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10 }}
                interval={Math.max(0, Math.floor(chartData.length / 20) - 1)}
                angle={chartData.length > 30 ? -45 : 0}
                textAnchor={chartData.length > 30 ? 'end' : 'middle'}
                height={chartData.length > 30 ? 40 : 20}
              />
              <YAxis
                tickFormatter={v => `${v}min`}
                tick={{ fontSize: 11 }}
                width={52}
              />
              <Tooltip
                formatter={(value, name) => [`${value} min`, name]}
                labelFormatter={(label, payload) => {
                  const ws = (payload?.[0]?.payload as { week_start?: string })?.week_start;
                  if (ws) {
                    const d = new Date(ws.endsWith('Z') ? ws : ws + 'Z');
                    return `Woche ${d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}`;
                  }
                  return `Woche ${label}`;
                }}
                contentStyle={{
                  fontSize: 12,
                  backgroundColor: 'hsl(var(--background))',
                  border: '1px solid hsl(var(--border))',
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar
                dataKey="Radfahren"
                stackId="a"
                fill="#fc4c02"
                fillOpacity={0.85}
                isAnimationActive={false}
              />
              <Bar
                dataKey="Workout"
                stackId="a"
                fill="#60a5fa"
                fillOpacity={0.85}
                isAnimationActive={false}
              />
              <Bar
                dataKey="Kraft"
                stackId="a"
                fill="#4ade80"
                fillOpacity={0.85}
                radius={[2, 2, 0, 0]}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Stats-Kacheln */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="shadow-sm border">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Rad gesamt</p>
            <p className="text-2xl font-bold mt-1">
              {fmtNum(Math.round(stats.totalRide / 60), 0)}{' '}
              <span className="text-sm font-normal text-muted-foreground">h</span>
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-sm border">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Aktive Wochen</p>
            <p className="text-2xl font-bold mt-1">
              {stats.activeWeeks}{' '}
              <span className="text-sm font-normal text-muted-foreground">/ {stats.total}</span>
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-sm border">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Beste Woche</p>
            <p className="text-2xl font-bold mt-1">
              {stats.peakRide}{' '}
              <span className="text-sm font-normal text-muted-foreground">min</span>
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-sm border">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">⌀ Woche (Rad)</p>
            <p className="text-2xl font-bold mt-1">
              {stats.avgRide}{' '}
              <span className="text-sm font-normal text-muted-foreground">min</span>
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Zusatz: Workout & Kraft Summen */}
      {(stats.totalWorkout > 0 || stats.totalWeight > 0) && (
        <div className="flex flex-wrap gap-3">
          {stats.totalWorkout > 0 && (
            <Card className="shadow-sm border">
              <CardContent className="px-4 py-3">
                <p className="text-xs text-muted-foreground">Workout gesamt</p>
                <p className="text-lg font-bold text-[#60a5fa] mt-0.5">
                  {fmtNum(Math.round(stats.totalWorkout / 60), 0)} h
                </p>
              </CardContent>
            </Card>
          )}
          {stats.totalWeight > 0 && (
            <Card className="shadow-sm border">
              <CardContent className="px-4 py-3">
                <p className="text-xs text-muted-foreground">Krafttraining gesamt</p>
                <p className="text-lg font-bold text-[#4ade80] mt-0.5">
                  {fmtNum(Math.round(stats.totalWeight / 60), 0)} h
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
