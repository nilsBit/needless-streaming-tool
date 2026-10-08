import { getDb } from '../db/index';
import { broadcast } from '../websocket/index';
import { featureOn } from '../features';
import { getOverlayScenes, getObsStatus } from '../obs/index';
import { CHAPTERS, GUIDE, QUESTS, STAGES, type Quest, type QuestContext } from './catalog';
import { markQuestFlag } from './flags';
import { READY_XP, readyCount } from '../overlays/readiness';

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
  chapter: number;
  why: string;
  how: string[];
  /** Waits for another quest; shown with this word and never proposed next. */
  blockedBy: string | null;
}

export interface ChapterView {
  n: number;
  title: string;
  badge: string;
  /** Waits for the chapter `after` to be done. */
  locked: boolean;
  after: number | null;
  done: number;
  total: number;
  complete: boolean;
  quests: QuestView[];
}

export interface Stage { level: number; name: string; xp: number; from: number; next: { name: string; from: number } | null }

export interface QuestOverview {
  stage: Stage;
  /** True until the streamer has chosen what the stream can do. */
  choosing: boolean;
  /** Whether the short intro to quests was shown once. */
  introSeen: boolean;
  /** Live on Twitch: celebrations stay quiet. */
  onAir: boolean;
  next: QuestView | null;
  chapters: ChapterView[];
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
    const chaptersBefore = new Set(chapterViews(have).filter((c) => c.complete).map((c) => c.n));
    const overview = questOverview();
    const finished = overview.chapters.filter((c) => c.complete && !chaptersBefore.has(c.n));
    newly.forEach((q, i) => {
      const last = i === newly.length - 1;
      broadcast('quest-completed', {
        key: q.key, title: q.title, xp: q.xp, stage: overview.stage,
        // The stage and the chapters go with the last of a batch, so they are celebrated once.
        levelUp: last && overview.stage.level > before,
        chapter: last && finished.length ? { n: finished[0].n, title: finished[0].title, badge: finished[0].badge } : null,
        onAir: overview.onAir,
      });
    });
  }
  return newly.map((q) => q.key);
}

/** EP from the quests done, plus READY_XP for every overlay made ready. */
function xpOf(done: Map<string, string>): number {
  return QUESTS.filter((q) => done.has(q.key) && visible(q)).reduce((sum, q) => sum + q.xp, 0) + READY_XP * readyCount();
}

/** The stage as it stands now. */
export function currentStage(): Stage {
  return stageFor(xpOf(completions()));
}

function view(q: Quest, have: Map<string, string>): QuestView {
  const g = GUIDE[q.key];
  const waits = !!g?.needs && !have.has(g.needs) && !have.has(q.key);
  return {
    key: q.key, group: q.group, title: q.title, text: q.text, xp: q.xp, goTo: q.goTo,
    completedAt: have.get(q.key) ?? null,
    chapter: g?.chapter ?? 1, why: g?.why ?? q.text, how: g?.how ?? [], blockedBy: waits ? g?.blockedBy ?? 'Erst eine andere Quest' : null,
  };
}

function chapterViews(have: Map<string, string>): ChapterView[] {
  const shown = QUESTS.filter(visible);
  const all = CHAPTERS.map((c) => {
    const quests = shown.filter((q) => (GUIDE[q.key]?.chapter ?? 1) === c.n).map((q) => view(q, have));
    const done = quests.filter((q) => q.completedAt).length;
    return { n: c.n, title: c.title, badge: c.badge, after: c.after ?? null, locked: false, done, total: quests.length, complete: quests.length > 0 && done === quests.length, quests };
  }).filter((c) => c.total > 0);
  for (const c of all) c.locked = c.after !== null && !(all.find((x) => x.n === c.after)?.complete ?? true);
  return all;
}

const setting = (key: string): string | null =>
  (getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined)?.value ?? null;

export function markIntroSeen(): void {
  getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('quests_intro_seen', '1');
}

export function questOverview(): QuestOverview {
  const have = completions();
  const choosing = !have.has('choose');
  const chapters = chapterViews(have).map((c) => (choosing ? { ...c, quests: c.quests.filter((q) => q.key === 'choose') } : c)).filter((c) => c.quests.length > 0);
  const shown = chapters.flatMap((c) => c.quests);
  const open = shown.filter((q) => !q.completedAt);
  const done = shown.filter((q) => q.completedAt).sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
  // Next: the first open quest one can do now, in an unlocked chapter.
  const next = chapters.filter((c) => !c.locked).flatMap((c) => c.quests).find((q) => !q.completedAt && !q.blockedBy) ?? null;
  const onAir = (getDb().prepare('SELECT is_live FROM stream_state WHERE id = 1').get() as { is_live: number } | undefined)?.is_live === 1;
  return { stage: stageFor(xpOf(have)), choosing, introSeen: setting('quests_intro_seen') === '1', onAir, next, chapters, open, done };
}
