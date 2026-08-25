import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function PowerEstimationCard() {
  const { t: ts } = useTranslation('settings');
  const [powerBusy, setPowerBusy] = useState(false);
  const [powerMsg, setPowerMsg] = useState<string | null>(null);
  const [powerError, setPowerError] = useState<string | null>(null);

  async function startPowerRecalc() {
    setPowerBusy(true);
    setPowerMsg(null);
    setPowerError(null);
    try {
      const res = await api.recalculatePower();
      if (res.ok) {
        setPowerMsg(res.message);
      } else {
        setPowerError(res.message);
      }
    } catch (e: unknown) {
      setPowerError(e instanceof Error ? e.message : ts('common.unknownError'));
    } finally {
      setPowerBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader className="border-b border-border pb-3">
        <CardTitle className="text-sm font-semibold">{ts('power.title')}</CardTitle>
        <p className="text-xs text-muted-foreground">
          {ts('power.subtitle')}
        </p>
      </CardHeader>
      <CardContent className="pt-5 space-y-4">
        {powerMsg && <p className="text-sm text-green-600">{powerMsg} {ts('power.backgroundSuffix')}</p>}
        {powerError && <p className="text-sm text-red-500">{powerError}</p>}
        <button
          onClick={startPowerRecalc}
          disabled={powerBusy}
          className="rounded-md px-5 py-2 text-sm font-medium bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-white cursor-pointer"
        >
          {powerBusy ? ts('power.starting') : ts('power.estimateButton')}
        </button>
      </CardContent>
    </Card>
  );
}
