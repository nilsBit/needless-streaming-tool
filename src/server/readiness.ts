import { getDb } from './db/index';
import { getBotStatus } from './bot/index';
import { getObsStatus, getScenes, getOverlayScenes } from './obs/index';
import { SCREENS } from './obs/screens';
import { characterSource } from './api/characters';
import { loadWorld } from './api/worldbuilder';
import { ALERT_SLOTS, getAlertSettings } from './bot/alerts';
import { getFeatures } from './features';
import { FEATURE_KEYS, readinessVisible } from '../shared/features';

/**
 * "Bereit für den Stream?" — what has to be in place before going live, and
 * where to fix it. The app shows the items that are not ok as a banner on
 * "Im Stream" and the connection marks in the sidebar.
 *
 * `assessReadiness` is pure so the shape is testable without any connection;
 * `readinessInput` gathers the live state. `ok: null` means "cannot be judged
 * yet" (the scenes while OBS is out of reach) and is never shown as a problem.
 */

export interface ReadinessTarget {
  area: 'stream' | 'chat' | 'overlays' | 'after' | 'settings' | 'help';
  subTab?: string;
}

export interface ReadinessItem {
  id: 'twitch' | 'obs' | 'scenes' | 'overlays' | 'worldbuilder' | 'commands' | 'alertSounds';
  ok: boolean | null;
  /** An `error` keeps the stream from working as intended; a `hint` is nice to have. */
  severity: 'error' | 'hint';
  /** The check, stated as the goal: „OBS verbunden“. */
  title: string;
  /** What is wrong, when it is: „OBS ist nicht verbunden.“ */
  problem: string;
  /** What that means on stream. */
  consequence: string;
  target: ReadinessTarget;
}

export interface ReadinessInput {
  bot: { connected: boolean; channel: string | null };
  obs: { connected: boolean; scenes: string[] | null; overlaysPlaced: number | null };
  world: { source: 'notion' | 'worldbuilder'; reachable: boolean | null; name: string | null };
  enabledCommands: number;
  alerts: { slots: number; withSound: number };
  /** The chosen features ("Was dein Stream kann"); every feature when left out. Checks of features that are off are dropped. */
  features?: readonly string[];
}

export interface Readiness {
  ready: boolean;
  items: ReadinessItem[];
}

