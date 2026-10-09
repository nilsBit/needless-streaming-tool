import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { initDatabase } from '../db/index';
import { generateApiToken } from '../auth-token';
import { createApp } from '../index';
import { csvCell, csvRow } from '../csv';
import { allowedOrigin } from '../origins';
import { looksLikeSound } from '../sound-sniff';
import { isAccelerator } from '../hotkey-accelerator';
import { pruneViewerData } from '../retention';

// Security review of 2026-10-06, block 4: exact origins, plain hardening
// headers, CSV cells a spreadsheet cannot misread, checked inputs, and what
// the app keeps about viewers.

describe('CSV cells', () => {
  it('quotes everything, doubles inner quotes, flattens line breaks and disarms formulas', () => {
    expect(csvCell('Karte der Unterstadt')).toBe('"Karte der Unterstadt"');
    expect(csvCell('sagt "hallo", geht')).toBe('"sagt ""hallo"", geht"');
    expect(csvCell('zwei\r\nZeilen')).toBe('"zwei Zeilen"');
    expect(csvCell('=HYPERLINK("http://evil")')).toBe('"\'=HYPERLINK(""http://evil"")"');
    expect(csvCell('+1 (0) 1234')).toBe('"\'+1 (0) 1234"');
    expect(csvCell('@kartograph')).toBe('"\'@kartograph"');
    expect(csvCell(null)).toBe('""');
    expect(csvRow(['a', 12, 'b'])).toBe('"a","12","b"');
  });
});

describe('origins', () => {
  const ctx = { port: 4000, host: '127.0.0.1' };
  it('lets the app, our own server, the dev page and non-browsers in', () => {
    expect(allowedOrigin(undefined, ctx)).toBe(true);
    expect(allowedOrigin('file://', ctx)).toBe(true);
    expect(allowedOrigin('http://localhost:4000', ctx)).toBe(true);
    expect(allowedOrigin('http://127.0.0.1:4000', ctx)).toBe(true);
    expect(allowedOrigin('http://localhost:5273', ctx)).toBe(true);
    expect(allowedOrigin('null', { ...ctx, path: '/api/design/inbox' })).toBe(true);
  });
  it('keeps other sites and other local dev servers out', () => {
    expect(allowedOrigin('https://evil.example', ctx)).toBe(false);
    expect(allowedOrigin('http://localhost:3001', ctx)).toBe(false);
    expect(allowedOrigin('http://localhost:5173', ctx)).toBe(false);
    expect(allowedOrigin('null', { ...ctx, path: '/api/settings/get/x' })).toBe(false);
    expect(allowedOrigin('http://192.168.1.20:4000', ctx)).toBe(false);
    expect(allowedOrigin('http://192.168.1.20:4000', { ...ctx, host: '0.0.0.0' })).toBe(true);
  });
});

