import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// HF-Korrektur (z.B. Betablocker/Bisoprolol) – dämpft die Herzfrequenzantwort unter
// Belastung; rein empirische, vom Nutzer selbst kalibrierte Näherung, kein Medizinwert.
export function HrCorrectionCard() {
  const { t } = useTranslation('common');
  const { t: ts } = useTranslation('settings');
  const [hrCorrectionEnabled, setHrCorrectionEnabled] = useState(false);
  const [hrCorrectionPctInput, setHrCorrectionPctInput] = useState('8');
  const [hrCorrectionSinceInput, setHrCorrectionSinceInput] = useState('');
  const [hrCorrectionSaving, setHrCorrectionSaving] = useState(false);
  const [hrCorrectionSuccess, setHrCorrectionSuccess] = useState(false);
  const [hrCorrectionError, setHrCorrectionError] = useState<string | null>(null);

  useEffect(() => {
    api.getSettings().then(res => {
      setHrCorrectionEnabled(res.hr_correction_enabled === 1);
      setHrCorrectionPctInput(String(res.hr_correction_pct ?? 8));
      setHrCorrectionSinceInput(res.hr_correction_since ?? '');
    }).catch(() => {});
  }, []);

  async function saveHrCorrection() {
    const pct = parseFloat(hrCorrectionPctInput.replace(',', '.'));
    if (isNaN(pct) || pct < 0 || pct > 30) {
      setHrCorrectionError(ts('hrCorrection.errors.pctRange'));
      return;
    }
    setHrCorrectionSaving(true);
    setHrCorrectionError(null);
    try {
      await api.saveSettings({
        hr_correction_enabled: hrCorrectionEnabled ? 1 : 0,
        hr_correction_pct:     pct,
        hr_correction_since:   hrCorrectionSinceInput || null,
      });
      setHrCorrectionSuccess(true);
      setTimeout(() => setHrCorrectionSuccess(false), 2500);
    } catch (e) {
      setHrCorrectionError(e instanceof Error ? e.message : ts('common.saveFailed'));
    } finally {
      setHrCorrectionSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader className="border-b border-border pb-3">
        <CardTitle className="text-sm font-semibold">{ts('hrCorrection.title')}</CardTitle>
        <p className="text-xs text-muted-foreground">{ts('hrCorrection.subtitle')}</p>
      </CardHeader>
      <CardContent className="pt-5 space-y-5">
        <label className="flex items-center gap-2.5 text-sm cursor-pointer select-none">
          <input
            type="checkbox"
            checked={hrCorrectionEnabled}
            onChange={e => setHrCorrectionEnabled(e.target.checked)}
            className="accent-primary h-4 w-4"
          />
          <span className="font-medium">{ts('hrCorrection.enableLabel')}</span>
        </label>

        <p className="text-xs text-muted-foreground leading-relaxed bg-muted/40 rounded-md p-3">
          {ts('hrCorrection.disclaimer')}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-2">
              {ts('hrCorrection.pctLabel')}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="1"
                min="0"
                max="30"
                value={hrCorrectionPctInput}
                onChange={e => setHrCorrectionPctInput(e.target.value)}
                className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-colors"
              />
              <span className="text-xs text-muted-foreground whitespace-nowrap">{ts('units.percentHrMax')}</span>
            </div>
            <p className="text-xs text-muted-foreground/50 mt-1.5">{ts('hrCorrection.pctHint')}</p>
          </div>

          <div>
            <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-2">
              {ts('hrCorrection.sinceLabel')}
            </label>
            <input
              type="date"
              value={hrCorrectionSinceInput}
              onChange={e => setHrCorrectionSinceInput(e.target.value)}
              className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-colors"
            />
            <p className="text-xs text-muted-foreground/50 mt-1.5">{ts('hrCorrection.sinceHint')}</p>
          </div>
        </div>

        <div className="flex items-center gap-4 pt-1">
          <button
            onClick={saveHrCorrection}
            disabled={hrCorrectionSaving}
            className="rounded-md px-5 py-2 text-sm font-medium bg-orange-500 hover:bg-orange-600 disabled:opacity-50 transition-colors text-white cursor-pointer"
          >
            {hrCorrectionSaving ? ts('common.saving') : t('actions.save')}
          </button>
          {hrCorrectionSuccess && <span className="text-sm text-green-600">{ts('common.saved')}</span>}
          {hrCorrectionError && <span className="text-sm text-red-500">{hrCorrectionError}</span>}
        </div>
      </CardContent>
    </Card>
  );
}
