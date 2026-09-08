import { useTranslation } from 'react-i18next';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';

import { fmtNum } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartTooltip } from '@/components/ui/chart-tooltip';

interface ChartPoint { label: string; km: number; count: number; hm: number }

function DistanzSparkTooltip({ active, payload, label }: { active?: boolean; payload?: any[]; label?: string }) {
  const { t } = useTranslation('dashboard');
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  return (
    <ChartTooltip
      active={active}
      label={label}
      rows={[
        { label: t('sparkTooltip.distance'), value: `${d?.km ?? 0} km` },
        { label: t('sparkTooltip.rides'), value: `${d?.count ?? 0}` },
        ...(d?.hm > 0 ? [{ label: t('sparkTooltip.elevation'), value: `${fmtNum(d.hm)} m` }] : []),
      ]}
    />
  );
}

export function DistanceChart({
  chartData,
  selectedYear,
  sparklineWeeks,
  chartHeight,
}: {
  chartData: ChartPoint[];
  selectedYear: string | null;
  sparklineWeeks: number;
  chartHeight: number;
}) {
  const { t } = useTranslation('dashboard');
  if (chartData.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-muted-foreground font-medium">
          {selectedYear
            ? t('charts.distanceYear', { year: selectedYear })
            : t('charts.distanceWeeks', { weeks: sparklineWeeks })}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--primary)" stopOpacity={1} />
                <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.3} />
              </linearGradient>
            </defs>
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
            <Tooltip content={<DistanzSparkTooltip />} />
            <Bar dataKey="km" fill="url(#barGrad)" radius={[4, 4, 0, 0]} maxBarSize={28} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
