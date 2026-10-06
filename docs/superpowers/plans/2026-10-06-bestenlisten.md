# Mehrere Bestenlisten — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single flex ranking with named Bestenlisten, each bound to one Twitch channel-point reward by its id, counting redemptions directly.

**Architecture:** A new table `leaderboards` (key, title, reward id, reward title) sits next to the existing `reward_stats` counts; the list key is the `reward_type` of its counts. A new server module `src/server/leaderboards.ts` owns the lists, the counting on redemption and the `!stats` wording; `src/server/api/leaderboards.ts` exposes them over HTTP. The two overlays keep their `?type=` parameter; the catalog lists them once per Bestenliste. The flex unlock flow (`flex_credits`, `!flex`, `src/server/flex.ts`) is removed by a schema migration that turns the saved flex reward into the first list.

**Tech Stack:** TypeScript, Express, better-sqlite3, Vitest (run through Electron: `npm test`), React (Vite), supertest.

**Spec:** `docs/superpowers/specs/2026-10-06-bestenlisten-design.md`

## Global Constraints

- Code and commit messages in English; every string a streamer or viewer reads in German (CLAUDE.md).
- Tests at the HTTP seam with `initDatabase(':memory:')` + `createApp()` + supertest; pure functions may be tested directly the way `src/server/__tests__/shoutout.test.ts` does. No mocks of our own modules; nothing external contacted.
- `createApp()` stays free of connections; Twitch is only reached from `startServer()` / the bot.
- Run `npm test`, `npm run typecheck`, `npm run lint` before every commit. All three terminate on their own.
- A dev server is usually running (port 4000). Never start a second one, never kill it. Group file edits into few rounds — nodemon restarts Electron on every save under `src/main` and `src/server`.
- `npm run build` and `electron-builder` stay off-limits.
- Vocabulary from `CONTEXT.md`: **Bestenliste** (ranking of one reward), **Belohnung** (Twitch channel-point reward), **Zuschauer** (viewer, stored as Twitch login in lower case).
- List titles: 1–45 characters. Reward ids: 1–100 characters. Reward titles: 1–45 characters (Twitch's own limit).
- Overlay addresses: `http://<host>/overlay/reward-leaderboard/index.html?type=<key>` and `.../reward-rankchange/index.html?type=<key>`. `type=all` no longer exists.

## Review Focus

1. **Two titles that slug to the same key** („Flex!" and „flex") — the second must be refused with a clear 400, not silently overwrite. Pinned in Task 1.
2. **Umlauts in a title** („Angeben für Könner") — the key must be plain `a–z0–9-` (`angeben-fuer-koenner`), stable, and usable in a URL. Pinned in Task 1.
3. **A viewer's login in another case** (Twitch sends `user_login` lower case but `user_name` as typed) — counts must land under the lower-case login, one row per viewer. Pinned in Task 2.
4. **An overlay still in OBS for a deleted list** — `/public/reward-stats/top?type=<gone>` must answer 200 with an empty leaderboard and `title: null`, never 500. Pinned in Task 2.
5. **The migration on a fresh database or run on a database that never had a flex reward** — no list, no crash, `flex_credits` gone, no leftover settings. Pinned in Task 4.

---

### Task 1: The lists — table, module, HTTP routes

**Files:**
- Modify: `src/server/db/schema.ts` (add table; bump `SCHEMA_VERSION` to 28 — the migration itself is Task 4, the bump is harmless on a fresh database because `runMigrations` guards every block)
- Create: `src/server/leaderboards.ts`
- Create: `src/server/api/leaderboards.ts`
- Modify: `src/server/index.ts:157` (mount the router)
- Test: `src/server/__tests__/leaderboards.test.ts`

**Interfaces:**
- Consumes: `getDb()` from `src/server/db/index.ts`; `checkAndBroadcast(type)` from `src/server/reward-leaderboard.ts`.
- Produces:
  ```ts
  export interface Leaderboard { key: string; title: string; reward_id: string; reward_title: string; viewers: number }
  export interface LeaderboardRow { user_name: string; count: number; last_redeemed_at: string }
  export function keyFromTitle(title: string): string
  export function listLeaderboards(): Leaderboard[]
  export function getLeaderboard(key: string): Leaderboard | null
  export function leaderboardForReward(rewardId: string): Leaderboard | null
  export function createLeaderboard(input: unknown): { leaderboard: Leaderboard } | { error: string }
  export function updateLeaderboard(key: string, input: unknown): { leaderboard: Leaderboard } | { error: string } | null
  export function deleteLeaderboard(key: string): { removed: number } | null
  export function leaderboardBoard(key: string): LeaderboardRow[] | null
  ```
  HTTP: `GET/POST /api/leaderboards`, `PATCH/DELETE /api/leaderboards/:key`, `GET /api/leaderboards/:key/board`.

- [ ] **Step 1: Add the table to the schema**

In `src/server/db/schema.ts`, change line 1 to `export const SCHEMA_VERSION = 28;` and add, directly after the `reward_stats` table (around line 148):

```sql
CREATE TABLE IF NOT EXISTS leaderboards (
  key          TEXT PRIMARY KEY,
  title        TEXT NOT NULL,
  reward_id    TEXT NOT NULL UNIQUE,
  reward_title TEXT NOT NULL,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

Leave `flex_credits` in the schema for now; Task 4 removes it together with the migration.

- [ ] **Step 2: Write the failing tests**

Create `src/server/__tests__/leaderboards.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { initDatabase } from '../db/index';
import { generateApiToken } from '../auth-token';
import { createApp } from '../index';
import { keyFromTitle } from '../leaderboards';

/**
 * A Bestenliste hangs on one Twitch reward and ranks who redeemed it most.
 * The streamer names it; the key is derived once and stays, so overlay
 * addresses and counts survive a rename.
 */
describe('Bestenlisten', () => {
  let app: Express;
  let token: string;
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const flex = { title: 'Flex', reward: { id: 'rw-1', title: 'Flex!' } };

  beforeEach(() => {
    initDatabase(':memory:');
    token = generateApiToken();
    app = createApp();
  });

  it('starts empty and lists what the streamer creates', async () => {
    expect((await request(app).get('/api/leaderboards').set(auth()).expect(200)).body).toEqual([]);
    const created = await request(app).post('/api/leaderboards').set(auth()).send(flex).expect(201);
    expect(created.body.leaderboard).toEqual({ key: 'flex', title: 'Flex', reward_id: 'rw-1', reward_title: 'Flex!', viewers: 0 });
    expect((await request(app).get('/api/leaderboards').set(auth()).expect(200)).body).toEqual([created.body.leaderboard]);
  });

  it('derives a plain key from the title', () => {
    expect(keyFromTitle('Flex')).toBe('flex');
    expect(keyFromTitle('Angeben für Könner!')).toBe('angeben-fuer-koenner');
    expect(keyFromTitle('  Große   Pause ')).toBe('grosse-pause');
    expect(keyFromTitle('!!!')).toBe('liste');
  });

  it('refuses a second list on the same reward, and a title whose key is taken', async () => {
    await request(app).post('/api/leaderboards').set(auth()).send(flex).expect(201);
    const sameReward = await request(app).post('/api/leaderboards').set(auth()).send({ title: 'Noch mal', reward: { id: 'rw-1', title: 'Flex!' } }).expect(400);
    expect(sameReward.body.error).toMatch(/reward/);
    const sameKey = await request(app).post('/api/leaderboards').set(auth()).send({ title: 'flex!', reward: { id: 'rw-2', title: 'Anders' } }).expect(400);
    expect(sameKey.body.error).toMatch(/name/);
  });

  it('refuses what is no list', async () => {
    await request(app).post('/api/leaderboards').set(auth()).send({ title: '', reward: { id: 'rw-1', title: 'Flex!' } }).expect(400);
    await request(app).post('/api/leaderboards').set(auth()).send({ title: 'Flex' }).expect(400);
    await request(app).post('/api/leaderboards').set(auth()).send({ title: 'x'.repeat(46), reward: { id: 'rw-1', title: 'Flex!' } }).expect(400);
    await request(app).post('/api/leaderboards').set(auth()).send({ title: 'Flex', reward: { id: '', title: 'Flex!' } }).expect(400);
  });

  it('renames a list without touching its key, and lets the reward change', async () => {
    await request(app).post('/api/leaderboards').set(auth()).send(flex).expect(201);
    const renamed = await request(app).patch('/api/leaderboards/flex').set(auth()).send({ title: 'Angeben' }).expect(200);
    expect(renamed.body.leaderboard).toMatchObject({ key: 'flex', title: 'Angeben', reward_id: 'rw-1' });
    const rechosen = await request(app).patch('/api/leaderboards/flex').set(auth()).send({ reward: { id: 'rw-9', title: 'Neu' } }).expect(200);
    expect(rechosen.body.leaderboard).toMatchObject({ key: 'flex', title: 'Angeben', reward_id: 'rw-9', reward_title: 'Neu' });
    await request(app).patch('/api/leaderboards/nope').set(auth()).send({ title: 'x' }).expect(404);
    await request(app).patch('/api/leaderboards/flex').set(auth()).send({ title: '' }).expect(400);
  });

  it('shows the board of a list and deletes the list with its counts', async () => {
    await request(app).post('/api/leaderboards').set(auth()).send(flex).expect(201);
    await request(app).post('/api/reward-stats').set(auth()).send({ user_name: 'Kartograph', reward_type: 'flex', count: 3 }).expect(200);
    await request(app).post('/api/reward-stats').set(auth()).send({ user_name: 'tintenfass', reward_type: 'flex', count: 5 }).expect(200);

    const board = (await request(app).get('/api/leaderboards/flex/board').set(auth()).expect(200)).body;
    expect(board.map((r: { user_name: string; count: number }) => [r.user_name, r.count])).toEqual([['tintenfass', 5], ['kartograph', 3]]);
    expect((await request(app).get('/api/leaderboards').set(auth()).expect(200)).body[0].viewers).toBe(2);
    await request(app).get('/api/leaderboards/nope/board').set(auth()).expect(404);

    expect((await request(app).delete('/api/leaderboards/flex').set(auth()).expect(200)).body).toEqual({ ok: true, removed: 2 });
    expect((await request(app).get('/api/leaderboards').set(auth()).expect(200)).body).toEqual([]);
    expect((await request(app).get('/api/reward-stats').set(auth()).expect(200)).body).toEqual([]);
    await request(app).delete('/api/leaderboards/flex').set(auth()).expect(404);
  });
});
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `npm test -- src/server/__tests__/leaderboards.test.ts`
Expected: FAIL — `Cannot find module '../leaderboards'`.

- [ ] **Step 4: Write the module**

Create `src/server/leaderboards.ts`:

```ts
import { getDb } from './db/index';
import { checkAndBroadcast } from './reward-leaderboard';

/**
 * A Bestenliste hangs on one Twitch channel-point reward and ranks who
 * redeemed it most (2026-10-06). The streamer names it; the key is derived
 * from the title once and never changes, so overlay addresses (`?type=key`)
 * and the counts in `reward_stats` (whose `reward_type` is the key) survive
 * a rename. The reward is kept by its Twitch id — renaming it in Twitch
 * changes nothing, a deleted one shows up as such in the app.
 */

export interface Leaderboard { key: string; title: string; reward_id: string; reward_title: string; viewers: number }
export interface LeaderboardRow { user_name: string; count: number; last_redeemed_at: string }
interface Reward { id: string; title: string }

const UMLAUTS: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' };

/** `Angeben für Könner!` → `angeben-fuer-koenner`; nothing usable → `liste`. */
export function keyFromTitle(title: string): string {
  const key = title
    .toLowerCase()
    .replace(/[äöüß]/g, (c) => UMLAUTS[c])
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  return key || 'liste';
}

const SELECT = `
  SELECT l.key, l.title, l.reward_id, l.reward_title,
         (SELECT COUNT(*) FROM reward_stats s WHERE s.reward_type = l.key) AS viewers
  FROM leaderboards l`;

export function listLeaderboards(): Leaderboard[] {
  return getDb().prepare(`${SELECT} ORDER BY l.created_at, l.key`).all() as Leaderboard[];
}

export function getLeaderboard(key: string): Leaderboard | null {
  return (getDb().prepare(`${SELECT} WHERE l.key = ?`).get(key) as Leaderboard | undefined) ?? null;
}

export function leaderboardForReward(rewardId: string): Leaderboard | null {
  return (getDb().prepare(`${SELECT} WHERE l.reward_id = ?`).get(rewardId) as Leaderboard | undefined) ?? null;
}

function cleanTitle(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const title = value.trim();
  return title && title.length <= 45 ? title : null;
}

function cleanReward(value: unknown): Reward | null {
  const { id, title } = (value ?? {}) as { id?: unknown; title?: unknown };
  if (typeof id !== 'string' || !id.trim() || id.trim().length > 100) return null;
  const cleaned = cleanTitle(title);
  return cleaned ? { id: id.trim(), title: cleaned } : null;
}

export function createLeaderboard(input: unknown): { leaderboard: Leaderboard } | { error: string } {
  const { title: rawTitle, reward: rawReward } = (input ?? {}) as { title?: unknown; reward?: unknown };
  const title = cleanTitle(rawTitle);
  if (!title) return { error: 'title must be 1 to 45 characters' };
  const reward = cleanReward(rawReward);
  if (!reward) return { error: 'reward must carry the Twitch id and the name of the reward' };
  const key = keyFromTitle(title);
  const db = getDb();
  if (getLeaderboard(key)) return { error: `a list with this name exists already (${key})` };
  if (leaderboardForReward(reward.id)) return { error: 'this reward has a list already' };
  db.prepare('INSERT INTO leaderboards (key, title, reward_id, reward_title) VALUES (?, ?, ?, ?)').run(key, title, reward.id, reward.title);
  return { leaderboard: getLeaderboard(key)! };
}

/** Rename, or choose another reward; null when there is no such list. */
export function updateLeaderboard(key: string, input: unknown): { leaderboard: Leaderboard } | { error: string } | null {
  const current = getLeaderboard(key);
  if (!current) return null;
  const { title: rawTitle, reward: rawReward } = (input ?? {}) as { title?: unknown; reward?: unknown };
  const db = getDb();
  if (rawTitle !== undefined) {
    const title = cleanTitle(rawTitle);
    if (!title) return { error: 'title must be 1 to 45 characters' };
    db.prepare('UPDATE leaderboards SET title = ? WHERE key = ?').run(title, key);
  }
  if (rawReward !== undefined) {
    const reward = cleanReward(rawReward);
    if (!reward) return { error: 'reward must carry the Twitch id and the name of the reward' };
    const taken = leaderboardForReward(reward.id);
    if (taken && taken.key !== key) return { error: 'this reward has a list already' };
    db.prepare('UPDATE leaderboards SET reward_id = ?, reward_title = ? WHERE key = ?').run(reward.id, reward.title, key);
  }
  return { leaderboard: getLeaderboard(key)! };
}

/** The list and every count under it; null when there is no such list. */
export function deleteLeaderboard(key: string): { removed: number } | null {
  if (!getLeaderboard(key)) return null;
  const db = getDb();
  const removed = db.transaction((): number => {
    const n = db.prepare('DELETE FROM reward_stats WHERE reward_type = ?').run(key).changes;
    db.prepare('DELETE FROM leaderboards WHERE key = ?').run(key);
    return n;
  })();
  checkAndBroadcast(key);
  return { removed };
}

/** Everyone counted in the list, most first — the order the overlay shows. */
export function leaderboardBoard(key: string): LeaderboardRow[] | null {
  if (!getLeaderboard(key)) return null;
  return getDb().prepare(
    'SELECT user_name, count, last_redeemed_at FROM reward_stats WHERE reward_type = ? ORDER BY count DESC, user_name ASC'
  ).all(key) as LeaderboardRow[];
}
```

Create `src/server/api/leaderboards.ts`:

```ts
import { Router } from 'express';
import { createLeaderboard, deleteLeaderboard, leaderboardBoard, listLeaderboards, updateLeaderboard } from '../leaderboards';

const router = Router();

router.get('/', (_req, res) => {
  res.json(listLeaderboards());
});

router.post('/', (req, res) => {
  const result = createLeaderboard(req.body);
  if ('error' in result) { res.status(400).json(result); return; }
  res.status(201).json(result);
});

router.patch('/:key', (req, res) => {
  const result = updateLeaderboard(req.params.key, req.body);
  if (result === null) { res.status(404).json({ error: 'no such list' }); return; }
  if ('error' in result) { res.status(400).json(result); return; }
  res.json(result);
});

router.delete('/:key', (req, res) => {
  const result = deleteLeaderboard(req.params.key);
  if (result === null) { res.status(404).json({ error: 'no such list' }); return; }
  res.json({ ok: true, ...result });
});

router.get('/:key/board', (req, res) => {
  const rows = leaderboardBoard(req.params.key);
  if (rows === null) { res.status(404).json({ error: 'no such list' }); return; }
  res.json(rows);
});

export default router;
```

In `src/server/index.ts`, next to the import on line 29 add `import leaderboardsRouter from './api/leaderboards';` and next to line 157 add `app.use('/api/leaderboards', leaderboardsRouter);` (same place, same auth as `/api/reward-stats`).

- [ ] **Step 5: Run the tests to see them pass**

Run: `npm test -- src/server/__tests__/leaderboards.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 6: Run the whole suite, typecheck, lint**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all green; lint shows only the 7 pre-existing warnings in other files.

- [ ] **Step 7: Commit**

```bash
git add src/server/db/schema.ts src/server/leaderboards.ts src/server/api/leaderboards.ts src/server/index.ts src/server/__tests__/leaderboards.test.ts
git commit -m "feat(leaderboards): named Bestenlisten, each on one Twitch reward"
```

---

### Task 2: Counting a redemption, and the public top endpoint

**Files:**
- Modify: `src/server/leaderboards.ts` (add `countRedemption`)
- Modify: `src/server/reward-leaderboard.ts:17-44, 99-120` (no more `all`; init from the lists)
- Modify: `src/server/bot/eventsub.ts:7, 72-101` (count by reward id, say it in chat)
- Modify: `src/server/index.ts:240-244` (title in `/public/reward-stats/top`)
- Test: `src/server/__tests__/leaderboards.test.ts`

**Interfaces:**
- Consumes: `getLeaderboard`, `leaderboardForReward` from Task 1; `broadcast(event, data)` from `src/server/websocket/index.ts`; `sayInChat(text)` from `src/server/bot/index.ts` (already used by the reminder there).
- Produces:
  ```ts
  export interface LeaderboardPoint { leaderboard: Leaderboard; count: number; rank: number }
  /** A redemption of a list's reward: one point, the Top 3 checked, the point announced. Null when no list has this reward. */
  export function countRedemption(rewardId: string, login: string, shownName?: string): LeaderboardPoint | null
  export function standing(key: string, login: string): { count: number; rank: number | null }
  ```
  WebSocket event `leaderboard-point` `{ key, title, user, login, count, rank }`.
  `GET /public/reward-stats/top?type=<key>` → `{ type, title: string | null, leaderboard }`.

- [ ] **Step 1: Write the failing tests**

Append to `src/server/__tests__/leaderboards.test.ts` (inside the file, as a second `describe`; add `countRedemption, standing` to the import from `'../leaderboards'`):

```ts
describe('a redemption on a list', () => {
  let app: Express;
  let token: string;
  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeEach(async () => {
    initDatabase(':memory:');
    token = generateApiToken();
    app = createApp();
    await request(app).post('/api/leaderboards').set(auth()).send({ title: 'Flex', reward: { id: 'rw-1', title: 'Flex!' } }).expect(201);
  });

  it('counts one point under the lower-case login and ranks the viewer', () => {
    expect(countRedemption('rw-1', 'kartograph', 'Kartograph')).toMatchObject({ count: 1, rank: 1, leaderboard: { key: 'flex', title: 'Flex' } });
    expect(countRedemption('rw-1', 'Kartograph', 'Kartograph')).toMatchObject({ count: 2, rank: 1 });
    expect(countRedemption('rw-1', 'tintenfass')).toMatchObject({ count: 1, rank: 2 });
    expect(standing('flex', 'KARTOGRAPH')).toEqual({ count: 2, rank: 1 });
    expect(standing('flex', 'niemand')).toEqual({ count: 0, rank: null });
  });

  it('counts nothing for a reward without a list', async () => {
    expect(countRedemption('rw-other', 'kartograph')).toBeNull();
    expect((await request(app).get('/api/leaderboards/flex/board').set(auth()).expect(200)).body).toEqual([]);
  });

  it('answers the overlay with title and top three, and stays calm about a list that is gone', async () => {
    countRedemption('rw-1', 'kartograph');
    const top = (await request(app).get('/public/reward-stats/top?type=flex').expect(200)).body;
    expect(top).toEqual({ type: 'flex', title: 'Flex', leaderboard: [{ rank: 1, userName: 'kartograph', count: 1 }] });
    const gone = (await request(app).get('/public/reward-stats/top?type=nope').expect(200)).body;
    expect(gone).toEqual({ type: 'nope', title: null, leaderboard: [] });
    const unset = (await request(app).get('/public/reward-stats/top').expect(200)).body;
    expect(unset.leaderboard).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npm test -- src/server/__tests__/leaderboards.test.ts`
Expected: FAIL — `countRedemption is not a function` (3 new tests fail, the 6 from Task 1 pass).

- [ ] **Step 3: Implement counting and the public answer**

Append to `src/server/leaderboards.ts` (add `import { broadcast } from './websocket/index';` at the top):

```ts
export interface LeaderboardPoint { leaderboard: Leaderboard; count: number; rank: number }

export function standing(key: string, login: string): { count: number; rank: number | null } {
  const name = login.toLowerCase();
  const db = getDb();
  const row = db.prepare('SELECT count FROM reward_stats WHERE user_name = ? AND reward_type = ?').get(name, key) as { count: number } | undefined;
  const count = row?.count ?? 0;
  const rank = count > 0
    ? (db.prepare('SELECT COUNT(*) + 1 AS rank FROM reward_stats WHERE reward_type = ? AND count > ?').get(key, count) as { rank: number }).rank
    : null;
  return { count, rank };
}

/**
 * A redemption of a list's reward: one point for the viewer, the Top 3 of
 * that list checked (the overlays follow), the point announced on the
 * WebSocket (alert board, app). Null when no list has this reward.
 */
export function countRedemption(rewardId: string, login: string, shownName: string = login): LeaderboardPoint | null {
  const leaderboard = leaderboardForReward(rewardId);
  if (!leaderboard) return null;
  const name = login.toLowerCase();
  getDb().prepare(`
    INSERT INTO reward_stats (user_name, reward_type, count, last_redeemed_at)
    VALUES (?, ?, 1, CURRENT_TIMESTAMP)
    ON CONFLICT(user_name, reward_type) DO UPDATE SET count = count + 1, last_redeemed_at = CURRENT_TIMESTAMP
  `).run(name, leaderboard.key);
  const { count, rank } = standing(leaderboard.key, name);
  checkAndBroadcast(leaderboard.key);
  broadcast('leaderboard-point', { key: leaderboard.key, title: leaderboard.title, user: shownName, login: name, count, rank });
  return { leaderboard, count, rank: rank ?? 1 };
}
```

In `src/server/reward-leaderboard.ts` replace `queryTop` (lines 17-44) with one branch — the `all` aggregate is gone:

```ts
function queryTop(type: string, limit = 3): LeaderboardEntry[] {
  try {
    const rows = getDb()
      .prepare(
        `SELECT user_name, count
         FROM reward_stats
         WHERE reward_type = ?
         ORDER BY count DESC, user_name ASC
         LIMIT ?`
      )
      .all(type, limit) as Array<{ user_name: string; count: number }>;
    return rows.map((row, i) => ({ rank: i + 1, userName: row.user_name, count: Number(row.count) }));
  } catch (err) {
    console.error('[Leaderboard] queryTop failed:', err);
    return [];
  }
}
```

and in `initRewardLeaderboard` drop the `cache.set('all', queryTop('all'));` line; the loop over `SELECT DISTINCT reward_type FROM reward_stats` stays (it covers every list that has counts).

In `src/server/index.ts` replace the route at lines 240-244:

```ts
  app.get('/public/reward-stats/top', (req, res) => {
    const type = (req.query.type as string) || '';
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 3, 1), 10);
    res.json({ type, title: getLeaderboard(type)?.title ?? null, leaderboard: type ? getTopRewards(type, limit) : [] });
  });
```

with `import { getLeaderboard } from './leaderboards';` next to the other imports.

In `src/server/bot/eventsub.ts`:
- line 7: replace `import { adoptFlexReward, grantFlexCredit, isFlexReward } from '../flex';` with `import { countRedemption } from '../leaderboards';` and add `import { sayInChat } from './index';`. Remove `import { botHelix } from './shoutout';` (line 10) and the adoption block in `connectEventSub` (the three lines starting `// Once: turn the flex keyword …`).
- In `handleRedemption`, replace lines 80-101 (from `// Map the reward …` to the end of the `if (rewardType === 'flex')` block) with:

```ts
  // A reward with a Bestenliste counts there, by its id; the rest is told
  // apart by title and does what it does (wheel, music, scene, suggestion).
  const point = countRedemption(rewardId, userName, userName);
  let rewardType = point ? point.leaderboard.key : rewardTitle;
  const titleLower = rewardTitle.toLowerCase();
  if (!point) {
    if (titleLower.includes('roulette')) rewardType = 'roulette';
    else if (titleLower.includes('feature')) rewardType = 'feature_request';
    else if (titleLower.includes('musik') || titleLower.includes('song')) rewardType = 'change_music';
    else if (titleLower.includes('scene') || titleLower.includes('szene')) rewardType = 'scene_change';
  }

  const result = getDb().prepare(
    'INSERT INTO rewards (user_name, reward_type, data) VALUES (?, ?, ?)'
  // The row is for alerts and the statistics count; what the viewer typed is used right here and not kept.
  ).run(userName, rewardType, JSON.stringify({ reward_title: rewardTitle, reward_id: rewardId, leaderboard: point?.leaderboard.key ?? null }));

  const reward = getDb().prepare('SELECT * FROM rewards WHERE id = ?').get(result.lastInsertRowid);
  broadcast('reward-redeemed', reward);

  if (point) {
    console.log(`[EventSub] ${userName}: ${point.leaderboard.title} Nr. ${point.count}, Platz ${point.rank}`);
    sayInChat(`💪 @${userName}: ${point.leaderboard.title} Nr. ${point.count} – Platz ${point.rank}.`);
  }
```

`handleRedemption` gets `userName` from `event.user_name`; also read `const login = (event.user_login as string) || userName;` right after it and pass `countRedemption(rewardId, login, userName)` — Twitch's `user_login` is the lower-case login, `user_name` the display name.

Check `sayInChat` is exported from `src/server/bot/index.ts` (the reminder calls it on line 66); if it is a local function, export it.

- [ ] **Step 4: Run the tests to see them pass**

Run: `npm test -- src/server/__tests__/leaderboards.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Fix what the suite now says**

Run: `npm test`
Expected: `src/server/__tests__/flex.test.ts` still passes (flex.ts is untouched until Task 4). Any test that relied on `type=all` from `/public/reward-stats/top` fails — adjust it to a list key. Then `npm run typecheck && npm run lint`.

- [ ] **Step 6: Commit**

```bash
git add src/server/leaderboards.ts src/server/reward-leaderboard.ts src/server/bot/eventsub.ts src/server/index.ts src/server/__tests__/leaderboards.test.ts
git commit -m "feat(leaderboards): a redemption counts in its list, by reward id"
```

---

### Task 3: Chat — `!stats` over all lists, `!flex` gone, the alert board

**Files:**
- Modify: `src/server/leaderboards.ts` (add `standingsText`)
- Modify: `src/server/bot/commands.ts:9, 257-286`
- Modify: `src/server/bot/command-names.ts:29, 120` (remove `flex`)
- Modify: `src/server/bot/command-list.ts:43-44`
- Modify: `src/overlays/alerts/index.html:76-82, 163-181`
- Test: `src/server/__tests__/leaderboards.test.ts`, `src/server/__tests__/commands.test.ts`

**Interfaces:**
- Produces: `export function standingsText(login: string): string` — the full `!stats` answer.

- [ ] **Step 1: Write the failing tests**

Append to the `describe('a redemption on a list')` block in `src/server/__tests__/leaderboards.test.ts` (add `standingsText` to the import):

```ts
  it('tells a viewer where they stand in every list', async () => {
    await request(app).post('/api/leaderboards').set(auth()).send({ title: 'Angeben', reward: { id: 'rw-2', title: 'Angeben' } }).expect(201);
    expect(standingsText('kartograph')).toBe('@kartograph hat noch nichts eingelöst.');
    countRedemption('rw-1', 'kartograph');
    countRedemption('rw-1', 'kartograph');
    countRedemption('rw-2', 'kartograph');
    countRedemption('rw-2', 'tintenfass');
    countRedemption('rw-2', 'tintenfass');
    expect(standingsText('Kartograph')).toBe('@Kartograph: Flex 2 (Platz 1), Angeben 1 (Platz 2).');
    expect(standingsText('tintenfass')).toBe('@tintenfass: Angeben 2 (Platz 1).');
  });
```

In `src/server/__tests__/commands.test.ts` add, inside the existing `describe`, one test:

```ts
  it('knows !stats and no longer knows !flex', async () => {
    expect(await find('!stats')).toMatchObject({ group: 'builtin', description: 'Zeigt deinen Stand in jeder Bestenliste: !stats, oder !stats <Name>.' });
    expect(await find('!flex')).toBeUndefined();
  });
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npm test -- src/server/__tests__/leaderboards.test.ts src/server/__tests__/commands.test.ts`
Expected: FAIL — `standingsText is not a function`; `!flex` is still found.

- [ ] **Step 3: Implement**

Append to `src/server/leaderboards.ts`:

```ts
/** `!stats [Name]`: the viewer's count and place in every list they are in, in list order. */
export function standingsText(login: string): string {
  const parts = listLeaderboards()
    .map((l) => ({ l, s: standing(l.key, login) }))
    .filter(({ s }) => s.count > 0)
    .map(({ l, s }) => `${l.title} ${s.count} (Platz ${s.rank})`);
  return parts.length ? `@${login}: ${parts.join(', ')}.` : `@${login} hat noch nichts eingelöst.`;
}
```

In `src/server/bot/commands.ts`:
- line 9: `import { flexReward, flexStanding, useFlex } from '../flex';` → `import { standingsText } from '../leaderboards';`
- delete the whole `case 'flex': { … }` block (lines 257-271).
- replace the `case 'rewardstats'` body (lines 273-286) with:

```ts
      case 'rewardstats': {
        const args = message.trim().split(' ').slice(1);
        // Only a login is looked up and echoed — never arbitrary text from the message.
        const asked = args[0]?.replace(/^@/, '') ?? '';
        const target = /^[a-z0-9_]{1,25}$/i.test(asked) ? asked : (tags.username || 'Unknown');
        say(standingsText(target));
        break;
      }
```

In `src/server/bot/command-names.ts` remove `flex: '!flex',` (line 29) and `'flex',` (line 120). In `src/server/bot/command-list.ts` remove the `flex:` line (43) and change line 44 to `rewardstats: 'Zeigt deinen Stand in jeder Bestenliste: !stats, oder !stats <Name>.',`.

In `src/overlays/alerts/index.html`:
- lines 76-82: remove `flex: 'schaltet einen Flex frei.',` from `REWARDS`.
- in `case 'reward-redeemed'` (around line 163) add, before `showAlert`, a skip for a counted point — the point gets its own alert below:

```js
          let extra = {};
          try { extra = JSON.parse(data.data || '{}'); } catch {}
          if (data.reward_type === 'roulette' || extra.leaderboard) break;
```

(replace the existing `if (data.reward_type === 'roulette') break;`).
- replace the `case 'flex':` block with:

```js
        case 'leaderboard-point':
          showAlert({
            label: data.title,
            who: data.user,
            text: `löst ${data.title} ein – Nr. ${data.count}${data.rank ? `, Platz ${data.rank}` : ''}`,
            kind: 'reward',
          });
          break;
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npm test -- src/server/__tests__/leaderboards.test.ts src/server/__tests__/commands.test.ts`
Expected: PASS.

- [ ] **Step 5: Whole suite, typecheck, lint, commit**

Run: `npm test && npm run typecheck && npm run lint`

```bash
git add src/server/leaderboards.ts src/server/bot/commands.ts src/server/bot/command-names.ts src/server/bot/command-list.ts src/overlays/alerts/index.html src/server/__tests__/leaderboards.test.ts src/server/__tests__/commands.test.ts
git commit -m "feat(leaderboards): !stats over every list, !flex retired, alert names the list"
```

---

### Task 4: Migration v28 — the flex reward becomes the first list, the unlock flow goes

**Files:**
- Modify: `src/server/db/schema.ts:150-154` (drop `flex_credits` from the schema)
- Modify: `src/server/db/index.ts:78` (add the `from < 28` block at the top of `runMigrations`)
- Delete: `src/server/flex.ts`, `src/server/__tests__/flex.test.ts`
- Modify: `src/server/api/reward-stats.ts` (drop flex imports and routes)
- Modify: `src/server/retention.ts:28-36` (no `flex_credits`)
- Modify: `src/server/privacy-text.ts:10`
- Test: `src/server/__tests__/leaderboards-migration.test.ts`

**Interfaces:**
- Consumes: Task 1 table.
- Produces: `forgetViewer(name): { rewardStats, rewards, songRequests }` (no `flexCredits`).

- [ ] **Step 1: Write the failing test**

Create `src/server/__tests__/leaderboards-migration.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Express } from 'express';
import { getDb, initDatabase } from '../db/index';
import { generateApiToken } from '../auth-token';
import { createApp } from '../index';

/**
 * Before 2026-10-06 (evening) the Bestenliste was the flex ranking: a chosen
 * reward unlocked a flex (`flex_credits`), !flex spent it. The update turns
 * the chosen reward into the first list, "Flex", and counts open flexes as
 * points, so nobody loses what they paid for.
 */
describe('the update to several Bestenlisten', () => {
  let dir: string;
  let token: string;
  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nst-leaderboards-'));
  });

  afterEach(() => {
    getDb().close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  /** A database as version 27 left it: counts under `flex`, open credits, the chosen reward. */
  function databaseFromBefore(withReward: boolean): Express {
    const file = path.join(dir, 'stream.db');
    initDatabase(file);
    const db = getDb();
    db.exec('DROP TABLE IF EXISTS leaderboards');
    db.exec('CREATE TABLE IF NOT EXISTS flex_credits (user_name TEXT PRIMARY KEY, credits INTEGER NOT NULL DEFAULT 0, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)');
    db.prepare("INSERT INTO reward_stats (user_name, reward_type, count) VALUES ('kartograph', 'flex', 3), ('tintenfass', 'flex', 1)").run();
    db.prepare("INSERT INTO flex_credits (user_name, credits) VALUES ('tintenfass', 2), ('neuling', 1)").run();
    if (withReward) {
      db.prepare("INSERT INTO settings (key, value) VALUES ('flex_reward_id', 'rw-1'), ('flex_reward_title', 'Flex!')").run();
    }
    db.prepare('DELETE FROM schema_version').run();
    db.prepare('INSERT INTO schema_version (version) VALUES (27)').run();
    db.close();
    initDatabase(file); // the next start
    token = generateApiToken();
    return createApp();
  }

  it('turns the chosen flex reward into the list "Flex" and keeps every point', async () => {
    const app = databaseFromBefore(true);
    const lists = (await request(app).get('/api/leaderboards').set(auth()).expect(200)).body;
    expect(lists).toEqual([{ key: 'flex', title: 'Flex', reward_id: 'rw-1', reward_title: 'Flex!', viewers: 3 }]);
    const board = (await request(app).get('/api/leaderboards/flex/board').set(auth()).expect(200)).body;
    expect(board.map((r: { user_name: string; count: number }) => [r.user_name, r.count])).toEqual([['kartograph', 3], ['tintenfass', 3], ['neuling', 1]]);
    expect(getDb().prepare("SELECT name FROM sqlite_master WHERE name = 'flex_credits'").get()).toBeUndefined();
    expect(getDb().prepare("SELECT COUNT(*) AS n FROM settings WHERE key LIKE 'flex_reward%'").get()).toEqual({ n: 0 });
  });

  it('creates no list without a chosen reward, but keeps the old counts for a list named "Flex" later', async () => {
    const app = databaseFromBefore(false);
    expect((await request(app).get('/api/leaderboards').set(auth()).expect(200)).body).toEqual([]);
    await request(app).post('/api/leaderboards').set(auth()).send({ title: 'Flex', reward: { id: 'rw-5', title: 'Flex' } }).expect(201);
    const board = (await request(app).get('/api/leaderboards/flex/board').set(auth()).expect(200)).body;
    expect(board.map((r: { user_name: string; count: number }) => [r.user_name, r.count])).toEqual([['kartograph', 3], ['tintenfass', 3], ['neuling', 1]]);
  });

  it('runs on a fresh database without a trace', async () => {
    initDatabase(path.join(dir, 'fresh.db'));
    token = generateApiToken();
    const app = createApp();
    expect((await request(app).get('/api/leaderboards').set(auth()).expect(200)).body).toEqual([]);
    expect(getDb().prepare("SELECT name FROM sqlite_master WHERE name = 'flex_credits'").get()).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to see it fail**

Run: `npm test -- src/server/__tests__/leaderboards-migration.test.ts`
Expected: FAIL — the list is missing after the restart; `flex_credits` still exists (the schema recreates it).

- [ ] **Step 3: Write the migration and remove the flex flow**

In `src/server/db/schema.ts` delete the `flex_credits` table (lines 150-154).

In `src/server/db/index.ts`, at the top of `runMigrations` (before `if (from < 25)`):

```ts
  if (from < 28) {
    // Several Bestenlisten (2026-10-06, evening): the chosen flex reward
    // becomes the first list, open flexes count as points, the unlock flow
    // (flex_credits, !flex) and its settings go. Counts under `flex` stay —
    // they belong to a list named "Flex", existing or created later.
    const setting = (key: string) => (db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined)?.value;
    const rewardId = setting('flex_reward_id');
    if (rewardId) {
      db.prepare('INSERT OR IGNORE INTO leaderboards (key, title, reward_id, reward_title) VALUES (?, ?, ?, ?)')
        .run('flex', 'Flex', rewardId, setting('flex_reward_title') || 'Flex');
    }
    try {
      const open = db.prepare('SELECT user_name, credits FROM flex_credits WHERE credits > 0').all() as Array<{ user_name: string; credits: number }>;
      const add = db.prepare(`INSERT INTO reward_stats (user_name, reward_type, count, last_redeemed_at) VALUES (?, 'flex', ?, CURRENT_TIMESTAMP)
        ON CONFLICT(user_name, reward_type) DO UPDATE SET count = count + excluded.count`);
      for (const row of open) add.run(row.user_name, row.credits);
    } catch { /* no flex_credits table — nothing was open */ }
    db.exec('DROP TABLE IF EXISTS flex_credits');
    db.prepare("DELETE FROM settings WHERE key IN ('flex_reward', 'flex_reward_id', 'flex_reward_title')").run();
    console.log(`[DB] Migrated: Bestenlisten — ${rewardId ? 'the flex reward is the list "Flex"' : 'no flex reward chosen, no list yet'}, open flexes counted, flex_credits dropped`);
  }
```

Delete `src/server/flex.ts` and `src/server/__tests__/flex.test.ts`.

In `src/server/api/reward-stats.ts`: delete the import from `'../flex'` and the three routes `GET /breakdown`, `GET /flex-settings`, `POST /flex-settings`, `POST /flex/credit`. Everything else (types, list, manual set, forget, delete, per-user) stays.

In `src/server/retention.ts` change `forgetViewer`:

```ts
export function forgetViewer(name: string): { rewardStats: number; rewards: number; songRequests: number } {
  const login = name.trim().toLowerCase();
  const db = getDb();
  return {
    rewardStats: db.prepare('DELETE FROM reward_stats WHERE user_name = ?').run(login).changes,
    rewards: db.prepare('DELETE FROM rewards WHERE LOWER(user_name) = ?').run(login).changes,
    songRequests: db.prepare('DELETE FROM song_requests WHERE LOWER(requested_by) = ?').run(login).changes,
  };
}
```

and in its doc comment replace „a viewer who has not redeemed anything for a year leaves the leaderboard counts" with the same sentence — it still holds.

In `src/server/privacy-text.ts:10` replace `deine Flexe für die Bestenliste` with `deine Einlösungen für die Bestenlisten`.

Search for leftovers: `grep -rn "flex" src/server --include=*.ts -i | grep -v "flex:" | grep -v "display: flex"` must show nothing but the migration and CSS.

- [ ] **Step 4: Run the tests to see them pass**

Run: `npm test -- src/server/__tests__/leaderboards-migration.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Whole suite, typecheck, lint, commit**

Run: `npm test && npm run typecheck && npm run lint`
Expected: green. A test that asserted `flexCredits` in the forget answer (`src/server/__tests__/hardening.test.ts` or `readiness.test.ts` may) is adjusted to the three remaining counts.

```bash
git add -A src/server/db src/server/flex.ts src/server/__tests__/flex.test.ts src/server/api/reward-stats.ts src/server/retention.ts src/server/privacy-text.ts src/server/__tests__/leaderboards-migration.test.ts
git commit -m "feat(leaderboards): migrate the flex reward into the list \"Flex\", retire the unlock flow"
```

---

### Task 5: Overlays — one catalog entry per list, OBS knows them, the title on screen

**Files:**
- Modify: `src/server/overlays/catalog.ts:22-37, 62-63, 93-120`
- Modify: `src/server/obs/visible-overlays.ts:17-22`
- Modify: `src/server/obs/place-overlay.ts:11-15, 34`
- Modify: `src/server/api/obs.ts:130-133`
- Modify: `src/server/api/actions.ts:170, 220-240`
- Modify: `src/overlays/reward-leaderboard/index.html:67, 80-88`
- Modify: `src/overlays/showcase/states.json:110, 118`
- Test: `src/server/__tests__/overlay-catalog.test.ts`, `src/server/__tests__/obs-visible-overlays.test.ts`, `src/server/__tests__/obs-place-overlay.test.ts`

**Interfaces:**
- Produces: `CatalogEntry` gains `base: string` (the overlay folder, `custom/<x>` for own overlays) and `variant: string | null` (the list key). `name` stays the unique id: `reward-leaderboard:flex`, else the base. `PlaceableOverlay` gains `base` and `variant`; `overlayNameFromUrl` answers `reward-leaderboard:flex` for a URL with `?type=flex`. `POST /api/actions/overlay-test/reward-leaderboard:flex` sends the sample with `type: 'flex'`.

- [ ] **Step 1: Write the failing tests**

In `src/server/__tests__/overlay-catalog.test.ts` add inside the `describe`:

```ts
  it('lists the Bestenliste overlays once per list, with the list key in the address', async () => {
    const before = (await request(app).get('/api/overlays/catalog').set(auth()).expect(200)).body;
    const placeholder = before.find((e: { name: string }) => e.name === 'reward-leaderboard');
    expect(placeholder).toMatchObject({ base: 'reward-leaderboard', variant: null, group: 'rewards' });
    expect(placeholder.sentence).toMatch(/Bestenlisten/);

    await request(app).post('/api/leaderboards').set(auth()).send({ title: 'Flex', reward: { id: 'rw-1', title: 'Flex!' } }).expect(201);
    await request(app).post('/api/leaderboards').set(auth()).send({ title: 'Angeben', reward: { id: 'rw-2', title: 'Angeben' } }).expect(201);
    const after = (await request(app).get('/api/overlays/catalog').set(auth()).expect(200)).body;
    const rewards = after.filter((e: { group: string }) => e.group === 'rewards');
    expect(rewards.map((e: { name: string }) => e.name)).toEqual(['reward-leaderboard:flex', 'reward-rankchange:flex', 'reward-leaderboard:angeben', 'reward-rankchange:angeben']);
    expect(rewards[0]).toMatchObject({ base: 'reward-leaderboard', variant: 'flex', label: 'Bestenliste: Flex', size: { width: 700, height: 260 }, previewState: 'top-three', feature: 'bestenliste' });
    expect(rewards[0].url).toMatch(/\/overlay\/reward-leaderboard\/index\.html\?type=flex$/);
    expect(after.find((e: { name: string }) => e.name === 'reward-leaderboard')).toBeUndefined();
    for (const entry of after) expect(typeof entry.base).toBe('string');
  });
```

In `src/server/__tests__/obs-visible-overlays.test.ts` add a URL to the fixture map (line 40ff): `'reward-leaderboard:flex': \`http://localhost:${PORT}/overlay/reward-leaderboard/index.html?type=flex\`` and extend the assertion that lists the names found so that it contains `'reward-leaderboard:flex'` (read the test to see which `it` enumerates the fixture; add the expectation there).

In `src/server/__tests__/obs-place-overlay.test.ts` add `base` and `variant` to every `PlaceableOverlay` literal (`base` = the old `name`, `variant: null`) and one new case:

```ts
  it('places a list overlay with the list key in its address', async () => {
    const obs = fakeObs({ scenes: ['Main'] });   // use the stand-in this file already builds
    const result = await placeOverlay(obs, 4000, { name: 'reward-leaderboard:flex', base: 'reward-leaderboard', variant: 'flex', label: 'Bestenliste: Flex', size: { width: 700, height: 260 } }, 'Main');
    expect(result.status).toBe('created');
    expect(obs.createdInputs[0].inputSettings.url).toBe('http://localhost:4000/overlay/reward-leaderboard/index.html?type=flex');
  });
```

(adapt `fakeObs` / `createdInputs` to the names the file actually uses for its stand-in and its record of `CreateInput` calls).

- [ ] **Step 2: Run the tests to see them fail**

Run: `npm test -- src/server/__tests__/overlay-catalog.test.ts src/server/__tests__/obs-visible-overlays.test.ts src/server/__tests__/obs-place-overlay.test.ts`
Expected: FAIL — no `base` on entries, no per-list names, URL without `?type=`.

- [ ] **Step 3: Implement**

`src/server/overlays/catalog.ts`:
- `CatalogEntry`: add `base: string;` and `variant: string | null;` after `name`.
- Change the two META lines:
  ```ts
  'reward-leaderboard': { label: 'Bestenliste', sentence: 'Die Top 3 einer Bestenliste – wer die Belohnung am öftesten eingelöst hat.', group: 'rewards', preview: 'top-three' },
  'reward-rankchange': { label: 'Rangwechsel', sentence: 'Meldet, wenn jemand in einer Bestenliste aufsteigt.', group: 'rewards', preview: 'overtake' },
  ```
- Add `import { listLeaderboards } from '../leaderboards';` and a constant `const PER_LIST = new Set(['reward-leaderboard', 'reward-rankchange']);`.
- In `overlayCatalog`, give every built-in entry `base: name, variant: null` and every custom entry `base: \`custom/${name}\`, variant: null`. Then, after the built-in `map` and before the custom loop, expand the two overlays:

```ts
  const lists = listLeaderboards();
  const expanded: CatalogEntry[] = [];
  for (const entry of entries) {
    if (!PER_LIST.has(entry.name)) { expanded.push(entry); continue; }
    if (lists.length === 0) {
      expanded.push({ ...entry, sentence: 'Lege unter Overlays & Alerts → Bestenlisten eine Liste an, dann bekommt dieses Overlay eine Adresse je Liste.' });
      continue;
    }
    for (const list of lists) {
      expanded.push({
        ...entry,
        name: `${entry.name}:${list.key}`,
        variant: list.key,
        label: `${entry.label}: ${list.title}`,
        url: `${entry.url}?type=${encodeURIComponent(list.key)}`,
      });
    }
  }
  entries.splice(0, entries.length, ...expanded);
```

- The final sort uses `within(a.name)`; change `within` to index by `base`: `const within = (name: string) => Object.keys(META).indexOf(name);` → call it with `a.base` / `b.base`, and add a third key so a list's two overlays stay together in list order: after the `within` comparison insert `|| lists.findIndex((l) => l.key === a.variant) - lists.findIndex((l) => l.key === b.variant)`.

`src/server/obs/visible-overlays.ts`, `overlayNameFromUrl`:

```ts
export function overlayNameFromUrl(url: string | undefined, port: number): string | null {
  if (!isOwnOverlayUrl(url, port)) return null;
  const parsed = new URL(url!);
  const match = parsed.pathname.match(/^\/overlay\/(custom\/[^/]+|[^/]+)/);
  if (!match) return null;
  // A Bestenliste overlay is one source per list: the list key rides in `?type=`.
  const type = parsed.searchParams.get('type');
  return type ? `${match[1]}:${type}` : match[1];
}
```

Update the doc comment above it: ``/overlay/reward-leaderboard/index.html?type=flex` → `reward-leaderboard:flex``.

`src/server/obs/place-overlay.ts`: `PlaceableOverlay` gains `base: string; variant: string | null;`; line 34 becomes

```ts
  const url = `http://localhost:${port}/overlay/${overlay.base}/index.html${overlay.variant ? `?type=${encodeURIComponent(overlay.variant)}` : ''}`;
```

`src/server/api/obs.ts:133`: pass `{ name: entry.name, base: entry.base, variant: entry.variant, label: entry.label, size: entry.size }`.

`src/server/api/actions.ts`: in `getTestEvents(name)` split the name first:

```ts
function getTestEvents(name: string): { event: string; data: unknown }[] {
  const [base, variant] = name.split(':');
  if (STATIC_TEST_EVENTS[base]) return STATIC_TEST_EVENTS[base];
  …
  if (base === 'reward-leaderboard' || base === 'reward-rankchange') {
    return [{
      event: 'reward-leaderboard-update',
      data: {
        type: variant ?? 'all',
        …unchanged sample…
```

and use `base` instead of `name` in every other comparison inside the function.

`src/overlays/reward-leaderboard/index.html`: line 67 → `<div class="header lex-kicker" id="title">Bestenliste</div>`; in `fetchLeaderboard`, after `leaderboard = data.leaderboard || [];` add `if (data.title) document.getElementById('title').textContent = data.title;`.

`src/overlays/showcase/states.json`: in the `reward-leaderboard` sample on line 110 add `"title": "Flex"` next to `"type": "all"` (the showcase opens the overlay without `?type=`, so its sample keeps `all`).

- [ ] **Step 4: Run the tests to see them pass**

Run: `npm test -- src/server/__tests__/overlay-catalog.test.ts src/server/__tests__/obs-visible-overlays.test.ts src/server/__tests__/obs-place-overlay.test.ts`
Expected: PASS.

- [ ] **Step 5: Whole suite, typecheck, lint, commit**

Run: `npm test && npm run typecheck && npm run lint`
Expected: green. `src/server/__tests__/setup.test.ts:94` (`byName['reward-rankchange']` → `'bestenliste'`) still holds because the placeholder entry keeps the bare name while no list exists.

```bash
git add src/server/overlays/catalog.ts src/server/obs/visible-overlays.ts src/server/obs/place-overlay.ts src/server/api/obs.ts src/server/api/actions.ts src/overlays/reward-leaderboard/index.html src/overlays/showcase/states.json src/server/__tests__/overlay-catalog.test.ts src/server/__tests__/obs-visible-overlays.test.ts src/server/__tests__/obs-place-overlay.test.ts
git commit -m "feat(overlays): one Bestenliste and Rangwechsel entry per list, OBS tells them apart"
```

---

### Task 6: The app — page Bestenlisten, navigation, setup text, help, vocabulary

**Files:**
- Create: `src/renderer/src/panels/LeaderboardsPanel.tsx`
- Delete: `src/renderer/src/panels/RewardStatsPanel.tsx`
- Modify: `src/renderer/src/navigation.ts:105-170`, `src/renderer/src/panelKeys.ts:26`, `src/renderer/src/panelRegistry.tsx:20, 49`
- Modify: `src/shared/features.ts:66`
- Modify: `src/renderer/src/panels/OverlaysPanel.tsx:17-28, 41, 111, 153, 162, 171, 259, 264`
- Modify: `src/renderer/src/components/setup/ObsStep.tsx:37`
- Modify: `src/renderer/src/components/setup/FinishStep.tsx:63-70`
- Modify: `src/renderer/src/docs/help-de.ts:117, 228-244`
- Modify: `CONTEXT.md:35-37`, `docs/STAND.md` (one paragraph after line 306)
- Test: `src/renderer/src/__tests__/navigation.test.ts` (existing), then by hand in the running app

**Interfaces:**
- Consumes: `GET/POST /api/leaderboards`, `PATCH/DELETE /api/leaderboards/:key`, `GET /api/leaderboards/:key/board` (Task 1); `POST /api/reward-stats` `{ user_name, reward_type, count }`, `DELETE /api/reward-stats/:user/:type`, `POST /api/reward-stats/forget` (existing); `GET /api/auth/twitch/rewards` → `{ rewards: {id,title}[], error? }`; `GET /api/settings/bot-status` → `{ connected }`; WebSocket `leaderboard-point`.
- Produces: panel key `leaderboards`, sub-tab `bestenlisten` under `overlays`.

- [ ] **Step 1: Navigation, keys, features**

`src/renderer/src/navigation.ts`:
- In the `overlays` tab (line 108) keywords: `['Overlays', 'Alerts', 'Meilensteine', 'Bestenlisten', 'Aussehen', 'Szenen in OBS']`; after the `meilensteine` sub-tab insert:

```ts
      {
        key: 'bestenlisten',
        label: 'Bestenlisten',
        sentence: 'Wer eine Belohnung am öftesten einlöst. Jede Liste hängt an einer Belohnung in Twitch und läuft als Overlay im Stream.',
        panels: ['leaderboards'],
      },
```

- In the `after` tab: keywords `['Content planen', 'Statistik']`; delete the `kanalpunkte` sub-tab (lines 162-167). Line 53: `rewardstats: 'Bestenliste',` → `leaderboards: 'Bestenlisten',`.

`src/renderer/src/panelKeys.ts:26`: `'rewardstats'` → `'leaderboards'`. `src/renderer/src/panelRegistry.tsx`: import `LeaderboardsPanel from './panels/LeaderboardsPanel'` instead of `RewardStatsPanel`; line 49 `leaderboards: LeaderboardsPanel,`.

`src/shared/features.ts:66`:

```ts
  { key: 'bestenliste', group: 'rewards', label: 'Bestenlisten', sentence: 'Wer eine Belohnung am öftesten einlöst – je Liste eine Belohnung. Als Overlay, mit Rangwechsel-Meldung und !stats.', needs: ['twitch', 'obs'], overlays: ['reward-leaderboard', 'reward-rankchange'], commands: ['rewardstats'], panels: ['leaderboards'], hotkeys: [], readiness: [] },
```

Run: `npm test -- src/renderer/src/__tests__/navigation.test.ts` — fix whatever names the removed sub-tab or panel.

- [ ] **Step 2: The panel**

Create `src/renderer/src/panels/LeaderboardsPanel.tsx`:

```tsx
import React, { useMemo, useRef, useState } from 'react';
import { useApi, apiPost, apiPatch, apiDelete } from '../hooks/useApi';
import { useWebSocket } from '../hooks/useWebSocket';
import { useToast } from '../contexts/ToastContext';
import Dialog from '../components/ux/Dialog';

interface Leaderboard { key: string; title: string; reward_id: string; reward_title: string; viewers: number }
interface Row { user_name: string; count: number; last_redeemed_at: string }
interface TwitchReward { id: string; title: string }

const day = (iso: string) => new Date(iso.includes('T') ? iso : iso + 'Z').toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

// "Bestenlisten" under Overlays & Alerts: every list as a card — name,
// reward, how many viewers — and, opened, its ranking with corrections.
// A list hangs on one Twitch reward, chosen from the channel's rewards and
// kept by its id; a reward gone from Twitch is said so until another is chosen.
export default function LeaderboardsPanel() {
  const { toast } = useToast();
  const { data: lists, refetch: refetchLists } = useApi<Leaderboard[]>('/leaderboards');
  const { data: rewardsData } = useApi<{ rewards: TwitchReward[]; error?: string }>('/auth/twitch/rewards');
  const { data: botStatus } = useApi<{ connected: boolean }>('/settings/bot-status');
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [creating, setCreating] = useState<{ title: string; rewardId: string } | null>(null);

  const rewards = rewardsData?.rewards ?? [];
  const listLoaded = !!botStatus?.connected && !!rewardsData && !rewardsData.error;
  const gone = (l: Leaderboard) => listLoaded && !rewards.some((r) => r.id === l.reward_id);
  const taken = new Set((lists ?? []).map((l) => l.reward_id));

  const create = async () => {
    if (!creating) return;
    const reward = rewards.find((r) => r.id === creating.rewardId);
    if (!creating.title.trim() || !reward) return;
    const result = await apiPost<{ leaderboard: Leaderboard }>('/leaderboards', { title: creating.title.trim(), reward });
    if (!result) { toast.error('Nicht angelegt – gibt es den Namen oder die Belohnung schon?'); return; }
    toast.success(`Bestenliste „${result.leaderboard.title}“ angelegt`);
    setCreating(null);
    refetchLists();
  };

  const open = (lists ?? []).find((l) => l.key === openKey) ?? null;

  return (
    <div className="panel card-slim rewards">
      <div className="card-line card-wrap">
        <p className="dialog-hint" style={{ margin: 0 }}>Jede Liste zählt die Einlösungen einer Belohnung. Die Overlays dazu stehen unter Overlays, je Liste eine Bestenliste und ein Rangwechsel.</p>
        <button type="button" className="card-primary" onClick={() => setCreating({ title: '', rewardId: '' })} disabled={!listLoaded} title={listLoaded ? undefined : 'Mit Twitch verbinden, um eine Liste anzulegen'}>+ Bestenliste</button>
      </div>
      {!listLoaded && <p className="dialog-hint" style={{ margin: 0 }}>Twitch ist nicht verbunden – Listen anlegen und Belohnungen wählen geht erst dann.</p>}
      {lists && lists.length === 0 && <p className="dialog-empty">Noch keine Bestenliste. Lege eine an und wähle die Belohnung, die zählen soll.</p>}

      <section className="rewards-ranking" aria-label="Bestenlisten">
        {(lists ?? []).map((l) => (
          <div key={l.key} className="rewards-row">
            <div className="rewards-who">
              <div className="rewards-name">{l.title}</div>
              <div className="dialog-hint">Belohnung „{l.reward_title}“{gone(l) ? ' – gibt es in Twitch nicht mehr' : ''}</div>
            </div>
            <div className="rewards-total"><div className="rewards-total-n">{l.viewers}</div><div className="dialog-hint">{l.viewers === 1 ? 'Zuschauer' : 'Zuschauer'}</div></div>
            <button type="button" className="card-secondary" onClick={() => setOpenKey(l.key)}>Öffnen</button>
          </div>
        ))}
      </section>

      {creating && (
        <Dialog
          title="Bestenliste anlegen"
          sentence="Ein Name für die Liste und die Belohnung in Twitch, deren Einlösungen zählen."
          onClose={() => setCreating(null)}
          width={520}
          footer={<>
            <button type="button" className="card-secondary" onClick={() => setCreating(null)}>Abbrechen</button>
            <button type="button" className="card-primary" onClick={create} disabled={!creating.title.trim() || !creating.rewardId}>Anlegen</button>
          </>}
        >
          <div className="dialog-grid">
            <div className="dialog-field"><label htmlFor="lb-title">Name</label><input id="lb-title" type="text" maxLength={45} value={creating.title} onChange={(e) => setCreating({ ...creating, title: e.target.value })} autoFocus /></div>
            <div className="dialog-field">
              <label htmlFor="lb-reward">Belohnung</label>
              <select id="lb-reward" value={creating.rewardId} onChange={(e) => setCreating({ ...creating, rewardId: e.target.value })}>
                <option value="">{rewards.length === 0 ? 'Keine Belohnungen in Twitch' : 'Belohnung wählen …'}</option>
                {rewards.map((r) => <option key={r.id} value={r.id} disabled={taken.has(r.id)}>{r.title}{taken.has(r.id) ? ' (hat schon eine Liste)' : ''}</option>)}
              </select>
            </div>
          </div>
        </Dialog>
      )}

      {open && (
        <ListDialog
          list={open}
          rewards={rewards}
          listLoaded={listLoaded}
          gone={gone(open)}
          taken={taken}
          onClose={() => setOpenKey(null)}
          onChanged={refetchLists}
        />
      )}
    </div>
  );
}

function ListDialog({ list, rewards, listLoaded, gone, taken, onClose, onChanged }: {
  list: Leaderboard; rewards: TwitchReward[]; listLoaded: boolean; gone: boolean; taken: Set<string>; onClose: () => void; onChanged: () => void;
}) {
  const { toast } = useToast();
  const { data: rows, refetch } = useApi<Row[]>(`/leaderboards/${encodeURIComponent(list.key)}/board`);
  const [search, setSearch] = useState('');
  const [title, setTitle] = useState<string | null>(null);
  const [editing, setEditing] = useState<Row | null>(null);
  const [countEdit, setCountEdit] = useState('');
  const [adding, setAdding] = useState<{ user: string; count: string } | null>(null);

  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  useWebSocket((event) => {
    if (event !== 'leaderboard-point') return;
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => { refetch(); onChanged(); }, 1500);
  });

  const viewers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (rows ?? []).filter((v) => !q || v.user_name.toLowerCase().includes(q));
  }, [rows, search]);

  const rename = async () => {
    if (title === null || !title.trim()) return;
    const result = await apiPatch(`/leaderboards/${encodeURIComponent(list.key)}`, { title: title.trim() });
    if (!result) { toast.error('Nicht umbenannt'); return; }
    toast.success('Umbenannt'); setTitle(null); onChanged();
  };
  const chooseReward = async (id: string) => {
    const reward = rewards.find((r) => r.id === id);
    if (!reward) return;
    const result = await apiPatch(`/leaderboards/${encodeURIComponent(list.key)}`, { reward });
    if (!result) { toast.error('Nicht gespeichert'); return; }
    toast.success(`„${reward.title}“ zählt jetzt für ${list.title}`); onChanged();
  };
  const remove = async () => {
    if (!window.confirm(`Die Bestenliste „${list.title}“ löschen? Die Zählung von ${n(list.viewers, 'Zuschauer', 'Zuschauern')} geht mit.`)) return;
    const ok = await apiDelete(`/leaderboards/${encodeURIComponent(list.key)}`);
    if (!ok) { toast.error('Nicht gelöscht'); return; }
    toast.success('Gelöscht'); onClose(); onChanged();
  };

  const openEdit = (v: Row) => { setEditing(v); setCountEdit(String(v.count)); };
  const saveCount = async () => {
    if (!editing) return;
    const count = Number(countEdit);
    if (!Number.isInteger(count) || count < 0) { toast.error('Eine Anzahl ist eine ganze Zahl.'); return; }
    const result = await apiPost('/reward-stats', { user_name: editing.user_name, reward_type: list.key, count });
    if (!result) { toast.error('Nicht gespeichert'); return; }
    toast.success('Gespeichert'); setEditing({ ...editing, count }); refetch(); onChanged();
  };
  const removeEntry = async () => {
    if (!editing) return;
    if (!window.confirm(`${editing.user_name} aus „${list.title}“ nehmen?`)) return;
    const ok = await apiDelete(`/reward-stats/${encodeURIComponent(editing.user_name)}/${encodeURIComponent(list.key)}`);
    if (!ok) { toast.error('Löschen fehlgeschlagen'); return; }
    setEditing(null); refetch(); onChanged();
  };
  const forget = async () => {
    if (!editing) return;
    if (!window.confirm(`${editing.user_name} vergessen? Alles, was unter diesem Namen gespeichert ist – in jeder Bestenliste, Songwünsche –, wird gelöscht.`)) return;
    const result = await apiPost('/reward-stats/forget', { user_name: editing.user_name });
    if (!result) { toast.error('Nicht gelöscht'); return; }
    toast.success(`${editing.user_name} vergessen`); setEditing(null); refetch(); onChanged();
  };
  const add = async () => {
    if (!adding || !adding.user.trim() || adding.count.trim() === '') return;
    const count = Number(adding.count);
    if (!Number.isInteger(count) || count < 0) { toast.error('Eine Anzahl ist eine ganze Zahl.'); return; }
    const result = await apiPost('/reward-stats', { user_name: adding.user.trim(), reward_type: list.key, count });
    if (!result) { toast.error('Nicht gespeichert'); return; }
    toast.success('Eingetragen'); setAdding(null); refetch(); onChanged();
  };

  return (
    <Dialog
      title={list.title}
      sentence="Die Rangliste, genau so wie das Overlay sie zeigt. Wer ein Jahr nicht einlöst, fällt heraus."
      onClose={onClose}
      width={640}
      footer={<>
        <button type="button" className="card-link" onClick={remove}>Liste löschen</button>
        <span style={{ flex: 1 }} />
        <button type="button" className="card-primary" onClick={onClose}>Fertig</button>
      </>}
    >
      <div className="card-row card-wrap">
        <label htmlFor="lb-rename" className="dialog-field-label">Name</label>
        <input id="lb-rename" type="text" maxLength={45} value={title ?? list.title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && rename()} style={{ width: 180 }} />
        {title !== null && title.trim() !== list.title && <button type="button" className="card-secondary" onClick={rename}>Umbenennen</button>}
      </div>
      <div className="card-row card-wrap">
        <label htmlFor="lb-choose" className="dialog-field-label">Belohnung in Twitch</label>
        <select id="lb-choose" value={list.reward_id} onChange={(e) => chooseReward(e.target.value)} disabled={!listLoaded} style={{ width: 220 }}>
          {!listLoaded && <option value={list.reward_id}>{list.reward_title}</option>}
          {gone && <option value={list.reward_id} disabled>{list.reward_title} (gibt es nicht mehr)</option>}
          {listLoaded && rewards.map((r) => <option key={r.id} value={r.id} disabled={taken.has(r.id) && r.id !== list.reward_id}>{r.title}</option>)}
        </select>
      </div>
      {gone && <p className="dialog-hint" role="alert">Die Belohnung „{list.reward_title}“ gibt es in Twitch nicht mehr – bitte eine andere wählen. Bis dahin zählt diese Liste nichts.</p>}
      {!listLoaded && <p className="dialog-hint">Mit Twitch verbinden, um eine andere Belohnung zu wählen.</p>}

      <div className="card-row card-wrap" style={{ justifyContent: 'space-between' }}>
        <input type="text" placeholder="Zuschauer suchen" aria-label="Zuschauer suchen" value={search} onChange={(e) => setSearch(e.target.value)} style={{ flex: '0 0 220px', width: 220 }} />
        <button type="button" className="card-secondary" onClick={() => setAdding({ user: '', count: '' })}>+ Eintrag von Hand</button>
      </div>
      {viewers.length === 0 && <p className="dialog-empty">{rows && rows.length ? 'Niemand passt zur Suche.' : 'Noch hat niemand eingelöst.'}</p>}
      {viewers.map((v, i) => (
        <div key={v.user_name} className="rewards-row">
          <span className="rewards-rank">{i + 1}</span>
          <div className="rewards-who">
            <div className="rewards-name">{v.user_name}</div>
            <div className="dialog-hint">zuletzt {day(v.last_redeemed_at)}</div>
          </div>
          <div className="rewards-total"><div className="rewards-total-n">{v.count}</div><div className="dialog-hint">{v.count === 1 ? 'Einlösung' : 'Einlösungen'}</div></div>
          <button type="button" className="card-secondary" onClick={() => openEdit(v)}>Bearbeiten</button>
        </div>
      ))}

      {editing && (
        <Dialog
          title={editing.user_name}
          sentence="Zahl korrigieren, oder alles zu dieser Person löschen."
          onClose={() => setEditing(null)}
          width={520}
          footer={<>
            <button type="button" className="card-link" onClick={forget}>Zuschauer vergessen</button>
            <span style={{ flex: 1 }} />
            <button type="button" className="card-primary" onClick={() => setEditing(null)}>Fertig</button>
          </>}
        >
          <ul className="dialog-list">
            <li>
              <span className="dialog-list-text">Einlösungen</span>
              <input type="number" min={0} aria-label="Anzahl" value={countEdit} onChange={(e) => setCountEdit(e.target.value)} style={{ width: 90 }} />
              <button type="button" className="card-secondary" onClick={saveCount}>Speichern</button>
              <button type="button" className="card-link" onClick={removeEntry}>Aus der Liste</button>
            </li>
          </ul>
        </Dialog>
      )}

      {adding && (
        <Dialog
          title="Eintrag von Hand"
          sentence="Einlösungen setzen, die das Tool nicht mitbekommen hat."
          onClose={() => setAdding(null)}
          width={520}
          footer={<>
            <button type="button" className="card-secondary" onClick={() => setAdding(null)}>Abbrechen</button>
            <button type="button" className="card-primary" onClick={add} disabled={!adding.user.trim() || adding.count.trim() === ''}>Eintragen</button>
          </>}
        >
          <div className="dialog-grid">
            <div className="dialog-field"><label htmlFor="lb-user">Zuschauer (Twitch-Login)</label><input id="lb-user" type="text" value={adding.user} onChange={(e) => setAdding({ ...adding, user: e.target.value })} autoFocus /></div>
            <div className="dialog-field"><label htmlFor="lb-count">Einlösungen</label><input id="lb-count" type="number" min={0} value={adding.count} onChange={(e) => setAdding({ ...adding, count: e.target.value })} style={{ width: 120 }} /></div>
          </div>
        </Dialog>
      )}
    </Dialog>
  );
}
```

`apiPatch` exists in `src/renderer/src/hooks/useApi.ts`; confirm `apiDelete` returns a truthy value on success as `RewardStatsPanel` relied on. Delete `src/renderer/src/panels/RewardStatsPanel.tsx`.

- [ ] **Step 3: The overlay pages follow the catalog**

`src/renderer/src/panels/OverlaysPanel.tsx`:
- `CatalogEntry` (line 17): add `base: string; variant: string | null;`.
- line 41 `TESTABLE.has(selected.name)` (259 and 264) → `TESTABLE.has(selected.base)`.
- line 111 `customBase`: `entry.base.replace(/^custom\//, '')`.
- lines 153, 162, 171: `/overlays/builtin/${entry.name}…` → `/overlays/builtin/${entry.base}…` (the HTML override belongs to the overlay, not to one list).
- `GROUP_LABELS.rewards` → `'Bestenlisten'`.

`src/renderer/src/components/setup/ObsStep.tsx:37`: `const rows = (catalog ?? []).filter((e) => wanted.includes(e.base));` — add `base: string` to its `CatalogEntry` interface too. Also in `src/server/overlays/catalog.ts` `GROUP_LABELS.rewards` → `'Bestenlisten'`.

`src/renderer/src/components/setup/FinishStep.tsx:63-70`: replace the first list item and the intro:

```tsx
            <p className="dialog-hint">Belohnungen legst du in Twitch an (Creator-Dashboard → Kanalpunkte). Die meisten erkennt das Tool am Namen; Bestenlisten wählst du unter Overlays & Alerts → Bestenlisten aus.</p>
            <ul className="setup-list">
              <li><span>Für jede <strong>Bestenliste</strong> eine Belohnung</span><span className="dialog-hint">wird unter Overlays & Alerts → Bestenlisten gewählt – jede Einlösung zählt</span></li>
```

and the last item: `<li><span>Jede andere Belohnung</span><span className="dialog-hint">zählt in der Statistik, in keiner Bestenliste</span></li>`.

- [ ] **Step 4: Help, vocabulary, state**

`src/renderer/src/docs/help-de.ts`:
- line 117: remove the `!flex` row.
- lines 228-244: the table row for Flex → `| *(Belohnung einer Bestenliste)* | zählt eine Einlösung in dieser Bestenliste |`; replace the two paragraphs from „Welche Belohnung den Flex freischaltet …" to „… einen Zuschauer vergessen." with:

```
Bestenlisten legst du unter **Overlays & Alerts → Bestenlisten** an: ein Name und die Belohnung aus deinem Kanal. Die Wahl hängt an der Belohnung selbst, nicht an ihrem Namen – umbenennen in Twitch ist kein Problem. Löschst du sie in Twitch, zeigt die Liste das an, bis du eine andere wählst.

**Eine Bestenliste** zählt jede Einlösung ihrer Belohnung. Der Bot antwortet „@Name: Flex Nr. 12 – Platz 3“, das Overlay **Bestenliste** zeigt die Top 3 der Liste, **Rangwechsel** meldet Überholer, die Alert-Tafel zeigt die Einlösung. \`!stats\` zeigt den eigenen Stand in jeder Liste, \`!stats <Name>\` den eines anderen. Je Liste gibt es unter Overlays eine Bestenliste und einen Rangwechsel mit eigener Adresse.

In der Liste siehst du die Rangliste, kannst Zahlen korrigieren, Einträge von Hand setzen, die Liste umbenennen oder löschen und einen Zuschauer vergessen.
```

- line 244 „Flexe werden mit dem Twitch-Login gezählt" → „Einlösungen werden mit dem Twitch-Login gezählt".

`CONTEXT.md:35-37`: replace the **Flex** entry with

```
**Bestenliste** (UI: „Bestenliste“, plural „Bestenlisten“):
A ranking of one Twitch reward's redemptions (2026-10-06, evening). A list has a key (from its title, never changes), a title, and the reward's Twitch id (`leaderboards`); each redemption of that reward adds one to `reward_stats` under the key. Overlays take the key as `?type=`. No unlock step, no `!flex` — that flow lived for one day.
_Avoid_: flex, point, score. A reward without a list counts nowhere.
```

`docs/STAND.md`: after the paragraph ending on line 306 add one paragraph: „**Mehrere Bestenlisten** (Nils, 06.10., Abend): je Liste eine Belohnung per Twitch-ID, Einlösung zählt direkt, `!flex` und `flex_credits` wieder weg, Seite unter Overlays & Alerts → Bestenlisten, Overlays je Liste mit `?type=<key>`. Alte Overlay-Adressen ohne Parameter zeigen nichts mehr. Spec: `docs/superpowers/specs/2026-10-06-bestenlisten-design.md`."

- [ ] **Step 5: Verify**

Run: `npm test && npm run typecheck && npm run lint`
Expected: green.

By hand in the running app (nodemon has restarted it; reload the window if the sidebar still shows the old tab):
1. Overlays & Alerts → Bestenlisten shows the list „Flex" (from the migration) with Nils's reward, or an empty state when none was chosen.
2. „+ Bestenliste" with Twitch connected: the reward list offers the channel's rewards, a reward already taken is greyed.
3. Overlays → group Bestenlisten shows „Bestenliste: Flex" and „Rangwechsel: Flex"; „Adresse kopieren" gives `…?type=flex`; „Im Stream testen" animates the overlay opened with that address.
4. In Twitch redeem the reward once: the bot answers „💪 @Name: Flex Nr. … – Platz …", the alert board shows it, the list's count rises.
5. `!stats` in chat answers with every list.

- [ ] **Step 6: Commit**

```bash
git add -A src/renderer src/shared/features.ts src/server/overlays/catalog.ts CONTEXT.md docs/STAND.md
git commit -m "feat(app): page Bestenlisten under Overlays & Alerts, help and vocabulary follow"
```

---

## Self-review notes

- Spec coverage: data model and counting (Tasks 1–2), server routes (Task 1), overlays and catalog (Task 5), chat (Task 3), page (Task 6), migration (Task 4), tests per section, exclusions untouched.
- Open flexes are counted in the migration whether or not a reward was chosen (Task 4) — a deliberate widening of spec step 2: the credits were paid for either way.
- The hint for a missing list lives as the placeholder entry's sentence in the catalog group (Task 5), which is how the panel shows text per entry; no extra UI element.
- The chat announcement on a redemption goes through `sayInChat` from `src/server/bot/index.ts` (Task 2); if the bot is not connected it must no-op — check that function's guard before relying on it.
