import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useDemoMode } from '@/hooks/use-demo-mode';

// Dauerhaft sichtbar, damit Beispieldaten nie mit den eigenen verwechselt werden
export function DemoModeBanner() {
  const { t } = useTranslation('common');
  const isActive = useDemoMode();
  if (!isActive) return null;
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-primary/30 bg-primary/10 px-4 py-2 text-sm">
      <span>{t('demoBanner.text')}</span>
      <Link to="/settings" className="font-medium text-primary-strong underline-offset-4 hover:underline">
        {t('demoBanner.disable')}
      </Link>
    </div>
  );
}
