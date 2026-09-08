import type { ReactNode } from 'react';

// Kategorial-Palette für Jahresvergleiche (mehr als 2-3 Serien) – fixe Hex-Werte statt
// var(--chart-N), analog zu comparison_colors (StreckenPage): --chart-N wird im Dark-Theme
// zu einer Graustufen-Rampe (siehe index.css), das würde die Jahres-Unterscheidbarkeit dort
// zerstören. Diese Palette ist bewusst themeunabhängig fix.
export const PALETTE = ['#fc4c02', '#60a5fa', '#4ade80', '#c084fc', '#f472b6', '#facc15'];
export const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
export const MONTH_DOYS = [1, 32, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];

export type MonthlyEntry = { year: number; month: number; distance_km: number; count: number };

/** Einheitliche Stat-Kachel für alle Progress-Tabs – farbiger Akzentbalken + Icon-Badge,
    große fette Zahl. `color-mix()` statt String-Konkatenation für die Icon-Tönung, damit sowohl
    Hex-Farben (Jahres-Palette) als auch CSS-Variablen (var(--primary)) funktionieren. */
export function StatTile({
  icon,
  label,
  value,
  valueColor,
  bg,
  borderColor,
  sub,
}: {
  icon?: ReactNode;
  label: ReactNode;
  value: ReactNode;
  valueColor?: string;
  bg?: string;
  borderColor?: string;
  sub?: ReactNode;
}) {
  const accent = valueColor ?? 'var(--primary)';
  return (
    <div
      className="relative overflow-hidden rounded-2xl border px-4 py-3.5 min-w-40 flex-1"
      style={{ background: bg ?? 'var(--card)', borderColor: borderColor ?? 'var(--border)' }}
    >
      <div className="absolute left-0 top-0 bottom-0 w-1" style={{ background: accent }} />
      <div className="flex items-center gap-3">
        {icon && (
          <span
            className="flex items-center justify-center w-10 h-10 rounded-full text-lg shrink-0"
            style={{ background: `color-mix(in srgb, ${accent} 18%, transparent)` }}
          >
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground truncate">
            {label}
          </p>
          <p className="text-2xl md:text-[28px] font-black tabular-nums leading-tight" style={{ color: accent }}>
            {value}
          </p>
        </div>
      </div>
      {sub && <p className="text-[11px] text-muted-foreground mt-1.5">{sub}</p>}
    </div>
  );
}
