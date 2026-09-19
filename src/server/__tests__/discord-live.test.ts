import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import http from 'http';
import type { AddressInfo } from 'net';
import request from 'supertest';
import type { Express } from 'express';
import { getDb, initDatabase } from '../db/index';
import { generateApiToken } from '../auth-token';
import { createApp } from '../index';
import { announceLive, LIVE_COOLDOWN_MS } from '../discord/live';

/**
 * Going live posts one message to a Discord channel. Only one: a stream that
 * drops and restarts, or an app restart mid-stream, must not ping everyone a
 * second time.
 */
describe('Discord live announcement', () => {
  let server: http.Server;
  let hookUrl: string;
  let received: { path: string; body: Record<string, unknown> }[];
  let status: number;

  const setSetting = (key: string, value: string) =>
    getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);

  beforeEach(async () => {
    initDatabase(':memory:');
    received = [];
    status = 204;
    server = http.createServer((req, res) => {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        received.push({ path: req.url ?? '', body: JSON.parse(raw || '{}') });
        res.writeHead(status);
        res.end();
      });
    });
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', () => done()));
    hookUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/webhooks/1/secret`;
  });

  afterEach(async () => {
    await new Promise<void>((done) => server.close(() => done()));
  });

  it('does nothing without a webhook', async () => {
    await expect(announceLive(1_000)).resolves.toBe('off');
    expect(received).toEqual([]);
  });

  it('posts the message with the Twitch channel filled in', async () => {
    setSetting('discord_live_webhook', hookUrl);
    setSetting('discord_live_message', '🔴 Live: https://twitch.tv/{channel}');
    setSetting('twitch_config', JSON.stringify({ channel: 'chain_des', username: 'chain_des', oauth_token: 'x' }));

    await expect(announceLive(1_000)).resolves.toBe('sent');

    expect(received).toHaveLength(1);
    expect(received[0]!.body).toMatchObject({ content: '🔴 Live: https://twitch.tv/chain_des' });
  });

  it('uses a default message when none is set', async () => {
    setSetting('discord_live_webhook', hookUrl);

    await announceLive(1_000);

    expect(String(received[0]!.body.content)).toMatch(/live/i);
  });

  it('never pings @everyone, whatever the message says', async () => {
    setSetting('discord_live_webhook', hookUrl);
    setSetting('discord_live_message', '@everyone live!');

    await announceLive(1_000);

    expect(received[0]!.body.allowed_mentions).toEqual({ parse: ['roles'] });
  });

  it('stays quiet when a stream restarts shortly after the last announcement', async () => {
    setSetting('discord_live_webhook', hookUrl);
    await announceLive(1_000);

    await expect(announceLive(1_000 + LIVE_COOLDOWN_MS - 1)).resolves.toBe('recent');
    expect(received).toHaveLength(1);
  });

  it('announces again once the cooldown has passed', async () => {
    setSetting('discord_live_webhook', hookUrl);
    await announceLive(1_000);

    await expect(announceLive(1_000 + LIVE_COOLDOWN_MS)).resolves.toBe('sent');
    expect(received).toHaveLength(2);
  });

  it('does not start the cooldown when Discord refuses the message', async () => {
    setSetting('discord_live_webhook', hookUrl);
    status = 500;
    await expect(announceLive(1_000)).resolves.toBe('failed');

    status = 204;
    await expect(announceLive(2_000)).resolves.toBe('sent');
  });
});

describe('Discord live settings', () => {
  let app: Express;
  let token: string;
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const URL = 'https://discord.com/api/webhooks/1550909326493753388/very-secret-token';

  beforeAll(() => {
    initDatabase(':memory:');
    token = generateApiToken();
    app = createApp();
  });

  beforeEach(() => {
    initDatabase(':memory:');
  });

  it('stores the webhook but never hands it back', async () => {
    await request(app).post('/api/settings/discord-live').set(auth()).send({ webhook_url: URL, message: 'Live!' }).expect(200);

    const res = await request(app).get('/api/settings/discord-live').set(auth()).expect(200);

    expect(res.body).toEqual({ configured: true, message: 'Live!' });
    expect(JSON.stringify(res.body)).not.toContain('very-secret-token');
  });

  it('rejects something that is not a Discord webhook', async () => {
    const res = await request(app)
      .post('/api/settings/discord-live')
      .set(auth())
      .send({ webhook_url: 'https://discord.gg/invite' })
      .expect(400);

    expect(res.body.error).toMatch(/webhook/i);
  });

  it('removes the webhook when asked', async () => {
    await request(app).post('/api/settings/discord-live').set(auth()).send({ webhook_url: URL }).expect(200);
    await request(app).post('/api/settings/discord-live').set(auth()).send({ webhook_url: '' }).expect(200);

    const res = await request(app).get('/api/settings/discord-live').set(auth()).expect(200);
    expect(res.body.configured).toBe(false);
  });
});
