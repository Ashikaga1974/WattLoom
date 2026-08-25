import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function GoalsCard() {
  const { t } = useTranslation('common');
  const { t: ts } = useTranslation('settings');
  const [yearlyKmGoalInput, setYearlyKmGoalInput] = useState('');
  const [weeklyHoursGoalInput, setWeeklyHoursGoalInput] = useState('');
  const [goalSaving, setGoalSaving] = useState(false);
  const [goalSuccess, setGoalSuccess] = useState(false);
  const [goalError, setGoalError] = useState<string | null>(null);

  useEffect(() => {
    api.getSettings().then(res => {
      if (res.yearly_km_goal != null) setYearlyKmGoalInput(String(res.yearly_km_goal));
      if (res.weekly_hours_goal != null) setWeeklyHoursGoalInput(String(res.weekly_hours_goal));
    }).catch(() => {});
  }, []);

  async function saveGoals() {
    const km = yearlyKmGoalInput ? parseFloat(yearlyKmGoalInput.replace(',', '.')) : null;
    if (km !== null && (isNaN(km) || km <= 0)) {
      setGoalError(ts('goals.errors.yearlyPositive'));
      return;
    }
    const hours = weeklyHoursGoalInput ? parseFloat(weeklyHoursGoalInput.replace(',', '.')) : null;
    if (hours !== null && (isNaN(hours) || hours <= 0)) {
      setGoalError(ts('goals.errors.weeklyPositive'));
      return;
    }
    setGoalSaving(true);
    setGoalError(null);
    try {
      await api.saveSettings({
        yearly_km_goal:    km,
        weekly_hours_goal: hours,
      });
      setGoalSuccess(true);
      setTimeout(() => setGoalSuccess(false), 2500);
    } catch (e) {
      setGoalError(e instanceof Error ? e.message : ts('common.saveFailed'));
    } finally {
      setGoalSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader className="border-b border-border pb-3">
        <CardTitle className="text-sm font-semibold">{ts('goals.title')}</CardTitle>
        <p className="text-xs text-muted-foreground">{ts('goals.subtitle')}</p>
      </CardHeader>
      <CardContent className="pt-5 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-2">
              {ts('goals.yearlyLabel')}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="10"
                min="0"
                value={yearlyKmGoalInput}
                onChange={(e) => setYearlyKmGoalInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && saveGoals()}
                placeholder="3000"
                className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-colors"
              />
              <span className="text-xs text-muted-foreground whitespace-nowrap">{ts('units.kmPerYear')}</span>
            </div>
          </div>

          <div>
            <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-2">
              {ts('goals.weeklyLabel')}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.5"
                min="0"
                value={weeklyHoursGoalInput}
                onChange={(e) => setWeeklyHoursGoalInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && saveGoals()}
                placeholder="5"
                className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-colors"
              />
              <span className="text-xs text-muted-foreground whitespace-nowrap">{ts('units.hoursPerWeek')}</span>
            </div>
            <p className="text-xs text-muted-foreground/50 mt-1.5">{ts('goals.weeklyHint')}</p>
          </div>
        </div>

        <div className="flex items-center gap-4 pt-1">
          <button
            onClick={saveGoals}
            disabled={goalSaving}
            className="rounded-md px-5 py-2 text-sm font-medium bg-orange-500 hover:bg-orange-600 disabled:opacity-50 transition-colors text-white cursor-pointer"
          >
            {goalSaving ? ts('common.saving') : t('actions.save')}
          </button>
          {goalSuccess && <span className="text-sm text-green-600">{ts('common.saved')}</span>}
          {goalError && <span className="text-sm text-red-500">{goalError}</span>}
        </div>
      </CardContent>
    </Card>
  );
}
