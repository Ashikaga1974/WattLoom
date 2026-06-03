import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { api, type FatigueData, type FatigueRide } from '@/lib/api';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Cell,
  ResponsiveContainer,
} from 'recharts';
import { fmtDate } from '@/lib/format';

// Farblogik: negativ = Ermüdung (H2 langsamer), positiv = Steigerung (H2 schneller)
function fatigueColor(v: number): string {
  if (v >= 10)  return '#3b82f6';  // blau – starke Steigerung
  if (v > 0)    return '#10b981';  // grün – Steigerung
  if (v > -5)   return '#22c55e';  // hellgrün – ausgeglichen
  if (v > -10)  return '#f59e0b';  // amber – leichte Ermüdung
  if (v > -20)  return '#f97316';  // orange – mittlere Ermüdung
  return '#ef4444';                 // rot – starke Ermüdung
}

function fatigueTextColor(v: number): string {
  if (v >= 10)  return 'text-blue-500';
  if (v > 0)    return 'text-emerald-500';
  if (v > -5)   return 'text-green-500';
  if (v > -10)  return 'text-amber-500';
  if (v > -20)  return 'text-orange-500';
  return 'text-red-500';
}

function fmtPct(v: number): string {
  return (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
}

function splitBarWidths(h1: number, h2: number): { w1: number; w2: number } {
  const total = h1 + h2;
  if (total === 0) return { w1: 50, w2: 50 };
  return {
    w1: Math.round((h1 / total) * 100),
    w2: Math.round((h2 / total) * 100),
  };
}

function fmtMonth(m: string): string {
  const names = ['Jan.', 'Feb.', 'Mär.', 'Apr.', 'Mai', 'Jun.', 'Jul.', 'Aug.', 'Sep.', 'Okt.', 'Nov.', 'Dez.'];
  const [year, month] = m.split('-');
  return `${names[parseInt(month) - 1]} ${year}`;
}

type InsightType = 'positive' | 'neutral' | 'warning';
interface Insight { text: string; type: InsightType }

function buildInsights(data: import('@/lib/api').FatigueData): Insight[] {
  const insights: Insight[] = [];
  const avg = data.stats.avg_fatigue_pct;
  if (avg === null) return insights;

  // Positiv = Steigerung (gut), Negativ = Ermüdung (schlecht)
  const steigerungPct = Math.round(data.stats.steigerung_count / data.stats.rides_analyzed * 100);

  if (avg > 0) {
    insights.push({ text: `Im Schnitt fährst du mit Steigerung (${fmtPct(avg)}) – sehr gleichmäßiges bis aufbauendes Pacing.`, type: 'positive' });
  } else if (avg > -5) {
    insights.push({ text: `Dein Pacing ist sehr ausgeglichen (Ø ${fmtPct(avg)}) – kaum Ermüdungseffekt.`, type: 'positive' });
  } else if (avg > -10) {
    insights.push({ text: `Du wirst leicht ermüdet (Ø ${fmtPct(avg)}) – für Freizeitradler ein normaler Wert.`, type: 'neutral' });
  } else if (avg > -20) {
    insights.push({ text: `Du ermüdest spürbar (Ø ${fmtPct(avg)}) – du startest häufig etwas zu schnell.`, type: 'warning' });
  } else {
    insights.push({ text: `Starke Ermüdung im Schnitt (Ø ${fmtPct(avg)}) – deutlicher Einbruch in der zweiten Hälfte.`, type: 'warning' });
  }

  if (steigerungPct >= 40) {
    insights.push({ text: `${steigerungPct} % deiner Rides endest du mit Steigerung – sehr konstantes Pacing.`, type: 'positive' });
  } else if (steigerungPct >= 20) {
    insights.push({ text: `${steigerungPct} % deiner Rides endest du mit Steigerung – etwa jeder 5. Ride.`, type: 'neutral' });
  } else {
    insights.push({ text: `Nur ${steigerungPct} % deiner Rides endest du mit Steigerung (${data.stats.steigerung_count} von ${data.stats.rides_analyzed}).`, type: 'neutral' });
  }

  const shortBucket = data.by_distance.find(b => b.label === '< 20 km');
  // Positiver Wert = Steigerung auf Kurzstrecken
  if (shortBucket && shortBucket.avg_fatigue_pct !== null && shortBucket.rides >= 5 && shortBucket.avg_fatigue_pct > 0) {
    insights.push({ text: `Kurze Rides (< 20 km) endest du im Schnitt mit Steigerung (${fmtPct(shortBucket.avg_fatigue_pct)}) – du wirst erst im Laufe der Fahrt warm.`, type: 'positive' });
  }

  const midBucket  = data.by_distance.find(b => b.label === '20–40 km');
  const longBucket = data.by_distance.find(b => b.label === '40–60 km');
  if (
    midBucket && longBucket &&
    midBucket.avg_fatigue_pct !== null && longBucket.avg_fatigue_pct !== null &&
    longBucket.rides >= 5 &&
    // Längere Rides ermüden weniger (weniger negativer / mehr positiver Wert)
    longBucket.avg_fatigue_pct > midBucket.avg_fatigue_pct
  ) {
    insights.push({
      text: `Paradox: Rides über 40 km pacst du gleichmäßiger (${fmtPct(longBucket.avg_fatigue_pct)}) als kürzere Rides (${fmtPct(midBucket.avg_fatigue_pct)}) – längere Ausfahrten planst du bewusster ein.`,
      type: 'positive',
    });
  }

  if (data.worst_ermuedung && data.worst_ermuedung.dist_km < 15) {
    insights.push({
      text: `Der Ausreißer mit ${fmtPct(data.worst_ermuedung.fatigue_pct)} Ermüdung war nur ${data.worst_ermuedung.dist_km} km lang – vermutlich kein typischer Ride.`,
      type: 'neutral',
    });
  }

  const validMonths = data.monthly.filter(m => m.rides >= 2);
  if (validMonths.length >= 3) {
    // Bester Monat: höchster Wert (Steigerung), schlechtester: niedrigster Wert (Ermüdung)
    const bestMonth  = validMonths.reduce((a, b) => a.avg_fatigue_pct > b.avg_fatigue_pct ? a : b);
    const worstMonth = validMonths.reduce((a, b) => a.avg_fatigue_pct < b.avg_fatigue_pct ? a : b);
    insights.push({
      text: `Bester Monat: ${fmtMonth(bestMonth.month)} (${fmtPct(bestMonth.avg_fatigue_pct)}), schlechtester: ${fmtMonth(worstMonth.month)} (${fmtPct(worstMonth.avg_fatigue_pct)}).`,
      type: 'neutral',
    });
  }

  return insights;
}

// Histogramm-Daten aufbereiten
function buildHistoData(distribution: FatigueData['distribution']) {
  const BUCKET_MIN = -50;
  const BUCKET_MAX = 30;
  const allBuckets: number[] = [];
  for (let b = BUCKET_MIN; b <= BUCKET_MAX; b += 5) allBuckets.push(b);

  const countMap = new Map(distribution.map(d => [d.bucket, d.count]));

  return allBuckets.map(bucket => ({
    bucket,
    label: `${bucket >= 0 ? '+' : ''}${bucket}%`,
    count: countMap.get(bucket) ?? 0,
    color: fatigueColor(bucket + 2.5), // Mitte des Buckets für Farbzuweisung
  }));
}

export default function FatigueIndexPage() {
  const [data, setData] = useState<FatigueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [availableYears, setAvailableYears] = useState<string[]>([]);
  const [filterYear, setFilterYear] = useState<string | null>(null);

  useEffect(() => {
    // Jahre für Jahresfilter laden
    api.activityStats()
      .then(stats => {
        const years = stats.available_years.filter(y => Number(y) >= 2000);
        setAvailableYears(years);
      })
      .catch(() => {/* Jahre optional */});

    // Initialdaten laden
    api.fatigueIndex()
      .then(result => setData(result))
      .catch(e => setError(e instanceof Error ? e.message : 'Fehler beim Laden'))
      .finally(() => setLoading(false));
  }, []);

  async function loadData(year?: string | null) {
    setLoading(true);
    setError(null);
    try {
      const result = await api.fatigueIndex(year ? Number(year) : undefined);
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler beim Laden');
    } finally {
      setLoading(false);
    }
  }

  function handleYearChange(year: string | null) {
    const y = year === 'all' ? null : year;
    setFilterYear(y);
    loadData(y);
  }

  const histoData = useMemo(() =>
    data?.distribution?.length ? buildHistoData(data.distribution) : [],
    [data]
  );

  const monthData = useMemo(() =>
    data?.monthly?.map(m => ({
      month: m.month.slice(0, 7),
      avg: m.avg_fatigue_pct,
      rides: m.rides,
      neg_split_pct: m.neg_split_pct,
      // Positiv = Steigerung (blau/grün), Negativ = Ermüdung (amber/rot)
    color: m.avg_fatigue_pct > 0 ? '#3b82f6' : m.avg_fatigue_pct > -10 ? '#f59e0b' : '#ef4444',
    })) ?? [],
    [data]
  );

  const tableRides: FatigueRide[] = data?.rides?.slice(0, 30) ?? [];

  const avgFatigue = data?.stats.avg_fatigue_pct ?? null;

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Ermüdungsindex" subtitle="Vergleich Geschwindigkeit 1. vs. 2. Hälfte je Ride" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 bg-muted animate-pulse rounded-xl" />
          ))}
        </div>
        <div className="h-56 bg-muted animate-pulse rounded-xl" />
        <div className="h-40 bg-muted animate-pulse rounded-xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Ermüdungsindex" />
        <div className="rounded border border-destructive/50 bg-destructive/10 p-4 text-destructive text-sm">{error}</div>
      </div>
    );
  }

  if (!data || data.stats.rides_analyzed === 0) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Ermüdungsindex"
          subtitle="Vergleich Geschwindigkeit 1. vs. 2. Hälfte je Ride"
          years={availableYears}
          selectedYear={filterYear}
          onYearChange={handleYearChange}
        />
        <div className="rounded-xl border bg-card px-6 py-10 text-center text-muted-foreground text-sm">
          Keine auswertbaren Rides gefunden.
          {filterYear && ` Für ${filterYear} liegen keine Tracks mit ausreichend Datenpunkten vor.`}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ermüdungsindex"
        subtitle="Vergleich Geschwindigkeit 1. vs. 2. Hälfte je Ride"
        years={availableYears}
        selectedYear={filterYear}
        onYearChange={handleYearChange}
      />

      {/* Erklärungsbox */}
      <Card className="shadow-sm border bg-muted/30">
        <CardContent className="px-5 py-4 space-y-3">
          <p className="text-sm font-semibold">Was zeigt der Ermüdungsindex?</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Jeder Ride wird an der Distanzmitte geteilt. Der Index misst, um wie viel Prozent sich deine
            Durchschnittsgeschwindigkeit von der ersten zur zweiten Hälfte verändert.
          </p>
          <p className="text-xs text-muted-foreground font-mono bg-muted rounded px-2 py-1 inline-block">
            Index = (Ø-Speed 2. Hälfte − Ø-Speed 1. Hälfte) ÷ Ø-Speed 1. Hälfte × 100
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Beispiel: 1. Hälfte 28 km/h, 2. Hälfte 25 km/h → <span className="text-orange-500 font-semibold">−10,7 %</span> Ermüdung.
            Fährst du in der zweiten Hälfte schneller, ist der Wert positiv — das bedeutet Steigerung (Fachbegriff: Negativsplit) und ist das beste mögliche Ergebnis.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
            {[
              { range: '> +10 %', label: 'Starke Steigerung', desc: 'H2 deutlich schneller', color: 'text-blue-500', bar: '#3b82f6' },
              { range: '0 – +10 %', label: 'Steigerung / Ausgeglichen', desc: 'H2 schneller oder gleich', color: 'text-emerald-500', bar: '#10b981' },
              { range: '−5 – 0 %', label: 'Fast ausgeglichen', desc: 'Kaum Unterschied', color: 'text-green-500', bar: '#22c55e' },
              { range: '−10 – −5 %', label: 'Leichte Ermüdung', desc: 'Noch im grünen Bereich', color: 'text-amber-500', bar: '#f59e0b' },
              { range: '−20 – −10 %', label: 'Mittlere Ermüdung', desc: 'Deutlicher Einbruch', color: 'text-orange-500', bar: '#f97316' },
              { range: '< −20 %', label: 'Starke Ermüdung', desc: 'Massiver Einbruch H2', color: 'text-red-500', bar: '#ef4444' },
            ].map(({ range, label, desc, color, bar }) => (
              <div key={range} className="flex items-start gap-2">
                <div className="w-1 h-full min-h-[36px] rounded-full shrink-0 mt-0.5" style={{ background: bar }} />
                <div>
                  <p className={`text-[11px] font-semibold ${color}`}>{range}</p>
                  <p className="text-[10px] text-foreground">{label}</p>
                  <p className="text-[10px] text-muted-foreground">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 1. Stats-Leiste */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">

        {/* Ø Ermüdung */}
        <Card className="shadow-sm border">
          <CardContent className="px-4 py-3 space-y-1">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Ø Ermüdung</p>
            {avgFatigue !== null ? (
              <>
                <p className={`text-2xl font-bold ${fatigueTextColor(avgFatigue)}`}>{fmtPct(avgFatigue)}</p>
                <p className="text-[10px] text-muted-foreground">
                  {avgFatigue > 0
                    ? 'Im Schnitt Steigerung'
                    : avgFatigue > -5
                    ? 'Fast kein Ermüdungseffekt'
                    : 'Durchschnittliche Ermüdung'}
                </p>
              </>
            ) : (
              <p className="text-2xl font-bold text-muted-foreground">–</p>
            )}
          </CardContent>
        </Card>

        {/* Steigerungen */}
        <Card className="shadow-sm border">
          <CardContent className="px-4 py-3 space-y-1">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Steigerungen</p>
            <p className="text-2xl font-bold text-blue-500">{data.stats.steigerung_count}</p>
            <p className="text-[10px] text-muted-foreground">von {data.stats.rides_analyzed} Rides</p>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-1">
              <div
                className="h-full bg-blue-500 rounded-full transition-all"
                style={{ width: `${Math.round(data.stats.steigerung_count / data.stats.rides_analyzed * 100)}%` }}
              />
            </div>
          </CardContent>
        </Card>

        {/* Beste Steigerung */}
        {data.best_steigerung ? (
          <Card className="shadow-sm" style={{ borderColor: 'rgba(59,130,246,0.25)', background: 'rgba(59,130,246,0.05)' }}>
            <CardContent className="px-4 py-3 space-y-1">
              <p className="text-[10px] uppercase tracking-wide text-blue-500">Beste Steigerung</p>
              <p className="text-2xl font-bold text-blue-500">{fmtPct(data.best_steigerung.fatigue_pct)}</p>
              <Link
                to={`/activities/${data.best_steigerung.activity_id}`}
                className="text-[10px] text-blue-400 hover:text-blue-300 truncate block transition-colors"
              >
                {data.best_steigerung.activity_name} · {fmtDate(data.best_steigerung.date)}
              </Link>
            </CardContent>
          </Card>
        ) : (
          <Card className="shadow-sm border">
            <CardContent className="px-4 py-3">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Beste Steigerung</p>
              <p className="text-2xl font-bold text-muted-foreground">–</p>
            </CardContent>
          </Card>
        )}

        {/* Größte Ermüdung */}
        {data.worst_ermuedung ? (
          <Card className="shadow-sm" style={{ borderColor: 'rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.05)' }}>
            <CardContent className="px-4 py-3 space-y-1">
              <p className="text-[10px] uppercase tracking-wide text-red-500">Größte Ermüdung</p>
              <p className="text-2xl font-bold text-red-500">{data.worst_ermuedung.fatigue_pct.toFixed(1)}%</p>
              <Link
                to={`/activities/${data.worst_ermuedung.activity_id}`}
                className="text-[10px] text-red-400 hover:text-red-300 truncate block transition-colors"
              >
                {data.worst_ermuedung.activity_name} · {fmtDate(data.worst_ermuedung.date)}
              </Link>
            </CardContent>
          </Card>
        ) : (
          <Card className="shadow-sm border">
            <CardContent className="px-4 py-3">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Größte Ermüdung</p>
              <p className="text-2xl font-bold text-muted-foreground">–</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* 2. Dynamische Einschätzung */}
      {(() => {
        const insights = buildInsights(data);
        if (!insights.length) return null;
        return (
          <Card className="shadow-sm border">
            <CardHeader className="pb-1 border-b">
              <CardTitle className="text-base font-semibold">Einschätzung</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Automatisch aus deinen Rides abgeleitet</p>
            </CardHeader>
            <CardContent className="pt-4">
              <ul className="space-y-2.5">
                {insights.map((insight, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm">
                    <span className={`mt-0.5 shrink-0 font-bold leading-none ${
                      insight.type === 'positive' ? 'text-green-500' :
                      insight.type === 'warning'  ? 'text-orange-500' :
                      'text-muted-foreground'
                    }`}>
                      {insight.type === 'positive' ? '↑' : insight.type === 'warning' ? '↓' : '·'}
                    </span>
                    <span className="text-muted-foreground leading-snug">{insight.text}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        );
      })()}

      {/* Histogramm: Verteilung */}
      {histoData.length > 0 && (
        <Card className="shadow-sm border overflow-hidden">
          <CardHeader className="pb-1 border-b">
            <CardTitle className="text-base font-semibold">Verteilung des Ermüdungsindex</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Rides je Ermüdungs-Bucket (5%-Schritte) — grün/blau = Steigerung, amber/rot = Ermüdung
            </p>
          </CardHeader>
          <CardContent className="pt-4">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={histoData} margin={{ top: 8, right: 16, bottom: 24, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 9 }}
                  interval={1}
                  angle={-45}
                  textAnchor="end"
                  height={40}
                />
                <YAxis tick={{ fontSize: 11 }} width={32} />
                <Tooltip
                  formatter={(value, _name, props) => {
                    const b = props.payload.bucket;
                    const hi = b + 5;
                    return [
                      `${value} Ride${Number(value) !== 1 ? 's' : ''}`,
                      `${b >= 0 ? '+' : ''}${b}% bis ${hi >= 0 ? '+' : ''}${hi}%`,
                    ];
                  }}
                  contentStyle={{
                    fontSize: 12,
                    backgroundColor: 'hsl(var(--background))',
                    border: '1px solid hsl(var(--border))',
                  }}
                />
                {/* Nulllinie */}
                <ReferenceLine
                  x="0%"
                  stroke="hsl(var(--foreground))"
                  strokeDasharray="6 4"
                  strokeOpacity={0.6}
                  label={{ value: 'Ausgeglichenes Pacing (0 %)', fontSize: 9, fill: 'hsl(var(--foreground))', position: 'insideTopRight' }}
                />
                {/* Ø-Linie */}
                {avgFatigue !== null && (
                  <ReferenceLine
                    x={`${avgFatigue >= 0 ? '+' : ''}${Math.round(avgFatigue / 5) * 5}%`}
                    stroke="#f97316"
                    strokeDasharray="4 3"
                    strokeOpacity={0.8}
                    label={{ value: `Ø ${fmtPct(avgFatigue)}`, fontSize: 9, fill: '#f97316', position: 'insideBottomRight' }}
                  />
                )}
                <Bar dataKey="count" name="Rides" radius={[2, 2, 0, 0]} isAnimationActive={false}>
                  {histoData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} fillOpacity={0.85} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="flex justify-between text-[10px] text-muted-foreground px-8 mt-1">
              <span>← Ermüdung (langsamer in H2)</span>
              <span>Steigerung (schneller) →</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 3. Kacheln: Beste Steigerung / Größte Ermüdung (Detail) */}
      {data.best_steigerung && data.worst_ermuedung && (
        <div className="grid sm:grid-cols-2 gap-4">
          {/* Beste Steigerung */}
          {(() => {
            const bn = data.best_steigerung!;
            const bnW = splitBarWidths(bn.spd_h1_kmh, bn.spd_h2_kmh);
            return (
              <Card className="shadow-sm" style={{ borderColor: 'rgba(59,130,246,0.25)', background: 'rgba(59,130,246,0.05)' }}>
                <CardContent className="px-5 py-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs text-blue-500 uppercase tracking-wide font-medium">Beste Steigerung</p>
                      <p className="text-sm font-semibold text-foreground truncate mt-0.5">{bn.activity_name}</p>
                      <p className="text-xs text-muted-foreground">{fmtDate(bn.date)} · {bn.dist_km} km</p>
                    </div>
                    <span className="shrink-0 text-lg font-bold text-blue-500 tabular-nums">{fmtPct(bn.fatigue_pct)}</span>
                  </div>
                  <div className="space-y-2">
                    <div>
                      <div className="flex justify-between text-[10px] text-muted-foreground mb-0.5">
                        <span>1. Hälfte</span>
                        <span className="font-semibold text-foreground">{bn.spd_h1_kmh} km/h</span>
                      </div>
                      <div className="h-3 bg-muted rounded overflow-hidden">
                        <div className="h-full rounded transition-all" style={{ width: `${bnW.w1}%`, background: '#6366f1' }} />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-[10px] text-muted-foreground mb-0.5">
                        <span>2. Hälfte</span>
                        <span className="font-semibold text-blue-400">{bn.spd_h2_kmh} km/h</span>
                      </div>
                      <div className="h-3 bg-muted rounded overflow-hidden">
                        <div className="h-full rounded transition-all" style={{ width: `${bnW.w2}%`, background: '#3b82f6' }} />
                      </div>
                    </div>
                  </div>
                  <Link
                    to={`/activities/${bn.activity_id}`}
                    className="inline-flex items-center gap-1 text-xs text-blue-500 hover:text-blue-400 transition-colors"
                  >
                    Zur Aktivität →
                  </Link>
                </CardContent>
              </Card>
            );
          })()}

          {/* Größte Ermüdung */}
          {(() => {
            const wf = data.worst_ermuedung!;
            const wfW = splitBarWidths(wf.spd_h1_kmh, wf.spd_h2_kmh);
            return (
              <Card className="shadow-sm" style={{ borderColor: 'rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.05)' }}>
                <CardContent className="px-5 py-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs text-red-500 uppercase tracking-wide font-medium">Größte Ermüdung</p>
                      <p className="text-sm font-semibold text-foreground truncate mt-0.5">{wf.activity_name}</p>
                      <p className="text-xs text-muted-foreground">{fmtDate(wf.date)} · {wf.dist_km} km</p>
                    </div>
                    <span className="shrink-0 text-lg font-bold text-red-500 tabular-nums">{wf.fatigue_pct.toFixed(1)}%</span>
                  </div>
                  <div className="space-y-2">
                    <div>
                      <div className="flex justify-between text-[10px] text-muted-foreground mb-0.5">
                        <span>1. Hälfte</span>
                        <span className="font-semibold text-orange-400">{wf.spd_h1_kmh} km/h</span>
                      </div>
                      <div className="h-3 bg-muted rounded overflow-hidden">
                        <div className="h-full rounded transition-all" style={{ width: `${wfW.w1}%`, background: '#f97316' }} />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-[10px] text-muted-foreground mb-0.5">
                        <span>2. Hälfte</span>
                        <span className="font-semibold text-red-400">{wf.spd_h2_kmh} km/h</span>
                      </div>
                      <div className="h-3 bg-muted rounded overflow-hidden">
                        <div className="h-full rounded transition-all" style={{ width: `${wfW.w2}%`, background: '#ef4444' }} />
                      </div>
                    </div>
                  </div>
                  <Link
                    to={`/activities/${wf.activity_id}`}
                    className="inline-flex items-center gap-1 text-xs text-red-500 hover:text-red-400 transition-colors"
                  >
                    Zur Aktivität →
                  </Link>
                </CardContent>
              </Card>
            );
          })()}
        </div>
      )}

      {/* 4. Monatstrend */}
      {monthData.length > 0 && (
        <Card className="shadow-sm border overflow-hidden">
          <CardHeader className="pb-1 border-b">
            <CardTitle className="text-base font-semibold">Monatlicher Trend</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Ø Ermüdungsindex je Monat — blau = Steigerung, amber/rot = Ermüdung
            </p>
          </CardHeader>
          <CardContent className="pt-4">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={monthData} margin={{ top: 8, right: 16, bottom: 24, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 9 }}
                  interval={2}
                  angle={-45}
                  textAnchor="end"
                  height={40}
                />
                <YAxis
                  tickFormatter={v => `${v >= 0 ? '+' : ''}${v}%`}
                  tick={{ fontSize: 10 }}
                  width={48}
                />
                <Tooltip
                  formatter={(value, _name, props) => [
                    `${fmtPct(Number(value))} · ${props.payload.rides} Rides · ${props.payload.neg_split_pct.toFixed(0)} % Steigerung`,
                    props.payload.month,
                  ]}
                  contentStyle={{
                    fontSize: 12,
                    backgroundColor: 'hsl(var(--background))',
                    border: '1px solid hsl(var(--border))',
                  }}
                />
                <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} />
                <Bar dataKey="avg" name="Ø Ermüdung" radius={[2, 2, 0, 0]} isAnimationActive={false}>
                  {monthData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} fillOpacity={0.8} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* 5. Distanz-Kacheln */}
      {data.by_distance.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {data.by_distance.map(bucket => (
            <Card key={bucket.label} className="shadow-sm border">
              <CardContent className="px-4 py-3 text-center space-y-1">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{bucket.label}</p>
                {bucket.avg_fatigue_pct !== null ? (
                  <>
                    <p className={`text-2xl font-bold ${fatigueTextColor(bucket.avg_fatigue_pct)}`}>
                      {fmtPct(bucket.avg_fatigue_pct)}
                    </p>
                    <div
                      className="h-1 rounded-full mt-1"
                      style={{ background: fatigueColor(bucket.avg_fatigue_pct), opacity: 0.7 }}
                    />
                  </>
                ) : (
                  <p className="text-2xl font-bold text-muted-foreground">–</p>
                )}
                <p className="text-[10px] text-muted-foreground">{bucket.rides} Ride{bucket.rides !== 1 ? 's' : ''}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 6. Ride-Tabelle */}
      {tableRides.length > 0 && (
        <Card className="shadow-sm border overflow-hidden">
          <CardHeader className="pb-1 border-b">
            <CardTitle className="text-base font-semibold">Letzte {tableRides.length} Rides</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">Sortiert nach Datum — neueste zuerst</p>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground uppercase tracking-wide border-b">
                  <th className="px-4 py-2 font-medium">Datum</th>
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium text-right">Dist.</th>
                  <th className="px-4 py-2 font-medium text-right">1. Hälfte</th>
                  <th className="px-4 py-2 font-medium text-right">2. Hälfte</th>
                  <th className="px-4 py-2 font-medium">Index</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {tableRides.map(ride => {
                  const v = ride.fatigue_pct;
                  const barPct = Math.min(Math.abs(v) / 30 * 100, 100);
                  return (
                    <tr key={ride.activity_id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">{fmtDate(ride.date)}</td>
                      <td className="px-4 py-2 max-w-[200px]">
                        <Link
                          to={`/activities/${ride.activity_id}`}
                          className="text-foreground hover:text-[#fc4c02] transition-colors truncate block"
                        >
                          {ride.activity_name}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-right text-muted-foreground">{ride.dist_km} km</td>
                      <td className="px-4 py-2 text-right text-muted-foreground">{ride.spd_h1_kmh}</td>
                      <td className="px-4 py-2 text-right text-muted-foreground">{ride.spd_h2_kmh}</td>
                      <td className="px-4 py-2 min-w-[120px]">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-muted rounded overflow-hidden">
                            <div
                              className="h-full rounded"
                              style={{ width: `${barPct}%`, background: fatigueColor(v) }}
                            />
                          </div>
                          <span className={`shrink-0 font-semibold tabular-nums ${fatigueTextColor(v)}`}>
                            {fmtPct(v)}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
