import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, type Bike } from '@/lib/api';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { LanguageCard } from './settings/LanguageCard';
import { PersonalDataCard } from './settings/PersonalDataCard';
import { GoalsCard } from './settings/GoalsCard';
import { AppConfigCard } from './settings/AppConfigCard';
import { AdvancedCard } from './settings/AdvancedCard';
import { HrCorrectionCard } from './settings/HrCorrectionCard';
import { DisplayConfigCard } from './settings/DisplayConfigCard';
import { LicenseCard } from './settings/LicenseCard';
import { AppSyncCard } from './settings/AppSyncCard';
import { ResetCard } from './settings/ResetCard';
import { ImportZipCard } from './settings/ImportZipCard';
import { FitImportCard } from './settings/FitImportCard';
import { TcxImportCard } from './settings/TcxImportCard';
import { GpxImportCard } from './settings/GpxImportCard';
import { WeatherCard } from './settings/WeatherCard';
import { PowerEstimationCard } from './settings/PowerEstimationCard';
import { LogCard } from './settings/LogCard';

type ImportStatus = 'idle' | 'running' | 'done' | 'error';

export default function SettingsPage() {
  const { t: ts } = useTranslation('settings');
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') ?? 'allgemein';
  function handleTabChange(value: string) {
    setSearchParams({ tab: value }, { replace: true });
  }

  // Bikes – zentral geladen, da mehrere Karten (Erweitert, FIT/TCX/GPX-Import) sie brauchen.
  const [bikes, setBikes] = useState<Bike[]>([]);

  // Import (ZIP) – lebt hier, weil "Datenbank zurücksetzen" (anderer Tab) den Anzeigestatus
  // nach einem erfolgreichen Reset zurücksetzen muss.
  const [importStatus, setImportStatus] = useState<ImportStatus>('idle');
  const [importLog, setImportLog] = useState<string[]>([]);
  const [importZip, setImportZip] = useState<string | null>(null);
  const [importConfirm, setImportConfirm] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  function handleResetSuccess() {
    setImportStatus('idle');
    setImportLog([]);
    setImportZip(null);
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{ts('pageTitle')}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{ts('pageSubtitle')}</p>
      </div>

      <Tabs value={tab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="allgemein">{ts('tabs.general')}</TabsTrigger>
          <TabsTrigger value="importe">{ts('tabs.imports')}</TabsTrigger>
          <TabsTrigger value="protokoll">{ts('tabs.log')}</TabsTrigger>
        </TabsList>

        <TabsContent value="allgemein" className="mt-6 space-y-8">
          <LanguageCard />
          <PersonalDataCard />
          <GoalsCard />
          <AppConfigCard />
          <AdvancedCard bikes={bikes} />
          <HrCorrectionCard />
          <DisplayConfigCard />
          <LicenseCard />
          <AppSyncCard />
          <ResetCard importRunning={importStatus === 'running'} onResetSuccess={handleResetSuccess} />
        </TabsContent>

        <TabsContent value="importe" className="mt-6 space-y-8">
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
          <WeatherCard />
          <PowerEstimationCard />
        </TabsContent>

        <TabsContent value="protokoll" className="mt-6 space-y-8">
          <LogCard />
        </TabsContent>
      </Tabs>
    </div>
  );
}
