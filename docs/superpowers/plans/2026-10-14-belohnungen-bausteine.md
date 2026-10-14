# Belohnungen: Bausteine, Vorlagen, einfaches Anlegen – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Belohnungen (Kanalpunkte und eigene Punkte) bekommen die Bausteine Alert, Glücksrad, Szene, Timer und Ton, acht Vorlagen nach Persona und einen Anlege-Ablauf, der nie mehr als ein Feld des Bausteins zeigt.

**Architecture:** Server: `reward-actions.ts` bleibt die eine Stelle für Bausteine (Schlüssel, Prüfung der Felder, Ausführung). Ein neues Modul `reward-timer.ts` legt einen Countdown über das bestehende „Ziel“ (`stream_state`) und holt das eigene Ziel danach zurück. Beide Einlöse-Wege (`bot/eventsub.ts`, `points/redeem.ts`) reichen Name und Text durch und schicken Text und Ton im `reward-redeemed`-Ereignis mit. Oberfläche: eine Vorlagen-Liste als Daten, ein Start-Dialog (Vorlagen, „Eigene Belohnung“), ein Blatt für eine Vorlage, der bestehende Quest-Pfad für eigene Belohnungen und ein gemeinsames Feld-Bauteil für Timer und Ton.

**Tech Stack:** TypeScript, Express, better-sqlite3, Vitest + supertest (Server), React (Electron-Renderer), Overlays als HTML mit Vanilla-JS.

**Spec:** `docs/superpowers/specs/2026-10-14-belohnungen-bausteine-design.md`

## Global Constraints

- Sprache in der App: Deutsch, Nils' Wörter („Overlays & Alerts“, „Alert“, „Belohnung“, „Kanalpunkte“).
- Bausteine: `alert`, `roulette`, `scene`, `timer`, `sound`. `feature_request` und `change_music` entfallen.
- Timer: Aufgabe 1–60 Zeichen; Dauer 1–60 Minuten, Standard 5; Knöpfe 1, 3, 5, 10 Min; „Zeit um!“ etwa 5 s.
- Ton: aus den vorhandenen Alert-Tönen; Lautstärke fest 0.8.
- Text im Alert: höchstens 100 Zeichen, danach „…“; Links (`http…`, `www.…`, `name.tld/…`) werden „[Link]“.
- Schema 37.
- Nur ein Belohnungs-Timer zur Zeit; ein zweiter schlägt fehl → Punkte zurück.
- Tests: `npx vitest run --pool=threads` (der Standard-Pool bricht unter Windows bei laufendem Dev-Tool ab).
- Typecheck: `npx tsc --noEmit -p tsconfig.json` und `npx tsc --noEmit -p tsconfig.node.json`.
- Keine Oberflächen-Durchgänge mit Nils ungefragt; Claude prüft die Oberfläche selbst in Chrome (playwright-core, `http://localhost:5273/#token=<Fixed API token>&port=4000`).
- Commits enden mit `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Kein Push ohne Nils.

## Review Focus

- Belohnungs-Timer läuft, Nils beendet in der App sein eigenes Ziel über „Zurücksetzen“ – der Countdown muss weg und darf danach kein altes Ziel zurückholen (Task 3, Test „resetting the goal ends a reward timer“).
- App neu gestartet, während der Countdown pausiert war – er bleibt pausiert mit derselben Restzeit (Task 3, Test „keeps a paused countdown paused after a restart“).
- Text mit Zeilenumbrüchen oder nur Leerzeichen – kein leerer Alert-Text, Umbrüche werden Leerzeichen (Task 5, Test in `alertText`).
- Ton-Belohnung, deren Datei gelöscht wurde, wird bearbeitet – Speichern ohne Ton-Wechsel darf nicht scheitern, muss aber zur Wahl eines Tons auffordern (Task 2, Test „refuses a sound that is gone“; Task 8 zeigt den Hinweis).
- Dashboard-Belohnung „Musik wünschen“ wird eingelöst – nur ein Alert, kein Fehler, keine Rückbuchung (Task 1, Test „treats music and feature names as an alert“).

---

## Dateien

| Datei | Aufgabe |
|---|---|
| `src/server/db/schema.ts` | v37, neue Spalten in `CREATE TABLE` |
| `src/server/db/index.ts` | Migration `from < 37` |
| `src/server/reward-actions.ts` | Bausteine, `extrasOfReward`, `alertText`, `soundOf`, `runAction` |
| `src/server/reward-timer.ts` (neu) | Countdown über dem Ziel |
| `src/server/api/stream-state.ts` | Timer-Motor exportieren, Routen für den Countdown |
| `src/server/index.ts` | `restoreRewardTimer()` beim Start |
| `src/server/channel-rewards.ts` | Felder `task`, `minutes`, `sound` |
| `src/server/points/rewards.ts` | dieselben Felder |
| `src/server/points/redeem.ts` | Name, Text, Ton durchreichen |
| `src/server/bot/eventsub.ts` | dasselbe für Kanalpunkte |
| `src/server/api/actions.ts` | Test-Alert ohne `feature_request` |
| `src/shared/types.ts` | `StreamState` um Countdown-Felder |
| `src/overlays/alerts/index.html` | Text und Ton aus `reward-redeemed` |
| `src/overlays/challenge/index.html` | Countdown, „von …“, „Zeit um!“ |
| `src/renderer/src/panels/ChallengePanel.tsx` | Countdown, Pause, Beenden |
| `src/renderer/src/components/rewards/rewardBlocks.ts` (neu) | Bausteine und Vorlagen als Daten |
| `src/renderer/src/components/rewards/BlockFields.tsx` (neu) | Feld für Timer bzw. Ton |
| `src/renderer/src/components/rewards/RewardStart.tsx` (neu) | Vorlagen-Dialog |
| `src/renderer/src/components/rewards/RewardQuestPath.tsx` | eigene Belohnung mit neuen Bausteinen |
| `src/renderer/src/components/rewards/RewardTemplates.tsx` | gelöscht |
| `src/renderer/src/panels/ChannelRewardsPanel.tsx`, `PointsPanel.tsx` | Start-Dialog, schlanker Bearbeiten-Dialog |
| `src/renderer/src/docs/help-de.ts`, `docs/STAND.md` | Texte |

---

### Task 1: Schema 37 und die neuen Bausteine

**Files:**
- Modify: `src/server/db/schema.ts` (Zeile 1, `stream_state` ~61, `twitch_reward_actions` ~175, `point_rewards` ~199)
- Modify: `src/server/db/index.ts` (nach dem `if (from < 36)`-Block ~417)
- Modify: `src/server/reward-actions.ts:10-36`
- Modify: `src/server/api/actions.ts:184`
- Modify: `src/server/__tests__/channel-rewards.test.ts`, `src/server/__tests__/points.test.ts` (Aufrufe mit `feature_request`/`change_music`)
- Create: `src/server/__tests__/reward-blocks-migration.test.ts`

**Interfaces:**
- Produces: `ACTION_KEYS = ['alert', 'roulette', 'scene', 'timer', 'sound']`, `ActionKey`; Spalten `task TEXT`, `minutes INTEGER`, `sound TEXT` in `twitch_reward_actions` und `point_rewards`; Spalten `timer_ends_at INTEGER`, `timer_task_by TEXT`, `timer_paused_left INTEGER`, `saved_challenge TEXT` in `stream_state`.

- [ ] **Step 1: Failing test schreiben**

`src/server/__tests__/reward-blocks-migration.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { getDb, initDatabase } from '../db/index';
import { SCHEMA_VERSION } from '../db/schema';
import { actionFromTitle, isActionKey } from '../reward-actions';

/**
 * Belohnungen bekommen Timer und Ton (spec 2026-10-14). „Idee einreichen“ und
 * „Musik wechseln“ waren technisch schon nur ein Alert und werden einer.
 */
describe('reward building blocks (v37)', () => {
  let dir = '';
  afterEach(() => { if (dir) fs.rmSync(dir, { recursive: true, force: true }); dir = ''; });

  const columns = (table: string) => (getDb().prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((c) => c.name);

  it('turns idea and music rewards into an alert and adds the new columns', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nst-v37-'));
    const file = path.join(dir, 'stream.db');
    initDatabase(file);
    const db = getDb();
    db.exec("INSERT INTO point_rewards (name, cost, action, needs_input) VALUES ('Idee', 10, 'feature_request', 1), ('Song', 10, 'change_music', 0), ('Rad', 10, 'roulette', 0)");
    db.exec("INSERT INTO twitch_reward_actions (reward_id, action) VALUES ('a', 'feature_request'), ('b', 'change_music'), ('c', 'scene')");
    db.exec('DELETE FROM schema_version');
    db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(36);
    db.close();

    initDatabase(file);
    const points = getDb().prepare('SELECT name, action, needs_input FROM point_rewards ORDER BY name').all();
    expect(points).toEqual([
      { name: 'Idee', action: 'alert', needs_input: 1 },
      { name: 'Rad', action: 'roulette', needs_input: 0 },
      { name: 'Song', action: 'alert', needs_input: 0 },
    ]);
    expect(getDb().prepare('SELECT reward_id, action FROM twitch_reward_actions ORDER BY reward_id').all()).toEqual([
      { reward_id: 'a', action: 'alert' }, { reward_id: 'b', action: 'alert' }, { reward_id: 'c', action: 'scene' },
    ]);
    for (const table of ['point_rewards', 'twitch_reward_actions']) expect(columns(table)).toEqual(expect.arrayContaining(['task', 'minutes', 'sound']));
    expect(columns('stream_state')).toEqual(expect.arrayContaining(['timer_ends_at', 'timer_task_by', 'timer_paused_left', 'saved_challenge']));
    expect((getDb().prepare('SELECT version FROM schema_version').get() as { version: number }).version).toBe(37);
  });

  it('starts a fresh database at v37', () => {
    initDatabase(':memory:');
    expect(SCHEMA_VERSION).toBe(37);
    expect(columns('point_rewards')).toEqual(expect.arrayContaining(['task', 'minutes', 'sound']));
  });

  it('knows timer and sound, and no longer idea or music', () => {
    expect(['alert', 'roulette', 'scene', 'timer', 'sound'].every(isActionKey)).toBe(true);
    expect(isActionKey('feature_request')).toBe(false);
    expect(isActionKey('change_music')).toBe(false);
  });

  it('treats music and feature names as an alert', () => {
    expect(actionFromTitle('Musik wünschen')).toBeNull();
    expect(actionFromTitle('Feature-Idee')).toBeNull();
    expect(actionFromTitle('Bug-Roulette')).toBe('roulette');
    expect(actionFromTitle('Szene Wald')).toBe('scene');
  });
});
```

- [ ] **Step 2: Test laufen lassen, er schlägt fehl**

Run: `npx vitest run --pool=threads src/server/__tests__/reward-blocks-migration.test.ts`
Expected: FAIL (`SCHEMA_VERSION` ist 36, `isActionKey('timer')` false).

- [ ] **Step 3: Schema**

In `src/server/db/schema.ts` Zeile 1: `export const SCHEMA_VERSION = 37;`

`stream_state` bekommt nach `project_name      TEXT`:

```sql
  project_name      TEXT,
  -- A reward's countdown over the goal (v37): when it ends (ms since 1970),
  -- who redeemed it, how much was left when paused, and the goal it covers.
  timer_ends_at     INTEGER,
  timer_task_by     TEXT,
  timer_paused_left INTEGER,
  saved_challenge   TEXT
```

`twitch_reward_actions` nach `scene_seconds INTEGER`:

```sql
  scene_seconds INTEGER,
  -- Timer and sound (v37): the task shown, its minutes, the sound file.
  task          TEXT,
  minutes       INTEGER,
  sound         TEXT
