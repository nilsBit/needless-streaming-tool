import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { getDb, initDatabase } from '../db/index';
import { SCHEMA_VERSION } from '../db/schema';

/**
 * Notion is gone (15.10.): the Worldbuilder is the only source of the world.
 * What a database kept for Notion goes with it — token and database ids, the
 * source choice, and the Active Character from before Entries existed.
 */
describe('Notion removed (v38)', () => {
  let dir = '';
  afterEach(() => { try { getDb().close(); } catch { /* already closed */ } if (dir) fs.rmSync(dir, { recursive: true, force: true }); dir = ''; });

  const setting = (key: string) =>
    (getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined)?.value ?? null;

  /** A database as v37 left it, with the given settings. */
  function v37With(settings: Record<string, string>): string {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nst-v38-'));
    const file = path.join(dir, 'stream.db');
    initDatabase(file);
    const db = getDb();
    const insert = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    for (const [key, value] of Object.entries(settings)) insert.run(key, value);
    db.exec('DELETE FROM schema_version');
    db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(37);
    db.close();
    return file;
  }

  it('deletes what was kept for Notion and leaves the rest', () => {
    initDatabase(v37With({
      notion_token: 'ntn_secret',
      notion_characters_db: 'abc',
      notion_clips_db: 'def',
      character_source: 'notion',
      active_character: '{"id":"old","name":"Mila"}',
      active_character_since: '1',
      worldbuilder_art: 'Figur',
    }));

    for (const key of ['notion_token', 'notion_characters_db', 'notion_clips_db', 'character_source', 'active_character', 'active_character_since']) {
      expect(setting(key)).toBeNull();
    }
    expect(setting('worldbuilder_art')).toBe('Figur');
    // Notion as the source never meant the Worldbuilder was set up.
    expect(setting('worldbuilder_known')).toBeNull();
    expect((getDb().prepare('SELECT MAX(version) AS version FROM schema_version').get() as { version: number }).version).toBe(38);
  });

  it('keeps a Worldbuilder that was the chosen source known as set up', () => {
    initDatabase(v37With({ character_source: 'worldbuilder' }));

    expect(setting('character_source')).toBeNull();
    expect(setting('worldbuilder_known')).toBe('1');
  });

  it('starts a fresh database at v38 without Notion settings', () => {
    initDatabase(':memory:');
    expect(SCHEMA_VERSION).toBe(38);
    expect(setting('notion_clips_db')).toBeNull();
  });
});
