import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { initDatabase } from '../db/index';
import { generateApiToken } from '../auth-token';
import { createApp } from '../index';

interface CommandInfo {
  trigger: string;
  description: string;
  group: 'text' | 'lookup' | 'builtin';
  id: string;
  stored: boolean;
}

/**
 * One list for all commands: the streamer's own texts, what is looked up in
 * the world, and the built-ins. `!befehle`, the app and the text for a Twitch
 * panel read from it, so a command is described once.
 */
describe('the command list', () => {
  let app: Express;
  let token: string;

  beforeEach(async () => {
    initDatabase(':memory:');
    token = generateApiToken();
    app = createApp();
    await request(app).post('/api/text-commands').set(auth())
      .send({ trigger: '!story', response: 'Wir schreiben eine Welt. Jede Woche ein Stück mehr.' }).expect(201);
  });

  const auth = () => ({ Authorization: `Bearer ${token}` });
  const list = async (): Promise<{ commands: CommandInfo[]; panel: string; builtinDescriptions: Record<string, string> }> =>
    (await request(app).get('/api/commands').set(auth()).expect(200)).body;
  const find = async (trigger: string) => (await list()).commands.find((c) => c.trigger === trigger);
  const chat = async (message: string) =>
    ((await request(app).post('/api/chat/try').set(auth()).send({ message }).expect(200)).body.replies ?? []).join(' ');

  it('describes every command, deriving what nobody wrote', async () => {
    const { commands } = await list();
    expect(commands.map((c) => c.group)).toContain('text');
    expect(await find('!story')).toMatchObject({ group: 'text', stored: false, description: 'Wir schreiben eine Welt.' });
    expect((await find('!figur'))?.description).toMatch(/Art „Figur“/);
    expect(await find('!uptime')).toMatchObject({ group: 'builtin', stored: false, description: 'Sagt, wie lange der Stream schon läuft.' });
  });

  it('takes a description of the streamer\'s own for a command', async () => {
    const story = await find('!story');
    await request(app).patch(`/api/text-commands/${story!.id}`).set(auth()).send({ description: 'Worum es in der Welt geht.' }).expect(200);
    expect(await find('!story')).toMatchObject({ stored: true, description: 'Worum es in der Welt geht.' });

    await request(app).patch(`/api/text-commands/${story!.id}`).set(auth()).send({ description: '  ' }).expect(200);
    expect(await find('!story')).toMatchObject({ stored: false, description: 'Wir schreiben eine Welt.' });
  });

  it('takes one for a built-in, and refuses a key that is no command', async () => {
    await request(app).post('/api/commands/descriptions').set(auth())
      .send({ uptime: 'Wie lange wir heute schon dabei sind.', __proto__: 'x', nonsense: 'y' }).expect(200);
    expect(await find('!uptime')).toMatchObject({ stored: true, description: 'Wie lange wir heute schon dabei sind.' });
    expect((await list()).builtinDescriptions).toEqual({ uptime: 'Wie lange wir heute schon dabei sind.' });
    await request(app).post('/api/commands/descriptions').set(auth()).send(['nope']).expect(400);
  });

  it('gives a text for a Twitch panel, grouped', async () => {
    const { panel } = await list();
    expect(panel.startsWith('Befehle im Chat')).toBe(true);
    expect(panel).toContain('ERKLÄRT\n!story — Wir schreiben eine Welt.');
    expect(panel).toContain('AUS DER WELT\n!begriff —');
    expect(panel).toContain('RUND UM DEN STREAM');
    expect(panel).not.toContain('!scene');
  });

  it('explains one command in chat, and still lists them all', async () => {
    expect(await chat('!befehle figur')).toBe('!figur — Zeigt einen Eintrag der Art „Figur“ aus der Welt — z. B. !figur <Name>.');
    expect(await chat('!befehle !story')).toContain('Wir schreiben eine Welt.');
    expect(await chat('!befehle quatsch')).toMatch(/kenne ich nicht.*📜 Befehle/);
    const all = await chat('!befehle');
    expect(all).toMatch(/^📜 Befehle: !story/);
    expect(all).toContain('!befehle <Name>');
  });

  it('leaves a command that is switched off out of the list', async () => {
    const story = await find('!story');
    await request(app).patch(`/api/text-commands/${story!.id}`).set(auth()).send({ enabled: false }).expect(200);
    expect(await find('!story')).toBeUndefined();
    expect((await list()).panel).not.toContain('!story');
  });
});
