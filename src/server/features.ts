import { getDb } from './db/index';
import { isWorldbuilderAvailable } from './api/worldbuilder';
import {
  DEFAULT_FEATURES, FEATURE_KEYS, OWNER_CHANNEL, PERSONAL_FEATURES, isFeatureKey,
  commandVisible, overlayVisible, type FeatureKey,
} from '../shared/features';

/**
 * Which features the streamer chose ("Was dein Stream kann"). Stored as a JSON
 * list under the setting `features`. Without the setting everything is on —
 * an installation that predates the setup, and one whose streamer skipped it,
 * both see the whole app. DEFAULT_FEATURES is only what the setup's first
 * step ticks in advance. The personal features (Nils's own) count as off
 * unless the tool is connected to his Twitch channel — nobody else sees them.
 */

const FEATURES_KEY = 'features';
const SETUP_KEY = 'setup_done';
const WORLDBUILDER_KEY = 'worldbuilder_known';

function readSetting(key: string): string | null {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

function writeSetting(key: string, value: string): void {
  getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
}

export function setupDone(): boolean {
  return readSetting(SETUP_KEY) === '1';
}

export function markSetupDone(): void {
  writeSetting(SETUP_KEY, '1');
}

/**
 * The Worldbuilder is set up on this machine: it announces itself (its
 * connection file exists — only while it runs), or it has done so before.
 * Seen once, it is remembered, so closing it does not take !welt and the
 * Entry Card away. Asked on every chat command, so the file is read at most
 * every few seconds; the setting is a cheap read.
 */
let worldbuilderSeen: { at: number; value: boolean } | null = null;
export function worldbuilderInstalled(): boolean {
  const now = Date.now();
  if (!worldbuilderSeen || now - worldbuilderSeen.at > 5_000) {
    worldbuilderSeen = { at: now, value: isWorldbuilderAvailable() };
    if (worldbuilderSeen.value && readSetting(WORLDBUILDER_KEY) !== '1') writeSetting(WORLDBUILDER_KEY, '1');
  }
  return worldbuilderSeen.value || readSetting(WORLDBUILDER_KEY) === '1';
}

/** Forget the cached answer — for tests that create or remove the file. */
export function forgetWorldbuilder(): void {
  worldbuilderSeen = null;
}

/** The tool is connected to Nils's Twitch channel — his own features exist. */
export function isOwner(): boolean {
  const raw = readSetting('twitch_config');
  if (!raw) return false;
  try {
    const { channel } = JSON.parse(raw) as { channel?: string };
    return channel?.trim().toLowerCase() === OWNER_CHANNEL;
  } catch {
    return false;
  }
}

const withoutPersonal = (list: FeatureKey[]): FeatureKey[] =>
  isOwner() ? list : list.filter((k) => !PERSONAL_FEATURES.includes(k));

export function getFeatures(): FeatureKey[] {
  const raw = readSetting(FEATURES_KEY);
  if (raw === null) return withoutPersonal([...FEATURE_KEYS]);
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return withoutPersonal([...DEFAULT_FEATURES]);
    return withoutPersonal(parsed.filter(isFeatureKey));
  } catch {
    return withoutPersonal([...DEFAULT_FEATURES]);
  }
}

export function saveFeatures(input: unknown): { features: FeatureKey[] } | { error: string } {
  if (!Array.isArray(input)) return { error: 'features must be a list of feature keys' };
  const unknown = input.filter((k) => !isFeatureKey(k));
  if (unknown.length) return { error: `unknown feature: ${unknown.map(String).join(', ')}` };
  const features = withoutPersonal([...new Set(input as FeatureKey[])]);
  writeSetting(FEATURES_KEY, JSON.stringify(features));
  return { features };
}

export const featureSet = (): Set<string> => new Set<string>(getFeatures());
export const featureOn = (key: FeatureKey): boolean => getFeatures().includes(key);
/** A built-in command answers only while a feature that claims it is on; unclaimed ones always do. */
export const commandEnabled = (commandKey: string): boolean => commandVisible(featureSet(), commandKey);
export const overlayEnabled = (overlay: string): boolean => overlayVisible(featureSet(), overlay);