export function assessReadiness(input: ReadinessInput): Readiness {
  const missingScenes = input.obs.scenes
    ? SCREENS.map((s) => s.scene).filter((scene) => !input.obs.scenes!.includes(scene))
    : [];

  const items: ReadinessItem[] = [
    {
      id: 'twitch',
      ok: input.bot.connected,
      severity: 'error',
      title: 'Twitch verbunden, Bot im Kanal',
      problem: 'Twitch ist nicht verbunden – der Bot ist nicht im Kanal.',
      consequence: 'Der Bot antwortet auf nichts, Alerts und Kanalpunkte kommen nicht an.',
      target: { area: 'settings', subTab: 'verbindungen' },
    },
    {
      id: 'obs',
      ok: input.obs.connected,
      severity: 'error',
      title: 'OBS verbunden',
      problem: 'OBS ist nicht verbunden.',
      consequence: 'Kein Szenenwechsel, kein Nachladen der Overlays, keine Live-Meldung nach Discord.',
      target: { area: 'settings', subTab: 'verbindungen' },
    },
    {
      id: 'scenes',
      ok: input.obs.connected && input.obs.scenes ? missingScenes.length === 0 : null,
      severity: 'error',
      title: 'Szenen „start“, „brb“ und „end“ in OBS',
      problem: missingScenes.length
        ? `In OBS ${missingScenes.length === 1 ? 'fehlt die Szene' : 'fehlen die Szenen'} ${missingScenes.map((s) => `„${s}“`).join(', ')}.`
        : 'In OBS fehlen Szenen für Start, Pause oder Ende.',
      consequence: 'Start-, Pausen- und Endbild lassen sich nicht aufrufen.',
      target: { area: 'overlays', subTab: 'szenen' },
    },
    {
      id: 'overlays',
      ok: input.obs.connected && input.obs.overlaysPlaced !== null ? input.obs.overlaysPlaced > 0 : null,
      severity: 'error',
      title: 'Overlays als Browserquellen in OBS',
      problem: 'In OBS zeigt keine Browserquelle auf dieses Tool.',
      consequence: 'Kein Overlay erscheint im Stream – weder Chat noch Musik noch die Eintragskarte.',
      target: { area: 'overlays', subTab: 'overlays' },
    },
    input.world.source === 'worldbuilder'
      ? {
          id: 'worldbuilder',
          ok: input.world.reachable,
          severity: 'error',
          title: input.world.name ? `Worldbuilder erreichbar („${input.world.name}“)` : 'Worldbuilder erreichbar',
          problem: 'Der Worldbuilder ist nicht erreichbar.',
          consequence: 'Die Eintragskarte bleibt leer, !figur, !ort und !gilde finden nichts.',
          target: { area: 'stream' },
        }
      : {
          id: 'worldbuilder',
          ok: false,
          severity: 'hint',
          title: 'Worldbuilder als Quelle gewählt',
          problem: 'Als Quelle für die Welt ist Notion gewählt, nicht der Worldbuilder.',
          consequence: 'Die Karte folgt nicht dem offenen Eintrag; Notion wird nicht mehr ausgebaut.',
          target: { area: 'stream' },
        },
    {
      id: 'commands',
      ok: input.enabledCommands > 0,
      severity: 'error',
      title: 'Mindestens ein eigener Befehl ist an',
      problem: 'Kein eigener Befehl ist eingeschaltet.',
      consequence: 'Niemand im Chat kann !welt oder !story fragen.',
      target: { area: 'chat', subTab: 'befehle' },
    },
    {
      id: 'alertSounds',
      ok: input.alerts.slots > 0 && input.alerts.withSound === input.alerts.slots,
      severity: 'hint',
      title: 'Alle Alerts haben einen Ton',
      problem: input.alerts.withSound === 0
        ? 'Kein Alert hat einen Ton.'
        : `${input.alerts.slots - input.alerts.withSound} von ${input.alerts.slots} Alerts haben keinen Ton.`,
      consequence: 'Die Tafel erscheint stumm.',
      target: { area: 'overlays', subTab: 'alerts' },
    },
  ];

  const on = new Set<string>(input.features ?? FEATURE_KEYS);
  const visible = items.filter((item) => readinessVisible(on, item.id));
  const ready = visible.every((item) => item.severity === 'hint' || item.ok !== false);
  return { ready, items: visible };
}

/** The live state. Talks to OBS only when it is already connected. */
export async function readinessInput(): Promise<ReadinessInput> {
  const bot = getBotStatus();
  const obs = getObsStatus();
  const scenes = obs.connected ? await getScenes() : null;
  const overlaysPlaced = obs.connected ? Object.keys((await getOverlayScenes()).byOverlay).length : null;

  const source = characterSource();
  let reachable: boolean | null = null;
  let name: string | null = null;
  if (source === 'worldbuilder') {
    const world = await loadWorld();
    reachable = 'name' in world;
    name = 'name' in world ? world.name : null;
  }

  const row = getDb().prepare('SELECT COUNT(*) AS n FROM text_commands WHERE enabled = 1').get() as { n: number };
  const settings = getAlertSettings();
  const slots = Object.keys(ALERT_SLOTS).length;
  const withSound = Object.values(settings).filter((s) => s.sound).length;

  return {
    bot,
    obs: { connected: obs.connected, scenes, overlaysPlaced },
    world: { source, reachable, name },
    enabledCommands: row.n,
    alerts: { slots, withSound },
    features: getFeatures(),
  };
}
