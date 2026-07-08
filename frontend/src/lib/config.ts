/** Catmull-Rom → Bezier Spannung für SVG-Liniendiagramme. 0 = gerade, 0.5 = stark gerundet. */
export const BEZIER_TENSION = 0.2;

/** RDP-Toleranz in Metern für die Track-Vereinfachung beim Laden. */
export const TRACK_SIMPLIFY_M = 5;

/** RDP-Toleranz in Metern für Track-Vereinfachung auf der Vergleichsseite. */
export const COMPARISON_SIMPLIFY = 20;

/** Anzahl Farbstufen für die geschwindigkeitsbasierte Karteneinfärbung. */
export const SPEED_COLOR_BUCKETS = 20;

/** Anzahl Wochen im Dashboard-Sparkline. */
export const SPARKLINE_WEEKS = 8;

/** Einheitliche Chart-Höhen (px) – ersetzt vormals ~12 verschiedene Ad-hoc-Werte je Seite. */
export const CHART_HEIGHT_MINI = 100;    // winzige Inline-Sparklines (z.B. ActivityDetailPage)
export const CHART_HEIGHT_COMPACT = 140; // kleine Trend-Charts (z.B. Dashboard, Wrapped)
export const CHART_HEIGHT = 200;         // Standard-Analyse-Chart
export const CHART_HEIGHT_DENSE = 220;   // dichte Mehrserien-Charts (Cap nach oben)

/** Farben für den Streckenvergleich (bis zu 5 Aktivitäten). */
export const COMPARISON_COLORS = [
  '#fc4c02',
  '#3b82f6',
  '#22c55e',
  '#ec4899',
  '#a78bfa',
] as const;
