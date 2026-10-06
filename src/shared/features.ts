// What a stream can do — the one list the setup asks from ("Was soll dein
// Stream können?", 06.10.2026) and the app shows by. A feature names what it
// needs connected, which overlays, built-in commands, panels, hotkeys and
// readiness checks belong to it. Pure data: the server filters by it, the
// renderer hides by it, and the navigation test reads it under Node.
//
// Spec: docs/superpowers/specs/2026-10-06-einrichtung-design.md

export type FeatureKey =
  | 'befehle' | 'musik' | 'rad' | 'vote' | 'shoutout'
  | 'chat' | 'song' | 'ziel' | 'fortschritt' | 'alerts'
  | 'bestenliste' | 'belohnungen'
  | 'momente' | 'autoclips' | 'meilensteine' | 'discord'
  | 'welt' | 'bilder';

export type FeatureGroupKey = 'chat' | 'overlays' | 'rewards' | 'after' | 'welt';
export type ConnectionKey = 'twitch' | 'obs' | 'discord' | 'worldbuilder';
export type ReadinessId = 'twitch' | 'obs' | 'scenes' | 'overlays' | 'worldbuilder' | 'commands' | 'alertSounds';

export interface FeatureGroup {
  key: FeatureGroupKey;
  label: string;
  sentence: string;
  /** Nils's own: shown only when the Worldbuilder is set up on this machine. */
  personal?: boolean;
}

export interface Feature {
  key: FeatureKey;
  group: FeatureGroupKey;
  label: string;
  sentence: string;
  needs: ConnectionKey[];
  /** Overlay folder names under src/overlays. */
  overlays: string[];
  /** Built-in command keys, as DEFAULT_COMMANDS names them. */
  commands: string[];
  /** Panel keys that show only while this (or another claiming feature) is on. */
  panels: string[];
  /** Keys of HotkeyConfig. */
  hotkeys: string[];
  readiness: ReadinessId[];
}

export const FEATURE_GROUPS: readonly FeatureGroup[] = [
  { key: 'chat', label: 'Im Chat', sentence: 'Was der Bot im Chat tut.' },
  { key: 'overlays', label: 'Overlays', sentence: 'Was Zuschauer im Stream sehen. Jedes ist eine Browserquelle in OBS.' },
  { key: 'rewards', label: 'Mit Kanalpunkten', sentence: 'Belohnungen legst du in Twitch an, das Tool reagiert darauf.' },
  { key: 'after', label: 'Nach dem Stream', sentence: 'Was aus dem Stream wird.' },
  { key: 'welt', label: 'Welt', sentence: 'Deine Welt aus dem Worldbuilder im Stream. Erscheint, weil der Worldbuilder auf diesem Rechner eingerichtet ist.', personal: true },
];

