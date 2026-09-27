import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/ui/page-header';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { OverviewTab } from './bikes/OverviewTab';
import { AddBikeForm } from './bikes/AddBikeForm';
import { DeletedTab } from './bikes/DeletedTab';
import { PurchasesTab } from './bikes/PurchasesTab';

export default function BikesPage() {
  const { t } = useTranslation('bikes');
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') ?? 'übersicht';
  const [overviewKey, setOverviewKey] = useState(0);

  function handleTabChange(value: string) {
    setSearchParams({ tab: value }, { replace: true });
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} />

      <Tabs value={tab} onValueChange={handleTabChange}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <TabsList>
            <TabsTrigger value="übersicht">{t('tabs.overview')}</TabsTrigger>
            <TabsTrigger value="lager">{t('tabs.stock')}</TabsTrigger>
            <TabsTrigger value="gelöscht">{t('tabs.deleted')}</TabsTrigger>
          </TabsList>
          {tab === 'übersicht' && (
            <AddBikeForm onAdded={() => setOverviewKey(k => k + 1)} />
          )}
        </div>

        <TabsContent value="übersicht" className="mt-6">
          <OverviewTab key={overviewKey} />
        </TabsContent>

        <TabsContent value="lager" className="mt-6">
          <PurchasesTab externalKey={0} onChanged={() => {}} />
        </TabsContent>

        <TabsContent value="gelöscht" className="mt-6">
          <DeletedTab />
        </TabsContent>

      </Tabs>
    </div>
  );
}
