/**
 * Asks for a quest check, gathered: at most one every two seconds, however
 * many changes come in. No polling — only something that may finish a quest
 * asks (spec 2026-10-08-quests-design). The check itself is set at start.
 */
const GATHER_MS = 2000;
let runner: (() => Promise<unknown>) | null = null;
let pending: ReturnType<typeof setTimeout> | null = null;

export function setQuestRunner(run: () => Promise<unknown>): void {
  runner = run;
}

export function requestQuestCheck(): void {
  if (!runner || pending) return;
  pending = setTimeout(() => {
    pending = null;
    runner?.().catch((err) => console.error('[Quests] Check failed:', err));
  }, GATHER_MS);
  pending.unref?.();
}
