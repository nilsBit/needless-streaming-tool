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
  aliases: string[];
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
  const list = async (): Promise<{ commands: CommandInfo[]; panel: string; builtinDescriptions: Record<string, string>; aliases: Record<string, string>; featured: { triggers: string[]; stored: boolean; max: number } }> =>
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

  it('names a few in chat, lists them all on request, and explains one', async () => {
    expect(await chat('!befehle figur')).toBe('!figur — Zeigt einen Eintrag der Art „Figur“ aus der Welt — z. B. !figur <Name>.');
    expect(await chat('!befehle !story')).toContain('Wir schreiben eine Welt.');
    expect(await chat('!befehle quatsch')).toMatch(/kenne ich nicht.*📜/);
    // The plain call: the usual ways in — here only !story and !figur exist of them — and how to get the rest.
    const few = await chat('!befehle');
    expect(few).toBe('📜 Neu hier? !story · !figur <Name> — alle Befehle: !befehle alle · was einer macht: !befehle <Name>');
    const all = await chat('!befehle alle');
    expect(all).toMatch(/^📜 Erklärt: !story · Aus der Welt: !begriff/);
    expect(all).toContain('Rund um den Stream: !challenge');
    expect(await chat('!befehle welt')).toMatch(/^📜 Aus der Welt: !begriff !figur/);
    expect(await chat('!befehle stream')).not.toContain('!story');
  });

  it('lets the streamer pick the few — up to six that exist', async () => {
    await request(app).post('/api/commands/featured').set(auth()).send({ triggers: ['!uptime', 'story'] }).expect(200);
    expect(await chat('!befehle')).toMatch(/^📜 Neu hier\? !uptime · !story — /);
    expect((await list()).featured).toMatchObject({ triggers: ['!uptime', '!story'], stored: true, max: 6 });
    await request(app).post('/api/commands/featured').set(auth()).send({ triggers: ['!nichts'] }).expect(400);
    await request(app).post('/api/commands/featured').set(auth()).send({ triggers: [] }).expect(200);
    expect((await list()).featured.stored).toBe(false);
  });

  it('answers a second name like the command it stands for, and says so in lists', async () => {
    await request(app).post('/api/commands/aliases').set(auth()).send({ '!geschichte': '!story', 'char': '!figur', '!liste': '!themen' }).expect(200);
    expect(await chat('!geschichte')).toContain('Wir schreiben eine Welt.');
    expect(await chat('!befehle geschichte')).toMatch(/^!story \(auch !geschichte\) — /);
    expect(await chat('!befehle alle')).toContain('!story (auch !geschichte)');
    expect((await list()).panel).toContain('!figur (auch !char) —');
    expect(await find('!story')).toMatchObject({ aliases: ['!geschichte'] });
    // A second name is taken: nobody else may become it.
    await request(app).post('/api/text-commands').set(auth()).send({ trigger: '!geschichte', response: 'x' }).expect(409);
  });

  it('refuses a second name that is a command, or that stands for nothing', async () => {
    await request(app).post('/api/commands/aliases').set(auth()).send({ '!story': '!uptime' }).expect(409);
    await request(app).post('/api/commands/aliases').set(auth()).send({ '!x': '!gibtsnicht' }).expect(404);
    await request(app).post('/api/commands/aliases').set(auth()).send({ 'kein wort': '!story' }).expect(400);
    expect((await list()).aliases).toEqual({});
  });

  it('calls the wheel’s list !themen now, and still answers to !issues', async () => {
    expect(await find('!themen')).toMatchObject({ group: 'builtin', aliases: [] });
    expect(await find('!issues')).toBeUndefined();
    const res = await request(app).post('/api/text-commands').set(auth()).send({ trigger: '!issues', response: 'x' });
    expect(res.status).toBe(409);
  });

  it('answers !commands and !help like !befehle, for viewers who look in English', async () => {
    const all = await chat('!befehle alle');
    expect(await chat('!commands alle')).toBe(all);
    expect(await chat('!HELP alle')).toBe(all);
    expect(await chat('!help story')).toContain('Wir schreiben eine Welt.');
  });

  it('keeps !commands and !help from becoming a command of their own', async () => {
    for (const trigger of ['!commands', '!help']) {
      const res = await request(app).post('/api/text-commands').set(auth()).send({ trigger, response: 'x' });
      expect(res.status).toBe(409);
    }
  });

  it('leaves the shoutout out of the list — it is for mods', async () => {
    expect(await find('!so')).toBeUndefined();
    expect(await chat('!befehle alle')).not.toMatch(/!so\b/);
  });

  it('leaves a command that is switched off out of the list', async () => {
    const story = await find('!story');
    await request(app).patch(`/api/text-commands/${story!.id}`).set(auth()).send({ enabled: false }).expect(200);
    expect(await find('!story')).toBeUndefined();
    expect((await list()).panel).not.toContain('!story');
  });

  it('lists !datenschutz among the built-ins and ends the panel text with what the tool keeps', async () => {
    const { commands, panel } = await list();
    expect(commands.find((c) => c.trigger === '!datenschutz')).toMatchObject({ group: 'builtin' });
    expect(panel).toContain('Deine Daten');
    expect(panel).toContain('90 Tage');
  });
});
