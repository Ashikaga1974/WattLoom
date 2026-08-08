export type InsightType = 'positive' | 'neutral' | 'warning';

export interface Insight {
  text: string;
  type: InsightType;
}
