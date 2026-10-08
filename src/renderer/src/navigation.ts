// The one source for the app's navigation: areas by situation, their sub tabs,
// the German names and the one sentence each. The sidebar and the page headers
// read from here. There is no start page: what is missing before going live is
// a banner on "Im Stream", the connections are marks in the sidebar (06.10.). Pure data — no React — so it is tested
// under Node (src/renderer/src/__tests__/navigation.test.ts).
//
// Spec: docs/superpowers/specs/2026-10-05-bedienung-neuaufbau-design.md
import type { PanelKey } from './panelKeys';
import { panelVisible } from '../../shared/features';

export type AreaKey = 'stream' | 'chat' | 'overlays' | 'after' | 'quests' | 'settings' | 'help';

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
  /** One sentence for the page header. */
  sentence: string;
  /** What lies here — the sidebar tooltip and the help page use it. */
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
  trycommands: 'Ausprobieren',
  points: 'Punkte',
  channelrewards: 'Kanalpunkte',
  quests: 'Quests',
  overlays: 'Overlays',
  clips: 'Content planen',
  autoclips: 'Von selbst merken',
  stats: 'Statistik',
  'settings-connections': 'Verbindungen',
  'settings-app': 'Programm',
  hotkeys: 'Tastenkürzel',
  'settings-data': 'Daten',
  help: 'Hilfe',
};

export const AREAS: readonly Area[] = [
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
    keywords: ['Befehle', 'Nachschlagen in der Welt', 'Erinnerung', 'Shoutout', 'Punkte', 'Kanalpunkte', 'Ausprobieren'],
    group: 'main',
    subTabs: [
      {
        key: 'befehle',
        label: 'Befehle',
        sentence: 'Eigene Texte wie !story und Nachschlage-Befehle wie !figur – eine Liste, was der Chat tippt und der Bot antwortet. Die eingebauten Befehle stehen unter „Von selbst“.',
        panels: ['textcommands'],
      },
      {
        key: 'selbst',
        label: 'Von selbst',
        sentence: 'Was der Bot ohne Aufforderung sagt, wie lange er zwischen Antworten wartet und wie die eingebauten Befehle heißen.',
        panels: ['chatbot'],
      },
      {
        key: 'punkte',
        label: 'Punkte',
        sentence: 'Eigene Punkte neben den Kanalpunkten von Twitch: wofür es welche gibt, was man dafür einlöst und wer am meisten beigetragen hat.',
        panels: ['points'],
      },
      {
        key: 'kanalpunkte',
        label: 'Kanalpunkte',
        sentence: 'Belohnungen für Twitch-Kanalpunkte: hier anlegen, mit einer Aktion verbinden, ändern und löschen. Was im Creator-Dashboard angelegt ist, steht zum Ansehen dabei.',
        panels: ['channelrewards'],
      },
      {
        key: 'ausprobieren',
        label: 'Ausprobieren',
        sentence: 'Schreib einen Befehl, wie ihn ein Zuschauer schreiben würde. Im echten Chat passiert dabei nichts.',
        panels: ['trycommands'],
      },
    ],
  },
  {
    key: 'overlays',
    label: 'Overlays & Alerts',
    sentence: 'Hier richtest du ein, was in deinem Stream erscheint – einmal. Gesteuert wird live unter „Im Stream“.',
    keywords: ['Overlays', 'Alerts', 'Meilensteine', 'Bestenlisten', 'Stil für alle', 'Start-, Pausen- und Endbild'],
    group: 'main',
    subTabs: [
      {
        key: 'overlays',
        label: 'Overlays',
        sentence: 'Jedes Overlay wird in drei Schritten einsatzbereit: einstellen, in OBS anlegen, testen.',
        panels: ['overlays'],
      },
    ],
  },
  {
    key: 'after',
    label: 'Nach dem Stream',
    sentence: 'Was passiert ist – und was daraus wird.',
    keywords: ['Content planen', 'Statistik'],
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
    ],
  },
  {
    key: 'quests',
    label: 'Quests',
    sentence: 'Dein Weg durchs Tool: was als Nächstes kommt, was du geschafft hast, und deine Stufe.',
    keywords: ['Stufe', 'Erfahrung', 'Abzeichen'],
    group: 'main',
    subTabs: [
      {
        key: 'quests',
        label: 'Quests',
        sentence: '',
        panels: ['quests'],
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
        sentence: 'API-Token, Sicherung und Sync-Ordner.',
        panels: ['settings-data'],
      },
    ],
  },
  {
    key: 'help',
    label: 'Hilfe',
    sentence: 'Wie alles zusammenhängt, Schritt für Schritt.',
    keywords: ['Erste Schritte', 'Befehle', 'Overlays'],
    group: 'secondary',
    subTabs: [{ key: 'hilfe', label: 'Hilfe', sentence: '', panels: ['help'] }],
  },
];

/**
 * What is left of the navigation once the chosen features ("Was dein Stream
 * kann") hide their panels: sub tabs without a panel go, areas without a sub
 * tab go. "Im Stream" stays while the moment card (`momente`) is on, even
 * with no card panel left. Einstellungen and Hilfe claim nothing and stay.
 */
export function visibleNavigation(on: ReadonlySet<string>): Area[] {
  return AREAS
    .map((area) => ({
      ...area,
      subTabs: area.subTabs
        .map((tab) => ({ ...tab, panels: tab.panels.filter((p) => panelVisible(on, p)) }))
        .filter((tab) => tab.panels.length > 0 || (area.key === 'stream' && on.has('momente'))),
    }))
    .filter((area) => area.subTabs.length > 0);
}

/**
 * Overlays & Alerts had sub tabs until 08.10.; each became an overlay's
 * workshop or "Stil für alle". A link to one of them (a quest, the readiness
 * banner) opens that instead — `@style` is Stil für alle.
 */
export const OVERLAY_OF_OLD_TAB: Record<string, string> = {
  alerts: 'alerts', meilensteine: 'milestone', bestenlisten: 'reward-leaderboard', szenen: 'start', aussehen: '@style',
};

/** The area for a stored key; the first area when the key is unknown. */
export function findArea(key: string | null | undefined): Area {
  return AREAS.find((a) => a.key === key) ?? AREAS[0];
}

/** The sub tab for a stored key within an area; the first when unknown. */
export function findSubTab(area: Area, key: string | null | undefined): SubTab {
  return area.subTabs.find((t) => t.key === key) ?? area.subTabs[0];
}
