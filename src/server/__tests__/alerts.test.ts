import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { initDatabase } from '../db/index';
import { generateApiToken } from '../auth-token';
import { createApp } from '../index';
import { createGiftCounter } from '../bot/alerts';

interface Sent { event: string; data: { kind?: string; label?: string; who?: string; text?: string; message?: string } }

/**
 * What the Alerts overlay shows when someone follows, subscribes, gifts,
 * raids or cheers. The test button sends the real wording, so this is what a
 * viewer sees.
 */
describe('alerts for followers, subs, raids and bits', () => {
  let app: Express;
  let token: string;

  beforeEach(() => {
    initDatabase(':memory:');
    token = generateApiToken();
    app = createApp();
  });

  const sent = async (): Promise<Sent[]> =>
    (await request(app).post('/api/actions/overlay-test/alerts').set({ Authorization: `Bearer ${token}` }).expect(200)).body.sent;
  const alert = async (kind: string) => (await sent()).find((s) => s.event === 'alert' && s.data.kind === kind)?.data;

  it('words a follow, a sub, a raid and bits — name apart, so the overlay can accent it', async () => {
    expect(await alert('follow')).toEqual({ kind: 'follow', label: 'Follower', who: 'Kartograph', text: 'folgt jetzt.' });
    expect(await alert('sub')).toMatchObject({ label: 'Abo', who: 'Lesezeichen42', text: 'ist jetzt dabei.', message: 'endlich dabei!' });
    expect(await alert('raid')).toMatchObject({ label: 'Raid', who: 'Nachtgilde', text: 'bringt 42 Zuschauer mit.' });
    expect(await alert('cheer')).toMatchObject({ label: 'Bits', who: 'Tintenfass', text: 'wirft 500 Bits ein.' });
  });

  it('counts five gifted subs once — the five single notices after them stay quiet', () => {
    const gifts = createGiftCounter();
    gifts.mystery('Mondfalter', 5);
    const quiet = Array.from({ length: 5 }, () => gifts.fromMystery('mondfalter'));
    expect(quiet).toEqual([true, true, true, true, true]);
    // A sixth, given on its own, is shown again.
    expect(gifts.fromMystery('Mondfalter')).toBe(false);
    expect(gifts.fromMystery('Tintenfass')).toBe(false);
  });

  it('forgets a mystery gift whose single notices never came', () => {
    let now = 0;
    const gifts = createGiftCounter(() => now);
    gifts.mystery('Mondfalter', 3);
    now = 5 * 60_000;
    expect(gifts.fromMystery('Mondfalter')).toBe(false);
  });

  it('still sends the channel point reward it always did', async () => {
    expect((await sent()).some((s) => s.event === 'reward-redeemed')).toBe(true);
  });

  describe('worded and sounded by the streamer', () => {
    const auth = () => ({ Authorization: `Bearer ${token}` });
    const save = (body: unknown) => request(app).post('/api/alerts').set(auth()).send(body as object);
    const test = async (slot: string) => (await request(app).post(`/api/alerts/test/${slot}`).set(auth()).expect(200)).body.sent;
    // Sounds are files in the data folder — a name no streamer would pick, taken away again.
    const SOUND = `test-${process.pid}-glocke.mp3`;
    // The server looks at the first bytes: a file has to start like the sound its name claims.
    const soundBytes = (name: string) => name.endsWith('.wav')
      ? Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE'), Buffer.alloc(16)])
      : name.endsWith('.ogg') ? Buffer.concat([Buffer.from('OggS'), Buffer.alloc(24)]) : Buffer.concat([Buffer.from('ID3'), Buffer.alloc(24)]);
    const upload = (name: string, body: Buffer = soundBytes(name)) =>
      request(app).post('/api/alerts/sounds').query({ name }).set(auth()).set('Content-Type', 'audio/mpeg').send(body);

    afterEach(async () => {
      await request(app).delete(`/api/alerts/sounds/${SOUND}`).set(auth());
    });

    it('lists every alert with what a new install says and what its text may hold', async () => {
      const { alerts } = (await request(app).get('/api/alerts').set(auth()).expect(200)).body;
      expect(alerts.map((a: { slot: string }) => a.slot)).toEqual(['follow', 'sub', 'resub', 'subgift', 'subgift_many', 'raid', 'cheer']);
      expect(alerts.find((a: { slot: string }) => a.slot === 'raid')).toMatchObject({
        label: 'Raid', text: 'bringt {zuschauer} mit.', placeholders: ['zuschauer'], sound: null,
      });
    });

    it('says a follow and a raid in the streamer’s words, numbers filled in', async () => {
      await save({ follow: { label: 'Neu im Archiv', text: 'schlägt das Kompendium auf.' }, raid: { text: 'stürmt mit {zuschauer} die Stadt!' } }).expect(200);
      expect(await test('follow')).toEqual({ kind: 'follow', label: 'Neu im Archiv', who: 'Kartograph', text: 'schlägt das Kompendium auf.' });
      expect(await test('raid')).toMatchObject({ label: 'Raid', text: 'stürmt mit 42 Zuschauer die Stadt!' });
      // The button on the overlay page shows the same wording.
      expect(await alert('follow')).toMatchObject({ text: 'schlägt das Kompendium auf.' });
    });

    it('words a gift to one viewer and a gift to several apart', async () => {
      await save({ subgift: { text: 'beschenkt {empfaenger}.' }, subgift_many: { text: 'lässt {abos} regnen.' } }).expect(200);
      expect(await test('subgift')).toMatchObject({ kind: 'subgift', text: 'beschenkt Kartograph.' });
      expect(await test('subgift_many')).toMatchObject({ kind: 'subgift', text: 'lässt 5 Abos regnen.' });
    });

    it('reckons with a number when asked — the bare result, for the streamer to name', async () => {
      await save({ resub: { text: 'hat schon {monate*5} Seiten gelesen.' }, raid: { text: 'bringt {zuschauer + 1} Leute mit.' }, cheer: { text: 'zahlt {bits/100} Taler.' } }).expect(200);
      expect(await test('resub')).toMatchObject({ text: 'hat schon 35 Seiten gelesen.' });
      expect(await test('raid')).toMatchObject({ text: 'bringt 43 Leute mit.' });
      expect(await test('cheer')).toMatchObject({ text: 'zahlt 5 Taler.' });
      // Reckoned with a price, it is money: two places, with a comma.
      await save({ resub: { text: 'schon {monate*4.99} € mir geschenkt.' }, cheer: { text: '{bits*0,01} €' } }).expect(200);
      expect(await test('resub')).toMatchObject({ text: 'schon 34,93 € mir geschenkt.' });
      expect(await test('cheer')).toMatchObject({ text: '5,00 €' });
      // A name is no number, and nothing divides by zero — both stay as written.
      await save({ subgift: { text: 'beschenkt {empfaenger*2}.' }, cheer: { text: '{bits/0}' } }).expect(200);
      expect(await test('subgift')).toMatchObject({ text: 'beschenkt {empfaenger*2}.' });
      expect(await test('cheer')).toMatchObject({ text: '{bits/0}' });
    });

    it('goes back to the built-in wording when a text is emptied', async () => {
      await save({ follow: { text: 'ist da.' } }).expect(200);
      await save({ follow: { text: '  ' } }).expect(200);
      expect(await test('follow')).toMatchObject({ text: 'folgt jetzt.' });
    });

    it('refuses an alert it does not know, a text too long and a volume out of range — and keeps nothing of it', async () => {
      await save({ hosting: { text: 'x' } }).expect(400);
      await save({ follow: { text: 'x'.repeat(121) } }).expect(400);
      await save({ follow: { label: 'Neu', volume: 2 } }).expect(400);
      expect(await test('follow')).toMatchObject({ label: 'Follower', text: 'folgt jetzt.' });
      await request(app).post('/api/alerts/test/hosting').set(auth()).expect(404);
    });

    it('plays an uploaded sound with the alert it was given to, at its volume', async () => {
      const uploaded = (await upload(SOUND).expect(200)).body;
      expect(uploaded.sounds).toContain(SOUND);
      await save({ raid: { sound: SOUND, volume: 0.3 } }).expect(200);

      const raid = await test('raid');
      expect(raid.sound).toEqual({ url: `/public/alert-sound/${SOUND}`, volume: 0.3 });
      // The overlay fetches it without a token, like everything it shows.
      const file = await request(app).get(raid.sound.url).expect(200);
      expect(file.headers['content-type']).toMatch(/audio/);
      // An alert without a sound stays silent.
      expect(await test('follow')).not.toHaveProperty('sound');
    });

    it('takes only sound files, by plain name', async () => {
      await upload('glocke.exe').expect(400);
      await upload('../glocke.mp3').expect(400);
      await upload(SOUND, Buffer.alloc(0)).expect(400);
      await save({ raid: { sound: 'nie-hochgeladen.mp3' } }).expect(400);
    });

    it('keeps a file whose name has brackets or an ampersand, under a tidied name', async () => {
      const odd = `test-${process.pid} Glocke (1) & Co.mp3`;
      const { name, sounds } = (await upload(odd).expect(200)).body;
      expect(name).toBe(`test-${process.pid} Glocke -1- - Co.mp3`);
      expect(sounds).toContain(name);
      await save({ raid: { sound: name } }).expect(200);
      await request(app).delete(`/api/alerts/sounds/${encodeURIComponent(name)}`).set(auth()).expect(200);
    });

    it('leaves an alert silent once its sound is deleted', async () => {
      await upload(SOUND).expect(200);
      await save({ cheer: { sound: SOUND } }).expect(200);
      const after = (await request(app).delete(`/api/alerts/sounds/${SOUND}`).set(auth()).expect(200)).body;
      expect(after.sounds).not.toContain(SOUND);
      expect(await test('cheer')).not.toHaveProperty('sound');
      await request(app).delete(`/api/alerts/sounds/${SOUND}`).set(auth()).expect(404);
    });

    it('switches a single occasion off and on again — off, it sends nothing', async () => {
      await save({ follow: { enabled: false } }).expect(200);
      const rows = (await request(app).get('/api/alerts').set(auth()).expect(200)).body.alerts as Array<{ slot: string; enabled: boolean }>;
      expect(rows.find((r) => r.slot === 'follow')?.enabled).toBe(false);
      expect(rows.find((r) => r.slot === 'raid')?.enabled).toBe(true);
      await request(app).post('/api/alerts/test/follow').set(auth()).expect(409);
      expect(await test('raid')).toMatchObject({ kind: 'raid' });
      await save({ follow: { enabled: true } }).expect(200);
      expect(await test('follow')).toMatchObject({ kind: 'follow' });
      await save({ follow: { enabled: 'nein' } }).expect(400);
    });

    it('sends no alert at all once the feature is off', async () => {
      await request(app).post('/api/setup/features').set(auth()).send({ features: ['chat'] }).expect(200);
      await request(app).post('/api/alerts/test/raid').set(auth()).expect(409);
      await request(app).post('/api/setup/features').set(auth()).send({ features: ['chat', 'alerts'] }).expect(200);
      expect(await test('raid')).toMatchObject({ kind: 'raid' });
    });

    it('is closed without a token', async () => {
      await request(app).get('/api/alerts').expect(401);
      await request(app).post('/api/alerts/sounds').query({ name: SOUND }).set('Content-Type', 'audio/mpeg').send(Buffer.from('x')).expect(401);
    });
  });

  it('has a showcase state for every kind it can show', async () => {
    const states = (await request(app).get('/overlay/showcase/states.json').expect(200)).body.overlays.alerts.states;
    const kinds = Object.values(states)
      .flatMap((state) => ((state as { events?: { event: string; data: { kind?: string } }[] }).events ?? []))
      .filter((e) => e.event === 'alert')
      .map((e) => e.data.kind);
    expect(new Set(kinds)).toEqual(new Set(['follow', 'sub', 'resub', 'subgift', 'raid', 'cheer']));
  });
});