export const FEATURES: readonly Feature[] = [
  { key: 'befehle', group: 'chat', label: 'Erklär-Befehle', sentence: 'Der Chat fragt !welt oder !story, der Bot antwortet mit deinem Text.', needs: ['twitch'], overlays: [], commands: [], panels: [], hotkeys: [], readiness: ['commands'] },
  { key: 'musik', group: 'chat', label: 'Musikwünsche', sentence: 'Zuschauer wünschen sich Songs mit !sr und sehen die Reihe mit !queue.', needs: ['twitch'], overlays: [], commands: ['sr', 'queue'], panels: ['song'], hotkeys: [], readiness: [] },
  { key: 'rad', group: 'chat', label: 'Glücksrad', sentence: 'Du sammelst Themen, das Rad entscheidet. Der Chat sieht sie mit !themen.', needs: ['twitch', 'obs'], overlays: ['roulette'], commands: ['issues'], panels: ['issues'], hotkeys: ['roulette'], readiness: [] },
  { key: 'vote', group: 'chat', label: 'Abstimmung', sentence: 'Du sammelst Vorschläge, der Chat stimmt mit !vote ab.', needs: ['twitch', 'obs'], overlays: ['poll'], commands: ['vote', 'design'], panels: ['designs'], hotkeys: [], readiness: [] },
  { key: 'shoutout', group: 'chat', label: 'Raid-Gruß von selbst', sentence: 'Wer dich raidet, bekommt vom Bot einen Gruß mit Link zum Kanal.', needs: ['twitch'], overlays: [], commands: ['shoutout'], panels: [], hotkeys: [], readiness: [] },

  { key: 'chat', group: 'overlays', label: 'Chat im Stream', sentence: 'Die letzten Nachrichten, ohne Befehle und Bot-Antworten.', needs: ['twitch', 'obs'], overlays: ['chat'], commands: [], panels: [], hotkeys: [], readiness: [] },
  { key: 'song', group: 'overlays', label: 'Musik mit Cover', sentence: 'Der Titel, der gerade läuft, mit Bild.', needs: ['obs'], overlays: ['song'], commands: ['song'], panels: ['song'], hotkeys: [], readiness: [] },
  { key: 'ziel', group: 'overlays', label: 'Ziel für heute', sentence: 'Ein Satz, dazu läuft eine Uhr.', needs: ['obs'], overlays: ['challenge'], commands: ['challenge'], panels: ['challenge'], hotkeys: ['challenge_toggle', 'timer_toggle', 'challenge_done', 'challenge_failed'], readiness: [] },
  { key: 'fortschritt', group: 'overlays', label: 'Aufgaben und Fortschritt', sentence: 'Woran du heute arbeitest, mit Balken und Liste zum Abhaken.', needs: ['obs'], overlays: ['progress', 'todos'], commands: ['todo', 'progress'], panels: ['progress'], hotkeys: [], readiness: [] },
  { key: 'alerts', group: 'overlays', label: 'Alerts', sentence: 'Tafel mit Ton bei Follow, Abo, Geschenk, Raid und Bits.', needs: ['twitch', 'obs'], overlays: ['alerts'], commands: [], panels: ['alerts'], hotkeys: [], readiness: ['alertSounds'] },

  { key: 'bestenliste', group: 'rewards', label: 'Bestenliste', sentence: 'Wer am meisten eingelöst hat – als Overlay, mit !stats im Chat und einer Meldung bei Rangwechsel.', needs: ['twitch', 'obs'], overlays: ['reward-leaderboard', 'reward-rankchange'], commands: ['rewardstats'], panels: ['rewardstats'], hotkeys: [], readiness: [] },
  { key: 'belohnungen', group: 'rewards', label: 'Belohnungen auslösen', sentence: 'Kanalpunkte drehen das Rad, wechseln kurz die Szene, ändern die Musik oder reichen einen Vorschlag ein.', needs: ['twitch', 'obs'], overlays: [], commands: ['scene'], panels: ['obs'], hotkeys: [], readiness: [] },

  { key: 'momente', group: 'after', label: 'Momente merken und Content planen', sentence: 'Ein Klick merkt die Stelle. Danach wird daraus ein Brett für TikTok, Shorts und Reels.', needs: [], overlays: [], commands: ['hype'], panels: ['clips'], hotkeys: ['hype_moment'], readiness: [] },
  { key: 'autoclips', group: 'after', label: 'Hype von selbst erkennen', sentence: 'Wenn der Chat explodiert, merkt das Tool den Moment für dich.', needs: ['twitch'], overlays: [], commands: [], panels: ['autoclips'], hotkeys: [], readiness: [] },
  { key: 'meilensteine', group: 'after', label: 'Meilensteine feiern', sentence: 'Ein abgehakter Meilenstein wird groß gefeiert, über allem anderen.', needs: ['obs'], overlays: ['milestone'], commands: [], panels: ['milestones'], hotkeys: ['milestone_minor', 'milestone_major', 'milestone_epic'], readiness: [] },
  { key: 'discord', group: 'after', label: 'Live-Meldung nach Discord', sentence: 'Wenn du live gehst, postet das Tool eine Nachricht in deinen Server.', needs: ['discord'], overlays: [], commands: [], panels: [], hotkeys: [], readiness: [] },

  { key: 'welt', group: 'welt', label: 'Eintragskarte aus der Welt', sentence: 'Die Karte zeigt den Eintrag, den du im Worldbuilder offen hast.', needs: ['obs', 'worldbuilder'], overlays: ['character'], commands: [], panels: ['world'], hotkeys: [], readiness: ['worldbuilder'] },
  { key: 'bilder', group: 'welt', label: 'Start-, Pausen- und Endbild', sentence: 'Füllen den ganzen Stream – davor, zwischendurch und danach, mit eigenen Szenen in OBS.', needs: ['obs'], overlays: ['start', 'pause', 'end'], commands: [], panels: ['obs'], hotkeys: [], readiness: ['scenes'] },
];

