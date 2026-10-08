import { useEffect } from 'react';

// Starting a quest (08.10.): it becomes the active one, the app goes where it
// is done, and there either the quest's path opens or the spot to click is
// lit up. Pages that own a path pick their request up when they mount, or
// at once when they are mounted already.

const ACTIVE_KEY = 'nst.activeQuest';

/** Quests done on a Quest-Pfad, and the path that does them. */
export const PATH_OF: Record<string, string> = {
  command: 'command', commands5: 'command',
  pointReward: 'pointReward', channelReward: 'channelReward',
  leaderboard: 'leaderboard',
  overlay: 'overlay', entryCard: 'overlay',
};

export function getActiveQuest(): string | null {
  try { return localStorage.getItem(ACTIVE_KEY); } catch { return null; }
}

export function setActiveQuest(key: string | null): void {
  try {
    if (key) localStorage.setItem(ACTIVE_KEY, key); else localStorage.removeItem(ACTIVE_KEY);
  } catch { /* the active quest then lasts until reload */ }
  window.dispatchEvent(new CustomEvent('nst-active-quest', { detail: key }));
}

let pendingPath: string | null = null;
let pendingSpot: string | null = null;

/** Ask the page that owns the path to open it. */
function requestPath(questKey: string): void {
  pendingPath = questKey;
  window.dispatchEvent(new CustomEvent('nst-quest-path', { detail: questKey }));
}

/** Ask the coach to light up the spot to click. */
function requestSpot(questKey: string): void {
  pendingSpot = questKey;
  window.dispatchEvent(new CustomEvent('nst-quest-spot', { detail: questKey }));
}

export function takeSpot(): string | null {
  const k = pendingSpot;
  pendingSpot = null;
  return k;
}

export function startQuest(questKey: string, goTo: { area: string; subTab?: string }, go: (t: { area: string; subTab?: string | null }) => void): void {
  setActiveQuest(questKey);
  go(goTo);
  // After the page has rendered.
  setTimeout(() => (PATH_OF[questKey] ? requestPath(questKey) : requestSpot(questKey)), 50);
}

/**
 * A page that owns a path: opens it when one of its quests is started —
 * right away if the request came before the page mounted.
 */
export function useQuestPath(paths: string[], open: (questKey: string) => void): void {
  useEffect(() => {
    const mine = (k: string | null) => !!k && paths.includes(PATH_OF[k] ?? '');
    if (mine(pendingPath)) { const k = pendingPath!; pendingPath = null; open(k); }
    const on = (e: Event) => {
      const k = (e as CustomEvent<string>).detail;
      if (mine(k)) { pendingPath = null; open(k); }
    };
    window.addEventListener('nst-quest-path', on);
    return () => window.removeEventListener('nst-quest-path', on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
