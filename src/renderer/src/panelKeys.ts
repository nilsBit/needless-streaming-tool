// Every panel the app can show, by key. Kept free of React so the navigation
// test can import it under Node. The registry (panelRegistry.tsx) maps each key
// to its component; navigation.ts gives each key exactly one place.
export const PANEL_KEYS = [
  // Im Stream
  'challenge',
  'issues',
  'designs',
  'progress',
  'song',
  'world',
  // Chat & Bot
  'textcommands',
  'chatbot',
  // Overlays & Alerts
  'overlays',
  'alerts',
  'milestones',
  'obs',
  // Nach dem Stream
  'clips',
  'autoclips',
  'stats',
  'rewardstats',
  // Einstellungen
  'settings-connections',
  'settings-app',
  'hotkeys',
  'settings-data',
  // Hilfe
  'help',
] as const;

export type PanelKey = (typeof PANEL_KEYS)[number];
