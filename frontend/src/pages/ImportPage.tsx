import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type Bike } from '@/lib/api';
import { useDemoMode } from '@/hooks/use-demo-mode';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { ImportZipCard } from './settings/ImportZipCard';
import { FitImportCard } from './settings/FitImportCard';
import { TcxImportCard } from './settings/TcxImportCard';
import { GpxImportCard } from './settings/GpxImportCard';
import { WeatherCard } from './settings/WeatherCard';
import { PowerEstimationCard } from './settings/PowerEstimationCard';

type ImportStatus = 'idle' | 'running' | 'done' | 'error';

export default function ImportPage() {
  const { t: ts } = useTranslation('settings');
  const [bikes, setBikes] = useState<Bike[]>([]);
  const [importStatus, setImportStatus] = useState<ImportStatus>('idle');
  const [importLog, setImportLog] = useState<string[]>([]);
  const [importZip, setImportZip] = useState<string | null>(null);
  const [importConfirm, setImportConfirm] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isDemoMode = useDemoMode();

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }

  async function refreshStatus() {
    try {
      const s = await api.importStatus();
      setImportStatus(s.status as ImportStatus);
      setImportLog(s.log);
      setImportZip(s.zip_name);
      if (s.status !== 'running') stopPolling();
    } catch { /* Backend nicht erreichbar */ }
  }

  function startPolling() {
    if (pollRef.current) return;
    pollRef.current = setInterval(refreshStatus, 2000);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Fehlalarm: setzt State erst nach await
    refreshStatus();
    api.bikes().then(setBikes).catch(() => {});
    return () => stopPolling();
  }, []);

  useEffect(() => {
    if (importStatus === 'running') startPolling();
    else stopPolling();
  }, [importStatus]);

  async function handleImportClick() {
    const stats = await api.activityStats();
    if (stats.total_rides > 0) {
      setImportConfirm(true);
    } else {
      await doStartImport();
    }
  }

  async function doStartImport() {
    setImportConfirm(false);
    setImportLog([]);
    setImportZip(null);
    setImportStatus('running');
    try {
      await api.startImport();
      startPolling();
    } catch (e) {
      setImportStatus('error');
      setImportLog([e instanceof Error ? e.message : ts('import.startError')]);
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader title={ts('tabs.imports')} />

      {isDemoMode ? (
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm">{ts('demoMode.importBlocked')}</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <ImportZipCard
            importStatus={importStatus}
            importLog={importLog}
            importZip={importZip}
            importConfirm={importConfirm}
            onImportClick={handleImportClick}
            onStartImport={doStartImport}
            onCancelConfirm={() => setImportConfirm(false)}
          />
          <FitImportCard bikes={bikes} />
          <TcxImportCard bikes={bikes} />
          <GpxImportCard bikes={bikes} />
        </>
      )}
      <WeatherCard />
      <PowerEstimationCard />
    </div>
  );
}
