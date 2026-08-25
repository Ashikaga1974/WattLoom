import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type LicenseStatus } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function LicenseCard() {
  const { t: ts } = useTranslation('settings');
  const [licenseStatus, setLicenseStatus] = useState<LicenseStatus | null>(null);
  const [licenseKeyInput, setLicenseKeyInput] = useState('');
  const [licenseBusy, setLicenseBusy] = useState(false);
  const [licenseError, setLicenseError] = useState<string | null>(null);
  const [licenseSuccess, setLicenseSuccess] = useState(false);

  async function loadLicenseStatus() {
    try {
      setLicenseStatus(await api.licenseStatus());
    } catch { /* ignorieren */ }
  }

  useEffect(() => { loadLicenseStatus(); }, []);

  async function activateLicense() {
    setLicenseBusy(true);
    setLicenseError(null);
    setLicenseSuccess(false);
    try {
      await api.activateLicense(licenseKeyInput.trim());
      setLicenseSuccess(true);
      setLicenseKeyInput('');
      await loadLicenseStatus();
    } catch (e: unknown) {
      setLicenseError(e instanceof Error ? e.message : ts('common.unknownError'));
    } finally {
      setLicenseBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader className="border-b border-border pb-3">
        <CardTitle className="text-sm font-semibold">{ts('license.title')}</CardTitle>
        <p className="text-xs text-muted-foreground">
          {ts('license.subtitle')}
        </p>
      </CardHeader>
      <CardContent className="pt-5 space-y-4">
        {licenseStatus?.licensed && (
          <p className="text-sm text-green-600">{ts('license.licensedFor', { customer: licenseStatus.customer })}</p>
        )}
        {!licenseStatus?.licensed && licenseStatus && (
          <p className={`text-sm ${licenseStatus.trial_days_left > 0 ? 'text-muted-foreground' : 'text-red-500'}`}>
            {licenseStatus.trial_days_left > 0
              ? ts('license.trialActive', { days: licenseStatus.trial_days_left })
              : ts('license.trialExpired')}
          </p>
        )}
        {!licenseStatus?.licensed && (
          <div className="flex gap-2">
            <input
              type="text"
              value={licenseKeyInput}
              onChange={e => setLicenseKeyInput(e.target.value)}
              placeholder={ts('license.keyPlaceholder')}
              className="flex-1 rounded-md border px-3 py-2 text-sm font-mono"
            />
            <button
              onClick={activateLicense}
              disabled={licenseBusy || !licenseKeyInput.trim()}
              className="rounded-md px-5 py-2 text-sm font-medium bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-white cursor-pointer"
            >
              {licenseBusy ? ts('license.activating') : ts('license.activateButton')}
            </button>
          </div>
        )}
        {licenseError && <p className="text-xs text-red-500">{licenseError}</p>}
        {licenseSuccess && <p className="text-xs text-green-600">{ts('license.activateSuccess')}</p>}
      </CardContent>
    </Card>
  );
}