```

`point_rewards` nach `scene_seconds    INTEGER,`:

```sql
  task             TEXT,
  minutes          INTEGER,
  sound            TEXT,
```

- [ ] **Step 4: Migration**

In `src/server/db/index.ts` direkt nach dem `if (from < 36) { … }`-Block:

```ts
  if (from < 37) {
    // Belohnungen get Timer and Ton (14.10.); "Idee einreichen" and "Musik
    // wechseln" were only ever an alert and become one.
    const add = (table: string, column: string, type: string) => {
      const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
      if (!columns.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    };
    for (const table of ['twitch_reward_actions', 'point_rewards']) {
      add(table, 'task', 'TEXT');
      add(table, 'minutes', 'INTEGER');
      add(table, 'sound', 'TEXT');
      db.prepare(`UPDATE ${table} SET action = 'alert' WHERE action IN ('feature_request', 'change_music')`).run();
    }
    add('stream_state', 'timer_ends_at', 'INTEGER');
    add('stream_state', 'timer_task_by', 'TEXT');
    add('stream_state', 'timer_paused_left', 'INTEGER');
    add('stream_state', 'saved_challenge', 'TEXT');
    console.log('[DB] Migrated: reward timer and sound');
  }
```

- [ ] **Step 5: Bausteine in `reward-actions.ts`**

Kommentar Z. 10–12 und Z. 13 ersetzen:

```ts
 * Five building blocks (spec 2026-10-14-belohnungen-bausteine): an alert, the
 * wheel, a scene for a while, a timer over the goal, a sound with the alert.
 */
export const ACTION_KEYS = ['alert', 'roulette', 'scene', 'timer', 'sound'] as const;
```

`actionFromTitle` (Z. 24–31):

```ts
export function actionFromTitle(title: string): ActionKey | null {
  const t = title.toLowerCase();
  if (t.includes('roulette')) return 'roulette';
  if (t.includes('scene') || t.includes('szene')) return 'scene';
  return null;
}
```

- [ ] **Step 6: Alte Schlüssel aus Aufrufern und Tests nehmen**

`src/server/api/actions.ts:184`: `reward_type: 'feature_request'` → `reward_type: 'alert'`.

`src/server/__tests__/points.test.ts` Z. 210, 254, 345: `action: 'feature_request'` → `action: 'alert'`.

`src/server/__tests__/channel-rewards.test.ts`:
- Test „runs the action its id is bound to“: `action: 'change_music'` → `action: 'alert'`, Erwartung `toBe('alert')`.
- Test „keeps telling a dashboard reward apart by its name“ ersetzen durch:

```ts
    it('treats a dashboard reward named for music or ideas as an alert', async () => {
      await redeem({ id: 'dddd-2', title: 'Feature wünschen' });
      expect((await queue())[0].reward_type).toBe('Feature wünschen');
      expect(calls.some((c) => c.path === '/channel_points/custom_rewards/redemptions')).toBe(false);
    });
```

(Ohne erkannte Aktion schreibt `eventsub.ts` den Titel als `reward_type` – unverändert.)

- [ ] **Step 7: Tests laufen lassen**

Run: `npx vitest run --pool=threads src/server/__tests__/reward-blocks-migration.test.ts src/server/__tests__/channel-rewards.test.ts src/server/__tests__/points.test.ts`
Expected: PASS. Danach `npx tsc --noEmit -p tsconfig.node.json` – Fehler im Renderer kommen erst in Task 7/8 dran; der Node-Typecheck muss sauber sein.

- [ ] **Step 8: Commit**

```bash
git add src/server/db/schema.ts src/server/db/index.ts src/server/reward-actions.ts src/server/api/actions.ts src/server/__tests__/reward-blocks-migration.test.ts src/server/__tests__/channel-rewards.test.ts src/server/__tests__/points.test.ts
git commit -m "feat(rewards): schema 37, timer and sound blocks, idea and music become an alert"
```

---

### Task 2: Felder für Timer und Ton an beiden Belohnungsarten

**Files:**
- Modify: `src/server/reward-actions.ts` (neue Funktion `extrasOfReward`, Konstanten)
- Modify: `src/server/channel-rewards.ts` (`ChannelReward`, `Bound`, `boundAction`, `fromHelix`, `Draft`, `validate`, `bind`)
- Modify: `src/server/points/rewards.ts` (`PointReward`, SQL, `validate`)
- Test: `src/server/__tests__/reward-fields.test.ts` (neu)

**Interfaces:**
- Consumes: `listSounds(): string[]` aus `src/server/bot/alerts.ts`.
- Produces:
  - `export const TASK_MAX = 60; export const TIMER_MINUTES_MAX = 60; export const TIMER_MINUTES_DEFAULT = 5;`
  - `export function extrasOfReward(action: ActionKey | undefined, task: unknown, minutes: unknown, sound: unknown): { task: string | null; minutes: number | null; sound: string | null } | { error: string }`
  - `ChannelReward` und `PointReward` haben `task: string | null; minutes: number | null; sound: string | null`.
  - `actionForReward(id)` liefert zusätzlich `task`, `minutes`, `sound`.

- [ ] **Step 1: Failing test schreiben**

`src/server/__tests__/reward-fields.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { initDatabase } from '../db/index';
import { generateApiToken } from '../auth-token';
import { createApp } from '../index';

/** Timer and Ton carry their own fields; every other block carries none. */
describe('reward fields for timer and sound', () => {
  let app: Express;
  let token: string;
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const SOUND = `test-${process.pid}-schrei.mp3`;
  const create = (body: Record<string, unknown>) => request(app).post('/api/points/rewards').set(auth()).send({ cost: 10, ...body });

  beforeEach(async () => {
    initDatabase(':memory:');
    token = generateApiToken();
    app = createApp();
    await request(app).post('/api/alerts/sounds').query({ name: SOUND }).set(auth()).set('Content-Type', 'audio/mpeg')
      .send(Buffer.concat([Buffer.from('ID3'), Buffer.alloc(24)])).expect(200);
  });
  afterEach(async () => { await request(app).delete(`/api/alerts/sounds/${SOUND}`).set(auth()); });

  it('keeps the task and minutes of a timer', async () => {
    const made = (await create({ name: 'Handicap', action: 'timer', task: '  Nur Pistole ', minutes: 10 }).expect(201)).body;
    expect(made).toMatchObject({ action: 'timer', task: 'Nur Pistole', minutes: 10, sound: null });
  });

  it('gives a timer five minutes and its name as the task when none is sent', async () => {
    const made = (await create({ name: 'Handicap', action: 'timer' }).expect(201)).body;
    expect(made).toMatchObject({ task: 'Handicap', minutes: 5 });
  });

  it('refuses a timer longer than an hour or a task over 60 characters', async () => {
    await create({ name: 'Lang', action: 'timer', minutes: 61 }).expect(400);
    await create({ name: 'Viel', action: 'timer', task: 'x'.repeat(61) }).expect(400);
  });

  it('keeps the sound of a sound reward', async () => {
    const made = (await create({ name: 'Jumpscare', action: 'sound', sound: SOUND }).expect(201)).body;
    expect(made).toMatchObject({ action: 'sound', sound: SOUND, task: null, minutes: null });
  });

  it('refuses a sound that is gone', async () => {
    await create({ name: 'Weg', action: 'sound', sound: 'gibt-es-nicht.mp3' }).expect(400);
    await create({ name: 'Ohne', action: 'sound' }).expect(400);
  });

  it('drops timer and sound fields when the reward becomes an alert', async () => {
    const made = (await create({ name: 'Wechsel', action: 'timer', minutes: 3 }).expect(201)).body;
    const changed = (await request(app).patch(`/api/points/rewards/${made.id}`).set(auth()).send({ action: 'alert' }).expect(200)).body;
    expect(changed).toMatchObject({ action: 'alert', task: null, minutes: null, sound: null });
  });
});
```

- [ ] **Step 2: Test laufen lassen, er schlägt fehl**

Run: `npx vitest run --pool=threads src/server/__tests__/reward-fields.test.ts`
Expected: FAIL (`task` undefined).

- [ ] **Step 3: `extrasOfReward` in `reward-actions.ts`**

Oben ergänzen: `import { listSounds } from './bot/alerts';`

Nach `sceneOfReward`:

```ts
export const TASK_MAX = 60;
export const TIMER_MINUTES_MAX = 60;
export const TIMER_MINUTES_DEFAULT = 5;

/**
 * The fields of a timer or a sound reward as the app sends them; null for any
 * other block. A timer without a task takes the reward's name (the caller
 * passes it as `fallbackTask`); a sound must be one of the alert sounds.
 */
export function extrasOfReward(action: ActionKey | undefined, task: unknown, minutes: unknown, sound: unknown, fallbackTask = ''):
  { task: string | null; minutes: number | null; sound: string | null } | { error: string } {
  if (action === 'timer') {
    const t = typeof task === 'string' && task.trim() ? task.trim() : fallbackTask.trim();
    if (!t || t.length > TASK_MAX) return { error: `task must be 1 to ${TASK_MAX} characters` };
    const m = minutes === undefined || minutes === null ? TIMER_MINUTES_DEFAULT : minutes;
    if (!Number.isInteger(m) || (m as number) < 1 || (m as number) > TIMER_MINUTES_MAX) return { error: `minutes must be from 1 to ${TIMER_MINUTES_MAX}` };
    return { task: t, minutes: m as number, sound: null };
  }
  if (action === 'sound') {
    if (typeof sound !== 'string' || !listSounds().includes(sound)) return { error: 'sound must be one of the alert sounds' };
    return { task: null, minutes: null, sound };
  }
  return { task: null, minutes: null, sound: null };
}
```

Prüfen, dass `bot/alerts.ts` `reward-actions.ts` nicht importiert (sonst Kreis): `grep -n "reward-actions" src/server/bot/alerts.ts` → keine Zeile.

- [ ] **Step 4: Eigene Punkte (`points/rewards.ts`)**

- `PointReward` um `task: string | null; minutes: number | null; sound: string | null;` ergänzen.
- In allen drei `SELECT`s (Z. 30, 34, 39) nach `scene_seconds,` einfügen: `task, minutes, sound,`.
- In `validate` die Vorlage `next` für `base` und neu um `task: base.task, minutes: base.minutes, sound: base.sound` bzw. `task: null, minutes: null, sound: null` ergänzen; nach dem Szenen-Block:

```ts
  const extras = extrasOfReward(next.action,
    'task' in body ? body.task : next.task,
    'minutes' in body ? body.minutes : next.minutes,
    'sound' in body ? body.sound : next.sound,
    next.name);
  if ('error' in extras) return { error: extras.error };
  next.task = extras.task;
  next.minutes = extras.minutes;
  next.sound = extras.sound;
```

  (Import: `import { extrasOfReward, isActionKey, sceneOfReward, type ActionKey } from '../reward-actions';`)
- `createPointReward`:

```ts
  const id = getDb().prepare('INSERT INTO point_rewards (name, cost, action, scene_name, scene_seconds, task, minutes, sound, needs_input, cooldown_seconds, enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(r.name, r.cost, r.action, r.scene_name, r.scene_seconds, r.task, r.minutes, r.sound, r.needs_input ? 1 : 0, r.cooldown_seconds, r.enabled ? 1 : 0).lastInsertRowid;
```

- `updatePointReward`:

```ts
  getDb().prepare('UPDATE point_rewards SET name = ?, cost = ?, action = ?, scene_name = ?, scene_seconds = ?, task = ?, minutes = ?, sound = ?, needs_input = ?, cooldown_seconds = ?, enabled = ? WHERE id = ?')
    .run(r.name, r.cost, r.action, r.scene_name, r.scene_seconds, r.task, r.minutes, r.sound, r.needs_input ? 1 : 0, r.cooldown_seconds, r.enabled ? 1 : 0, id);
```

- [ ] **Step 5: Kanalpunkte (`channel-rewards.ts`)**

- `ChannelReward` um `task: string | null; minutes: number | null; sound: string | null;`.
- `interface Bound { action: ActionKey; scene_name: string | null; scene_seconds: number | null; task: string | null; minutes: number | null; sound: string | null }`
- `boundAction`:

```ts
function boundAction(id: string): Bound | null {
  const row = getDb().prepare('SELECT action, scene_name, scene_seconds, task, minutes, sound FROM twitch_reward_actions WHERE reward_id = ?').get(id) as (Omit<Bound, 'action'> & { action: string }) | undefined;
  return row && isActionKey(row.action) ? { ...row, action: row.action } : null;
}
```

- `fromHelix`: nach `scene_seconds` ergänzen `task: bound?.task ?? null, minutes: bound?.minutes ?? null, sound: bound?.sound ?? null,`.
- `Draft` um `task?: string | null; minutes?: number | null; sound?: string | null;`.
- In `validate` im `if ('action' in b || creating)`-Block nach der Szene:

```ts
    const extras = extrasOfReward(d.action, b.task, b.minutes, b.sound, typeof b.title === 'string' ? b.title : '');
    if ('error' in extras) return { status: 400, error: extras.error };
    d.task = extras.task;
    d.minutes = extras.minutes;
    d.sound = extras.sound;
```

  (Import ergänzen: `extrasOfReward`.)
- `bind`:

```ts
function bind(id: string, d: Draft): void {
  if (!d.action) return;
  getDb().prepare('INSERT OR REPLACE INTO twitch_reward_actions (reward_id, action, scene_name, scene_seconds, task, minutes, sound) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, d.action, d.scene_name ?? null, d.scene_seconds ?? null, d.task ?? null, d.minutes ?? null, d.sound ?? null);
}
```

Ein Test für Kanalpunkte kommt in `channel-rewards.test.ts` im `describe('Twitch rewards from the app')`:

```ts
  it('keeps a timer reward\'s task and minutes', async () => {
    const made = (await request(app).post('/api/channel-rewards').set(auth()).send({ title: 'Nur Pistole', cost: 500, action: 'timer', minutes: 3 }).expect(201)).body;
    expect(made).toMatchObject({ action: 'timer', task: 'Nur Pistole', minutes: 3, sound: null });
  });
```

- [ ] **Step 6: Tests laufen lassen**

Run: `npx vitest run --pool=threads src/server/__tests__/reward-fields.test.ts src/server/__tests__/channel-rewards.test.ts src/server/__tests__/points.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/server/reward-actions.ts src/server/channel-rewards.ts src/server/points/rewards.ts src/server/__tests__/reward-fields.test.ts src/server/__tests__/channel-rewards.test.ts
git commit -m "feat(rewards): timer task and minutes, sound file on both kinds of rewards"
```

---

### Task 3: Countdown über dem Ziel

**Files:**
- Modify: `src/server/api/stream-state.ts`
- Create: `src/server/reward-timer.ts`
- Modify: `src/server/index.ts:293` (neben `restoreTimerState()`)
- Modify: `src/shared/types.ts:3-12`
- Test: `src/server/__tests__/reward-timer.test.ts` (neu)

**Interfaces:**
- Produces (`api/stream-state.ts`): `export function startServerTimer(): void`, `export function stopServerTimer(): void`, `export function currentTimerSeconds(): number`, `export function broadcastState(): void`; Routen `POST /api/stream-state/reward-timer/end` und `POST /api/stream-state/reward-timer/pause` (beide antworten mit dem Zustand).
- Produces (`reward-timer.ts`):
  - `export const REWARD_TIMER_DONE_MS = 5000;`
  - `export function startRewardTimer(o: { task: string; minutes: number; who: string }, now?: number): { ok: true } | { ok: false; reason: string }`
  - `export function endRewardTimer(now?: number): void` – sofort zurück zum Ziel davor
  - `export function dropRewardTimer(): void` – Countdown weg, ohne das Ziel davor zurückzuholen (beim Zurücksetzen des Ziels)
  - `export function toggleRewardTimerPause(now?: number): boolean` – false, wenn kein Countdown läuft
  - `export function restoreRewardTimer(now?: number): void`
  - `export function rewardTimerActive(): boolean`
- Produces (`shared/types.ts`): `StreamState` um `timer_ends_at: number | null; timer_task_by: string | null; timer_paused_left: number | null; saved_challenge: string | null;`

- [ ] **Step 1: Failing test schreiben**

`src/server/__tests__/reward-timer.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { getDb, initDatabase } from '../db/index';
import { generateApiToken } from '../auth-token';
import { createApp } from '../index';
import { REWARD_TIMER_DONE_MS, endRewardTimer, restoreRewardTimer, startRewardTimer, toggleRewardTimerPause } from '../reward-timer';

/**
 * A reward's timer is a countdown over "Ziel für heute": the task, who
 * redeemed it and the time left; "Zeit um!" for a moment; then whatever goal
 * was there before comes back as it was.
 */
describe('reward timer', () => {
  let app: Express;
  let token: string;
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const state = () => getDb().prepare('SELECT * FROM stream_state WHERE id = 1').get() as Record<string, unknown>;
  const T0 = Date.UTC(2026, 9, 14, 20, 0, 0);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    initDatabase(':memory:');
    token = generateApiToken();
    app = createApp();
  });
  afterEach(() => { endRewardTimer(); vi.useRealTimers(); });

  it('shows the task, who and when it ends', () => {
    expect(startRewardTimer({ task: 'Nur Pistole', minutes: 5, who: 'Lena' })).toEqual({ ok: true });
    expect(state()).toMatchObject({ challenge_title: 'Nur Pistole', challenge_status: 'in_progress', timer_ends_at: T0 + 300_000, timer_task_by: 'Lena', timer_running: 0 });
  });

  it('says "Zeit um" at the end, then clears', () => {
    startRewardTimer({ task: 'Nur Pistole', minutes: 1, who: 'Lena' });
    vi.advanceTimersByTime(60_000);
    expect(state()).toMatchObject({ challenge_status: 'done', timer_ends_at: T0 + 60_000 });
    vi.advanceTimersByTime(REWARD_TIMER_DONE_MS);
    expect(state()).toMatchObject({ challenge_title: null, challenge_status: 'idle', timer_ends_at: null, timer_task_by: null });
  });

  it('refuses a second timer while one runs', () => {
    startRewardTimer({ task: 'Eins', minutes: 5, who: 'Lena' });
    expect(startRewardTimer({ task: 'Zwei', minutes: 5, who: 'Tom' })).toEqual({ ok: false, reason: 'es läuft schon ein Timer' });
    expect(state().challenge_title).toBe('Eins');
  });

  it('brings the streamer\'s own goal back, its clock having run on', async () => {
    await request(app).patch('/api/stream-state').set(auth()).send({ challenge_title: 'Kapitel 3 fertig', challenge_status: 'in_progress', timer_seconds: 100, timer_running: 1 }).expect(200);
    startRewardTimer({ task: 'Nur Pistole', minutes: 1, who: 'Lena' });
    vi.advanceTimersByTime(60_000 + REWARD_TIMER_DONE_MS);
    const s = state();
    expect(s).toMatchObject({ challenge_title: 'Kapitel 3 fertig', challenge_status: 'in_progress', timer_running: 1, saved_challenge: null });
    expect(s.timer_seconds as number).toBeGreaterThanOrEqual(165);
    await request(app).patch('/api/stream-state').set(auth()).send({ timer_running: 0 });
  });

  it('pauses and resumes with the time that was left', () => {
    startRewardTimer({ task: 'Nur Pistole', minutes: 5, who: 'Lena' });
    vi.advanceTimersByTime(60_000);
    expect(toggleRewardTimerPause()).toBe(true);
    expect(state()).toMatchObject({ timer_paused_left: 240_000, timer_ends_at: null });
    vi.advanceTimersByTime(600_000);
    expect(state().challenge_status).toBe('in_progress');
    toggleRewardTimerPause();
    expect(state()).toMatchObject({ timer_paused_left: null, timer_ends_at: Date.now() + 240_000 });
  });

  it('runs on after a restart, or ends at once when the time is up', () => {
    startRewardTimer({ task: 'Nur Pistole', minutes: 5, who: 'Lena' });
    restoreRewardTimer(T0 + 10 * 60_000);
    expect(state()).toMatchObject({ challenge_status: 'idle', timer_ends_at: null });

    startRewardTimer({ task: 'Nochmal', minutes: 5, who: 'Lena' });
    restoreRewardTimer();
    vi.advanceTimersByTime(300_000);
    expect(state().challenge_status).toBe('done');
  });

  it('keeps a paused countdown paused after a restart', () => {
    startRewardTimer({ task: 'Nur Pistole', minutes: 5, who: 'Lena' });
    toggleRewardTimerPause();
    restoreRewardTimer(T0 + 60 * 60_000);
    expect(state()).toMatchObject({ challenge_status: 'in_progress', timer_paused_left: 300_000 });
  });

  it('ends from the app and when the goal is reset', async () => {
    startRewardTimer({ task: 'Nur Pistole', minutes: 5, who: 'Lena' });
    await request(app).post('/api/stream-state/reward-timer/end').set(auth()).expect(200);
    expect(state()).toMatchObject({ challenge_status: 'idle', timer_ends_at: null });
  });

  it('resetting the goal ends a reward timer', async () => {
    await request(app).patch('/api/stream-state').set(auth()).send({ challenge_title: 'Eigenes', challenge_status: 'in_progress' }).expect(200);
    startRewardTimer({ task: 'Nur Pistole', minutes: 5, who: 'Lena' });
    await request(app).patch('/api/stream-state').set(auth()).send({ challenge_title: null, challenge_status: 'idle', timer_seconds: 0, timer_running: 0 }).expect(200);
    expect(state()).toMatchObject({ challenge_title: null, timer_ends_at: null, saved_challenge: null });
    vi.advanceTimersByTime(600_000);
    expect(state().challenge_title).toBeNull();
  });
});
```

- [ ] **Step 2: Test laufen lassen, er schlägt fehl**

Run: `npx vitest run --pool=threads src/server/__tests__/reward-timer.test.ts`
Expected: FAIL (`../reward-timer` fehlt).

- [ ] **Step 3: Timer-Motor in `api/stream-state.ts` exportieren**

`function startServerTimer()` → `export function startServerTimer()`, ebenso `stopServerTimer`. Dazu:

```ts
/** The goal's clock as it stands — the running value, not the last one saved. */
export function currentTimerSeconds(): number {
  if (timerInterval) return timerSeconds;
  const row = getDb().prepare('SELECT timer_seconds FROM stream_state WHERE id = 1').get() as { timer_seconds: number } | undefined;
  return row?.timer_seconds ?? 0;
}

export function broadcastState(): void {
  broadcast('stream-state', getDb().prepare('SELECT * FROM stream_state WHERE id = 1').get());
}
```

Im `PATCH /`, vor `db.prepare(\`UPDATE …\`)`: Wird das Ziel zurückgesetzt (`challenge_status === 'idle'`), endet ein Countdown ohne Rückweg:

```ts
  if (challenge_status === 'idle') dropRewardTimer();
```

und am Dateiende zwei Routen vor `export default router;`:

```ts
router.post('/reward-timer/end', (_req, res) => {
  endRewardTimer();
  res.json(getDb().prepare('SELECT * FROM stream_state WHERE id = 1').get());
});

router.post('/reward-timer/pause', (_req, res) => {
  if (!toggleRewardTimerPause()) { res.status(409).json({ error: 'Es läuft kein Timer einer Belohnung.' }); return; }
  res.json(getDb().prepare('SELECT * FROM stream_state WHERE id = 1').get());
});
```

Import oben: `import { dropRewardTimer, endRewardTimer, toggleRewardTimerPause } from '../reward-timer';`

- [ ] **Step 4: `src/server/reward-timer.ts` anlegen**

```ts
import { getDb } from './db/index';
import { broadcastState, currentTimerSeconds, startServerTimer, stopServerTimer } from './api/stream-state';

/**
 * A reward's countdown (spec 2026-10-14-belohnungen-bausteine): it takes
 * "Ziel für heute" for a while — the task, who redeemed it, the time left —
 * says "Zeit um!" for a moment and then gives the goal back as it was. Only
 * one at a time. The end lives in the database, so a restart picks it up.
 */

export const REWARD_TIMER_DONE_MS = 5000;

interface Saved { challenge_title: string | null; challenge_status: string; timer_seconds: number; timer_running: number; saved_at: number }
interface Row { challenge_title: string | null; challenge_status: string; timer_running: number; timer_ends_at: number | null; timer_paused_left: number | null; saved_challenge: string | null }

let endTimer: ReturnType<typeof setTimeout> | null = null;
let clearTimer: ReturnType<typeof setTimeout> | null = null;

const row = () => getDb().prepare('SELECT challenge_title, challenge_status, timer_running, timer_ends_at, timer_paused_left, saved_challenge FROM stream_state WHERE id = 1').get() as Row;

function cancel(): void {
  if (endTimer) clearTimeout(endTimer);
  if (clearTimer) clearTimeout(clearTimer);
  endTimer = clearTimer = null;
}

export function rewardTimerActive(): boolean {
  const r = row();
  return r.timer_ends_at !== null || r.timer_paused_left !== null;
}

function schedule(endsAt: number, now: number): void {
  cancel();
  endTimer = setTimeout(timeUp, Math.max(0, endsAt - now));
}

/** 0:00 — "Zeit um!" for a moment, then the goal from before. */
function timeUp(): void {
  endTimer = null;
  getDb().prepare("UPDATE stream_state SET challenge_status = 'done' WHERE id = 1").run();
  broadcastState();
  clearTimer = setTimeout(endRewardTimer, REWARD_TIMER_DONE_MS);
}

export function startRewardTimer(o: { task: string; minutes: number; who: string }, now: number = Date.now()): { ok: true } | { ok: false; reason: string } {
  if (rewardTimerActive()) return { ok: false, reason: 'es läuft schon ein Timer' };
  const r = row();
  const own = r.challenge_title && r.challenge_status !== 'idle'
    ? JSON.stringify({ challenge_title: r.challenge_title, challenge_status: r.challenge_status, timer_seconds: currentTimerSeconds(), timer_running: r.timer_running, saved_at: now } satisfies Saved)
    : null;
  stopServerTimer();
  const endsAt = now + o.minutes * 60_000;
  getDb().prepare(`UPDATE stream_state SET challenge_title = ?, challenge_status = 'in_progress', timer_running = 0, timer_seconds = 0,
    timer_ends_at = ?, timer_task_by = ?, timer_paused_left = NULL, saved_challenge = ? WHERE id = 1`).run(o.task, endsAt, o.who, own);
  broadcastState();
  schedule(endsAt, now);
  return { ok: true };
}

/** The countdown goes; the goal from before comes back, its clock having run on. */
export function endRewardTimer(now: number = Date.now()): void {
  cancel();
  const r = row();
  if (r.timer_ends_at === null && r.timer_paused_left === null && r.saved_challenge === null) return;
  const saved = r.saved_challenge ? JSON.parse(r.saved_challenge) as Saved : null;
  const seconds = saved ? saved.timer_seconds + (saved.timer_running ? Math.floor((now - saved.saved_at) / 1000) : 0) : 0;
  getDb().prepare(`UPDATE stream_state SET challenge_title = ?, challenge_status = ?, timer_seconds = ?, timer_running = ?,
    timer_ends_at = NULL, timer_task_by = NULL, timer_paused_left = NULL, saved_challenge = NULL WHERE id = 1`)
    .run(saved?.challenge_title ?? null, saved?.challenge_status ?? 'idle', seconds, saved?.timer_running ?? 0);
  if (saved?.timer_running) startServerTimer();
  broadcastState();
}

/** The goal was reset in the app: the countdown goes and nothing comes back. */
export function dropRewardTimer(): void {
  cancel();
  getDb().prepare('UPDATE stream_state SET timer_ends_at = NULL, timer_task_by = NULL, timer_paused_left = NULL, saved_challenge = NULL WHERE id = 1').run();
}

export function toggleRewardTimerPause(now: number = Date.now()): boolean {
  const r = row();
  if (r.timer_paused_left !== null) {
    const endsAt = now + r.timer_paused_left;
    getDb().prepare('UPDATE stream_state SET timer_ends_at = ?, timer_paused_left = NULL WHERE id = 1').run(endsAt);
    schedule(endsAt, now);
  } else if (r.timer_ends_at !== null && r.challenge_status === 'in_progress') {
    cancel();
    getDb().prepare('UPDATE stream_state SET timer_paused_left = ?, timer_ends_at = NULL WHERE id = 1').run(Math.max(0, r.timer_ends_at - now));
  } else {
    return false;
  }
  broadcastState();
  return true;
}

/** At start: a countdown runs on, one whose time is up ends; a paused one waits. */
export function restoreRewardTimer(now: number = Date.now()): void {
  const r = row();
  if (r.timer_ends_at === null) return;
  if (r.timer_ends_at <= now) endRewardTimer(now);
  else schedule(r.timer_ends_at, now);
}
```

Hinweis zum Test „says Zeit um“: dort bleibt `timer_ends_at` während „Zeit um!“ gesetzt – das Overlay erkennt daran, dass es ein Countdown war.

- [ ] **Step 5: Beim Start wiederherstellen**

`src/server/index.ts`: Import `import { restoreRewardTimer } from './reward-timer';` und nach `restoreTimerState();` (Z. 293): `restoreRewardTimer();`

- [ ] **Step 6: Typ ergänzen**

`src/shared/types.ts` in `StreamState` nach `project_name`:

```ts
  /** A reward's countdown: when it ends (ms), who redeemed it, what was left when paused (spec 2026-10-14). */
  timer_ends_at: number | null;
  timer_task_by: string | null;
  timer_paused_left: number | null;
  saved_challenge: string | null;
```

- [ ] **Step 7: Tests laufen lassen**

Run: `npx vitest run --pool=threads src/server/__tests__/reward-timer.test.ts src/server/__tests__/stream-state.test.ts`
Expected: PASS. Dann `npx tsc --noEmit -p tsconfig.node.json`: sauber.

- [ ] **Step 8: Commit**

```bash
git add src/server/reward-timer.ts src/server/api/stream-state.ts src/server/index.ts src/shared/types.ts src/server/__tests__/reward-timer.test.ts
git commit -m "feat(goal): a reward's countdown over the goal, with pause, end and restart"
```

---

### Task 4: Timer beim Einlösen auslösen

**Files:**
- Modify: `src/server/reward-actions.ts:100-114` (`runAction`)
- Modify: `src/server/bot/eventsub.ts:78-120` (`handleRedemption`)
- Modify: `src/server/points/redeem.ts:79`
- Test: `src/server/__tests__/channel-rewards.test.ts`, `src/server/__tests__/points.test.ts`

**Interfaces:**
- Consumes: `startRewardTimer` (Task 3), `Bound.task/minutes` und `PointReward.task/minutes` (Task 2).
- Produces: `export interface RunOptions { sceneName?: string | null; sceneSeconds?: number | null; task?: string | null; minutes?: number | null; who?: string }` und `runAction(action: ActionKey, opts?: RunOptions)`.

- [ ] **Step 1: Failing tests schreiben**

In `channel-rewards.test.ts`, `describe('a redemption')`:

```ts
    it('starts the timer with the viewer\'s name, and refunds a second one', async () => {
      const made = (await request(app).post('/api/channel-rewards').set(auth()).send({ title: 'Nur Pistole', cost: 500, action: 'timer', minutes: 5 }).expect(201)).body;
      await redeem({ id: made.id, title: made.title });
      const state = (await request(app).get('/api/stream-state').set(auth()).expect(200)).body;
      expect(state).toMatchObject({ challenge_title: 'Nur Pistole', timer_task_by: 'Mila' });
      calls = [];
      await handleRedemption({ id: 'red-2', user_name: 'Tom', user_login: 'tom', reward: { id: made.id, title: made.title }, user_input: '' });
      expect(calls.find((c) => c.path === '/channel_points/custom_rewards/redemptions')?.body).toEqual({ status: 'CANCELED' });
      await request(app).post('/api/stream-state/reward-timer/end').set(auth()).expect(200);
    });
```

In `points.test.ts`, im `describe`, das `redeemFor` (Z. 247) nutzt:

```ts
    it('starts a timer reward\'s countdown and gives the points back for a second', async () => {
      await request(app).post('/api/points/rewards').set(auth()).send({ name: 'Handicap', cost: 10, action: 'timer', task: 'Nur Pistole', minutes: 3 }).expect(201);
      await request(app).post('/api/points/viewers/mila/adjust').set(auth()).send({ amount: 50 }).expect(200);
      await redeemFor('mila', { reward: 'Handicap' }).expect(200);
      expect((await request(app).get('/api/stream-state').set(auth())).body).toMatchObject({ challenge_title: 'Nur Pistole', timer_task_by: 'mila' });
      const second = await redeemFor('mila', { reward: 'Handicap' });
      expect(second.status).toBe(409);
      expect(second.body.message).toMatch(/läuft schon ein Timer/);
      await request(app).post('/api/stream-state/reward-timer/end').set(auth()).expect(200);
    });
```

(Vor dem Schreiben im Test prüfen, mit welchem Status `POST /points/viewers/:login/redeem` bei `code: 'action'` antwortet: `grep -n "action" src/server/api/points.ts`. Steht dort ein anderer Status als 409, die Erwartung darauf anpassen – der Test prüft die Rückbuchung über die Meldung.)

- [ ] **Step 2: Tests laufen lassen, sie schlagen fehl**

Run: `npx vitest run --pool=threads src/server/__tests__/channel-rewards.test.ts src/server/__tests__/points.test.ts`
Expected: FAIL (kein Countdown).

- [ ] **Step 3: `runAction` erweitern**

```ts
export interface RunOptions { sceneName?: string | null; sceneSeconds?: number | null; task?: string | null; minutes?: number | null; who?: string }

/** Runs one action. A reason comes back when it did not happen, so the caller can refund. */
export async function runAction(action: ActionKey, opts: RunOptions = {}): Promise<{ ok: true } | { ok: false; reason: string }> {
  switch (action) {
    case 'roulette': {
      const result = triggerRoulette();
      return 'error' in result ? { ok: false, reason: result.error } : { ok: true };
    }
    case 'scene': {
      if (!opts.sceneName) return { ok: false, reason: 'die Belohnung nennt keine Szene' };
      return switchMappedScene(rewardScene(opts.sceneName, opts.sceneSeconds));
    }
    case 'timer': {
      if (!opts.task || !opts.minutes) return { ok: false, reason: 'die Belohnung nennt keine Aufgabe' };
      return startRewardTimer({ task: opts.task, minutes: opts.minutes, who: opts.who || 'jemand' });
    }
    default:
      // alert and sound: the alert the caller sends is all there is.
      return { ok: true };
  }
}
```

Import: `import { startRewardTimer } from './reward-timer';`

- [ ] **Step 4: Aufrufer**

`bot/eventsub.ts` Z. ~113:

```ts
    const done = await runAction(bound.action, { sceneName: bound.scene_name, sceneSeconds: bound.scene_seconds, task: bound.task, minutes: bound.minutes, who: userName });
```

`points/redeem.ts` Z. 79:

```ts
  const done = await runAction(reward.action, { sceneName: reward.scene_name, sceneSeconds: reward.scene_seconds, task: reward.task, minutes: reward.minutes, who });
```

- [ ] **Step 5: Tests laufen lassen**

Run: `npx vitest run --pool=threads src/server/__tests__/channel-rewards.test.ts src/server/__tests__/points.test.ts src/server/__tests__/reward-timer.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/server/reward-actions.ts src/server/bot/eventsub.ts src/server/points/redeem.ts src/server/__tests__/channel-rewards.test.ts src/server/__tests__/points.test.ts
git commit -m "feat(rewards): a timer reward starts the countdown, a second one is refunded"
```

---

### Task 5: Text und Ton im Alert

**Files:**
- Modify: `src/server/reward-actions.ts` (neue `alertText`, `soundOf`)
- Modify: `src/server/bot/eventsub.ts:98-104` (Broadcast)
- Modify: `src/server/points/redeem.ts:86-90`
- Modify: `src/overlays/alerts/index.html:78-81, 163-177`
- Test: `src/server/__tests__/reward-alert.test.ts` (neu)

**Interfaces:**
- Produces:
  - `export const ALERT_TEXT_MAX = 100;`
  - `export function alertText(input: string | null | undefined): string | undefined` – gekürzt, Links „[Link]“, leer → `undefined`
  - `export function soundOf(name: string | null | undefined): { url: string; volume: number } | undefined`
  - `reward-redeemed`-Daten (`data` als JSON-String) tragen bei beiden Wegen `reward_title`, `message?`, `sound?`.

- [ ] **Step 1: Failing test schreiben**

`src/server/__tests__/reward-alert.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { initDatabase } from '../db/index';
import { generateApiToken } from '../auth-token';
import { createApp } from '../index';
import { alertText } from '../reward-actions';

let events: Array<{ event: string; data: Record<string, unknown> }> = [];
vi.mock('../websocket/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../websocket/index')>()),
  broadcast: (event: string, data: Record<string, unknown>) => { events.push({ event, data }); },
}));

describe('what a reward\'s alert shows', () => {
  it('cuts the viewer\'s text to 100 characters and hides links', () => {
    expect(alertText('Schau mal https://evil.example/x und www.spam.de oder kauf.shop/jetzt')).toBe('Schau mal [Link] und [Link] oder [Link]');
    expect(alertText('a'.repeat(120))).toBe(`${'a'.repeat(99)}…`);
    expect(alertText('  Zeile\n\nzwei  ')).toBe('Zeile zwei');
    expect(alertText('   ')).toBeUndefined();
  });

  describe('own points', () => {
    let app: Express;
    let token: string;
    const auth = () => ({ Authorization: `Bearer ${token}` });
    const SOUND = `test-${process.pid}-glas.mp3`;

    beforeEach(async () => {
      initDatabase(':memory:');
      token = generateApiToken();
      app = createApp();
      await request(app).post('/api/alerts/sounds').query({ name: SOUND }).set(auth()).set('Content-Type', 'audio/mpeg')
        .send(Buffer.concat([Buffer.from('ID3'), Buffer.alloc(24)])).expect(200);
      await request(app).post('/api/points/viewers/mila/adjust').set(auth()).send({ amount: 100 }).expect(200);
      events = [];
    });
    afterEach(async () => { await request(app).delete(`/api/alerts/sounds/${SOUND}`).set(auth()); });

    const redeemed = () => JSON.parse(events.find((e) => e.event === 'reward-redeemed')!.data.data as string);

    it('plays a sound reward\'s sound with its alert', async () => {
      await request(app).post('/api/points/rewards').set(auth()).send({ name: 'Trink was', cost: 10, action: 'sound', sound: SOUND }).expect(201);
      await request(app).post('/api/points/viewers/mila/redeem').set(auth()).send({ reward: 'Trink was' }).expect(200);
      expect(redeemed()).toMatchObject({ reward_title: 'Trink was', sound: { url: `/public/alert-sound/${SOUND}`, volume: 0.8 } });
    });

    it('still alerts, silently, when the sound was deleted', async () => {
      await request(app).post('/api/points/rewards').set(auth()).send({ name: 'Trink was', cost: 10, action: 'sound', sound: SOUND }).expect(201);
      await request(app).delete(`/api/alerts/sounds/${SOUND}`).set(auth()).expect(200);
      await request(app).post('/api/points/viewers/mila/redeem').set(auth()).send({ reward: 'Trink was' }).expect(200);
      expect(redeemed().sound).toBeUndefined();
    });

    it('carries the cleaned text', async () => {
      await request(app).post('/api/points/rewards').set(auth()).send({ name: 'Frage', cost: 10, action: 'alert', needs_input: true }).expect(201);
      await request(app).post('/api/points/viewers/mila/redeem').set(auth()).send({ reward: 'Frage', input: 'Siehe https://x.y/z' }).expect(200);
      expect(redeemed().message).toBe('Siehe [Link]');
    });
  });
});
```

Und in `channel-rewards.test.ts`, `describe('a redemption')` – dort wird `broadcast` nicht gemockt; der Text wird über den Rückgabewert geprüft, deshalb exportiert `eventsub.ts` nichts Neues, sondern der Test liest die Zeile nicht. Stattdessen ein Test an `reward-alert.test.ts` (gleiche Datei, eigener `describe`), der `handleRedemption` direkt ruft:

```ts
  describe('channel points', () => {
    it('carries what the viewer wrote, cleaned', async () => {
      initDatabase(':memory:');
      generateApiToken();
      createApp();
      events = [];
      const { handleRedemption } = await import('../bot/eventsub');
      await handleRedemption({ id: 'r1', user_name: 'Mila', user_login: 'mila', reward: { id: 'x', title: 'Frage an mich' }, user_input: 'Wie geht das? www.spam.de' });
      expect(JSON.parse(events.find((e) => e.event === 'reward-redeemed')!.data.data as string)).toMatchObject({ reward_title: 'Frage an mich', message: 'Wie geht das? [Link]' });
    });
  });
```

- [ ] **Step 2: Test laufen lassen, er schlägt fehl**

Run: `npx vitest run --pool=threads src/server/__tests__/reward-alert.test.ts`
Expected: FAIL (`alertText` fehlt).

- [ ] **Step 3: Helfer in `reward-actions.ts`**

```ts
export const ALERT_TEXT_MAX = 100;
const LINK = /\b(?:https?:\/\/\S+|www\.\S+|[a-z0-9-]+\.[a-z]{2,}\/\S*)/gi;

/**
 * What a viewer wrote, as it may stand in the alert on stream: one line, links
 * as "[Link]", at most 100 characters. Nothing for an empty text.
 */
export function alertText(input: string | null | undefined): string | undefined {
  const text = (input ?? '').replace(/\s+/g, ' ').trim().replace(LINK, '[Link]');
  if (!text) return undefined;
  return text.length > ALERT_TEXT_MAX ? `${text.slice(0, ALERT_TEXT_MAX - 1)}…` : text;
}

/** A sound reward's sound for the alert overlay, if the file is still there. */
export function soundOf(name: string | null | undefined): { url: string; volume: number } | undefined {
  if (!name || !listSounds().includes(name)) return undefined;
  return { url: `/public/alert-sound/${encodeURIComponent(name)}`, volume: 0.8 };
}
```

Vor dem Schreiben prüfen, wie die Ton-URL heute gebaut wird (`grep -n "alert-sound" src/server/bot/alerts.ts`) und dasselbe Muster nehmen (mit oder ohne `encodeURIComponent`); die Erwartung im Test ist dann entsprechend.

- [ ] **Step 4: Eigene Punkte**

`points/redeem.ts` Z. 86–90:

```ts
  const stored = { reward_title: reward.name, source: 'points', currency, cost: reward.cost };
  const id = getDb().prepare('INSERT INTO rewards (user_name, reward_type, data) VALUES (?, ?, ?)')
    .run(who, rewardTypeOf(reward.action), JSON.stringify(stored)).lastInsertRowid;
  const row = getDb().prepare('SELECT * FROM rewards WHERE id = ?').get(id) as Record<string, unknown>;
  broadcast('reward-redeemed', { ...row, data: JSON.stringify({ ...stored, message: alertText(text), sound: reward.action === 'sound' ? soundOf(reward.sound) : undefined }) });
```

Import `alertText, soundOf` aus `../reward-actions`.

- [ ] **Step 5: Kanalpunkte**

`bot/eventsub.ts`: nach dem `INSERT` (Z. ~102) die Zeile wie bisher lesen, aber mit Text und Ton senden:

```ts
  const reward = getDb().prepare('SELECT * FROM rewards WHERE id = ?').get(result.lastInsertRowid) as Record<string, unknown>;
  // What the viewer wrote and the reward's sound travel with the alert only; the row keeps neither.
  const shown = { reward_title: rewardTitle, reward_id: rewardId, leaderboard: point?.leaderboard.key ?? null, message: alertText(userInput), sound: bound?.action === 'sound' ? soundOf(bound.sound) : undefined };
  broadcast('reward-redeemed', { ...reward, data: JSON.stringify(shown) });
```

(ersetzt `const reward = …get(result.lastInsertRowid); broadcast('reward-redeemed', reward);`). Import `alertText, soundOf` aus `../reward-actions`.

- [ ] **Step 6: Alert-Overlay**

`src/overlays/alerts/index.html`: die Konstante `REWARDS` (Z. 78–81) löschen. Den Fall `reward-redeemed` ersetzen:

```js
        case 'reward-redeemed': {
          // A redemption that counts in a Bestenliste shows no alert: the list overlay counts up instead (Nils, 06.10.).
          let extra = {};
          try { extra = JSON.parse(data.data || '{}'); } catch {}
          if (data.reward_type === 'roulette' || extra.leaderboard) break;
          // Both kinds name the reward; text and sound come along when the reward has them (14.10.).
          const own = extra.source === 'points';
          showAlert({
            label: own ? (extra.currency || 'Punkte') : 'Kanalpunkte',
            who: data.user_name,
            text: extra.reward_title ? `löst „${extra.reward_title}“ ein.` : 'löst eine Belohnung ein.',
            message: extra.message,
            sound: extra.sound,
            kind: 'reward',
          });
          break;
        }
```

`next()` spielt `alert.sound` bereits.

- [ ] **Step 7: Tests laufen lassen**

Run: `npx vitest run --pool=threads src/server/__tests__/reward-alert.test.ts src/server/__tests__/channel-rewards.test.ts src/server/__tests__/points.test.ts src/server/__tests__/alerts.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/server/reward-actions.ts src/server/bot/eventsub.ts src/server/points/redeem.ts src/overlays/alerts/index.html src/server/__tests__/reward-alert.test.ts
git commit -m "feat(rewards): the alert shows the viewer's text for both kinds and plays a sound reward's sound"
```

---

### Task 6: Countdown im Ziel-Overlay und auf der Ziel-Karte

**Files:**
- Modify: `src/overlays/challenge/index.html:76-140`
- Modify: `src/renderer/src/panels/ChallengePanel.tsx`

**Interfaces:**
- Consumes: `StreamState.timer_ends_at`, `timer_task_by`, `timer_paused_left` (Task 3); Routen `POST /stream-state/reward-timer/end` und `/pause` (Task 3).

- [ ] **Step 1: Overlay**

In `src/overlays/challenge/index.html` nach `var tickInterval = null;`:

```js
    // A reward's countdown (14.10.): it counts down to an end the server set.
    var endsAt = null;
    var pausedLeft = null;

    function remaining() {
      if (pausedLeft !== null) return Math.ceil(pausedLeft / 1000);
      return Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
    }
```

`startTicking` so ändern, dass er bei einem Countdown rückwärts zeigt:

```js
    function startTicking() {
      stopTicking();
      if (endsAt !== null && pausedLeft === null) {
        tickInterval = setInterval(function() { timerEl.textContent = formatTime(remaining()); }, 250);
        return;
      }
      if (!timerRunning) return;
      tickInterval = setInterval(function() {
        currentSeconds++;
        timerEl.textContent = formatTime(currentSeconds);
      }, 1000);
    }
```

In `update(state)` nach `dot.className = …`:

```js
      endsAt = state.timer_ends_at || null;
      pausedLeft = state.timer_paused_left == null ? null : state.timer_paused_left;
      if (endsAt !== null || pausedLeft !== null) {
        var done = state.challenge_status === 'done';
        statusLabel.textContent = done ? 'Zeit um!' : (state.timer_task_by ? 'von ' + state.timer_task_by : '');
        timerEl.style.display = done ? 'none' : '';
        timerEl.textContent = formatTime(remaining());
        timerEl.classList.toggle('paused', pausedLeft !== null);
        if (done) stopTicking(); else startTicking();
        return;
      }
```

(Der bestehende Rest von `update` bleibt für das eigene Ziel.)

- [ ] **Step 2: Ziel-Karte**

In `ChallengePanel.tsx`:
- Unter `const timerDisplay = …` den Countdown berechnen, mit einem Sekunden-Takt nur solange er läuft:

```tsx
  const [now, setNow] = useState(Date.now());
  const countdown = state?.timer_ends_at != null || state?.timer_paused_left != null;
  useEffect(() => {
    if (state?.timer_ends_at == null) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [state?.timer_ends_at]);
  const left = state?.timer_paused_left != null ? state.timer_paused_left : Math.max(0, (state?.timer_ends_at ?? 0) - now);
  const leftSeconds = Math.ceil(left / 1000);
  const countdownDisplay = `${Math.floor(leftSeconds / 60).toString().padStart(2, '0')}:${(leftSeconds % 60).toString().padStart(2, '0')}`;
```

- Zwei Handler:

```tsx
  const pauseCountdown = async () => { if (!(await apiPost('/stream-state/reward-timer/pause', {}))) toast.error('Aktion fehlgeschlagen'); };
  const endCountdown = async () => { if (!(await apiPost('/stream-state/reward-timer/end', {}))) toast.error('Aktion fehlgeschlagen'); };
```

  (Import `apiPost` aus `../hooks/useApi`.)
- Im laufenden Zustand (dort, wo heute `card-timer` und „Pause/Weiter“ stehen, Z. ~105) bei `countdown` stattdessen:

```tsx
        {countdown ? (
          <>
            <span className="card-timer">{state?.challenge_status === 'done' ? 'Zeit um!' : countdownDisplay}</span>
            {state?.timer_task_by && <span className="card-hint">von {state.timer_task_by}</span>}
            {state?.challenge_status !== 'done' && <button type="button" className="card-secondary" onClick={pauseCountdown}>{state?.timer_paused_left != null ? 'Weiter' : 'Pause'}</button>}
            <button type="button" className="card-secondary" onClick={endCountdown}>Beenden</button>
          </>
        ) : (
          /* bisheriger Inhalt: card-timer, Pause/Weiter, Geschafft/Nicht geschafft … */
        )}
```

  Den bisherigen Inhalt dieses Abschnitts unverändert in den `else`-Zweig verschieben. Vor dem Schreiben Z. 95–117 lesen, um die genaue Stelle und die vorhandenen Klassennamen (`card-hint` o. ä.) zu übernehmen; gibt es keine Klasse für eine graue Zeile, `className="dialog-hint"` nehmen.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: sauber.

- [ ] **Step 4: Selbst ansehen**

Dev-Tool läuft (`npm run dev`). Countdown über die API starten (eine Timer-Belohnung bei eigenen Punkten anlegen und mit `POST /api/points/viewers/<login>/redeem` einlösen, Fixed-Token aus dem Log). In Chrome per playwright-core `http://localhost:4000/overlay/challenge/` und die App unter `http://localhost:5273/#token=…&port=4000` öffnen: Countdown läuft rückwärts, „von <Name>“ steht da, Pause hält ihn an, Beenden holt das alte Ziel zurück. Screenshots im Scratchpad, nicht im Repo.

- [ ] **Step 5: Commit**

```bash
git add src/overlays/challenge/index.html src/renderer/src/panels/ChallengePanel.tsx
git commit -m "feat(goal): the overlay and the goal card count a reward's timer down"
```

---

### Task 7: Neue Belohnung – Vorlagen zuerst, eigene Schritt für Schritt

**Files:**
- Create: `src/renderer/src/components/rewards/rewardBlocks.ts`
- Create: `src/renderer/src/components/rewards/BlockFields.tsx`
- Create: `src/renderer/src/components/rewards/RewardStart.tsx`
- Modify: `src/renderer/src/components/rewards/RewardQuestPath.tsx`
- Modify: `src/renderer/src/panels/ChannelRewardsPanel.tsx`, `src/renderer/src/panels/PointsPanel.tsx`
- Delete: `src/renderer/src/components/rewards/RewardTemplates.tsx`

**Interfaces:**
- Produces (`rewardBlocks.ts`):

```ts
export type Block = 'alert' | 'roulette' | 'scene' | 'timer' | 'sound';
export type Persona = 'kreativ' | 'gaming' | 'talk' | 'coding';
export interface BlockInfo { value: Block; title: string; text: string; icon: string; names: string[] }
export const BLOCKS: readonly BlockInfo[];
export interface RewardTemplate { key: string; persona: Persona; name: string; does: string; cost: number; block: Block; needsInput?: boolean; minutes?: number; feature?: string }
export const REWARD_TEMPLATES: readonly RewardTemplate[];
export const PERSONAS: ReadonlyArray<{ value: Persona | 'alle'; label: string }>;
export const DURATIONS: readonly number[]; // [1, 3, 5, 10]
/** Price for the kind of points: own points cost a tenth, at least 10. */
export function templateCost(t: RewardTemplate, mode: 'points' | 'twitch'): number;
```

- Produces (`BlockFields.tsx`): `export default function BlockFields(props: { block: Block; task: string; minutes: number; sound: string | null; onChange: (p: { task?: string; minutes?: number; sound?: string | null }) => void }): JSX.Element | null` – Timer: Aufgabe + Dauer-Knöpfe; Ton: Ton-Knöpfe mit ▶ (lädt `GET /alerts` → `sounds`), Hinweis ohne Töne; sonst `null`.
- Produces (`RewardStart.tsx`): `export default function RewardStart(props: { mode: 'points' | 'twitch'; currency: string; existing: string[]; isOn: (f: string) => boolean; onClose: () => void; onCreated: () => void; onOwn: () => void; onNeedsReconnect?: () => void }): JSX.Element`
- `RewardQuestPath` behält seine Props; `RewardAction` wird `Block`.

- [ ] **Step 1: `rewardBlocks.ts`**

```ts
// The five building blocks a reward is made of and the templates per persona
// (spec 2026-10-14-belohnungen-bausteine). No stream type is ever chosen: the
// persona buttons only filter the templates.

export type Block = 'alert' | 'roulette' | 'scene' | 'timer' | 'sound';
export type Persona = 'kreativ' | 'gaming' | 'talk' | 'coding';

export interface BlockInfo { value: Block; title: string; text: string; icon: string; names: string[] }

export const BLOCKS: readonly BlockInfo[] = [
  { value: 'alert', title: 'Nur ein Alert', text: 'Eine Meldung im Stream – du reagierst darauf.', icon: 'M12 3a6 6 0 016 6v4l2 3H4l2-3V9a6 6 0 016-6zM10 19a2 2 0 004 0', names: ['Frage an mich', 'Licht aus', 'Hallo sagen'] },
  { value: 'roulette', title: 'Glücksrad drehen', text: 'Das Rad wählt ein Thema für dich.', icon: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 3v9l6 4', names: ['Thema drehen', 'Schicksal', 'Rad!'] },
  { value: 'scene', title: 'Szene kurz zeigen', text: 'Für ein paar Sekunden eine andere Szene.', icon: 'M3 5h18v12H3zM8 21h8', names: ['Hände zeigen', 'Karte zeigen', 'Kamera groß'] },
  { value: 'timer', title: 'Timer starten', text: 'Eine Aufgabe mit Countdown im Bild.', icon: 'M12 7v5l3 2M12 3a9 9 0 100 18 9 9 0 000-18z', names: ['Nur Pistole', 'Ohne Maus', 'Schwarz-Weiß'] },
  { value: 'sound', title: 'Ton abspielen', text: 'Ein Ton aus deinen Alert-Tönen.', icon: 'M9 18V5l11-2v13M9 18a3 3 0 11-6 0 3 3 0 016 0zM20 16a3 3 0 11-6 0 3 3 0 016 0z', names: ['Jumpscare', 'Trink was!', 'Applaus'] },
];

export interface RewardTemplate { key: string; persona: Persona; name: string; does: string; cost: number; block: Block; needsInput?: boolean; minutes?: number; feature?: string }

export const REWARD_TEMPLATES: readonly RewardTemplate[] = [
  { key: 'thema', persona: 'kreativ', name: 'Thema drehen', does: 'Das Glücksrad wählt, woran du als Nächstes arbeitest.', cost: 500, block: 'roulette', feature: 'rad' },
  { key: 'farbe', persona: 'kreativ', name: 'Farbe wählen', does: 'Der Zuschauer schreibt eine Farbe dazu.', cost: 300, block: 'alert', needsInput: true },
  { key: 'handicap', persona: 'gaming', name: 'Handicap: 5 Minuten', does: 'Eine Aufgabe mit Countdown im Bild.', cost: 1000, block: 'timer', minutes: 5 },
  { key: 'jumpscare', persona: 'gaming', name: 'Jumpscare', does: 'Ein Ton, der dich erschreckt.', cost: 400, block: 'sound' },
  { key: 'frage', persona: 'talk', name: 'Frage an mich', does: 'Der Zuschauer schreibt eine Frage dazu.', cost: 300, block: 'alert', needsInput: true },
  { key: 'trink', persona: 'talk', name: 'Trink was!', does: 'Ein Ton erinnert dich ans Trinken.', cost: 200, block: 'sound' },
  { key: 'feature', persona: 'coding', name: 'Feature-Wunsch', does: 'Der Zuschauer schreibt seinen Wunsch dazu.', cost: 500, block: 'alert', needsInput: true },
  { key: 'maus', persona: 'coding', name: '10 Minuten ohne Maus', does: 'Nur Tastatur – mit Countdown im Bild.', cost: 1500, block: 'timer', minutes: 10 },
];

export const PERSONAS: ReadonlyArray<{ value: Persona | 'alle'; label: string }> = [
  { value: 'alle', label: 'Alle' }, { value: 'kreativ', label: 'Kreativ' }, { value: 'gaming', label: 'Gaming' }, { value: 'talk', label: 'Talk' }, { value: 'coding', label: 'Coding' },
];

export const DURATIONS: readonly number[] = [1, 3, 5, 10];

/** Own points come slower than channel points: a template costs a tenth there, at least 10. */
export function templateCost(t: RewardTemplate, mode: 'points' | 'twitch'): number {
  return mode === 'points' ? Math.max(10, Math.round(t.cost / 10)) : t.cost;
}

/** What a block's alert looks like on stream, for the preview. */
export function streamPreview(block: Block, name: string, o: { minutes?: number; sound?: string | null; withText?: boolean }): string {
  if (block === 'timer') return `${name} · von Lena · ${(o.minutes ?? 5) - 1}:59`;
  if (block === 'sound') return `Lena · ${name}${o.sound ? ` – mit Ton „${o.sound.replace(/\.[a-z0-9]+$/i, '')}“` : ''}`;
  if (block === 'roulette') return 'Das Rad dreht sich und bleibt auf einem Thema stehen.';
  if (block === 'scene') return 'Die Szene läuft für die gewählte Zeit, dann kommt die vorige zurück.';
  return o.withText ? `Lena · ${name} – „Wie bist du darauf gekommen?“` : `Lena löst „${name}“ ein.`;
}
```

- [ ] **Step 2: `BlockFields.tsx`**

```tsx
import React, { useEffect, useState } from 'react';
import { apiGet, getServerPort } from '../../hooks/useApi';
import { DURATIONS, type Block } from './rewardBlocks';

// The one field a block needs beyond name and price: the task and minutes of a
// timer, the sound of a sound. Every other block needs none (14.10.: "der User
// soll nicht erschlagen werden an Optionen").
export default function BlockFields({ block, task, minutes, sound, onChange }: {
  block: Block; task: string; minutes: number; sound: string | null;
  onChange: (p: { task?: string; minutes?: number; sound?: string | null }) => void;
}) {
  const [sounds, setSounds] = useState<string[] | null>(null);
  useEffect(() => {
    if (block !== 'sound') return;
    void apiGet<{ sounds: string[] }>('/alerts').then((r) => {
      const list = r?.sounds ?? [];
      setSounds(list);
      if (!sound && list[0]) onChange({ sound: list[0] });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [block]);

  if (block === 'timer') return (
    <>
      <div className="dialog-field">
        <label htmlFor="bf-task">Aufgabe – steht so im Bild</label>
        <input id="bf-task" type="text" maxLength={60} value={task} onChange={(e) => onChange({ task: e.target.value })} />
      </div>
      <div className="dialog-field">
        <span className="dialog-label" id="bf-minutes">Wie lange?</span>
        <div className="card-row card-wrap" role="radiogroup" aria-labelledby="bf-minutes">
          {DURATIONS.map((m) => (
            <button key={m} type="button" role="radio" aria-checked={minutes === m} className={`pill ${minutes === m ? 'on' : ''}`} onClick={() => onChange({ minutes: m })}>{m} Min</button>
          ))}
        </div>
      </div>
    </>
  );

  if (block === 'sound') {
    if (sounds && sounds.length === 0) return <p className="dialog-hint" role="alert">Noch keine Töne – unter Overlays &amp; Alerts → Alerts hochladen.</p>;
    const play = (name: string) => { try { void new Audio(`http://localhost:${getServerPort()}/public/alert-sound/${encodeURIComponent(name)}`).play(); } catch { /* nothing to hear */ } };
    return (
      <div className="dialog-field">
        <span className="dialog-label" id="bf-sound">Welcher Ton?</span>
        <div className="card-row card-wrap" role="radiogroup" aria-labelledby="bf-sound">
          {(sounds ?? []).map((s) => (
            <button key={s} type="button" role="radio" aria-checked={sound === s} className={`pill ${sound === s ? 'on' : ''}`} onClick={() => { onChange({ sound: s }); play(s); }}>▶ {s.replace(/\.[a-z0-9]+$/i, '')}</button>
          ))}
        </div>
      </div>
    );
  }
  return null;
}
```

Vor dem Schreiben prüfen: gibt es `apiGet` und die Klassen `pill`, `pill.on`, `dialog-label`? (`grep -n "export async function apiGet" src/renderer/src/hooks/useApi.ts`, `grep -n "^\.pill" src/renderer/src/index.css`). Fehlt `.pill.on`, in `index.css` neben `.pill` ergänzen: `.pill.on { border-color: var(--accent); color: var(--accent); }`. Fehlt `.dialog-label`, ein `<span>` mit `style={{ color: 'var(--text-secondary)' }}` nehmen.

- [ ] **Step 3: `RewardStart.tsx`**

```tsx
import React, { useState } from 'react';
import { apiFetch } from '../../hooks/useApi';
import { useToast } from '../../contexts/ToastContext';
import Dialog from '../ux/Dialog';
import BlockFields from './BlockFields';
import { BLOCKS, PERSONAS, REWARD_TEMPLATES, streamPreview, templateCost, type Persona, type RewardTemplate } from './rewardBlocks';

