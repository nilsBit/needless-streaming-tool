// The one source for the app's navigation: areas by situation, their sub tabs,
// the German names and the one sentence each. The sidebar, the page headers and
// the start cards all read from here. Pure data — no React — so it is tested
// under Node (src/renderer/src/__tests__/navigation.test.ts).
//
// Spec: docs/superpowers/specs/2026-10-05-bedienung-neuaufbau-design.md
import type { PanelKey } from './panelKeys';

export type AreaKey = 'start' | 'stream' | 'chat' | 'overlays' | 'after' | 'settings' | 'help';

export interface SubTab {
  key: string;
  label: string;
  /** One sentence on what you do here; shown under the sub tabs. */
  sentence: string;
  panels: PanelKey[];
}

export interface Area {
  key: AreaKey;
  label: string;
  /** One sentence for the page header and the start card. */
  sentence: string;
  /** What lies here, for the start card. */
  keywords: string[];
  /** `secondary` areas sit below the divider in the sidebar. */
  group: 'main' | 'secondary';
  /** At least one. A single sub tab is not shown as a tab row. */
  subTabs: SubTab[];
}

/** German display name per panel — for error fallbacks and the walk-through. */
export const PANEL_LABELS: Record<PanelKey, string> = {
  challenge: 'Ziel für heute',
  issues: 'Glücksrad',
  designs: 'Abstimmung',
  progress: 'Fortschritt',
  song: 'Musik',
  world: 'Eintrag aus der Welt',
  textcommands: 'Befehle',
  chatbot: 'Von selbst',
  overlays: 'Overlays',
  alerts: 'Alerts',
  milestones: 'Meilensteine',
  obs: 'Szenen in OBS',
  clips: 'Content planen',
  autoclips: 'Von selbst merken',
  stats: 'Statistik',
  rewardstats: 'Kanalpunkte',
  'settings-connections': 'Verbindungen',
  'settings-app': 'Programm',
  hotkeys: 'Tastenkürzel',
  'settings-data': 'Daten',
  help: 'Hilfe',
};

