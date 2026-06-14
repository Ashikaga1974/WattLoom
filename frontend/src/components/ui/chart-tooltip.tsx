export interface TooltipRow {
  label: string;
  value: string | number | null;
  className?: string;
  color?: string;
  separator?: boolean;
}

export function ChartTooltip({
  active,
  label,
  rows,
}: {
  active?: boolean;
  label?: string | null;
  rows: TooltipRow[];
}) {
  if (!active) return null;
  const visible = rows.filter(r => r.value !== null && r.value !== undefined);
  if (!visible.length) return null;
  return (
    <div className="bg-background border border-border rounded-lg px-3 py-2.5 text-xs shadow-md min-w-[140px] max-w-[240px]">
      {label && (
        <p className="font-semibold text-foreground border-b border-border pb-1.5 mb-1.5">{label}</p>
      )}
      <div className="space-y-1.5">
        {visible.map((row, i) => (
          <div
            key={i}
            className={`flex justify-between gap-4 ${row.separator ? 'border-t border-border pt-1.5' : ''}`}
          >
            <span className="text-muted-foreground shrink-0">{row.label}</span>
            <span
              className={`font-medium text-right ${row.className ?? 'text-foreground'}`}
              style={row.color ? { color: row.color } : undefined}
            >
              {row.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
