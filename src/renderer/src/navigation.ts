// The one source for the app's navigation: areas by situation, their sub tabs,
// the German names and the one sentence each. The sidebar and the page headers
// read from here. There is no start page: what is missing before going live is
// a banner on "Im Stream", the connections are marks in the sidebar (06.10.). Pure data — no React — so it is tested
// under Node (src/renderer/src/__tests__/navigation.test.ts).
//
// Spec: docs/superpowers/specs/2026-10-05-bedienung-neuaufbau-design.md
import type { PanelKey } from './panelKeys';
import { panelVisible } from '../../shared/features';

export type AreaKey = 'stream' | 'chat' | 'overlays' | 'after' | 'settings' | 'help';

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
  overlays: 'Overlays',
  appearance: 'Aussehen',
  alerts: 'Alerts',
  milestones: 'Meilensteine',
  obs: 'Szenen in OBS',
  clips: 'Content planen',
  autoclips: 'Von selbst merken',
  stats: 'Statistik',
  rewardstats: 'Bestenliste',
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
    keywords: ['Befehle', 'Nachschlagen in der Welt', 'Erinnerung', 'Shoutout', 'Ausprobieren'],
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
    sentence: 'Hier richtest du ein, was im Stream-Bild erscheint und wie es aussieht. Ausgelöst wird es unter „Im Stream“.',
    keywords: ['Overlays', 'Alerts', 'Meilensteine', 'Aussehen', 'Szenen in OBS'],
    group: 'main',
    subTabs: [
      {
        key: 'overlays',
        label: 'Overlays',
        sentence: 'Jedes Overlay ist eine Browserquelle in OBS mit einer eigenen Adresse. Links wählst du eines, rechts siehst du es und alles, was du damit tun kannst.',
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
        key: 'aussehen',
        label: 'Aussehen',
        sentence: 'Ein Stil für alle Overlays auf einmal, Farben und Schrift, einzelne Overlays abweichend, Entwürfe aus Figma.',
        panels: ['appearance'],
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
    keywords: ['Content planen', 'Statistik', 'Bestenliste'],
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
        label: 'Bestenliste',
        sentence: 'Wer am meisten geflext hat. Die Belohnung „Flex“ in Twitch schaltet einen Flex frei, !flex im Chat zählt ihn – nur das zählt hier.',
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
        sentence: 'Stream-Deck-Token, Sicherung und Sync-Ordner.',
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

/** The area for a stored key; the first area when the key is unknown. */
export function findArea(key: string | null | undefined): Area {
  return AREAS.find((a) => a.key === key) ?? AREAS[0];
}

/** The sub tab for a stored key within an area; the first when unknown. */
export function findSubTab(area: Area, key: string | null | undefined): SubTab {
  return area.subTabs.find((t) => t.key === key) ?? area.subTabs[0];
}
