import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Express } from 'express';
import { getDb, initDatabase } from '../db/index';
import { generateApiToken } from '../auth-token';
import { createApp } from '../index';
import { resetStreamLog, streamEnded, streamStarted } from '../stream-report/log';

/**
 * Projekt (2026-10-12): what a creative stream works on over many streams.
 * Several projects can be open, one is current; each keeps its own stand and
 * counts the streams it was worked on. The chat asks with !projekt.
 */
describe('projects', () => {
  let app: Express;
  let token: string;
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const state = async () => (await request(app).get('/api/projects').set(auth()).expect(200)).body;
  const ask = async (message: string) => (await request(app).post('/api/chat/try').set(auth()).send({ message }).expect(200)).body.replies?.[0];
  const create = (body: object) => request(app).post('/api/projects').set(auth()).send(body);

  beforeAll(() => {
    initDatabase(':memory:');
    token = generateApiToken();
    app = createApp();
    resetStreamLog();
  });

  it('has no project at first, and says so in chat', async () => {
    expect(await state()).toEqual({ current: null, open: [] });
    expect(await ask('!projekt')).toBe('Gerade läuft kein Projekt.');
    const pub = await request(app).get('/public/project').expect(200);
    expect(pub.body).toEqual({ current: null });
  });

  it('refuses a project that is not complete', async () => {
    expect((await create({ name: 'Drache', kind: 'steps', steps: ['Skizze'] })).status).toBe(400);
    expect((await create({ name: '', kind: 'steps', steps: ['Skizze', 'Farbe'] })).status).toBe(400);
    expect((await create({ name: 'Armee', kind: 'count', unit: 'Figuren' })).status).toBe(400);
    expect((await create({ name: 'Armee', kind: 'liste' })).status).toBe(400);
    expect((await state()).open).toEqual([]);
  });

  it('creates a project in steps that is current at once', async () => {
    const res = await create({ name: 'Drache für Mia', kind: 'steps', steps: ['Skizze', ' Linework ', '', 'Farbe', 'Details'] }).expect(201);
    expect(res.body).toMatchObject({ name: 'Drache für Mia', kind: 'steps', steps: ['Skizze', 'Linework', 'Farbe', 'Details'], position: 0, stand: 'Skizze · Schritt 1 von 4', streams: 0, live: false, finished: false });
    expect((await state()).current.name).toBe('Drache für Mia');
    expect(await ask('!projekt')).toBe('Gerade dran: Drache für Mia – Skizze (Schritt 1 von 4).');
    // The name it had before keeps answering.
    expect(await ask('!progress')).toBe('Gerade dran: Drache für Mia – Skizze (Schritt 1 von 4).');
  });

  it('goes on one step and back, never below the first', async () => {
    const on = await request(app).post('/api/projects/current/forward').set(auth()).expect(200);
    expect(on.body).toMatchObject({ position: 1, step: 'Linework', stand: 'Linework · Schritt 2 von 4', pct: 25 });
    await request(app).post('/api/projects/current/back').set(auth()).expect(200);
    const back = await request(app).post('/api/projects/current/back').set(auth()).expect(200);
    expect(back.body.position).toBe(0);
    await request(app).post('/api/projects/current/forward').set(auth()).expect(200);
  });

  it('counts the stream on air once for the current project', async () => {
    streamStarted('2026-10-12T18:00:00Z', Date.parse('2026-10-12T18:00:00Z'));
    // Picked up again after a restart: the same stream, not a second.
    streamStarted('2026-10-12T18:00:00Z', Date.parse('2026-10-12T18:10:00Z'));
    const { current } = await state();
    expect(current).toMatchObject({ streams: 1, live: true });
    expect(await ask('!projekt')).toBe('Gerade dran: Drache für Mia – Linework (Schritt 2 von 4). Der 1. Stream an diesem Projekt.');
  });

  it('switches between open projects, each keeping its stand', async () => {
    const army = await create({ name: 'Zwergenarmee', kind: 'count', unit: 'Figuren', total: 30, position: 12 }).expect(201);
    expect(army.body).toMatchObject({ stand: '12 von 30 Figuren', pct: 40, streams: 1, live: true });
    let s = await state();
    expect(s.current.name).toBe('Zwergenarmee');
    expect(s.open.map((p: { name: string }) => p.name)).toEqual(['Drache für Mia']);
    expect((await request(app).post('/api/projects/current/forward').set(auth()).expect(200)).body.stand).toBe('13 von 30 Figuren');

    const dragon = s.open[0];
    await request(app).post(`/api/projects/${dragon.id}/current`).set(auth()).expect(200);
    s = await state();
    // Back where it was, and this stream still counts once for it.
    expect(s.current).toMatchObject({ name: 'Drache für Mia', step: 'Linework', streams: 1 });
    expect(s.open[0]).toMatchObject({ name: 'Zwergenarmee', stand: '13 von 30 Figuren' });
  });

  it('lists the open projects last worked on first', async () => {
    await create({ name: 'Buchcover', kind: 'steps', steps: ['Skizze', 'Farbe'] }).expect(201);
    const s = await state();
    expect(s.current.name).toBe('Buchcover');
    expect(s.open.map((p: { name: string }) => p.name)).toEqual(['Drache für Mia', 'Zwergenarmee']);
  });

  it('counts a new stream again', async () => {
    streamEnded(Date.parse('2026-10-12T20:00:00Z'));
    expect((await state()).current.live).toBe(false);
    expect(await ask('!projekt')).toBe('Gerade dran: Buchcover – Skizze (Schritt 1 von 2). Bisher 1 Stream daran.');
    streamStarted('2026-10-14T18:00:00Z', Date.parse('2026-10-14T18:00:00Z'));
    expect((await state()).current).toMatchObject({ name: 'Buchcover', streams: 2, live: true });
  });

  it('finishes a project: it leaves the list, nothing is deleted', async () => {
    await request(app).post('/api/projects/current/forward').set(auth()).expect(200);
    const done = await request(app).post('/api/projects/current/forward').set(auth()).expect(200);
    expect(done.body).toMatchObject({ finished: true, stand: 'Alle Schritte geschafft', step: null, pct: 100 });
    expect(await ask('!projekt')).toBe('Gerade dran: Buchcover – alle Schritte geschafft. Der 2. Stream an diesem Projekt.');

    const finished = await request(app).post(`/api/projects/${done.body.id}/finish`).set(auth()).expect(200);
    expect(finished.body.finished_at).toBeTruthy();
    const s = await state();
    expect(s.current).toBeNull();
    expect(s.open.map((p: { name: string }) => p.name)).toEqual(['Drache für Mia', 'Zwergenarmee']);
    expect(await ask('!projekt')).toBe('Gerade läuft kein Projekt.');
    await request(app).post(`/api/projects/${done.body.id}/finish`).set(auth()).expect(409);
    await request(app).post(`/api/projects/${done.body.id}/current`).set(auth()).expect(409);
    await request(app).post('/api/projects/current/forward').set(auth()).expect(409);
  });

  it('takes the stand of a goal as typed in, and keeps counting past a weekly goal', async () => {
    const res = await create({ name: 'Roman', kind: 'goal', unit: 'Wörter', total: 1000, position: 900, weekly: true }).expect(201);
    expect(res.body.stand).toBe('900 von 1.000 Wörter diese Woche');
    // A goal has no fixed step: "Projekt weiter" does nothing there.
    await request(app).post('/api/projects/current/forward').set(auth()).expect(409);
    const on = await request(app).post('/api/projects/current/stand').set(auth()).send({ position: 1400 }).expect(200);
    expect(on.body).toMatchObject({ position: 1400, pct: 100, finished: false });
    expect((await request(app).get('/public/project').expect(200)).body.current.stand).toBe('1.400 von 1.000 Wörter diese Woche');
    await request(app).post('/api/projects/current/stand').set(auth()).send({ position: -1 }).expect(400);
    await request(app).post('/api/projects/current/stand').set(auth()).send({ position: '12' }).expect(400);
  });

  it('edits name, steps and stand, but not the kind', async () => {
    const dragon = (await state()).open.find((p: { name: string }) => p.name === 'Drache für Mia');
    const res = await request(app).patch(`/api/projects/${dragon.id}`).set(auth()).send({ name: 'Drache für Mila', steps: ['Skizze', 'Farbe'], position: 9 }).expect(200);
    expect(res.body).toMatchObject({ name: 'Drache für Mila', steps: ['Skizze', 'Farbe'], position: 2, finished: true });
    await request(app).patch(`/api/projects/${dragon.id}`).set(auth()).send({ kind: 'count' }).expect(400);
    await request(app).patch(`/api/projects/${dragon.id}`).set(auth()).send({ steps: [] }).expect(400);
    await request(app).patch('/api/projects/9999').set(auth()).send({ name: 'x' }).expect(404);
  });

  it('deletes a project', async () => {
    const army = (await state()).open.find((p: { name: string }) => p.name === 'Zwergenarmee');
    await request(app).delete(`/api/projects/${army.id}`).set(auth()).expect(204);
    await request(app).delete(`/api/projects/${army.id}`).set(auth()).expect(404);
    expect((await state()).open.map((p: { name: string }) => p.name)).not.toContain('Zwergenarmee');
  });

  it('keeps !projekt for the built-in', async () => {
    const res = await request(app).post('/api/text-commands').set(auth()).send({ trigger: '!projekt', response: 'Mein Text' });
    expect(res.status).toBe(409);
  });

  it('takes a shortcut for "Projekt weiter"', async () => {
    await request(app).post('/api/settings/hotkeys').set(auth()).send({ project_forward: 'CommandOrControl+Alt+P' }).expect(200);
    expect((await request(app).get('/api/settings/hotkeys').set(auth()).expect(200)).body.project_forward).toBe('CommandOrControl+Alt+P');
  });
});

