import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/ui/page-header';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

import { ProgressTab } from './progress/ProgressTab';
import { YearComparisonTab } from './progress/YearComparisonTab';
import { VolumeTab } from './progress/VolumeTab';
import { TimeOfDayTab } from './progress/TimeOfDayTab';

export default function ProgressPage() {
  const { t } = useTranslation('progress');
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') ?? 'fortschritt';

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('header.title')}
        subtitle={t('header.subtitle')}
      />

      <Tabs value={tab} onValueChange={newTab => setSearchParams({ tab: newTab }, { replace: true })}>
        <TabsList>
          <TabsTrigger value="fortschritt">{t('tabs.progress')}</TabsTrigger>
          <TabsTrigger value="vergleich">{t('tabs.yearComparison')}</TabsTrigger>
          <TabsTrigger value="volumen">{t('tabs.volume')}</TabsTrigger>
          <TabsTrigger value="tageszeit">{t('tabs.timeOfDay')}</TabsTrigger>
        </TabsList>
        <TabsContent value="fortschritt" className="mt-6">
          <ProgressTab />
        </TabsContent>
        <TabsContent value="vergleich" className="mt-6">
          <YearComparisonTab />
        </TabsContent>
        <TabsContent value="volumen" className="mt-6">
          <VolumeTab />
        </TabsContent>
        <TabsContent value="tageszeit" className="mt-6">
          <TimeOfDayTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
