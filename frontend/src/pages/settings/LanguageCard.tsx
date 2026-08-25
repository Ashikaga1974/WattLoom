import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type Language } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CONFIG_DEFAULTS, useConfigReload } from '@/lib/config-context';

export function LanguageCard() {
  const { t: ts } = useTranslation('settings');
  const reloadConfig = useConfigReload();
  const [languageInput, setLanguageInput] = useState<string>(CONFIG_DEFAULTS.language);
  const [languages, setLanguages] = useState<Language[]>([]);
  const [importLangInput, setImportLangInput] = useState('');
  const [translationImportBusy, setTranslationImportBusy] = useState(false);
  const [translationImportError, setTranslationImportError] = useState<string | null>(null);
  const [translationImportSuccess, setTranslationImportSuccess] = useState(false);
  const translationFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.getSettings().then(res => setLanguageInput(res.language ?? CONFIG_DEFAULTS.language)).catch(() => {});
    api.getLanguages().then(setLanguages).catch(() => {});
  }, []);

  async function changeLanguage(lang: string) {
    setLanguageInput(lang);
    try {
      await api.saveSettings({ language: lang });
      await reloadConfig();
    } catch { /* Sprache bleibt lokal gesetzt, nächster Reload versucht es erneut */ }
  }

  function exportTranslations(lang: string) {
    api.exportTranslations(lang).then(data => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `wattloom-translations-${lang}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }).catch(() => { /* ignorieren */ });
  }

  async function importTranslations(file: File) {
    if (!importLangInput) return;
    setTranslationImportBusy(true);
    setTranslationImportError(null);
    setTranslationImportSuccess(false);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      await api.importTranslations(importLangInput, parsed);
      setLanguages(await api.getLanguages());
      setTranslationImportSuccess(true);
    } catch (e) {
      setTranslationImportError(e instanceof Error ? e.message : 'Import fehlgeschlagen');
    } finally {
      setTranslationImportBusy(false);
      if (translationFileRef.current) translationFileRef.current.value = '';
    }
  }

  return (
    <Card>
      <CardHeader className="border-b border-border pb-3">
        <CardTitle className="text-sm font-semibold">{ts('language.title')}</CardTitle>
      </CardHeader>
      <CardContent className="pt-5 space-y-5">
        <div className="inline-flex rounded-md border border-input overflow-hidden flex-wrap">
          {languages.filter(l => l.available).map((lang) => (
            <button
              key={lang.code}
              type="button"
              onClick={() => changeLanguage(lang.code)}
              className={`px-4 py-2 text-sm transition-colors ${
                languageInput === lang.code
                  ? 'bg-orange-500 text-white'
                  : 'bg-background hover:bg-muted text-foreground'
              }`}
            >
              {lang.name}
            </button>
          ))}
        </div>

        <div className="border-t border-border pt-4 space-y-3">
          <p className="text-xs text-muted-foreground">{ts('language.translateHint')}</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => exportTranslations(languageInput)}
              className="px-3 py-1.5 text-sm rounded-md border border-input bg-background hover:bg-muted"
            >
              {ts('language.exportButton')}
            </button>
            <span className="text-xs text-muted-foreground">{ts('language.exportHint')}</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={importLangInput}
              onChange={e => setImportLangInput(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">{ts('language.importLangPlaceholder')}</option>
              {languages.map(l => (
                <option key={l.code} value={l.code}>{l.name}{l.available ? ` (${ts('language.alreadyTranslated')})` : ''}</option>
              ))}
            </select>
            <input
              ref={translationFileRef}
              type="file"
              accept="application/json"
              disabled={!importLangInput || translationImportBusy}
              onChange={e => { const f = e.target.files?.[0]; if (f) importTranslations(f); }}
              className="text-sm"
            />
          </div>
          {translationImportBusy && <p className="text-xs text-muted-foreground">{ts('language.importBusy')}</p>}
          {translationImportSuccess && <p className="text-xs text-green-500">{ts('language.importSuccess')}</p>}
          {translationImportError && <p className="text-xs text-destructive">{translationImportError}</p>}
        </div>
      </CardContent>
    </Card>
  );
}