// "+ Neue Belohnung" (Entwurf A, 14.10.): templates first, filtered by
// persona; a template opens one sheet – name, price, at most one field –
// and "Anlegen". "Eigene Belohnung" goes step by step (RewardQuestPath).
export default function RewardStart({ mode, currency, existing, isOn, onClose, onCreated, onOwn, onNeedsReconnect }: {
  mode: 'points' | 'twitch'; currency: string; existing: string[]; isOn: (f: string) => boolean;
  onClose: () => void; onCreated: () => void; onOwn: () => void; onNeedsReconnect?: () => void;
}) {
  const { toast } = useToast();
  const [persona, setPersona] = useState<Persona | 'alle'>('alle');
  const [picked, setPicked] = useState<RewardTemplate | null>(null);
  const [name, setName] = useState('');
  const [cost, setCost] = useState(0);
  const [task, setTask] = useState('');
  const [minutes, setMinutes] = useState(5);
  const [sound, setSound] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const unit = mode === 'points' ? currency : 'Kanalpunkte';
  const taken = new Set(existing.map((n) => n.trim().toLowerCase()));
  const shown = REWARD_TEMPLATES.filter((t) => (!t.feature || isOn(t.feature)) && (persona === 'alle' || t.persona === persona));

  const pick = (t: RewardTemplate) => {
    setPicked(t); setName(t.name); setCost(templateCost(t, mode)); setTask(t.name.replace(/:.*$/, '')); setMinutes(t.minutes ?? 5); setSound(null);
  };

  const create = async () => {
    if (!picked) return;
    setBusy(true);
    const common = { cost, action: picked.block, task: picked.block === 'timer' ? task : undefined, minutes: picked.block === 'timer' ? minutes : undefined, sound: picked.block === 'sound' ? sound : undefined, enabled: true };
    const res = mode === 'points'
      ? await apiFetch('/points/rewards', { method: 'POST', body: JSON.stringify({ ...common, name: name.trim(), needs_input: !!picked.needsInput, cooldown_seconds: 0 }) })
      : await apiFetch('/channel-rewards', { method: 'POST', body: JSON.stringify({ ...common, title: name.trim(), input_required: !!picked.needsInput }) });
    setBusy(false);
    if (res.status === 401 && mode === 'twitch') { onNeedsReconnect?.(); toast.error('Dem Twitch-Login fehlt das Recht, Belohnungen anzulegen.'); return; }
    if (!res.ok) { toast.error((await res.json().catch(() => ({}))).error ?? 'Nicht angelegt'); return; }
    toast.success(`„${name.trim()}“ ist da!`);
    onCreated();
  };

  if (!picked) return (
    <Dialog title="Neue Belohnung" sentence="Nimm eine Vorlage – Name und Preis kannst du gleich danach anpassen." onClose={onClose} width={860}
      footer={<button type="button" className="card-secondary" onClick={onClose}>Abbrechen</button>}>
      <div className="card-row card-wrap" role="radiogroup" aria-label="Für welchen Stream">
        {PERSONAS.map((p) => <button key={p.value} type="button" role="radio" aria-checked={persona === p.value} className={`pill ${persona === p.value ? 'on' : ''}`} onClick={() => setPersona(p.value)}>{p.label}</button>)}
      </div>
      <div className="reward-template-grid">
        {shown.map((t) => {
          const made = taken.has(t.name.toLowerCase());
          return (
            <button key={t.key} type="button" className="reward-template" onClick={() => pick(t)} disabled={made}>
              <span className="reward-template-name">{t.name}</span>
              <span className="reward-template-does">{t.does}</span>
              <span className="reward-template-foot">
                <span className="reward-template-cost">{templateCost(t, mode)} <span>{unit}</span></span>
                <span className="ovl-chip">{made ? 'gibt es schon' : BLOCKS.find((b) => b.value === t.block)!.title}</span>
              </span>
            </button>
          );
        })}
        <button type="button" className="reward-template reward-template-own" onClick={onOwn}>
          <span className="reward-template-name">+ Eigene Belohnung</span>
          <span className="reward-template-does">Ohne Vorlage, Schritt für Schritt</span>
        </button>
      </div>
    </Dialog>
  );

  const needsSound = picked.block === 'sound' && !sound;
  return (
    <Dialog title={picked.name} sentence={picked.does} onClose={onClose} width={620}
      footer={<>
        <button type="button" className="card-secondary" onClick={() => setPicked(null)}>Andere Vorlage</button>
        <span style={{ flex: 1 }} />
        <button type="button" className="card-primary" onClick={create} disabled={busy || !name.trim() || cost < 1 || needsSound || (picked.block === 'timer' && !task.trim())}>{busy ? 'Legt an …' : 'Anlegen'}</button>
      </>}>
      <div className="dialog-grid">
        <div className="dialog-field"><label htmlFor="rs-name">Name</label><input id="rs-name" type="text" maxLength={mode === 'points' ? 40 : 45} value={name} onChange={(e) => setName(e.target.value)} autoFocus /></div>
        <div className="dialog-field"><label htmlFor="rs-cost">Preis ({unit})</label><input id="rs-cost" type="number" min={1} value={String(cost)} onChange={(e) => setCost(Number(e.target.value))} style={{ width: 140 }} /></div>
        <BlockFields block={picked.block} task={task} minutes={minutes} sound={sound} onChange={(p) => { if (p.task !== undefined) setTask(p.task); if (p.minutes !== undefined) setMinutes(p.minutes); if (p.sound !== undefined) setSound(p.sound); }} />
      </div>
      <div className="chat-box-row"><div className="ovl-box-text"><b>So sieht es im Stream aus</b><span>{streamPreview(picked.block, name.trim(), { minutes, sound, withText: picked.needsInput })}</span></div></div>
    </Dialog>
  );
}
```

Vor dem Schreiben prüfen, ob `.reward-template` als `<button>` gut aussieht (heute ist es ein `<div>`): in `index.css` `.reward-template` um `text-align: left; font: inherit; color: inherit; cursor: pointer;` ergänzen und `.reward-template:disabled { opacity: .55; cursor: default; }` sowie `.reward-template-own { border-style: dashed; justify-content: center; }`.

- [ ] **Step 4: `RewardQuestPath.tsx` auf die Bausteine umstellen**

- `export type RewardAction = 'alert' | …` und die lokale `ACTIONS`-Liste löschen; stattdessen `import { BLOCKS, streamPreview, type Block } from './rewardBlocks';` und `import BlockFields from './BlockFields';`. Überall `ACTIONS` → `BLOCKS`, `RewardAction` → `Block`. `RewardDraft.action` hat den Typ `Block`.
- Neue States: `const [task, setTask] = useState('');`, `const [minutes, setMinutes] = useState(5);`, `const [sound, setSound] = useState<string | null>(null);`, `const [withText, setWithText] = useState(false);`
- Zusätzlicher Schritt nach „Wirkung“ für `alert`, `timer`, `sound` (für `scene` bleibt der Szenen-Schritt):

```tsx
        ...(action === 'timer' || action === 'sound' ? [{
          label: action === 'timer' ? 'Aufgabe' : 'Ton',
          ready: action === 'timer' ? !!(task.trim() || name.trim()) : !!sound,
          content: (
            <>
              <h3 className="quest-step-title">{action === 'timer' ? 'Welche Aufgabe, und wie lange?' : 'Welcher Ton?'}</h3>
              <BlockFields block={action} task={task} minutes={minutes} sound={sound} onChange={(p) => { if (p.task !== undefined) setTask(p.task); if (p.minutes !== undefined) setMinutes(p.minutes); if (p.sound !== undefined) setSound(p.sound); }} />
            </>
          ),
        }] : []),
        ...(action === 'alert' ? [{
          label: 'Text',
          content: (
            <>
              <h3 className="quest-step-title">Schreibt der Zuschauer etwas dazu?</h3>
              <ChoiceCards label="Text" value={withText ? 'ja' : 'nein'} onChange={(v) => setWithText(v === 'ja')} options={[
                { value: 'ja', title: 'Ja, er schreibt etwas dazu', text: 'Der Text steht im Alert unter seinem Namen.' },
                { value: 'nein', title: 'Nein, nur der Alert', text: 'Name und Belohnung, sonst nichts.' },
              ]} />
            </>
          ),
        }] : []),
