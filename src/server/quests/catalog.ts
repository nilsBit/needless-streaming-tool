import { getDb } from '../db/index';
import { getAlertSettings } from '../bot/alerts';
import { setupDone } from '../features';
import type { FeatureKey } from '../../shared/features';

/**
 * The quests (spec 2026-10-08-quests-design). A quest is done when the state
 * says so — a reward exists, OBS was connected once — not because a button
 * was pressed, so what was set up another way, or before, counts too.
 * Things that happened once and leave no trace (connected, streamed, spun)
 * are remembered by a flag the place sets where it happens (markQuestFlag).
 *
 * A quest of a feature that is switched off is hidden and does not count.
 */

export type QuestGroup = 'start' | 'befehle' | 'punkte' | 'kanalpunkte' | 'bestenliste' | 'rad' | 'alerts' | 'momente' | 'discord' | 'welt';

export interface QuestContext {
  /** Where the own overlays sit in OBS, if OBS could be asked; null otherwise. */
  placedOverlays: Set<string> | null;
}

export interface Quest {
  key: string;
  group: QuestGroup;
  title: string;
  /** What to do, in one sentence. */
  text: string;
  xp: number;
  /** Shown only while this feature is on. */
  feature: FeatureKey | null;
  /** Where "Los geht's" leads: an area and sub-tab of the app. */
  goTo: { area: string; subTab?: string };
  done: (ctx: QuestContext) => boolean;
}

const count = (sql: string, ...args: unknown[]): number => (getDb().prepare(sql).get(...args) as { n: number }).n;
const setting = (key: string): string | null =>
  (getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined)?.value ?? null;

/** A thing that happened once: set where it happens, read here. */
export const flagged = (name: string): boolean => setting(`quest_flag_${name}`) === '1';

