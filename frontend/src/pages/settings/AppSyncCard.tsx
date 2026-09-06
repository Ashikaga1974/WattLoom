import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { fmtClock, fmtDate } from '@/lib/format';

export function AppSyncCard() {
  const { t: ts } = useTranslation('settings');
  const [appSyncStatus, setAppSyncStatus] = useState<{ last_synced_at: string | null; last_status: string | null; last_message: string | null } | null>(null);
  const [appSyncBusy, setAppSyncBusy] = useState(false);
  const [appSyncError, setAppSyncError] = useState<string | null>(null);
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(true);
  const [autoSyncSaving, setAutoSyncSaving] = useState(false);

  async function loadAppSyncStatus() {
    try {
      setAppSyncStatus(await api.appSyncStatus());
    } catch { /* ignorieren */ }
  }

  useEffect(() => {
    loadAppSyncStatus();
    api.getSettings().then(res => setAutoSyncEnabled(res.app_sync_enabled !== 0)).catch(() => {});
  }, []);

  async function toggleAutoSync(checked: boolean) {
    setAutoSyncEnabled(checked);
    setAutoSyncSaving(true);
    try {
      await api.saveSettings({ app_sync_enabled: checked ? 1 : 0 });
    } catch {
      setAutoSyncEnabled(!checked);
    } finally {
      setAutoSyncSaving(false);
    }
  }

  async function startAppSync() {
    setAppSyncBusy(true);
    setAppSyncError(null);
    try {
      const res = await api.appSyncRun();
      if (!res.ok) setAppSyncError(res.message);
      await loadAppSyncStatus();
    } catch (e: unknown) {
      setAppSyncError(e instanceof Error ? e.message : ts('common.unknownError'));
    } finally {
      setAppSyncBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader className="border-b border-border pb-3">
        <CardTitle className="text-sm font-semibold">{ts('appSync.title')}</CardTitle>
        <p className="text-xs text-muted-foreground">
          {ts('appSync.subtitle')}
        </p>
      </CardHeader>
      <CardContent className="pt-5 space-y-4">
        <label className="flex items-center gap-2.5 text-sm cursor-pointer select-none">
          <input
            type="checkbox"
            checked={autoSyncEnabled}
            disabled={autoSyncSaving}
            onChange={e => toggleAutoSync(e.target.checked)}
            className="accent-primary h-4 w-4"
          />
          <span className="font-medium">{ts('appSync.autoSyncLabel')}</span>
        </label>
        {appSyncStatus?.last_synced_at && (
          <p className="text-sm text-muted-foreground">
            {ts('appSync.lastSync', { date: fmtDate(appSyncStatus.last_synced_at), time: fmtClock(appSyncStatus.last_synced_at) })}
            {appSyncStatus.last_status === 'error' && (
              <span className="text-red-500"> {ts('appSync.failedPrefix')} {appSyncStatus.last_message}</span>
            )}
            {appSyncStatus.last_status === 'ok' && (
              <span className="text-green-600"> – {appSyncStatus.last_message}</span>
            )}
          </p>
        )}
        {!appSyncStatus?.last_synced_at && (
          <p className="text-sm text-muted-foreground">{ts('appSync.notSyncedYet')}</p>
        )}
        {appSyncError && <p className="text-sm text-red-500">{appSyncError}</p>}
        <button
          onClick={startAppSync}
          disabled={appSyncBusy}
          className="rounded-md px-5 py-2 text-sm font-medium bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-white cursor-pointer"
        >
          {appSyncBusy ? ts('appSync.syncing') : ts('appSync.syncNow')}
        </button>
      </CardContent>
    </Card>
  );
}