```

- In `create` die Körper ersetzen:

```ts
    const extras = { task: action === 'timer' ? (task.trim() || name.trim()) : undefined, minutes: action === 'timer' ? minutes : undefined, sound: action === 'sound' ? sound : undefined };
    const res = mode === 'points'
      ? await apiFetch('/points/rewards', { method: 'POST', body: JSON.stringify({ name: name.trim(), cost, action, scene_name: scene, scene_seconds: sceneSeconds, ...extras, needs_input: action === 'alert' && withText, cooldown_seconds: 0, enabled: true }) })
      : await apiFetch('/channel-rewards', { method: 'POST', body: JSON.stringify({ title: name.trim(), cost, action, scene_name: scene, scene_seconds: sceneSeconds, ...extras, input_required: action === 'alert' && withText, enabled: true }) });
```

- In der Vorschau „Im Stream“ den Text durch `streamPreview(action, name.trim(), { minutes, sound, withText })` ersetzen.
- `startAt={initial ? 1 : 0}` bleibt; `initial` kommt nur noch ohne Vorlage vor (Quests), sonst `undefined`.

- [ ] **Step 5: Seiten verdrahten**

In beiden Panels:
- `RewardTemplates`-Import und `applyTemplate` löschen; die Zeile `{starting && <RewardTemplates … />}` löschen.
- State `const [starting, …]` bleibt für die Schritte; Schritt 2 Text: `'Sie erscheint sofort bei deinen Zuschauern. Fang mit einer Vorlage an.'` bleibt.
- Neuer State `const [start, setStart] = useState(false);`. „+ Neue Belohnung“ ruft `setStart(true)` statt `setPath({})`. `useQuestPath([...], () => setPath({}))` bleibt (Quests führen direkt in den Schritt-Weg).
- Render:

```tsx
      {start && <RewardStart mode="twitch" currency="Kanalpunkte" existing={(rewards ?? []).map((r) => r.title)} isOn={(f) => isOn(f as FeatureKey)}
        onClose={() => setStart(false)} onCreated={() => { setStart(false); void load(); }} onOwn={() => { setStart(false); setPath({}); }} onNeedsReconnect={() => setNeedsReconnect(true)} />}
