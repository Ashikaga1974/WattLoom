// Kategorial-Palette für Jahresvergleiche (mehr als 2-3 Serien) – fixe Hex-Werte statt
// var(--chart-N), analog zu comparison_colors (RouteComparisonPage): --chart-N wird im Dark-Theme
// zu einer Graustufen-Rampe (siehe index.css), das würde die Jahres-Unterscheidbarkeit dort
// zerstören. Diese Palette ist bewusst themeunabhängig fix.
export const PALETTE = ['#fc4c02', '#60a5fa', '#4ade80', '#c084fc', '#f472b6', '#facc15'];
export const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
export const MONTH_DOYS = [1, 32, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];

export type MonthlyEntry = { year: number; month: number; distance_km: number; count: number };
