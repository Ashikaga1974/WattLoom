import { useEffect, useState } from 'react';
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
import { ResetCard } from './settings/ResetCard';
import { LogCard } from './settings/LogCard';

export default function SettingsPage() {
  const { t: ts } = useTranslation('settings');
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') ?? 'allgemein';
  function handleTabChange(value: string) {
    setSearchParams({ tab: value }, { replace: true });
  }

  // Bikes – zentral geladen, da die "Erweitert"-Karte sie braucht.
  const [bikes, setBikes] = useState<Bike[]>([]);

  useEffect(() => {
    api.bikes().then(setBikes).catch(() => {});
  }, []);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{ts('pageTitle')}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{ts('pageSubtitle')}</p>
      </div>

      <Tabs value={tab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="allgemein">{ts('tabs.general')}</TabsTrigger>
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
          <ResetCard />
        </TabsContent>

        <TabsContent value="protokoll" className="mt-6 space-y-8">
          <LogCard />
        </TabsContent>
      </Tabs>
    </div>
  );
}
