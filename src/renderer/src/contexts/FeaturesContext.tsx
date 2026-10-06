import React, { createContext, useContext, useMemo, useState } from 'react';
import { useApi, apiFetch, apiPost } from '../hooks/useApi';
import { useWebSocket } from '../hooks/useWebSocket';
import { FEATURE_KEYS, DEFAULT_FEATURES, panelVisible as panelVisibleFor, type FeatureKey } from '../../../shared/features';

// "Was dein Stream kann": the chosen features, read once from the server and
// kept current over the socket. Panels, cards, overlays and hotkeys ask here
// whether they are wanted. Until the answer arrives everything counts as on
// and the setup as done, so nothing flickers away on start.

interface SetupInfo { done: boolean; features: FeatureKey[]; worldbuilder: boolean; defaults: FeatureKey[] }

interface FeaturesValue {
  loaded: boolean;
  /** The setup was walked through or skipped. */
  done: boolean;
  /** The Worldbuilder is set up on this machine — Nils's own features exist. */
  worldbuilder: boolean;
  defaults: readonly FeatureKey[];
  features: ReadonlySet<string>;
  isOn(key: FeatureKey): boolean;
  panelVisible(panel: string): boolean;
  save(features: FeatureKey[]): Promise<boolean>;
  /** Close the setup for good: it was walked through or skipped. */
  finish(): Promise<void>;
  setupOpen: boolean;
  openSetup(): void;
  closeSetup(): void;
}

const FeaturesContext = createContext<FeaturesValue | null>(null);

export function FeaturesProvider({ children }: { children: React.ReactNode }) {
  const { data, refetch } = useApi<SetupInfo>('/setup');
  const [setupOpen, setSetupOpen] = useState(false);
  useWebSocket((event) => { if (event === 'features-changed') refetch(); });

  const value = useMemo<FeaturesValue>(() => {
    const features = new Set<string>(data ? data.features : FEATURE_KEYS);
    return {
      loaded: data !== null,
      done: data ? data.done : true,
      worldbuilder: data?.worldbuilder ?? false,
      defaults: data?.defaults ?? DEFAULT_FEATURES,
      features,
      isOn: (key) => features.has(key),
      panelVisible: (panel) => panelVisibleFor(features, panel),
      save: async (list) => {
        const res = await apiFetch('/setup/features', { method: 'POST', body: JSON.stringify({ features: list }) });
        if (res.ok) await refetch();
        return res.ok;
      },
      finish: async () => {
        await apiPost('/setup/done', {});
        setSetupOpen(false);
        await refetch();
      },
      setupOpen,
      openSetup: () => setSetupOpen(true),
      closeSetup: () => setSetupOpen(false),
    };
  }, [data, refetch, setupOpen]);

  return <FeaturesContext.Provider value={value}>{children}</FeaturesContext.Provider>;
}

export function useFeatures(): FeaturesValue {
  const value = useContext(FeaturesContext);
  if (!value) throw new Error('useFeatures needs a FeaturesProvider');
  return value;
}

/** For the few places that may render outside the provider (none today) — everything on. */
export const useFeaturesOptional = (): FeaturesValue | null => useContext(FeaturesContext);