describe('sound files', () => {
  it('recognises MP3, WAV and OGG by their first bytes and nothing else', () => {
    expect(looksLikeSound(Buffer.concat([Buffer.from('ID3'), Buffer.alloc(16)]), 'ding.mp3')).toBe(true);
    expect(looksLikeSound(Buffer.concat([Buffer.from([0xff, 0xfb]), Buffer.alloc(16)]), 'ding.mp3')).toBe(true);
    expect(looksLikeSound(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE'), Buffer.alloc(8)]), 'ding.wav')).toBe(true);
    expect(looksLikeSound(Buffer.concat([Buffer.from('OggS'), Buffer.alloc(16)]), 'ding.ogg')).toBe(true);
    expect(looksLikeSound(Buffer.from('<html><script>alert(1)</script></html>'), 'ding.mp3')).toBe(false);
    expect(looksLikeSound(Buffer.concat([Buffer.from('OggS'), Buffer.alloc(16)]), 'ding.wav')).toBe(false);
    expect(looksLikeSound(Buffer.from('ID3'), 'ding.mp3')).toBe(false);
  });
});

describe('hotkey accelerators', () => {
  it('accepts what Electron registers and refuses the rest', () => {
    expect(isAccelerator('CommandOrControl+Shift+E')).toBe(true);
    expect(isAccelerator('Ctrl+Alt+F12')).toBe(true);
    expect(isAccelerator('Shift+num7')).toBe(true);
    expect(isAccelerator('')).toBe(true);
    expect(isAccelerator('CommandOrControl+')).toBe(false);
    expect(isAccelerator('Strg+E')).toBe(false);
    expect(isAccelerator('E; rm -rf')).toBe(false);
    expect(isAccelerator(42)).toBe(false);
  });
});

describe('hardened routes', () => {
  let app: Express;
  let token: string;
  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(() => {
    initDatabase(':memory:');
    token = generateApiToken();
    app = createApp();
  });

  it('sets the plain hardening headers and frames nothing of the API', async () => {
    const res = await request(app).get('/api/health').set(auth()).expect(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['vary']).toContain('Origin');
    const pub = await request(app).get('/public/stream-state').expect(200);
    expect(pub.headers['x-frame-options']).toBeUndefined();
  });

  it('answers CORS only for the app, not for another local dev server', async () => {
    const ok = await request(app).get('/public/stream-state').set('Origin', 'http://localhost:5273').expect(200);
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:5273');
    const other = await request(app).get('/public/stream-state').set('Origin', 'http://localhost:3001').expect(200);
    expect(other.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('keeps internals out of error bodies', async () => {
    // Electron's `app` is not there in a test, so the autostart route fails — with a plain message.
    const res = await request(app).post('/api/settings/autostart').set(auth()).send({ enabled: true }).expect(500);
    expect(res.body.error).toBe('Autostart nicht verfügbar');
    expect(res.body.details).toBeUndefined();
  });

  it('refuses hotkeys that are not shortcuts and keys it does not know', async () => {
    await request(app).post('/api/settings/hotkeys').set(auth()).send({ hype_moment: 'Strg+C' }).expect(400);
    await request(app).post('/api/settings/hotkeys').set(auth()).send({ open_calc: 'CommandOrControl+C' }).expect(400);
    await request(app).post('/api/settings/hotkeys').set(auth()).send({ hype_moment: 'CommandOrControl+Shift+H', roulette: '' }).expect(200);
    const saved = await request(app).get('/api/settings/hotkeys').set(auth()).expect(200);
    expect(saved.body.hype_moment).toBe('CommandOrControl+Shift+H');
  });

  it('refuses a sync folder that is relative, missing or ours', async () => {
    await request(app).post('/api/settings/sync/config').set(auth()).send({ enabled: true, syncPath: 'Dropbox/NST' }).expect(400);
    await request(app).post('/api/settings/sync/config').set(auth()).send({ enabled: true, syncPath: '/definitely/not/here/nst-sync' }).expect(400);
    await request(app).post('/api/settings/sync/config').set(auth()).send({ enabled: true, syncPath: 42 }).expect(400);
  });

  it('wants strings for overlay HTML and real sound bytes for a sound', async () => {
    await request(app).put('/api/overlays/builtin/chat').set(auth()).send({ html: { evil: true } }).expect(400);
    await request(app).post('/api/overlays').set(auth()).send({ name: ['x'], html: '<b>' }).expect(400);
    await request(app).post('/api/alerts/sounds?name=ding.mp3').set(auth()).set('Content-Type', 'audio/mpeg').send(Buffer.from('<html>not a sound at all</html>')).expect(400);
  });

  it('forgets a viewer with everything stored under the login', async () => {
    await request(app).post('/api/reward-stats').set(auth()).send({ user_name: 'Kartograph', reward_type: 'roulette', count: 3 }).expect(200);
    await request(app).post('/api/reward-stats/forget').set(auth()).send({ user_name: 'kartograph' }).expect(200);
    const rows = (await request(app).get('/api/reward-stats').set(auth()).expect(200)).body as Array<{ user_name: string }>;
    expect(rows.find((r) => r.user_name === 'kartograph')).toBeUndefined();
    await request(app).post('/api/reward-stats/forget').set(auth()).send({ user_name: 'DROP TABLE' }).expect(400);
    await request(app).post('/api/reward-stats/forget').set(auth()).send({}).expect(400);
  });

  it('prunes nothing that is fresh', () => {
    expect(pruneViewerData(90)).toEqual({ songRequests: 0, leaderboard: 0, points: 0, streams: 0 });
  });
});