export const AREAS: readonly Area[] = [
  {
    key: 'start',
    label: 'Start',
    sentence: 'Bereit für den Stream? Hier siehst du, was verbunden ist, und findest jeden Bereich.',
    keywords: ['Verbindungen', 'Prüfliste', 'Bereiche'],
    group: 'main',
    subTabs: [{ key: 'start', label: 'Start', sentence: '', panels: [] }],
  },
  {
    key: 'stream',
    label: 'Im Stream',
    sentence: 'Alles, was du auslöst, während du live bist.',
    keywords: ['Ziel für heute', 'Glücksrad', 'Abstimmung', 'Fortschritt', 'Musik', 'Eintrag aus der Welt'],
    group: 'main',
    subTabs: [
      {
        key: 'stream',
        label: 'Im Stream',
        sentence: '',
        panels: ['challenge', 'issues', 'designs', 'progress', 'song', 'world'],
      },
    ],
  },
  {
    key: 'chat',
    label: 'Chat & Bot',
    sentence: 'Was der Bot antwortet und was er von selbst sagt.',
    keywords: ['Befehle', 'Nachschlagen in der Welt', 'Erinnerung', 'Shoutout'],
    group: 'main',
    subTabs: [
      {
        key: 'befehle',
        label: 'Befehle',
        sentence: 'Eigene Texte wie !story und Nachschlage-Befehle wie !figur – was der Chat tippt und der Bot antwortet.',
        panels: ['textcommands'],
      },
      {
        key: 'selbst',
        label: 'Von selbst',
        sentence: 'Was der Bot ohne Aufforderung sagt, wie lange er zwischen Antworten wartet und wie die eingebauten Befehle heißen.',
        panels: ['chatbot'],
      },
    ],
  },
  {
    key: 'overlays',
    label: 'Overlays & Alerts',
    sentence: 'Hier richtest du ein, was im Stream-Bild erscheint und wie es aussieht. Ausgelöst wird es unter „Im Stream“.',
    keywords: ['Overlays', 'Alerts', 'Meilensteine', 'Szenen in OBS'],
    group: 'main',
    subTabs: [
      {
        key: 'overlays',
        label: 'Overlays',
        sentence: 'Jedes Overlay ist eine Browserquelle in OBS mit einer eigenen Adresse. Hier siehst du alle, ihr Aussehen und eigene Kopien.',
        panels: ['overlays'],
      },
      {
        key: 'alerts',
        label: 'Alerts',
        sentence: 'Die Tafel oben rechts, wenn jemand folgt, abonniert, raidet oder Bits gibt – Text und Ton je Anlass.',
        panels: ['alerts'],
      },
      {
        key: 'meilensteine',
        label: 'Meilensteine',
        sentence: 'Ziele, die du dir setzt und im Stream abhakst. Beim Abhaken feiert sie eine Einblendung.',
        panels: ['milestones'],
      },
      {
        key: 'szenen',
        label: 'Szenen in OBS',
        sentence: 'Start-, Pausen- und Endbild als Szenen anlegen und Szenen per Kanalpunkt wechseln lassen.',
        panels: ['obs'],
      },
    ],
  },
  {
    key: 'after',
    label: 'Nach dem Stream',
    sentence: 'Was passiert ist – und was daraus wird.',
    keywords: ['Content planen', 'Statistik', 'Kanalpunkte'],
    group: 'main',
    subTabs: [
      {
        key: 'content',
        label: 'Content planen',
        sentence: 'Die Momente, die du im Stream gemerkt hast – und was das Tool von selbst merkt.',
        panels: ['clips', 'autoclips'],
      },
      {
        key: 'statistik',
        label: 'Statistik',
        sentence: 'Zahlen zu deinen Streams – heute, der Stand deiner Listen und der Verlauf.',
        panels: ['stats'],
      },
      {
        key: 'kanalpunkte',
        label: 'Kanalpunkte',
        sentence: 'Wer welche Belohnung wie oft eingelöst hat. Daraus entsteht die Bestenliste im Stream.',
        panels: ['rewardstats'],
      },
    ],
  },
  {
    key: 'settings',
    label: 'Einstellungen',
    sentence: 'Verbindungen, Programm und Daten.',
    keywords: ['Twitch', 'OBS', 'Discord', 'Notion', 'Backup', 'Tastenkürzel'],
    group: 'secondary',
    subTabs: [
      {
        key: 'verbindungen',
        label: 'Verbindungen',
        sentence: 'Twitch, OBS, Notion, Discord und GitHub – was verbunden ist und was noch fehlt.',
        panels: ['settings-connections'],
      },
      {
        key: 'programm',
        label: 'Programm',
        sentence: 'Aussehen der App, Autostart und globale Tastenkürzel.',
        panels: ['settings-app', 'hotkeys'],
      },
      {
        key: 'daten',
        label: 'Daten',
        sentence: 'Stream-Deck-Token, Backup und Sync.',
        panels: ['settings-data'],
      },
    ],
  },
  {
    key: 'help',
    label: 'Hilfe',
    sentence: 'Wie alles zusammenhängt, Schritt für Schritt.',
    keywords: ['Erste Schritte', 'Befehle', 'Overlays', 'Stream Deck'],
    group: 'secondary',
    subTabs: [{ key: 'hilfe', label: 'Hilfe', sentence: '', panels: ['help'] }],
  },
];

/** The area for a stored key; the first area when the key is unknown. */
export function findArea(key: string | null | undefined): Area {
  return AREAS.find((a) => a.key === key) ?? AREAS[0];
}

/** The sub tab for a stored key within an area; the first when unknown. */
export function findSubTab(area: Area, key: string | null | undefined): SubTab {
  return area.subTabs.find((t) => t.key === key) ?? area.subTabs[0];
}
