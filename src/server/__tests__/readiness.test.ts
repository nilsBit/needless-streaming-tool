import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import os from 'os';
import path from 'path';
import request from 'supertest';
import type { Express } from 'express';
import { initDatabase } from '../db/index';
import { generateApiToken } from '../auth-token';
import { createApp } from '../index';
import { assessReadiness, type ReadinessInput } from '../readiness';

// "Bereit für den Stream?" over HTTP. Nothing is connected in a test, so the
// live route reports the missing pieces; the pure assessment is checked with
// a complete input as well.

const complete: ReadinessInput = {
  bot: { connected: true, channel: 'chain_des' },
  obs: { connected: true, scenes: ['main', 'Camera', 'start', 'brb', 'end'], overlaysPlaced: 9 },
  world: { source: 'worldbuilder', reachable: true, name: 'Die Verborgene Stadt' },
  enabledCommands: 3,
  alerts: { slots: 7, withSound: 7 },
};

describe('readiness', () => {
  let app: Express;
  let token: string;

  beforeAll(() => {
    // No Worldbuilder on this machine: its checks (the entry card, the screens' scenes) are not asked.
    process.env.WORLDBUILDER_ANSCHLUSS = path.join(os.tmpdir(), `nst-readiness-test-${process.pid}-${Date.now()}.json`);
    initDatabase(':memory:');
    token = generateApiToken();
    app = createApp();
  });

  afterAll(() => { delete process.env.WORLDBUILDER_ANSCHLUSS; });

  it('needs a token like every API route', async () => {
    await request(app).get('/api/readiness').expect(401);
  });

  it('names what is missing on a fresh install, and where to fix it', async () => {
    const res = await request(app).get('/api/readiness').set('Authorization', `Bearer ${token}`).expect(200);
    expect(res.body.ready).toBe(false);
    const byId = Object.fromEntries(res.body.items.map((i: { id: string }) => [i.id, i]));

    expect(byId.twitch.ok).toBe(false);
    expect(byId.twitch.target).toEqual({ area: 'settings', subTab: 'verbindungen' });
    expect(byId.obs.ok).toBe(false);
    // Overlays cannot be judged while OBS is out of reach — not a problem of its own.
    expect(byId.overlays.ok).toBeNull();
    // The screens' scenes and the Worldbuilder are Nils's own: without the Worldbuilder set up here, they are not asked.
    expect(byId.scenes).toBeUndefined();
    expect(byId.worldbuilder).toBeUndefined();
    expect(byId.commands.ok).toBe(false);
    expect(byId.alertSounds.severity).toBe('hint');
    for (const item of res.body.items) {
      expect(item.title.length).toBeGreaterThan(5);
      expect(item.problem.length).toBeGreaterThan(5);
      expect(item.consequence.length).toBeGreaterThan(5);
    }
  });

  it('counts an enabled text command as soon as it exists', async () => {
    await request(app)
      .post('/api/text-commands')
      .set('Authorization', `Bearer ${token}`)
      .send({ trigger: 'welt', response: 'Eine Welt, die live geschrieben wird – Figuren, Orte, Gilden.' })
      .expect(201);

    const res = await request(app).get('/api/readiness').set('Authorization', `Bearer ${token}`).expect(200);
    const commands = res.body.items.find((i: { id: string }) => i.id === 'commands');
    expect(commands.ok).toBe(true);
  });

  it('is ready when every error-level check passes, hints aside', () => {
    expect(assessReadiness(complete).ready).toBe(true);
    const silent = assessReadiness({ ...complete, alerts: { slots: 7, withSound: 2 } });
    expect(silent.ready).toBe(true);
    expect(silent.items.find((i) => i.id === 'alertSounds')?.problem).toBe('5 von 7 Alerts haben keinen Ton.');
  });

  it('names the missing scenes once OBS is connected', () => {
    const result = assessReadiness({ ...complete, obs: { connected: true, scenes: ['main', 'brb'], overlaysPlaced: 9 } });
    const scenes = result.items.find((i) => i.id === 'scenes');
    expect(scenes?.ok).toBe(false);
    expect(scenes?.problem).toBe('In OBS fehlen die Szenen „start“, „end“.');
    expect(result.ready).toBe(false);
  });

  it('complains when OBS has no browser source pointing at the tool', () => {
    const result = assessReadiness({ ...complete, obs: { connected: true, scenes: ['main', 'start', 'brb', 'end'], overlaysPlaced: 0 } });
    const overlays = result.items.find((i) => i.id === 'overlays');
    expect(overlays?.ok).toBe(false);
    expect(overlays?.target).toEqual({ area: 'overlays', subTab: 'overlays' });
    expect(result.ready).toBe(false);
  });

  it('treats an unreachable Worldbuilder as an error when it is the chosen source', () => {
    const result = assessReadiness({ ...complete, world: { source: 'worldbuilder', reachable: false, name: null } });
    const world = result.items.find((i) => i.id === 'worldbuilder');
    expect(world?.severity).toBe('error');
    expect(world?.ok).toBe(false);
    expect(result.ready).toBe(false);
  });
});
