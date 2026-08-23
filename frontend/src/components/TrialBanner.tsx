import { useTranslation } from 'react-i18next';
import { useLicenseStatus } from '@/components/LicenseGate';
import { fmtDate } from '@/lib/format';

/**
 * Bewusst innerhalb von SidebarInset gerendert (nicht über der ganzen Seite wie ein
 * erster Anlauf es tat) – ein volle-Breite-Banner über allem hätte die fixed-positionierte
 * Sidebar (Logo/App-Name) überdeckt, siehe sidebar.tsx (`fixed inset-y-0`).
 */
export function TrialBanner() {
  const { t } = useTranslation('common');
  const status = useLicenseStatus();

  if (!status || status.licensed) return null;

  return (
    <div className="sticky top-0 z-20 flex items-center justify-center gap-3 bg-orange-500 text-white text-sm px-4 py-2">
      <span>
        {t('license.trialBanner', {
          days: status.trial_days_left,
          date: status.trial_end_date ? fmtDate(status.trial_end_date) : '',
        })}
      </span>
      <a href="/settings" className="underline font-medium shrink-0">
        {t('license.enterKey')}
      </a>
    </div>
  );
}
