import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '../locales/en.json';

/**
 * To add a language: copy src/locales/en.json to <lang>.json, translate it, register it below.
 */
export function setupI18n(extra: Record<string, unknown> = {}): typeof i18n {
  if (!i18n.isInitialized) {
    void i18n.use(initReactI18next).init({
      lng: 'en',
      fallbackLng: 'en',
      resources: { en: { translation: { ...en, ...extra } } },
      interpolation: { escapeValue: false },
      returnNull: false,
    });
  }
  return i18n;
}

export default i18n;