```

  bei `PointsPanel` mit `mode="points" currency={currency} existing={(rewards ?? []).map((r) => r.name)}`, `onCreated={() => { setStart(false); void refetchRewards(); }}`, ohne `onNeedsReconnect`.
- Leerer Hinweis bei eigenen Punkten: `'Noch keine. Eine Vorlage oben ist der schnellste Anfang.'` → `'Noch keine. „+ Neue Belohnung“ zeigt Vorlagen für jeden Stream.'`
- `git rm src/renderer/src/components/rewards/RewardTemplates.tsx`

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: Fehler nur noch in den Bearbeiten-Dialogen (`Action`-Typ mit `feature_request`) – die behebt Task 8. Ist der Typecheck schon hier sauber, ist es auch gut.

- [ ] **Step 7: Commit**

```bash
git add -A src/renderer/src/components/rewards src/renderer/src/panels/ChannelRewardsPanel.tsx src/renderer/src/panels/PointsPanel.tsx src/renderer/src/index.css
git commit -m "feat(rewards): new reward starts from persona templates, one sheet each; own rewards step by step"
```

---

### Task 8: Schlanker Bearbeiten-Dialog, Fehlermeldungen mit Grund

**Files:**
- Modify: `src/renderer/src/panels/ChannelRewardsPanel.tsx` (`Action`, `ACTIONS`, `Reward`, `RewardDialog`)
- Modify: `src/renderer/src/panels/PointsPanel.tsx` (`Action`, `ACTIONS`, `Reward`, `RewardDialog`)

**Interfaces:**
- Consumes: `Block`, `BLOCKS` (Task 7), `BlockFields` (Task 7), Felder `task/minutes/sound` (Task 2).

- [ ] **Step 1: Typen und Namen**

In beiden Panels: `type Action = …` → `import { BLOCKS, type Block } from '../components/rewards/rewardBlocks';` und `type Action = Block;`. `ACTIONS` als Abbildung aus `BLOCKS`:

```ts
const ACTIONS = Object.fromEntries(BLOCKS.map((b) => [b.value, b.title])) as Record<Action, string>;
```

`Reward` (beide) um `task: string | null; minutes: number | null; sound: string | null;`.

Zeilentext der Liste ergänzen (beide Panels, in `chat-row-text`): nach der Szene `{r.action === 'timer' && r.minutes ? ` „${r.task}“, ${r.minutes} Min` : ''}{r.action === 'sound' && r.sound ? ` – ${r.sound.replace(/\.[a-z0-9]+$/i, '')}` : ''}`.

- [ ] **Step 2: Kanalpunkte-Dialog**

In `RewardDialog` (ChannelRewardsPanel):
- Body von `save`: `const body = { title: draft.title, cost: Number(draft.cost), action: draft.action, scene_name: draft.scene_name, scene_seconds: draft.scene_seconds, task: draft.task, minutes: draft.minutes, sound: draft.sound, input_required: draft.action === 'alert' && draft.input_required, enabled: draft.enabled };` (kein `prompt` mehr).
- `remove`:

```ts
  const remove = async () => {
    if (!window.confirm(`„${initial.title}“ in Twitch löschen? Zuschauer sehen die Belohnung danach nicht mehr.`)) return;
    const res = await apiFetch(`/channel-rewards/${encodeURIComponent(draft.id!)}`, { method: 'DELETE' });
    if (!res.ok) { toast.error((await res.json().catch(() => ({}))).error ?? 'Nicht gelöscht'); return; }
    onSaved();
  };
