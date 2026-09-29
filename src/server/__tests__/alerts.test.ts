import { describe, it, expect, beforeEach } from 'vitest';
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

  it('has a showcase state for every kind it can show', async () => {
    const states = (await request(app).get('/overlay/showcase/states.json').expect(200)).body.overlays.alerts.states;
    const kinds = Object.values(states)
      .flatMap((state) => ((state as { events?: { event: string; data: { kind?: string } }[] }).events ?? []))
      .filter((e) => e.event === 'alert')
      .map((e) => e.data.kind);
    expect(new Set(kinds)).toEqual(new Set(['follow', 'sub', 'resub', 'subgift', 'raid', 'cheer']));
  });
});