export const FEATURE_KEYS: readonly FeatureKey[] = FEATURES.map((f) => f.key);
export const PERSONAL_FEATURES: readonly FeatureKey[] = FEATURES.filter((f) => FEATURE_GROUPS.find((g) => g.key === f.group)?.personal).map((f) => f.key);
/** What a fresh install starts with: things every stream can use that need nothing beyond Twitch and OBS. */
export const DEFAULT_FEATURES: readonly FeatureKey[] = ['chat', 'alerts', 'momente'];

export const CONNECTION_ORDER: readonly ConnectionKey[] = ['twitch', 'obs', 'worldbuilder', 'discord'];
export const CONNECTION_LABELS: Record<ConnectionKey, string> = { twitch: 'Twitch', obs: 'OBS', discord: 'Discord', worldbuilder: 'Worldbuilder' };

export function isFeatureKey(value: unknown): value is FeatureKey {
  return typeof value === 'string' && (FEATURE_KEYS as readonly string[]).includes(value);
}

export function featureByKey(key: FeatureKey): Feature {
  return FEATURES.find((f) => f.key === key)!;
}

const onFeatures = (on: ReadonlySet<string>): Feature[] => FEATURES.filter((f) => on.has(f.key));

/** The connections the chosen features need, in the order the setup shows them. */
export function connectionsNeeded(on: ReadonlySet<string>): ConnectionKey[] {
  const needed = new Set(onFeatures(on).flatMap((f) => f.needs));
  return CONNECTION_ORDER.filter((c) => needed.has(c));
}

/** True when no feature claims the thing, or one that claims it is on. */
function claimed<T>(on: ReadonlySet<string>, pick: (f: Feature) => readonly T[], value: T): boolean {
  const claimants = FEATURES.filter((f) => pick(f).includes(value));
  return claimants.length === 0 || claimants.some((f) => on.has(f.key));
}

export const panelVisible = (on: ReadonlySet<string>, panel: string) => claimed(on, (f) => f.panels, panel);
export const commandVisible = (on: ReadonlySet<string>, commandKey: string) => claimed(on, (f) => f.commands, commandKey);
export const overlayVisible = (on: ReadonlySet<string>, overlay: string) => claimed(on, (f) => f.overlays, overlay);
export const hotkeyVisible = (on: ReadonlySet<string>, hotkey: string) => claimed(on, (f) => f.hotkeys, hotkey);

/** The feature an overlay belongs to, or null for one that belongs to none (custom overlays). */
export function featureOfOverlay(overlay: string): FeatureKey | null {
  return FEATURES.find((f) => f.overlays.includes(overlay))?.key ?? null;
}

/**
 * Whether a readiness check still matters: a check a feature claims needs that
 * feature on; the connection checks stay while a chosen feature needs them;
 * "overlays in OBS" stays while a chosen feature has an overlay at all.
 */
export function readinessVisible(on: ReadonlySet<string>, id: ReadinessId): boolean {
  const claimants = FEATURES.filter((f) => f.readiness.includes(id));
  if (claimants.length > 0) return claimants.some((f) => on.has(f.key));
  if (id === 'twitch' || id === 'obs') return onFeatures(on).some((f) => f.needs.includes(id));
  if (id === 'overlays') return onFeatures(on).some((f) => f.overlays.length > 0);
  return true;
}

/** The overlays the chosen features bring, in feature order, each once. */
export function overlaysOf(on: ReadonlySet<string>): string[] {
  return [...new Set(onFeatures(on).flatMap((f) => f.overlays))];
}
