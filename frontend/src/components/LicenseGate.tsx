import { createContext, useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type LicenseStatus } from '@/lib/api';

const LicenseStatusContext = createContext<LicenseStatus | null>(null);

/** Liefert den zuletzt geladenen Lizenzstatus, z.B. für TrialBanner – kein eigener API-Call,
 * nutzt den einen Fetch aus LicenseGate weiter. null solange noch nicht geladen. */
export function useLicenseStatus(): LicenseStatus | null {
  return useContext(LicenseStatusContext);
}

/**
 * Blockiert die App komplett, wenn Trial abgelaufen und keine gültige Lizenz aktiviert ist.
 * Das Backend gated ohnehin serverseitig (license_gate-Middleware in main.py) – dieser
 * Screen ist nur die UI-Entsprechung, damit man statt lauter 402-Fehlern einen klaren
 * Aktivierungs-Bildschirm sieht. Läuft der Trial noch, wird der Status per Context an
 * TrialBanner durchgereicht (siehe components/TrialBanner.tsx) – dort, nicht hier, weil
 * ein Banner über der kompletten Seite die fixed-positionierte Sidebar überdecken würde.
 */
export function LicenseGate({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation('common');
  const [status, setStatus] = useState<LicenseStatus | null>(null);
  // Getrennt von `status === null`, damit ein fehlgeschlagener Fetch (Backend noch nicht
  // erreichbar, Netzwerkfehler) nicht wie "lädt noch" aussieht und die App dauerhaft weiß bleibt.
  const [loading, setLoading] = useState(true);
  const [fetchFailed, setFetchFailed] = useState(false);
  const [key, setKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [activating, setActivating] = useState(false);

  function loadStatus() {
    setLoading(true);
    setFetchFailed(false);
    api.licenseStatus()
      .then(res => { setStatus(res); setLoading(false); })
      .catch(() => { setFetchFailed(true); setLoading(false); });
  }

  useEffect(loadStatus, []);

  async function activate() {
    setActivating(true);
    setError(null);
    try {
      await api.activateLicense(key.trim());
      setStatus(await api.licenseStatus());
    } catch (e) {
      setError(e instanceof Error ? e.message : t('license.activationFailed'));
    } finally {
      setActivating(false);
    }
  }

  if (loading) return null;

  if (fetchFailed || status === null) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="w-full max-w-sm rounded-2xl border p-6 space-y-4 text-center">
          <div>
            <h1 className="text-lg font-semibold">{t('license.connectionFailed.title')}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {t('license.connectionFailed.body')}
            </p>
          </div>
          <button
            onClick={loadStatus}
            className="w-full rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium"
          >
            {t('license.retry')}
          </button>
        </div>
      </div>
    );
  }

  if (status.access) {
    return <LicenseStatusContext.Provider value={status}>{children}</LicenseStatusContext.Provider>;
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl border p-6 space-y-4">
        <div>
          <h1 className="text-lg font-semibold">{t('license.trialExpired.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t('license.trialExpired.body')}
          </p>
        </div>
        <input
          type="text"
          value={key}
          onChange={e => setKey(e.target.value)}
          placeholder="WLM1...."
          className="w-full rounded-md border px-3 py-2 text-sm font-mono"
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
        <button
          onClick={activate}
          disabled={activating || !key.trim()}
          className="w-full rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {activating ? t('license.activating') : t('license.activate')}
        </button>
      </div>
    </div>
  );
}
