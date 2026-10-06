import fs from 'fs';
import path from 'path';
import { readStates } from '../showcase';
import { getOverlayConfig } from '../api/overlay-config';
import { appliedChanges } from '../design-apply';
import { getUserDataPath } from '../paths';

/**
 * The overlays as the app presents them: German name, one sentence, a group,
 * the size the OBS source should have, which showcase state stands in as the
 * preview, and whether the streamer has changed the overlay's look — because
 * the preview shows sample data only while an overlay is still in its default
 * layout (decided 2026-10-06).
 *
 * Sizes and preview states come from the showcase (`states.json`); the words
 * live here. A folder under src/overlays that this table does not know still
 * appears, under its folder name.
 */

export type CatalogGroup = 'always' | 'join' | 'today' | 'rewards' | 'screens' | 'alerts' | 'custom';

export interface CatalogEntry {
  name: string;
  label: string;
  sentence: string;
  group: CatalogGroup;
  /** Width × height of the browser source, from the showcase; null for custom overlays. */
  size: { width: number; height: number } | null;
  /** The showcase state with sample data, or null when there is none. */
  previewState: string | null;
  url: string;
  builtin: boolean;
  /** HTML override, own palette values or an applied Figma draft — the preview then runs live. */
  customized: boolean;
  /** Why it counts as customized, for the UI to say. */
  customizedBy: Array<'html' | 'palette' | 'figma'>;
}

export const GROUP_LABELS: Record<CatalogGroup, string> = {
  always: 'Immer da',
  join: 'Mitmachen',
  today: 'Heute im Stream',
  rewards: 'Kanalpunkte',
  screens: 'Start, Pause, Ende',
  alerts: 'Meldungen',
  custom: 'Eigene Overlays',
};

const META: Record<string, { label: string; sentence: string; group: CatalogGroup; preview: string }> = {
  character: { label: 'Eintragskarte', sentence: 'Der Welt-Eintrag, den du im Worldbuilder offen hast.', group: 'always', preview: 'with-portrait' },
  chat: { label: 'Chat', sentence: 'Die letzten Nachrichten, ohne Befehle und Bot-Antworten.', group: 'always', preview: 'gespraech' },
  song: { label: 'Musik', sentence: 'Der Song, der gerade läuft, mit Cover – nur dieser eine Titel.', group: 'always', preview: 'playing' },
  roulette: { label: 'Glücksrad', sentence: 'Dreht über deine gesammelten Themen.', group: 'join', preview: 'winner' },
  poll: { label: 'Abstimmung', sentence: 'Vorschläge, Balken und am Ende das Ergebnis.', group: 'join', preview: 'open' },
  progress: { label: 'Fortschritt', sentence: 'Deine Schritte für heute mit Balken.', group: 'today', preview: 'in-progress' },
  todos: { label: 'Aufgaben', sentence: 'Deine Liste zum Abhaken.', group: 'today', preview: 'open-todos' },
  challenge: { label: 'Ziel für heute', sentence: 'Dein Ziel mit laufender Uhr.', group: 'today', preview: 'running' },
  milestone: { label: 'Meilenstein', sentence: 'Feiert einen abgehakten Meilenstein groß, über allem anderen.', group: 'today', preview: 'major' },
  'reward-leaderboard': { label: 'Bestenliste', sentence: 'Wer am meisten Kanalpunkte eingelöst hat.', group: 'rewards', preview: 'top-three' },
  'reward-rankchange': { label: 'Rangwechsel', sentence: 'Meldet, wenn jemand in der Bestenliste aufsteigt.', group: 'rewards', preview: 'overtake' },
  start: { label: 'Startbild', sentence: 'Füllt den ganzen Stream, bevor es losgeht.', group: 'screens', preview: 'mit-eintrag' },
  pause: { label: 'Pausenbild', sentence: 'Füllt den ganzen Stream, wenn du kurz weg bist.', group: 'screens', preview: 'mit-eintrag' },
  end: { label: 'Endbild', sentence: 'Füllt den ganzen Stream zum Abschluss.', group: 'screens', preview: 'mit-eintrag' },
  alerts: { label: 'Alerts', sentence: 'Tafel bei Follow, Abo, Geschenk, Raid und Bits.', group: 'alerts', preview: 'follow' },
};

const GROUP_ORDER: CatalogGroup[] = ['always', 'join', 'today', 'rewards', 'screens', 'alerts', 'custom'];

function builtinDir(): string {
  return process.env.NST_OVERLAYS_DIR ?? path.join(process.cwd(), 'src', 'overlays');
}

function builtinNames(): string[] {
  try {
    return fs.readdirSync(builtinDir(), { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith('_') && e.name !== 'showcase')
      .map((e) => e.name);
  } catch {
    return [];
  }
}

function customNames(): string[] {
  try {
    const dir = getUserDataPath('custom-overlays');
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && fs.existsSync(path.join(dir, e.name, 'index.html')))
      .map((e) => e.name);
  } catch {
    return [];
  }
}

export function overlayCatalog(host: string): CatalogEntry[] {
  const states = readStates().overlays;
  const config = getOverlayConfig();
  const figma = new Set(appliedChanges().map((c) => c.overlay));
  const overrideDir = getUserDataPath('overlay-overrides');

  const entries: CatalogEntry[] = builtinNames().map((name) => {
    const meta = META[name];
    const showcase = Object.prototype.hasOwnProperty.call(states, name) ? states[name] : null;
    const by: CatalogEntry['customizedBy'] = [];
    if (fs.existsSync(path.join(overrideDir, name, 'index.html'))) by.push('html');
    if (Object.keys(config.overrides?.[name] ?? {}).length > 0) by.push('palette');
    if (figma.has(name)) by.push('figma');
    const preview = meta && showcase && Object.prototype.hasOwnProperty.call(showcase.states, meta.preview)
      ? meta.preview
      : showcase ? Object.keys(showcase.states)[0] ?? null : null;
    return {
      name,
      label: meta?.label ?? name,
      sentence: meta?.sentence ?? '',
      group: meta?.group ?? 'custom',
      size: showcase?.size ?? null,
      previewState: preview,
      url: `http://${host}/overlay/${name}/index.html`,
      builtin: true,
      customized: by.length > 0,
      customizedBy: by,
    };
  });

  for (const name of customNames()) {
    entries.push({
      name: `custom/${name}`,
      label: name,
      sentence: 'Ein eigenes Overlay aus deiner HTML-Datei.',
      group: 'custom',
      size: null,
      previewState: null,
      url: `http://${host}/overlay/custom/${name}/index.html`,
      builtin: false,
      customized: true,
      customizedBy: ['html'],
    });
  }

  const order = (g: CatalogGroup) => GROUP_ORDER.indexOf(g);
  const within = (name: string) => Object.keys(META).indexOf(name);
  return entries.sort((a, b) => order(a.group) - order(b.group) || within(a.name) - within(b.name) || a.label.localeCompare(b.label, 'de'));
}
