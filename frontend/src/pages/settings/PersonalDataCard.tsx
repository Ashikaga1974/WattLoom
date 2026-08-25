import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type Settings } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export function PersonalDataCard() {
  const { t } = useTranslation('common');
  const { t: ts } = useTranslation('settings');
  const [weightInput, setWeightInput] = useState('');
  const [birthYearInput, setBirthYearInput] = useState('');
  const [hrMaxInput, setHrMaxInput] = useState('185');
  const [tzInput, setTzInput] = useState('auto');
  const [saved, setSaved] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loadingSettings, setLoadingSettings] = useState(true);

  useEffect(() => {
    api.getSettings().then(res => {
      setSaved(res);
      if (res.weight_kg != null) setWeightInput(String(res.weight_kg));
      if (res.birth_year != null) setBirthYearInput(String(res.birth_year));
      setHrMaxInput(String(res.hr_max ?? 185));
      setTzInput(res.tz_offset != null ? String(res.tz_offset) : 'auto');
    }).catch(() => {}).finally(() => setLoadingSettings(false));
  }, []);

  async function save() {
    const kg = parseFloat(weightInput.replace(',', '.'));
    if (weightInput && (isNaN(kg) || kg < 30 || kg > 200)) {
      setSaveError(ts('personalData.errors.weightRange'));
      return;
    }
    const year = birthYearInput ? parseInt(birthYearInput) : null;
    if (year !== null && (year < 1920 || year > 2010)) {
      setSaveError(ts('personalData.errors.birthYearRange'));
      return;
    }
    const hrMax = parseInt(hrMaxInput);
    if (isNaN(hrMax) || hrMax < 100 || hrMax > 240) {
      setSaveError(ts('personalData.errors.hrMaxRange'));
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const tz = tzInput === 'auto' ? null : parseInt(tzInput);
      const res = await api.saveSettings({
        weight_kg:  weightInput ? kg : undefined,
        birth_year: year ?? undefined,
        hr_max:     hrMax,
        tz_offset:  tz,
      });
      setSaved(res);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : ts('common.saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader className="border-b border-border pb-3">
        <CardTitle className="text-sm font-semibold">{ts('personalData.title')}</CardTitle>
        <p className="text-xs text-muted-foreground">{ts('personalData.subtitle')}</p>
      </CardHeader>
      <CardContent className="pt-5 space-y-5">
        {loadingSettings ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {/* Gewicht */}
              <div>
                <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-2">
                  {ts('personalData.weightLabel')}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.1"
                    min="30"
                    max="200"
                    value={weightInput}
                    onChange={(e) => setWeightInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && save()}
                    placeholder="75.5"
                    className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-colors"
                  />
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{ts('units.kg')}</span>
                </div>
                {saved?.weight_kg != null && (
                  <p className="text-xs text-muted-foreground/60 mt-1.5">{ts('personalData.weightSaved', { value: saved.weight_kg })}</p>
                )}
              </div>

              {/* Geburtsjahr */}
              <div>
                <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-2">
                  {ts('personalData.birthYearLabel')}
                </label>
                <input
                  type="number"
                  step="1"
                  min="1920"
                  max="2010"
                  value={birthYearInput}
                  onChange={(e) => setBirthYearInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && save()}
                  placeholder="1985"
                  className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-colors"
                />
                {saved?.birth_year != null && (
                  <p className="text-xs text-muted-foreground/60 mt-1.5">
                    {ts('personalData.birthYearInfo', { year: saved.birth_year, age: new Date().getFullYear() - saved.birth_year })}
                  </p>
                )}
              </div>

              {/* HRmax */}
              <div>
                <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-2">
                  {ts('personalData.hrMaxLabel')}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="1"
                    min="100"
                    max="240"
                    value={hrMaxInput}
                    onChange={(e) => setHrMaxInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && save()}
                    placeholder="185"
                    className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-colors"
                  />
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{ts('units.bpm')}</span>
                </div>
                <p className="text-xs text-muted-foreground/50 mt-1.5">{ts('personalData.hrMaxHint')}</p>
              </div>

              {/* Zeitzone */}
              <div>
                <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-2">
                  {ts('personalData.timezoneLabel')}
                </label>
                <select
                  value={tzInput}
                  onChange={(e) => setTzInput(e.target.value)}
                  className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-colors"
                >
                  <option value="auto">{ts('personalData.timezoneAuto')}</option>
                  <option value="1">{ts('personalData.timezoneCet')}</option>
                  <option value="2">{ts('personalData.timezoneCest')}</option>
                </select>
                <p className="text-xs text-muted-foreground/50 mt-1.5">
                  {ts('personalData.timezoneHint')}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4 pt-1">
              <button
                onClick={save}
                disabled={saving}
                className="rounded-md px-5 py-2 text-sm font-medium bg-orange-500 hover:bg-orange-600 disabled:opacity-50 transition-colors text-white cursor-pointer"
              >
                {saving ? ts('common.saving') : t('actions.save')}
              </button>
              {saveSuccess && <span className="text-sm text-green-600">{ts('common.saved')}</span>}
              {saveError && <span className="text-sm text-red-500">{saveError}</span>}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
