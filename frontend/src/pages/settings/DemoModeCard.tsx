import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';
import { useDemoMode } from '@/hooks/use-demo-mode';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function DemoModeCard() {
  const { t: ts } = useTranslation('settings');
  const isActive = useDemoMode();
  const [isSwitching, setIsSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setIsSwitching(true);
    setError(null);
    try {
      await api.setDemoMode(!isActive);
      // Kompletter Reload statt State-Update: Einstellungen, Sprache, Übersetzungen und alle
      // geladenen Seitendaten stammen aus der jeweils aktiven DB
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : ts('demoMode.genericError'));
      setIsSwitching(false);
    }
  }

  return (
    <Card>
      <CardHeader className="border-b border-border pb-3">
        <CardTitle className="text-sm font-semibold">{ts('demoMode.title')}</CardTitle>
        <p className="text-xs text-muted-foreground">{ts('demoMode.subtitle')}</p>
      </CardHeader>
      <CardContent className="pt-5 space-y-3">
        {isActive && <p className="text-sm text-primary">{ts('demoMode.activeHint')}</p>}
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button
          onClick={toggle}
          disabled={isActive === null || isSwitching}
          className="rounded-md px-5 py-2 text-sm font-medium border border-border hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
        >
          {isSwitching ? ts('demoMode.switching') : isActive ? ts('demoMode.disable') : ts('demoMode.enable')}
        </button>
      </CardContent>
    </Card>
  );
}
