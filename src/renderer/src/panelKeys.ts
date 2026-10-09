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
  'trycommands',
  'points',
  'channelrewards',
  'quests',
  // Overlays & Alerts — alerts, milestones, leaderboards and the style for
  // all live in the overlay workshop, not as panels of their own (08.10.)
  'overlays',
  // Nach dem Stream
  'report',
  // Einstellungen
  'settings-connections',
  'settings-app',
  'hotkeys',
  'settings-data',
  // Hilfe
  'help',
] as const;

export type PanelKey = (typeof PANEL_KEYS)[number];
