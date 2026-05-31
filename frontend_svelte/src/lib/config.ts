// Zentrale Konfigurationsparameter – werden in der Berechnungsseite (/berechnungen) angezeigt.
// Änderungen hier wirken sich automatisch auf die Dokumentation aus.

/** Catmull-Rom → Bezier Spannung für alle SVG-Liniendiagramme. 0 = gerade, 0.5 = stark gerundet. */
export const BEZIER_TENSION = 0.2;

/** Anzahl Wochen im Dashboard-Sparkline (ohne Jahresfilter). */
export const SPARKLINE_WEEKS = 8;

/** Anzahl Farbstufen (Buckets) für die geschwindigkeitsbasierte Karteneinfärbung. */
export const SPEED_COLOR_BUCKETS = 20;

/** RDP-Toleranz in Metern für die Track-Vereinfachung beim Laden. */
export const TRACK_SIMPLIFY_M = 5;

/** RDP-Toleranz in Metern für Track-Vereinfachung auf der Vergleichsseite (höher = weniger Punkte). */
export const COMPARISON_SIMPLIFY = 20;

/** Farben für den Streckenvergleich (bis zu 5 Aktivitäten). */
export const COMPARISON_COLORS = [
	'#fc4c02', // Orange  – Referenz-Aktivität
	'#60a5fa', // Blau
	'#4ade80', // Grün
	'#f472b6', // Pink
	'#a78bfa', // Violett
] as const;
