import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiGet, apiPost } from '../hooks/useApi';

type Theme = 'dark' | 'light';

interface ThemeContextType {
  theme: Theme;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType>({ theme: 'dark', setTheme: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('dark');

  useEffect(() => {
    apiGet<{ value: string | null }>('/settings/get/ui.theme').then((res) => {
      if (res?.value) {
        const t = res.value as Theme;
        setThemeState(t);
        document.documentElement.setAttribute('data-theme', t);
      } else {
        const saved = localStorage.getItem('app-theme') as Theme | null;
        if (saved) {
          setThemeState(saved);
          document.documentElement.setAttribute('data-theme', saved);
          apiPost('/settings/set', { key: 'ui.theme', value: saved });
          localStorage.removeItem('app-theme');
        } else {
          document.documentElement.setAttribute('data-theme', 'dark');
        }
      }
    });
  }, []);

  const setTheme = (t: Theme) => {
    setThemeState(t);
    document.documentElement.setAttribute('data-theme', t);
    apiPost('/settings/set', { key: 'ui.theme', value: t });
  };

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() { return useContext(ThemeContext); }