```

  (`apiDelete` aus dem Import nehmen, wenn er sonst nicht gebraucht wird.)
- Felder: das `<select>` für „Was passiert“ bleibt; darunter `{(draft.action === 'timer' || draft.action === 'sound') && <BlockFields block={draft.action} task={draft.task ?? ''} minutes={draft.minutes ?? 5} sound={draft.sound} onChange={(p) => setDraft({ ...draft, ...p })} />}`. Das Feld „Text für Zuschauer (optional)“ löschen. Die Checkbox „Zuschauer muss etwas dazuschreiben“ nur bei `draft.action === 'alert'` zeigen, Text „Zuschauer schreibt etwas dazu – steht im Alert“.
- Den „Anlegen/Speichern“-Knopf zusätzlich sperren bei `draft.action === 'sound' && !draft.sound` und `draft.action === 'timer' && !(draft.task ?? '').trim()`.
- `Draft`-Typ und `setDraft({ ...r, action: r.action ?? 'alert' })` bleiben; `Draft` bekommt die drei Felder aus `Reward` automatisch.

- [ ] **Step 3: Punkte-Dialog**

In `RewardDialog` (PointsPanel):
- Body von `save` um `task: draft.task, minutes: draft.minutes, sound: draft.sound` ergänzen; `needs_input: draft.action === 'alert' && draft.needs_input`.
- `remove` wie oben mit `apiFetch(\`/points/rewards/${draft.id}\`, { method: 'DELETE' })` und Fehlertext aus `error`.
- Nach dem `ScenePicker`-Block `BlockFields` wie in Step 2. Checkbox „Zuschauer schreibt einen Text dazu“ nur bei `alert`. „Sperre je Zuschauer“ bleibt (gibt es nur bei eigenen Punkten und ist heute schon da).
- Neu-Anlage über diesen Dialog gibt es nicht mehr (`setEditingReward` wird nur noch aus „Bearbeiten“ gerufen) – prüfen mit `grep -n "setEditingReward(" src/renderer/src/panels/PointsPanel.tsx`; findet sich ein Aufruf mit neuem Objekt, ihn auf `setStart(true)` umstellen.

- [ ] **Step 4: Typecheck und Tests**

Run: `npx tsc --noEmit -p tsconfig.json && npx tsc --noEmit -p tsconfig.node.json && npx vitest run --pool=threads`
Expected: beide Typechecks sauber, alle Tests grün.

- [ ] **Step 5: Selbst ansehen**

In Chrome (playwright-core) bei 1360 und 420 px Breite: Chat & Bot → Belohnungen → „+ Neue Belohnung“: Persona-Filter, Vorlage „Handicap: 5 Minuten“ → Blatt mit Name, Preis, Aufgabe, Dauer, Vorschau; „+ Eigene Belohnung“ → Schritte; „Bearbeiten“ einer Timer-Belohnung zeigt Aufgabe und Dauer, keine „Text für Zuschauer“-Zeile. Bei Kanalpunkten nur ansehen, nichts in Twitch anlegen (das würde echte Belohnungen in Nils' Kanal erzeugen) – bei eigenen Punkten anlegen und danach wieder löschen. Screenshots ins Scratchpad.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/panels/ChannelRewardsPanel.tsx src/renderer/src/panels/PointsPanel.tsx
git commit -m "feat(rewards): slim edit dialog with the block's own field; errors say why"
```

---

### Task 9: Hilfe und STAND

**Files:**
- Modify: `src/renderer/src/docs/help-de.ts`
- Modify: `docs/STAND.md`

- [ ] **Step 1: Hilfe**

`grep -n -i "Idee einreichen\|Musik wechseln\|Vorschlag einreichen\|Vorlage" src/renderer/src/docs/help-de.ts` – jede Stelle auf die Bausteine umschreiben. Im Abschnitt zu Belohnungen einen Absatz ergänzen:

```
**Was eine Belohnung tut:** Nur ein Alert (auf Wunsch mit dem Text des Zuschauers), Glücksrad drehen, Szene kurz zeigen, **Timer starten** (eine Aufgabe mit Countdown über deinem Ziel; danach ist dein Ziel wieder da, nur ein Timer zur Zeit) und **Ton abspielen** (ein Ton aus deinen Alert-Tönen). „+ Neue Belohnung“ zeigt Vorlagen für Kreative, Gaming, Talk und Coding; „+ Eigene Belohnung“ führt Schritt für Schritt. Text im Alert ist höchstens 100 Zeichen lang, Links werden zu „[Link]“.
```

- [ ] **Step 2: STAND.md**

Unter „## Wo wir stehen geblieben sind“ einen Block „**Hier aufgehört (<Datum>, <Rechner>)**“ mit: was gebaut ist (Bausteine, Countdown, Vorlagen, Bearbeiten), Schema 37, wo Spec und Plan liegen, was offen ist (Nils nimmt im Alltag ab; „Quelle kurz einblenden“ später).

- [ ] **Step 3: Volle Prüfung**

Run: `npx tsc --noEmit -p tsconfig.json && npx tsc --noEmit -p tsconfig.node.json && npx vitest run --pool=threads`
Expected: alles grün.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/docs/help-de.ts docs/STAND.md
git commit -m "docs: reward building blocks in the help, STAND"
```
