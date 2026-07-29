import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import lt from './locales/lt.json';
import pl from './locales/pl.json';

// Mirrors frontend/src/i18n/index.ts — same 3 languages, same default/
// fallback. Starts at 'en' like web does; actual language then comes from
// the signed-in user's stored preference (see AuthContext's applyUser,
// same pattern as web) once /auth/me resolves.
export const SUPPORTED_LANGUAGES = ['en', 'lt', 'pl'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

i18next.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    lt: { translation: lt },
    pl: { translation: pl },
  },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18next;
