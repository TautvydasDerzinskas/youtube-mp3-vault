import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import lt from './locales/lt.json';
import pl from './locales/pl.json';

export const SUPPORTED_LANGUAGES = ['en', 'lt', 'pl'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  en: 'English',
  lt: 'Lietuvių',
  pl: 'Polski',
};

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
