import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import type { Express } from 'express';
import { initDatabase } from '../db/index';
import { generateApiToken } from '../auth-token';
import { createApp } from '../index';

/**
 * The showcase plays every overlay state in the browser, without the server.
 * These tests hold the state list to the overlays that actually exist.
 */
describe('showcase state list', () => {
  let app: Express;

  beforeAll(() => {
    initDatabase(':memory:');
    generateApiToken();
    app = createApp();
  });

  const overlayDirs = fs
    .readdirSync(path.join(process.cwd(), 'src', 'overlays'), { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('_') && d.name !== 'showcase')
    .map((d) => d.name);

  it('is served to overlays without a token', async () => {
    const res = await request(app).get('/overlay/showcase/states.json').expect(200);
    expect(res.body.overlays).toBeTypeOf('object');
  });

  it('has at least one state with a size for every overlay', async () => {
    const res = await request(app).get('/overlay/showcase/states.json').expect(200);
    for (const name of overlayDirs) {
      const entry = res.body.overlays[name];
      expect(entry, `missing overlay ${name}`).toBeDefined();
      expect(entry.size.width).toBeGreaterThan(0);
      expect(entry.size.height).toBeGreaterThan(0);
      expect(Object.keys(entry.states).length, `no states for ${name}`).toBeGreaterThan(0);
      for (const [stateName, state] of Object.entries<{ freezeAfterMs: number }>(entry.states)) {
        expect(stateName).toMatch(/^[a-z0-9-]+$/);
        expect(state.freezeAfterMs).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('gives every action a label and something to do', async () => {
    const res = await request(app).get('/overlay/showcase/states.json').expect(200);
    for (const [name, entry] of Object.entries<{ actions?: { label: string; public?: object; events?: { event: string }[] }[] }>(res.body.overlays)) {
      for (const action of entry.actions ?? []) {
        expect(action.label, `action without label in ${name}`).toMatch(/\S/);
        expect(Boolean(action.public) || (action.events ?? []).length > 0, `${name} › ${action.label} does nothing`).toBe(true);
        for (const e of action.events ?? []) expect(e.event, `${name} › ${action.label}`).toMatch(/^[a-z-]+$/);
      }
    }
  });

  it('lists no overlay that does not exist', async () => {
    const res = await request(app).get('/overlay/showcase/states.json').expect(200);
    for (const name of Object.keys(res.body.overlays)) expect(overlayDirs).toContain(name);
  });

  it('ships boot.js with the showcase mode', async () => {
    const res = await request(app).get('/overlay/boot.js').expect(200);
    expect(res.text).toContain('data-showcase-ready');
  });

  it('serves the showcase page', async () => {
    const res = await request(app).get('/overlay/showcase/').expect(200);
    expect(res.text).toContain('states.json');
    expect(res.text).toContain('?state=');
  });
});
