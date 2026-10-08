import { getDb } from '../db/index';
import { broadcast } from '../websocket/index';
import { featureOn } from '../features';
import { getOverlayScenes, getObsStatus } from '../obs/index';
import { QUESTS, STAGES, type Quest, type QuestContext } from './catalog';
import { markQuestFlag } from './flags';

/**
 * Checks the quests against the state, keeps what is newly done and tells
 * the app (spec 2026-10-08-quests-design). Done stays done. Only quests of
 * features that are on show and count; until "choose" is done, only it shows.
 */

export interface QuestView {
  key: string;
  group: Quest['group'];
  title: string;
  text: string;
  xp: number;
  goTo: Quest['goTo'];
  completedAt: string | null;
}

export interface Stage { level: number; name: string; xp: number; from: number; next: { name: string; from: number } | null }

export interface QuestOverview {
  stage: Stage;
  /** True until the streamer has chosen what the stream can do. */
  choosing: boolean;
  next: QuestView | null;
  open: QuestView[];
  done: QuestView[];
}

const INITIALIZED = 'quests_initialized';

function completions(): Map<string, string> {
  const rows = getDb().prepare('SELECT key, completed_at FROM quest_progress').all() as Array<{ key: string; completed_at: string }>;
  return new Map(rows.map((r) => [r.key, r.completed_at]));
}

const visible = (q: Quest) => q.feature === null || featureOn(q.feature);

export function stageFor(xp: number): Stage {
  let i = 0;
  while (i + 1 < STAGES.length && xp >= STAGES[i + 1].from) i += 1;
  const next = STAGES[i + 1] ?? null;
  return { level: i + 1, name: STAGES[i].name, xp, from: STAGES[i].from, next: next ? { name: next.name, from: next.from } : null };
}

async function context(): Promise<QuestContext> {
  if (!getObsStatus().connected) return { placedOverlays: null };
  const { byOverlay } = await getOverlayScenes();
  const placed = new Set(Object.keys(byOverlay));
  if (placed.size > 0) markQuestFlag('overlay');
  return { placedOverlays: placed };
}

/**
 * The check. The very first one books what is done already without a word —
 * an install that was set up before the quests would otherwise celebrate
 * eight quests at once.
 */
export async function evaluateQuests(): Promise<string[]> {
  const db = getDb();
  const have = completions();
  const ctx = await context();
  const quiet = (db.prepare('SELECT value FROM settings WHERE key = ?').get(INITIALIZED) as { value: string } | undefined)?.value !== '1';
  const choosingDone = have.has('choose') || QUESTS[0].done(ctx);
  const newly: Quest[] = [];
  for (const q of QUESTS) {
    if (have.has(q.key) || !visible(q)) continue;
    if (q.key !== 'choose' && !choosingDone) continue;
    if (!q.done(ctx)) continue;
    db.prepare('INSERT OR IGNORE INTO quest_progress (key, completed_at) VALUES (?, CURRENT_TIMESTAMP)').run(q.key);
    newly.push(q);
  }
  if (quiet) {
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(INITIALIZED, '1');
    return newly.map((q) => q.key);
  }
  if (newly.length) {
    const before = stageFor(xpOf(have)).level;
    const overview = questOverview();
    for (const q of newly) {
      broadcast('quest-completed', { key: q.key, title: q.title, xp: q.xp, stage: overview.stage, levelUp: overview.stage.level > before });
    }
  }
  return newly.map((q) => q.key);
}

function xpOf(done: Map<string, string>): number {
  return QUESTS.filter((q) => done.has(q.key) && visible(q)).reduce((sum, q) => sum + q.xp, 0);
}

export function questOverview(): QuestOverview {
  const have = completions();
  const view = (q: Quest): QuestView => ({ key: q.key, group: q.group, title: q.title, text: q.text, xp: q.xp, goTo: q.goTo, completedAt: have.get(q.key) ?? null });
  const choosing = !have.has('choose');
  const shown = QUESTS.filter(visible).filter((q) => !choosing || q.key === 'choose');
  const open = shown.filter((q) => !have.has(q.key)).map(view);
  const done = shown.filter((q) => have.has(q.key)).map(view)
    .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
  return { stage: stageFor(xpOf(have)), choosing, next: open[0] ?? null, open, done };
}
