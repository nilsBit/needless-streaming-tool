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
  afterEach(() => { try { getDb().close(); } catch { /* already closed */ } if (dir) fs.rmSync(dir, { recursive: true, force: true }); dir = ''; });

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
    expect((getDb().prepare('SELECT MAX(version) AS version FROM schema_version').get() as { version: number }).version).toBe(SCHEMA_VERSION);
  });

  it('starts a fresh database at v37 or later', () => {
    initDatabase(':memory:');
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(37);
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
