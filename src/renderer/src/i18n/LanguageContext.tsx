import React, { createContext, useContext, useState, useEffect } from 'react';
import { Lang, t, TranslationKey } from './translations';
import { apiGet, apiPost } from '../hooks/useApi';

interface LanguageContextType {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: TranslationKey) => string;
}

const LanguageContext = createContext<LanguageContextType>({
  lang: 'de',
  setLang: () => {},
  t: (key) => key,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>('de');

  useEffect(() => {
    apiGet<{ value: string | null }>('/settings/get/ui.language').then((res) => {
      if (res?.value) {
        setLangState(res.value === 'en' ? 'en' : 'de');
      } else {
        const saved = localStorage.getItem('app-language');
        if (saved) {
          const migrated = saved === 'en' ? 'en' : 'de';
          setLangState(migrated as Lang);
          apiPost('/settings/set', { key: 'ui.language', value: migrated });
          localStorage.removeItem('app-language');
        }
      }
    });
  }, []);

  const setLang = (newLang: Lang) => {
    setLangState(newLang);
    apiPost('/settings/set', { key: 'ui.language', value: newLang });
  };

  const translate = (key: TranslationKey) => t(key, lang);

  return (
    <LanguageContext.Provider value={{ lang, setLang, t: translate }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useTranslation() { return useContext(LanguageContext); }
