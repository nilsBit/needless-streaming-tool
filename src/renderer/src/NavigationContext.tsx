import { createContext, useContext } from 'react';
import type { AreaKey } from './navigation';

export interface NavTarget {
  area: AreaKey;
  subTab?: string | null;
}

// Lets a panel send the user somewhere ("Dorthin" in the readiness banner,
// a connection mark in the sidebar) without knowing the shell.
const NavigationContext = createContext<(target: NavTarget) => void>(() => {});

export const NavigationProvider = NavigationContext.Provider;

export function useNavigate(): (target: NavTarget) => void {
  return useContext(NavigationContext);
}
