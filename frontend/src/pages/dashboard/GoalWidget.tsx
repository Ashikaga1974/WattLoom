import { useTranslation } from 'react-i18next';

const GOAL_COLOR = '#3b82f6';

// Anteil des Kalenderjahres, der bereits verstrichen ist (0–1) – Vergleichsbasis für "im Plan"
function yearProgressFraction(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1).getTime();
  const end = new Date(now.getFullYear() + 1, 0, 1).getTime();
  return (now.getTime() - start) / (end - start);
}

function GoalRow({
  icon,
  label,
  current,
  target,
  unit,
  paceHint,
}: {
  icon: string;
  label: string;
  current: number;
  target: number;
  unit: string;
  paceHint?: { diffPct: number };
}) {
  const { t } = useTranslation('dashboard');
  const pct = Math.min(100, Math.round((current / target) * 100));
  const paceColor = paceHint == null ? GOAL_COLOR : paceHint.diffPct >= 0 ? '#22c55e' : '#f59e0b';
  return (
    <div className="flex items-center gap-4">
      <div className="text-2xl font-black tabular-nums shrink-0 w-16 text-right" style={{ color: paceColor }}>
        {pct}%
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between mb-1.5 gap-2">
          <span className="text-sm font-semibold text-foreground whitespace-nowrap">{icon} {label}</span>
          <span className="text-xs text-muted-foreground tabular-nums shrink-0">
            {current.toFixed(0)} / {target.toFixed(0)} {unit}
          </span>
        </div>
        <div className="h-2.5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${pct}%`, background: paceColor }}
          />
        </div>
        {paceHint && (
          <p className="text-[11px] mt-1" style={{ color: paceColor }}>
            {paceHint.diffPct >= 0 ? t('goals.onPlan') : t('goals.behindPlan', { pct: Math.abs(paceHint.diffPct) })}
          </p>
        )}
      </div>
    </div>
  );
}

export function GoalWidget({
  yearlyKmGoal,
  weeklyHoursGoal,
  yearKm,
  weekHours,
}: {
  yearlyKmGoal: number | null;
  weeklyHoursGoal: number | null;
  yearKm: number | null;
  weekHours: number | null;
}) {
  const { t } = useTranslation('dashboard');
  if (yearlyKmGoal == null && weeklyHoursGoal == null) return null;
  const showYear = yearlyKmGoal != null && yearKm != null;
  const showWeek = weeklyHoursGoal != null && weekHours != null;
  const yearPct = showYear ? Math.min(100, Math.round((yearKm! / yearlyKmGoal!) * 100)) : 0;
  const expectedPct = Math.round(yearProgressFraction() * 100);

  return (
    <div className="rounded-2xl border px-5 py-4 space-y-4" style={{ borderColor: `${GOAL_COLOR}50`, background: `${GOAL_COLOR}0d` }}>
      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        {t('goals.title')}
      </p>
      {showYear && (
        <GoalRow
          icon="🎯"
          label={t('goals.yearlyLabel', { year: new Date().getFullYear() })}
          current={yearKm!}
          target={yearlyKmGoal!}
          unit="km"
          paceHint={{ diffPct: yearPct - expectedPct }}
        />
      )}
      {showWeek && (
        <GoalRow icon="📅" label={t('goals.weeklyLabel')} current={weekHours!} target={weeklyHoursGoal!} unit="h" />
      )}
    </div>
  );
}
