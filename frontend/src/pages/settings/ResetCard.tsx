import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function ResetCard({ importRunning, onResetSuccess }: { importRunning: boolean; onResetSuccess: () => void }) {
  const { t } = useTranslation('common');
  const { t: ts } = useTranslation('settings');
  const [resetConfirm, setResetConfirm] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetDone, setResetDone] = useState(false);
  const [resetBackupName, setResetBackupName] = useState<string | null>(null);

  async function confirmReset() {
    setResetBusy(true);
    setResetError(null);
    setResetDone(false);
    try {
      const res = await api.resetDb();
      if (!res.ok) throw new Error(res.message ?? ts('reset.genericFailure'));
      setResetDone(true);
      setResetBackupName(res.backup ?? null);
      setResetConfirm(false);
      onResetSuccess();
    } catch (e) {
      setResetError(e instanceof Error ? e.message : ts('reset.genericError'));
    } finally {
      setResetBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader className="border-b border-border pb-3">
        <CardTitle className="text-sm font-semibold">{ts('reset.title')}</CardTitle>
        <p className="text-xs text-muted-foreground">
          {ts('reset.subtitle')}
        </p>
      </CardHeader>
      <CardContent className="pt-5">
        {resetDone && (
          <p className="text-sm text-green-600 mb-3">
            {ts('reset.done')}
            {resetBackupName && <> {ts('reset.backupSavedPrefix')} <code className="text-xs">{resetBackupName}</code></>}
          </p>
        )}
        {resetError && <p className="text-sm text-red-500 mb-3">{resetError}</p>}

        {!resetConfirm ? (
          <button
            onClick={() => { setResetConfirm(true); setResetDone(false); setResetError(null); }}
            disabled={importRunning}
            className="rounded-md px-5 py-2 text-sm font-medium border border-destructive/40 text-destructive hover:bg-destructive/10 hover:border-destructive/70 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            {ts('reset.clearButton')}
          </button>
        ) : (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 space-y-3">
            <p className="text-sm text-destructive">
              {ts('reset.confirmText')}
            </p>
            <div className="flex gap-3">
              <button
                onClick={confirmReset}
                disabled={resetBusy}
                className="rounded-md px-4 py-2 text-sm font-medium bg-red-600 hover:bg-red-700 disabled:opacity-50 transition-colors text-white cursor-pointer"
              >
                {resetBusy ? ts('reset.deleting') : ts('reset.confirmYes')}
              </button>
              <button
                onClick={() => setResetConfirm(false)}
                disabled={resetBusy}
                className="rounded-md px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                {t('actions.cancel')}
              </button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
