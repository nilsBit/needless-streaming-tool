import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { initDatabase } from '../db/index';
import { createApp } from '../index';
import {
  CHAT_FEED_SIZE,
  clearChatFeed,
  feedChatMessage,
  parseChatParts,
  recentChat,
  removeChatMessage,
  removeChatUser,
} from '../bot/chat-feed';

const tags = (over: Record<string, unknown> = {}) => ({
  id: 'm1',
  username: 'lena_42',
  'display-name': 'Lena_42',
  color: '#1E90FF',
  emotes: null,
  ...over,
});

/**
 * The chat overlay shows what viewers write. It hears every message the bot
 * reads, keeps the last few for an overlay that reloads, and takes back what a
 * moderator removes — a deleted message must not stay on stream.
 */
// What would go out to the overlays — without a WebSocket server, broadcast sends nothing.
let events: Array<{ event: string; data: unknown }> = [];
vi.mock('../websocket/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../websocket/index')>()),
  broadcast: (event: string, data: unknown) => {
    if (event.startsWith('chat-')) events.push({ event, data });
  },
}));

describe('the chat feed', () => {
  beforeEach(() => {
    clearChatFeed();
    events = [];
  });

  it('turns a message into a line with name, colour and text', () => {
    feedChatMessage(tags(), 'wer ist Samael??');

    expect(recentChat()).toEqual([
      { id: 'm1', login: 'lena_42', user: 'Lena_42', color: '#1E90FF', parts: [{ type: 'text', text: 'wer ist Samael??' }] },
    ]);
    expect(events).toEqual([{ event: 'chat-message', data: recentChat()[0] }]);
  });

  it('leaves out commands — their answers would flood the box', () => {
    feedChatMessage(tags(), '!welt');
    feedChatMessage(tags({ id: 'm2' }), '  !lore Mila');

    expect(recentChat()).toEqual([]);
    expect(events).toEqual([]);
  });

  it('drops a message it cannot take back later', () => {
    feedChatMessage(tags({ id: undefined }), 'hallo');
    expect(recentChat()).toEqual([]);
  });

  it('keeps only the last few', () => {
    for (let i = 0; i < CHAT_FEED_SIZE + 5; i++) feedChatMessage(tags({ id: `m${i}` }), `Nachricht ${i}`);

    const lines = recentChat();
    expect(lines).toHaveLength(CHAT_FEED_SIZE);
    expect(lines[lines.length - 1].parts).toEqual([{ type: 'text', text: `Nachricht ${CHAT_FEED_SIZE + 4}` }]);
  });

  it('falls back to the login when there is no display name or colour', () => {
    feedChatMessage(tags({ 'display-name': undefined, color: null }), 'hi');
    expect(recentChat()[0]).toMatchObject({ user: 'lena_42', color: null });
  });

  it('takes back a deleted message', () => {
    feedChatMessage(tags({ id: 'a' }), 'bleibt');
    feedChatMessage(tags({ id: 'b' }), 'geht');
    events = [];

    removeChatMessage('b');

    expect(recentChat().map((l) => l.id)).toEqual(['a']);
    expect(events).toEqual([{ event: 'chat-remove', data: { ids: ['b'] } }]);
  });

  it('takes back everything from someone who was timed out or banned', () => {
    feedChatMessage(tags({ id: 'a', username: 'troll' }), 'eins');
    feedChatMessage(tags({ id: 'b' }), 'normal');
    feedChatMessage(tags({ id: 'c', username: 'Troll' }), 'zwei');
    events = [];

    removeChatUser('troll');

    expect(recentChat().map((l) => l.id)).toEqual(['b']);
    expect(events).toEqual([{ event: 'chat-remove', data: { ids: ['a', 'c'] } }]);
  });

  it('says nothing when there was nothing to take back', () => {
    feedChatMessage(tags({ id: 'a' }), 'bleibt');
    events = [];

    removeChatMessage('gibt-es-nicht');
    removeChatUser('niemand');

    expect(events).toEqual([]);
  });

  it('empties everything when the chat is cleared', () => {
    feedChatMessage(tags({ id: 'a' }), 'eins');
    events = [];

    clearChatFeed(true);

    expect(recentChat()).toEqual([]);
    expect(events).toEqual([{ event: 'chat-remove', data: { ids: ['a'] } }]);
  });
});

describe('emotes in a chat line', () => {
  it('cuts the message at the positions Twitch sends', () => {
    expect(parseChatParts('Kappa hallo PogChamp', { '25': ['0-4'], '88': ['12-19'] })).toEqual([
      { type: 'emote', id: '25', name: 'Kappa' },
      { type: 'text', text: ' hallo ' },
      { type: 'emote', id: '88', name: 'PogChamp' },
    ]);
  });

  it('counts positions in characters, so an emoji before an emote does not shift it', () => {
    expect(parseChatParts('😍 Kappa', { '25': ['2-6'] })).toEqual([
      { type: 'text', text: '😍 ' },
      { type: 'emote', id: '25', name: 'Kappa' },
    ]);
  });

  it('keeps plain text as one part', () => {
    expect(parseChatParts('die Farben 😍', null)).toEqual([{ type: 'text', text: 'die Farben 😍' }]);
  });

  it('ignores an emote id that is not a plain Twitch id', () => {
    expect(parseChatParts('x', { '../evil': ['0-0'] })).toEqual([{ type: 'text', text: 'x' }]);
  });
});

describe('GET /public/chat', () => {
  let app: Express;

  beforeEach(() => {
    initDatabase(':memory:');
    app = createApp();
    clearChatFeed();
  });

  it('hands a reloading overlay the last lines, without a token', async () => {
    feedChatMessage(tags(), 'hallo');

    const res = await request(app).get('/public/chat').expect(200);

    expect(res.body).toEqual(recentChat());
  });
});

describe('the chat overlay', () => {
  it('may load Twitch emotes', async () => {
    initDatabase(':memory:');
    const res = await request(createApp()).get('/overlay/chat/index.html').expect(200);
    const imgSrc = /img-src ([^;]*)/.exec(res.headers['content-security-policy'])?.[1] ?? '';

    expect(imgSrc.split(' ')).toContain('https://static-cdn.jtvnw.net');
    expect(res.text).toContain('https://static-cdn.jtvnw.net/emoticons/v2/');
  });
});
