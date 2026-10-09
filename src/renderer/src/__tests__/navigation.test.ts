import { describe, it, expect } from 'vitest';
import { FEATURES, FEATURE_KEYS } from '../../../shared/features';
import { AREAS, PANEL_LABELS, findArea, findSubTab, visibleNavigation } from '../navigation';
import { PANEL_KEYS } from '../panelKeys';

// The one renderer test, agreed in the navigation spec: navigation.ts is pure
// data, and the point of the rebuild is that everything has exactly one place.

const OLD_NAMES = [
  'Settings', 'Progress Tracker', 'Clip Moments', 'Reward Stats', 'Now Playing',
  'Challenge', 'Milestones', 'OBS Scenes', 'Live', 'Produktion', 'Projekt',
  'Features', 'App', 'Daten & API', 'Erklär-Commands', 'Chat Commands', 'Start',
];

function allLabels(): string[] {
  const labels: string[] = [];
  for (const area of AREAS) {
    labels.push(area.label);
    for (const tab of area.subTabs) labels.push(tab.label);
  }
  labels.push(...Object.values(PANEL_LABELS));
  return labels;
}

describe('navigation', () => {
  it('gives every panel exactly one place', () => {
    const seen = new Map<string, number>();
    for (const area of AREAS) {
      for (const tab of area.subTabs) {
        for (const panel of tab.panels) seen.set(panel, (seen.get(panel) ?? 0) + 1);
      }
    }
    for (const key of PANEL_KEYS) expect(seen.get(key), `panel "${key}" has no place or several`).toBe(1);
    for (const key of seen.keys()) expect(PANEL_KEYS as readonly string[], `unknown panel "${key}"`).toContain(key);
  });

  it('has a German label for every panel', () => {
    for (const key of PANEL_KEYS) expect(PANEL_LABELS[key], `label for "${key}"`).toBeTruthy();
  });

  it('has content in every sub tab', () => {
    for (const area of AREAS) {
      expect(area.subTabs.length, `area "${area.key}" has no sub tab`).toBeGreaterThan(0);
      for (const tab of area.subTabs) {
        expect(tab.panels.length, `sub tab "${area.key}/${tab.key}" is empty`).toBeGreaterThan(0);
      }
    }
  });

  it('uses the new names, not the old ones', () => {
    const labels = allLabels();
    for (const old of OLD_NAMES) expect(labels, `"${old}" is still a label`).not.toContain(old);
    for (const label of labels) expect(label, `label "${label}" carries an emoji or symbol`).toMatch(/^[\p{L}\p{N} &!'’„“.·-]+$/u);
  });

  it('opens on Im Stream and keeps Einstellungen and Hilfe below the divider', () => {
    expect(AREAS[0].key).toBe('stream');
    for (const area of AREAS) {
      const secondary = area.key === 'settings' || area.key === 'help';
      expect(area.group).toBe(secondary ? 'secondary' : 'main');
    }
  });

  it('falls back to the first area and sub tab for unknown keys', () => {
    expect(findArea('nope').key).toBe('stream');
    expect(findArea(null).key).toBe('stream');
    // A stored 'start' from the first build of the shell lands on Im Stream too.
    expect(findArea('start').key).toBe('stream');
    const overlays = findArea('overlays');
    // Alerts was a sub tab until 08.10.; it is an overlay's workshop now.
    expect(findSubTab(overlays, 'alerts').key).toBe('overlays');
    expect(findSubTab(overlays, 'nope').key).toBe(overlays.subTabs[0].key);
    expect(findSubTab(overlays, undefined).key).toBe(overlays.subTabs[0].key);
  });

  it('gives every area a sentence and keywords', () => {
    for (const area of AREAS) {
      expect(area.sentence.length, `area "${area.key}" has no sentence`).toBeGreaterThan(10);
      expect(area.keywords.length, `area "${area.key}" has no keywords`).toBeGreaterThan(0);
    }
  });

  it('hides what the chosen features do not need, and never Quests, Einstellungen or Hilfe', () => {
    // The setup's defaults: Chat im Stream, Alerts, Momente merken.
    const few = visibleNavigation(new Set(['chat', 'alerts', 'momente']));
    expect(few.map((a) => a.key)).toEqual(['stream', 'chat', 'overlays', 'after', 'quests', 'settings', 'help']);
    // Im Stream keeps its place for the moment card, with no card panel left.
    expect(few.find((a) => a.key === 'stream')!.subTabs[0].panels).toEqual([]);
    expect(few.find((a) => a.key === 'overlays')!.subTabs.map((t) => t.key)).toEqual(['overlays']);
    expect(few.find((a) => a.key === 'after')!.subTabs.map((t) => t.key)).toEqual(['auswertung']);
    expect(few.find((a) => a.key === 'after')!.subTabs[0].panels).toEqual(['report']);

    // Nothing chosen: only what belongs to no feature — the quests too, whose first is choosing.
    const none = visibleNavigation(new Set());
    expect(none.map((a) => a.key)).toEqual(['chat', 'overlays', 'after', 'quests', 'settings', 'help']);

    // Everything chosen: the navigation as written.
    expect(visibleNavigation(new Set(FEATURE_KEYS))).toEqual(AREAS);
  });

  it('claims only panels that exist, each overlay and hotkey once', () => {
    const overlays = FEATURES.flatMap((f) => f.overlays);
    const hotkeys = FEATURES.flatMap((f) => f.hotkeys);
    for (const f of FEATURES) for (const p of f.panels) expect(PANEL_KEYS as readonly string[], `feature "${f.key}" claims unknown panel "${p}"`).toContain(p);
    expect(new Set(overlays).size).toBe(overlays.length);
    expect(new Set(hotkeys).size).toBe(hotkeys.length);
  });
});