describe('projects from the old "Fortschritt"', () => {
  it('turns the board into the steps of one project, done first', async () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'nst-projects-')), 'stream.db');
    initDatabase(file);
    // A database from before 2026-10-12: points on the board, not yet carried over.
    getDb().exec(`
      INSERT INTO project_items (title, status, sort_order) VALUES ('Karte', 'pending', 0), ('Figuren', 'done', 1), ('Kapitel', 'in_progress', 2);
      UPDATE stream_state SET project_name = 'Unterstadt' WHERE id = 1;
      INSERT INTO text_commands (trigger, response) VALUES ('!projekt', 'Mein eigener Text');
      DELETE FROM settings WHERE key = 'projects_migrated';
    `);
    getDb().close();

    initDatabase(file);
    const token = generateApiToken();
    const app = createApp();
    const res = await request(app).get('/api/projects').set({ Authorization: `Bearer ${token}` }).expect(200);
    expect(res.body.current).toMatchObject({ name: 'Unterstadt', kind: 'steps', steps: ['Figuren', 'Kapitel', 'Karte'], position: 1, step: 'Kapitel' });

    // The streamer's own !projekt keeps answering; the built-in keeps its old name.
    const own = await request(app).post('/api/chat/try').set({ Authorization: `Bearer ${token}` }).send({ message: '!projekt' }).expect(200);
    expect(own.body.replies).toEqual(['Mein eigener Text']);
    const builtin = await request(app).post('/api/chat/try').set({ Authorization: `Bearer ${token}` }).send({ message: '!progress' }).expect(200);
    expect(builtin.body.replies[0]).toMatch(/^Gerade dran: Unterstadt – Kapitel/);
  });
});
