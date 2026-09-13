import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type Bike, type Language } from '@/lib/api';
import { useConfigReload } from '@/lib/config-context';
import { PersonalDataCard } from '@/pages/settings/PersonalDataCard';
import { FitImportCard } from '@/pages/settings/FitImportCard';
import { TcxImportCard } from '@/pages/settings/TcxImportCard';
import { GpxImportCard } from '@/pages/settings/GpxImportCard';

type WizardStep = 'language' | 'profile' | 'bike' | 'import' | 'done';

// Der Sprach-Schritt selbst ist bewusst NICHT übersetzt (fixes Englisch) – der Nutzer hat zu
// diesem Zeitpunkt noch keine Sprache gewählt, jeder andere Text wäre eine Annahme ins Blaue.
// Alle folgenden Schritte nutzen i18n (Namespace "onboarding") und übernehmen so die getroffene Wahl.
function LanguageStep({ onSelected }: { onSelected: () => void }) {
  const reloadConfig = useConfigReload();
  const [languages, setLanguages] = useState<Language[]>([]);
  const [selecting, setSelecting] = useState<string | null>(null);

  useEffect(() => { api.getLanguages().then(setLanguages).catch(() => {}); }, []);

  async function choose(code: string) {
    setSelecting(code);
    try {
      await api.saveSettings({ language: code });
      await reloadConfig();
      onSelected();
    } finally {
      setSelecting(null);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Welcome to WattLoom</h1>
        <p className="text-sm text-muted-foreground mt-1">Please choose your language to continue.</p>
      </div>
      <div className="rounded-lg border border-border p-5 space-y-3">
        {languages.filter(l => l.available).map(lang => (
          <button
            key={lang.code}
            onClick={() => choose(lang.code)}
            disabled={selecting !== null}
            className="w-full flex items-center justify-between rounded-md border border-input px-4 py-3 text-sm hover:bg-muted disabled:opacity-50 transition-colors cursor-pointer"
          >
            <span>{lang.name}</span>
            {selecting === lang.code && <span className="text-xs text-muted-foreground">…</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function SetupWizard() {
  const { t } = useTranslation('onboarding');
  const [step, setStep] = useState<WizardStep>('language');
  const [bikeName, setBikeName] = useState('');
  const [creatingBike, setCreatingBike] = useState(false);
  const [bikeError, setBikeError] = useState<string | null>(null);
  const [createdBike, setCreatedBike] = useState<Bike | null>(null);
  const [finishing, setFinishing] = useState(false);
  const reloadConfig = useConfigReload();

  const STEPS: { key: WizardStep; label: string }[] = [
    { key: 'language', label: 'Language' },
    { key: 'profile', label: t('steps.profile') },
    { key: 'bike', label: t('steps.bike') },
    { key: 'import', label: t('steps.import') },
    { key: 'done', label: t('steps.done') },
  ];
  const stepIndex = STEPS.findIndex(s => s.key === step);

  async function createFirstBike() {
    if (!bikeName.trim()) return;
    setCreatingBike(true);
    setBikeError(null);
    try {
      const res = await api.createBike(bikeName.trim());
      await api.saveSettings({ default_bike_id: res.id });
      setCreatedBike({ id: res.id, name: res.name } as Bike);
      setStep('import');
    } catch (e) {
      setBikeError(e instanceof Error ? e.message : t('bike.error'));
    } finally {
      setCreatingBike(false);
    }
  }

  async function finishOnboarding() {
    setFinishing(true);
    try {
      await api.saveSettings({ onboarding_completed: 1 });
      await reloadConfig();
    } finally {
      setFinishing(false);
    }
  }

  const wizardBikes: Bike[] = createdBike ? [createdBike] : [];

  return (
    <div className="min-h-screen flex items-start justify-center p-6 bg-background">
      <div className="w-full max-w-2xl space-y-6 pt-10">
        {step === 'language' ? (
          <LanguageStep onSelected={() => setStep('profile')} />
        ) : (
          <>
            <div>
              <h1 className="text-xl font-semibold">{t('welcome.title')}</h1>
              <p className="text-sm text-muted-foreground mt-1">{t('welcome.subtitle')}</p>
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
              {STEPS.map((s, i) => (
                <div key={s.key} className="flex items-center gap-2">
                  <span
                    className={
                      'rounded-full w-5 h-5 flex items-center justify-center border ' +
                      (i <= stepIndex ? 'bg-orange-500 border-orange-500 text-white' : 'border-border')
                    }
                  >
                    {i + 1}
                  </span>
                  <span className={i === stepIndex ? 'font-medium text-foreground' : ''}>{s.label}</span>
                  {i < STEPS.length - 1 && <span className="mx-1 text-border">—</span>}
                </div>
              ))}
            </div>

            {step === 'profile' && (
              <div className="space-y-4">
                <PersonalDataCard />
                <div className="flex justify-end">
                  <button
                    onClick={() => setStep('bike')}
                    className="rounded-md px-5 py-2 text-sm font-medium bg-orange-500 hover:bg-orange-600 text-white transition-colors cursor-pointer"
                  >
                    {t('actions.next')}
                  </button>
                </div>
              </div>
            )}

            {step === 'bike' && (
              <div className="space-y-4">
                <div className="rounded-lg border border-border p-5 space-y-4">
                  <div>
                    <h2 className="text-sm font-semibold">{t('bike.title')}</h2>
                    <p className="text-xs text-muted-foreground mt-1">{t('bike.subtitle')}</p>
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-2">
                      {t('bike.nameLabel')}
                    </label>
                    <input
                      type="text"
                      value={bikeName}
                      onChange={(e) => setBikeName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && createFirstBike()}
                      placeholder={t('bike.namePlaceholder')}
                      className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-colors"
                    />
                  </div>
                  {bikeError && <p className="text-sm text-red-500">{bikeError}</p>}
                  <div className="flex justify-end">
                    <button
                      onClick={createFirstBike}
                      disabled={!bikeName.trim() || creatingBike}
                      className="rounded-md px-5 py-2 text-sm font-medium bg-orange-500 hover:bg-orange-600 disabled:opacity-50 transition-colors text-white cursor-pointer"
                    >
                      {creatingBike ? t('bike.creating') : t('bike.createButton')}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {step === 'import' && (
              <div className="space-y-4">
                <p className="text-xs text-muted-foreground">{t('import.hint')}</p>
                <FitImportCard bikes={wizardBikes} />
                <TcxImportCard bikes={wizardBikes} />
                <GpxImportCard bikes={wizardBikes} />
                <div className="flex justify-end">
                  <button
                    onClick={() => setStep('done')}
                    className="rounded-md px-5 py-2 text-sm font-medium bg-orange-500 hover:bg-orange-600 text-white transition-colors cursor-pointer"
                  >
                    {t('actions.next')}
                  </button>
                </div>
              </div>
            )}

            {step === 'done' && (
              <div className="rounded-lg border border-border p-6 space-y-4 text-center">
                <p className="text-sm">{t('done.text')}</p>
                <button
                  onClick={finishOnboarding}
                  disabled={finishing}
                  className="rounded-md px-6 py-2 text-sm font-medium bg-orange-500 hover:bg-orange-600 disabled:opacity-50 transition-colors text-white cursor-pointer"
                >
                  {finishing ? t('done.finishing') : t('done.button')}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
