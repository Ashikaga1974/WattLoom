import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/ui/page-header';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { OverviewTab } from './bikes/OverviewTab';
import { DeletedTab } from './bikes/DeletedTab';
import { CompareTab } from './bikes/CompareTab';

export default function BikesPage() {
  const { t } = useTranslation('bikes');
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') ?? 'übersicht';

  function handleTabChange(value: string) {
    setSearchParams({ tab: value }, { replace: true });
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Bikes" />

      <Tabs value={tab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="übersicht">{t('tabs.overview')}</TabsTrigger>
          <TabsTrigger value="gelöscht">{t('tabs.deleted')}</TabsTrigger>
          <TabsTrigger value="vergleich">{t('tabs.compare')}</TabsTrigger>
        </TabsList>

        <TabsContent value="übersicht" className="mt-6">
          <OverviewTab />
        </TabsContent>

        <TabsContent value="gelöscht" className="mt-6">
          <DeletedTab />
        </TabsContent>

        <TabsContent value="vergleich" className="mt-6">
          <CompareTab />
        </TabsContent>

      </Tabs>
    </div>
  );
}