export const QUESTS: readonly Quest[] = [
  {
    key: 'choose', group: 'start', title: 'Wähle, was dein Stream können soll', xp: 20, feature: null,
    text: 'Das Tool zeigt dir danach nur das – und die Quests dazu.',
    goTo: { area: 'settings', subTab: 'programm' },
    done: () => setting('features') !== null || setupDone(),
  },
  {
    key: 'twitch', group: 'start', title: 'Twitch verbinden', xp: 40, feature: null,
    text: 'Damit der Bot in deinem Chat antwortet.',
    goTo: { area: 'settings', subTab: 'verbindungen' },
    done: () => flagged('twitch'),
  },
  {
    key: 'obs', group: 'start', title: 'OBS verbinden', xp: 40, feature: null,
    text: 'Damit das Tool deine Szenen kennt und Overlays ins Bild bringt.',
    goTo: { area: 'settings', subTab: 'verbindungen' },
    done: () => flagged('obs'),
  },
  {
    key: 'overlay', group: 'start', title: 'Erstes Overlay ins Bild', xp: 40, feature: null,
    text: 'Ein Overlay als Browserquelle in eine Szene in OBS.',
    goTo: { area: 'overlays', subTab: 'overlays' },
    done: (ctx) => flagged('overlay') || (ctx.placedOverlays?.size ?? 0) > 0,
  },
  {
    key: 'stream', group: 'start', title: 'Erster Stream mit dem Tool', xp: 60, feature: null,
    text: 'Geh live, während das Tool läuft.',
    goTo: { area: 'stream' },
    done: () => flagged('stream'),
  },
  {
    key: 'command', group: 'befehle', title: 'Ersten eigenen Befehl anlegen', xp: 30, feature: 'befehle',
    text: 'Ein Befehl wie !story, der deine Welt erklärt.',
    goTo: { area: 'chat', subTab: 'befehle' },
    done: () => count('SELECT COUNT(*) AS n FROM text_commands') > 0,
  },
  {
    key: 'commands5', group: 'befehle', title: 'Fünf Befehle', xp: 50, feature: 'befehle',
    text: 'Eigene Texte und Nachschlage-Befehle zusammen.',
    goTo: { area: 'chat', subTab: 'befehle' },
    done: () => count('SELECT (SELECT COUNT(*) FROM text_commands) + (SELECT COUNT(*) FROM lookup_commands) AS n') >= 5,
  },
  {
    key: 'pointReward', group: 'punkte', title: 'Erste Belohnung anlegen', xp: 50, feature: 'punkte',
    text: 'Was Zuschauer mit deinen Punkten einlösen.',
    goTo: { area: 'chat', subTab: 'punkte' },
    done: () => count('SELECT COUNT(*) AS n FROM point_rewards') > 0,
  },
  {
    key: 'pointTry', group: 'punkte', title: 'Belohnung selbst testen', xp: 30, feature: 'punkte',
    text: 'Gib dir Punkte und löse im Chat ein.',
    goTo: { area: 'chat', subTab: 'punkte' },
    done: () => flagged('pointTry'),
  },
  {
    key: 'points10', group: 'punkte', title: '10 Einlösungen', xp: 100, feature: 'punkte',
    text: 'Deine Zuschauer lösen mit Punkten ein.',
    goTo: { area: 'chat', subTab: 'punkte' },
    done: () => count(`SELECT COUNT(*) AS n FROM rewards WHERE data LIKE '%"source":"points"%'`) >= 10,
  },
  {
    key: 'channelReward', group: 'kanalpunkte', title: 'Erste Belohnung aus dem Tool', xp: 50, feature: 'belohnungen',
    text: 'Eine Kanalpunkte-Belohnung, die etwas tut.',
    goTo: { area: 'chat', subTab: 'kanalpunkte' },
    done: () => count('SELECT COUNT(*) AS n FROM twitch_reward_actions') > 0,
  },
  {
    key: 'leaderboard', group: 'bestenliste', title: 'Erste Bestenliste', xp: 40, feature: 'bestenliste',
    text: 'Wer eine Belohnung am öftesten einlöst.',
    goTo: { area: 'overlays', subTab: 'bestenlisten' },
    done: () => count('SELECT COUNT(*) AS n FROM leaderboards') > 0,
  },
  {
    key: 'topics3', group: 'rad', title: 'Drei Themen sammeln', xp: 30, feature: 'rad',
    text: 'Woraus das Glücksrad wählt.',
    goTo: { area: 'stream' },
    done: () => flagged('topics3') || count(`SELECT COUNT(*) AS n FROM issues WHERE status = 'open'`) >= 3,
  },
  {
    key: 'spin', group: 'rad', title: 'Rad gedreht', xp: 30, feature: 'rad',
    text: 'Lass das Glücksrad einmal entscheiden.',
    goTo: { area: 'stream' },
    done: () => flagged('spin'),
  },
  {
    key: 'alertSound', group: 'alerts', title: 'Eigener Alert-Ton', xp: 30, feature: 'alerts',
    text: 'Ein Ton, der bei Follow, Abo oder Raid spielt.',
    goTo: { area: 'overlays', subTab: 'alerts' },
    done: () => Object.values(getAlertSettings()).some((s) => !!s.sound),
  },
  {
    key: 'moment', group: 'momente', title: 'Ersten Moment merken', xp: 30, feature: 'momente',
    text: 'Ein Klick im Stream merkt die Stelle für später.',
    goTo: { area: 'stream' },
    done: () => count('SELECT COUNT(*) AS n FROM clips') > 0,
  },
  {
    key: 'published', group: 'momente', title: 'Moment veröffentlicht', xp: 60, feature: 'momente',
    text: 'Aus einem Moment wird ein Clip auf TikTok, Shorts oder Reels.',
    goTo: { area: 'after', subTab: 'content' },
    done: () => count(`SELECT COUNT(*) AS n FROM clips WHERE status = 'published'`) > 0,
  },
  {
    key: 'discord', group: 'discord', title: 'Live-Meldung einrichten', xp: 40, feature: 'discord',
    text: 'Dein Discord erfährt, wenn du live gehst.',
    goTo: { area: 'settings', subTab: 'verbindungen' },
    done: () => !!setting('discord_live_webhook'),
  },
  {
    key: 'entryCard', group: 'welt', title: 'Eintragskarte im Bild', xp: 40, feature: 'welt',
    text: 'Die Karte zeigt, woran du in der Welt schreibst.',
    goTo: { area: 'overlays', subTab: 'overlays' },
    done: (ctx) => ctx.placedOverlays?.has('character') ?? false,
  },
];

/**
 * How each quest is explained and where it stands (08.10.: the first quests
 * felt "unerklärt und stuck"). `why` is one sentence of what it is good for,
 * `how` two or three short steps, `needs` a quest that has to be done first —
 * until then this one is shown as blocked and never proposed next.
 */
export interface QuestGuide { chapter: number; why: string; how: string[]; needs?: string; blockedBy?: string }

