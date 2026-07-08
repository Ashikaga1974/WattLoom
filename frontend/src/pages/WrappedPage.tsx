import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

import { api, type WrappedData } from '@/lib/api';
import { fmtDate, fmtNum } from '@/lib/format';
import { CHART_HEIGHT_COMPACT } from '@/lib/config';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ChartTooltip } from '@/components/ui/chart-tooltip';

const MONTH_NAMES = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const WEEKDAY_NAMES = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const ORANGE = '#fc4c02';
const BLUE = '#3b82f6';

function fmtMovingTime(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

function PctBadge({ pct }: { pct: number }) {
  const positive = pct >= 0;
  return (
    <span className={`text-xs font-medium ml-1 ${positive ? 'text-green-600' : 'text-red-500'}`}>
      {positive ? '+' : ''}{pct.toFixed(1)}%
    </span>
  );
}

function BigStatCard({ label, value, unit, delta }: { label: string; value: string; unit?: string; delta?: number | null }) {
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-bold text-foreground">
          {value}
          {unit && <span className="text-base font-normal text-muted-foreground ml-1">{unit}</span>}
        </p>
        {delta !== undefined && delta !== null && <PctBadge pct={delta} />}
      </CardContent>
    </Card>
  );
}

function MonthlyKmTooltip({ active, payload, label }: { active?: boolean; payload?: any[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  return (
    <ChartTooltip
      active={active}
      label={label}
      rows={[
        { label: 'Distanz', value: `${Number(d?.km ?? 0).toFixed(0)} km`, color: d?.isBest ? ORANGE : BLUE },
      ]}
    />
  );
}

function HighlightCard({ label, headline, subline, linkId }: { label: string; headline: string; subline: string; linkId?: number }) {
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold text-foreground">{headline}</p>
        {linkId ? (
          <Link to={`/activities/${linkId}`} className="text-sm text-orange-500 hover:underline">{subline}</Link>
        ) : (
          <p className="text-sm text-muted-foreground">{subline}</p>
        )}
      </CardContent>
    </Card>
  );
}

export default function WrappedPage() {
  const [data, setData] = useState<WrappedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);

  async function load(year?: number) {
    setLoading(true);
    setError(null);
    try {
      const tzOffset = -Math.round(new Date().getTimezoneOffset() / 60);
      const result = await api.wrapped(year, tzOffset);
      setData(result);
      setSelectedYear(result.year);
    } catch (e) {
      setError('Fehler beim Laden der Daten.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">Jahresrückblick</h1>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="pt-6"><Skeleton className="h-10 w-full" /></CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Jahresrückblick</h1>
        <p className="text-red-500 text-sm">{error}</p>
      </div>
    );
  }

  if (!data || data.totals.rides === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Jahresrückblick</h1>
        <p className="text-muted-foreground text-sm">Keine Daten für dieses Jahr.</p>
      </div>
    );
  }

  // Daten für Monatschart
  const monthlyChartData = data.monthly_km.map((km, i) => ({
    name: MONTH_NAMES[i],
    km,
    isBest: data.best_month?.month === i + 1,
  }));

  // Daten für Wochentag-Minibalken
  const maxWeekday = Math.max(...data.rides_by_weekday, 1);
  const maxHour = Math.max(...data.rides_by_hour, 1);

  return (
    <div className="space-y-6">
      {/* Kopfzeile + Jahresauswahl */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Jahresrückblick {data.year}</h1>
        <div className="flex gap-2 flex-wrap">
          {data.available_years.map((yr) => (
            <button
              key={yr}
              onClick={() => load(yr)}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors cursor-pointer ${
                yr === selectedYear
                  ? 'bg-orange-500 text-white'
                  : 'bg-muted text-muted-foreground hover:bg-accent'
              }`}
            >
              {yr}
            </button>
          ))}
        </div>
      </div>

      {/* Gesamt-Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <BigStatCard
          label="Fahrten"
          value={fmtNum(data.totals.rides)}
          delta={data.vs_prev_year?.rides_pct ?? null}
        />
        <BigStatCard
          label="Kilometer"
          value={fmtNum(data.totals.distance_km, 0)}
          unit="km"
          delta={data.vs_prev_year?.distance_pct ?? null}
        />
        <BigStatCard
          label="Stunden"
          value={data.totals.moving_hours.toFixed(1)}
          unit="h"
        />
        <BigStatCard
          label="Höhenmeter"
          value={fmtNum(data.totals.elevation_m, 0)}
          unit="m"
        />
      </div>

      {/* Highlight-Kacheln */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {data.best_ride && (
          <HighlightCard
            label="Längste Fahrt"
            headline={`${data.best_ride.distance_km.toFixed(1)} km`}
            subline={`${data.best_ride.name} · ${fmtDate(data.best_ride.date)} · ${fmtMovingTime(data.best_ride.moving_time_s)}`}
            linkId={data.best_ride.id}
          />
        )}
        {data.most_elevation_ride && (
          <HighlightCard
            label="Meiste Höhenmeter"
            headline={`${fmtNum(data.most_elevation_ride.elevation_m, 0)} m`}
            subline={`${data.most_elevation_ride.name} · ${fmtDate(data.most_elevation_ride.date)} · ${data.most_elevation_ride.distance_km.toFixed(1)} km`}
            linkId={data.most_elevation_ride.id}
          />
        )}
        {data.fastest_ride && (
          <HighlightCard
            label="Schnellste Fahrt"
            headline={`${data.fastest_ride.avg_speed_kmh.toFixed(1)} km/h`}
            subline={`${data.fastest_ride.name} · ${fmtDate(data.fastest_ride.date)} · ${data.fastest_ride.distance_km.toFixed(1)} km`}
            linkId={data.fastest_ride.id}
          />
        )}
        {data.best_month && (
          <HighlightCard
            label="Bester Monat"
            headline={MONTH_NAMES[data.best_month.month - 1]}
            subline={`${data.best_month.distance_km.toFixed(0)} km · ${data.best_month.rides} Fahrten`}
          />
        )}
        {data.best_week && (
          <HighlightCard
            label="Beste Woche"
            headline={`${data.best_week.distance_km.toFixed(0)} km`}
            subline={`ab ${fmtDate(data.best_week.week_start)} · ${data.best_week.rides} Fahrten`}
          />
        )}
        {data.longest_streak && (
          <HighlightCard
            label="Längste Streak"
            headline={`${data.longest_streak.days} Tage`}
            subline={`${fmtDate(data.longest_streak.from)} – ${fmtDate(data.longest_streak.to)}`}
          />
        )}
        {data.favorite_bike && (
          <HighlightCard
            label="Lieblingsbike"
            headline={data.favorite_bike.name}
            subline={`${data.favorite_bike.rides} Fahrten · ${data.favorite_bike.distance_km.toFixed(0)} km`}
          />
        )}
      </div>

      {/* Monatsverlauf */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Monatsverlauf {data.year}</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={CHART_HEIGHT_COMPACT}>
            <BarChart data={monthlyChartData} barSize={28}>
              <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={40} unit=" km" />
              <Tooltip content={<MonthlyKmTooltip />} />
              <Bar dataKey="km" radius={[3, 3, 0, 0]}>
                {monthlyChartData.map((entry, i) => (
                  <Cell key={i} fill={entry.isBest ? ORANGE : BLUE} fillOpacity={entry.isBest ? 1 : 0.7} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Wochentag & Tageszeit-Verteilung */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Wochentag */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Fahrten nach Wochentag</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-1 h-16">
              {data.rides_by_weekday.map((count, i) => {
                const isMax = count === maxWeekday;
                const h = Math.round((count / maxWeekday) * 48);
                return (
                  <div key={i} className="flex flex-col items-center flex-1 gap-1">
                    <div
                      className="w-full rounded-sm transition-all"
                      style={{ height: `${h}px`, background: isMax ? ORANGE : BLUE }}
                      title={`${WEEKDAY_NAMES[i]}: ${count}`}
                    />
                    <span className="text-xs text-muted-foreground">{WEEKDAY_NAMES[i]}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Tageszeit */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Fahrten nach Tageszeit</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-px h-14">
              {data.rides_by_hour.map((count, i) => {
                const isMax = count === maxHour;
                const h = Math.round((count / maxHour) * 40);
                return (
                  <div
                    key={i}
                    className="flex-1 rounded-sm"
                    style={{ height: `${Math.max(h, 2)}px`, background: isMax ? ORANGE : BLUE }}
                    title={`${i}:00 – ${count} Fahrten`}
                  />
                );
              })}
            </div>
            <div className="flex justify-between mt-1">
              {['0h', '6h', '12h', '18h', '24h'].map((l) => (
                <span key={l} className="text-xs text-muted-foreground">{l}</span>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
