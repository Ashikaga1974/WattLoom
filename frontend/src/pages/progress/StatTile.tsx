import type { ReactNode } from 'react';

/** Einheitliche Stat-Kachel für alle Progress-Tabs – farbiger Akzentbalken + Icon-Badge,
    große fette Zahl. `color-mix()` statt String-Konkatenation für die Icon-Tönung, damit sowohl
    Hex-Farben (Jahres-Palette) als auch CSS-Variablen (var(--primary-strong)) funktionieren. */
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
  const accent = valueColor ?? 'var(--primary-strong)';
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