export const GUIDE: Record<string, QuestGuide> = {
  choose: { chapter: 1, why: 'Damit dir das Tool nur zeigt, was du wirklich brauchst.', how: ['Einstellungen → Programm', 'Funktionen an- und ausschalten'] },
  twitch: { chapter: 1, why: 'Ohne Twitch antwortet kein Bot, und es kommen keine Alerts.', how: ['Einstellungen → Verbindungen', '„Mit Twitch verbinden“', 'Im Browser bestätigen'] },
  obs: { chapter: 1, why: 'Damit das Tool Overlays ins Bild bringt und weiß, was gerade zu sehen ist.', how: ['In OBS: Werkzeuge → WebSocket-Servereinstellungen, Server an', 'Passwort hier eintragen', '„Verbinden“'] },
  overlay: { chapter: 1, why: 'Deine Zuschauer sehen, was im Stream passiert.', how: ['Overlays & Alerts → ein Overlay wählen', '„In OBS anlegen“', 'In OBS an die richtige Stelle schieben'], needs: 'obs', blockedBy: 'Braucht OBS' },
  command: { chapter: 1, why: 'Du musst deine Welt nicht jeden Stream neu erklären – der Chat fragt einfach.', how: ['Chat & Bot → Befehle', '„+ Neuer Befehl“ – der Weg führt dich', 'Im Chat ausprobieren'] },
  stream: { chapter: 1, why: 'Alles zusammen im echten Einsatz.', how: ['Tool offen lassen', 'In OBS „Stream starten“'], needs: 'obs', blockedBy: 'Braucht OBS' },
  commands5: { chapter: 2, why: 'Je mehr der Chat selbst nachlesen kann, desto weniger musst du erklären.', how: ['Chat & Bot → Befehle', 'Weitere Befehle über „+ Neuer Befehl“'], needs: 'command', blockedBy: 'Erst einen Befehl' },
  pointReward: { chapter: 2, why: 'Zuschauen und Mitmachen lohnt sich – Punkte haben einen Wert.', how: ['Chat & Bot → Punkte', 'Eine Vorlage übernehmen'] },
  pointTry: { chapter: 2, why: 'Du siehst selbst, was deine Zuschauer erleben.', how: ['Chat & Bot → Punkte', '„500 Punkte an dich“', 'Im Chat !einlösen Name'], needs: 'pointReward', blockedBy: 'Erst eine Belohnung' },
  points10: { chapter: 2, why: 'Dein Chat nimmt die Punkte an.', how: ['Im Stream auf deine Belohnungen hinweisen', '!belohnungen zeigt sie'], needs: 'pointReward', blockedBy: 'Erst eine Belohnung' },
  channelReward: { chapter: 2, why: 'Kanalpunkte tun etwas im Stream, statt nur gezählt zu werden.', how: ['Chat & Bot → Kanalpunkte', 'Eine Vorlage übernehmen'], needs: 'twitch', blockedBy: 'Braucht Twitch' },
  leaderboard: { chapter: 2, why: 'Wer am meisten mitmacht, steht im Bild.', how: ['Overlays & Alerts → Bestenlisten', '„+ Bestenliste“'], needs: 'twitch', blockedBy: 'Braucht Twitch' },
  topics3: { chapter: 2, why: 'Das Glücksrad braucht etwas, woraus es wählt.', how: ['Im Stream → Glücksrad', 'Drei Themen eintragen'] },
  spin: { chapter: 2, why: 'Der Chat sieht, wie der Zufall entscheidet.', how: ['Im Stream → Glücksrad', '„Rad drehen“'], needs: 'topics3', blockedBy: 'Erst drei Themen' },
  alertSound: { chapter: 2, why: 'Ein Follow oder Raid fällt auf, auch wenn du gerade nicht hinschaust.', how: ['Overlays & Alerts → Alerts', 'Bei einem Anlass eine Tondatei wählen'] },
  discord: { chapter: 2, why: 'Dein Discord erfährt von selbst, wenn du live gehst.', how: ['Einstellungen → Verbindungen → Discord', 'Webhook-Adresse eintragen'] },
  moment: { chapter: 3, why: 'Aus guten Stellen wird später Content.', how: ['Im Stream → „Moment merken“, wenn etwas passiert'] },
  published: { chapter: 3, why: 'Dein Stream wächst über TikTok, Shorts und Reels.', how: ['Nach dem Stream → Content planen', 'Eine Karte bis „Veröffentlicht“ schieben'], needs: 'moment', blockedBy: 'Erst ein Moment' },
  entryCard: { chapter: 3, why: 'Die Zuschauer sehen, woran du in der Welt gerade schreibst.', how: ['Overlays & Alerts → Eintragskarte', '„In OBS anlegen“'], needs: 'obs', blockedBy: 'Braucht OBS' },
};

/** Chapters: a story through the tool, each with a badge. One may wait for another. */
export const CHAPTERS: ReadonlyArray<{ n: number; title: string; badge: string; after?: number }> = [
  { n: 1, title: 'Bereit für den ersten Stream', badge: 'Startklar' },
  { n: 2, title: 'Der Chat spielt mit', badge: 'Gastgeber' },
  { n: 3, title: 'Aus dem Stream wird Content', badge: 'Chronist', after: 1 },
];

/** The stages, by the EP they start at. Things, not people. */
export const STAGES: ReadonlyArray<{ name: string; from: number }> = [
  { name: 'Funke', from: 0 },
  { name: 'Lagerfeuer', from: 100 },
  { name: 'Leuchtfeuer', from: 250 },
  { name: 'Leuchtturm', from: 450 },
  { name: 'Sternbild', from: 700 },
];
