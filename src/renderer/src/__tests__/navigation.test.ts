import { describe, it, expect } from 'vitest';
import { AREAS, PANEL_LABELS, findArea, findSubTab } from '../navigation';
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
    expect(findSubTab(overlays, 'alerts').key).toBe('alerts');
    expect(findSubTab(overlays, 'nope').key).toBe(overlays.subTabs[0].key);
    expect(findSubTab(overlays, undefined).key).toBe(overlays.subTabs[0].key);
  });

  it('gives every area a sentence and keywords', () => {
    for (const area of AREAS) {
      expect(area.sentence.length, `area "${area.key}" has no sentence`).toBeGreaterThan(10);
      expect(area.keywords.length, `area "${area.key}" has no keywords`).toBeGreaterThan(0);
    }
  });
});
