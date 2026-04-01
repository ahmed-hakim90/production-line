import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { getLanguageDir } from '@/src/i18n';

type AppDirection = 'rtl' | 'ltr';

function normalizeLanguage(language?: string): 'ar' | 'en' {
  return language?.startsWith('en') ? 'en' : 'ar';
}

export function useAppDirection(): { dir: AppDirection; isRTL: boolean; isLTR: boolean } {
  const { i18n } = useTranslation();

  return useMemo(() => {
    const lang = normalizeLanguage(i18n.language);
    const dir = getLanguageDir(lang);
    return { dir, isRTL: dir === 'rtl', isLTR: dir === 'ltr' };
  }, [i18n.language]);
}

