import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Insight } from '@/lib/insights';

interface InsightCardProps {
  insights: Insight[];
  title?: string;
  subtitle?: string;
}

export function InsightCard({
  insights,
  title = 'Einschätzung',
  subtitle = 'Automatisch aus deinen Daten abgeleitet',
}: InsightCardProps) {
  if (insights.length === 0) return null;

  return (
    <Card className="shadow-sm border">
      <CardHeader className="pb-1 border-b">
        <CardTitle className="text-base font-semibold">{title}</CardTitle>
        <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
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
}
