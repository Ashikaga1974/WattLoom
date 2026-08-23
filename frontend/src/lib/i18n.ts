import { useEffect } from 'react';
import i18next from 'i18next';
import HttpBackend from 'i18next-http-backend';
import { initReactI18next } from 'react-i18next';
import { setFormatLocale } from './format';
import { CONFIG_DEFAULTS, useConfig } from './config-context';

// Übersetzungen liegen in der DB (translations-Tabelle, siehe backend/api/translations.py)
// statt im Frontend-Bundle – Sascha kann so beliebige weitere Sprachen (aus SUPPORTED_LANGUAGES)
// importieren, ohne den Code anzufassen. i18next-http-backend lädt jeden Namespace einzeln von
// GET /translations/{{lng}}/{{ns}}, im selben verschachtelten JSON-Format wie die vormaligen
// locales/{de,en}/<ns>.json-Dateien – bestehende t()-Aufrufe bleiben unverändert.
// Kein fester `ns`-Array hier: würde bei jedem App-Start + Sprachwechsel alle ~22 Namespaces
// eager laden, egal welche Seite offen ist. useTranslation([ns, 'common']) auf den einzelnen
// Seiten lädt seinen Namespace stattdessen selbst nach, sobald die Seite gemountet wird.

const LOCALE_BY_LANG: Record<string, string> = {
  de: 'de-DE', en: 'en-GB', fr: 'fr-FR', es: 'es-ES', it: 'it-IT',
  nl: 'nl-NL', pl: 'pl-PL', pt: 'pt-PT', tr: 'tr-TR',
};

i18next
  .use(HttpBackend)
  .use(initReactI18next)
  .init({
    lng: CONFIG_DEFAULTS.language,
    fallbackLng: 'de',
    defaultNS: 'common',
    backend: {
      // Siehe Kommentar zu BASE in lib/api.ts – gleicher Grund (Dev: separate Origins,
      // Production: relative URL, damit egal ist, welcher Hostname aufgerufen wurde).
      loadPath: import.meta.env.DEV
        ? 'http://localhost:8000/translations/{{lng}}/{{ns}}'
        : '/translations/{{lng}}/{{ns}}',
    },
    interpolation: { escapeValue: false },
  });

setFormatLocale(LOCALE_BY_LANG[CONFIG_DEFAULTS.language] ?? 'de-DE');

i18next.on('languageChanged', (lng) => {
  setFormatLocale(LOCALE_BY_LANG[lng] ?? 'de-DE');
});

// In App.tsx (innerhalb von ConfigProvider) aufrufen: hält i18next in Sync mit der aus
// /settings geladenen Sprache. Lebt hier statt in config-context.tsx, weil dieses Modul
// bereits config-context importiert (CONFIG_DEFAULTS) – der umgekehrte Import würde einen
// Zirkelbezug erzeugen.
export function useSyncLanguage(): void {
  const config = useConfig();
  useEffect(() => {
    if (i18next.language !== config.language) {
      i18next.changeLanguage(config.language);
    }
  }, [config.language]);
}

export default i18next;
