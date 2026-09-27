import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/ui/page-header';
import { CompareTab } from './bikes/CompareTab';

export default function BikeComparePage() {
  const { t } = useTranslation('bikes');
  return (
    <div className="space-y-6">
      <PageHeader title={t('tabs.compare')} />
      <CompareTab />
    </div>
  );
}
