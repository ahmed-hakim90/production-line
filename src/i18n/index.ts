import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import commonAr from './locales/ar/common.json';
import commonEn from './locales/en/common.json';

export const SUPPORTED_LANGUAGES = ['ar', 'en'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

const resources = {
  ar: { common: commonAr },
  en: { common: commonEn },
} as const;

if (!i18n.isInitialized) {
  void i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources: resources as any,
      fallbackLng: 'ar',
      supportedLngs: [...SUPPORTED_LANGUAGES],
      defaultNS: 'common',
      ns: ['common'],
      detection: {
        // We'll override language from Firestore later (per-user).
        order: ['localStorage', 'navigator'],
        caches: ['localStorage'],
        lookupLocalStorage: 'erp_language',
      },
      interpolation: { escapeValue: false },
      react: { useSuspense: false },
    });
}

export function getLanguageDir(lang: SupportedLanguage): 'rtl' | 'ltr' {
  return lang === 'ar' ? 'rtl' : 'ltr';
}

export async function setAppLanguage(lang: SupportedLanguage): Promise<void> {
  const safe = (SUPPORTED_LANGUAGES as readonly string[]).includes(lang) ? lang : 'ar';

  try {
    localStorage.setItem('erp_language', safe);
  } catch {
    /* ignore */
  }

  if (typeof document !== 'undefined') {
    document.documentElement.lang = safe;
    document.documentElement.dir = getLanguageDir(safe);
  }

  await i18n.changeLanguage(safe);
}

export default i18n;

