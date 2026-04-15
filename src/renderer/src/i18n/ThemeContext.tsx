import React, { createContext, useContext, useState } from 'react';

type Theme = 'dark' | 'light';

interface ThemeContextType {
  theme: Theme;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType>({ theme: 'dark', setTheme: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    return (localStorage.getItem('app-theme') as Theme) || 'dark';
  });

  const setTheme = (t: Theme) => {
    setThemeState(t);
    localStorage.setItem('app-theme', t);
    document.documentElement.setAttribute('data-theme', t);
  };

  // Set initial theme on mount
  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, []);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() { return useContext(ThemeContext); }
