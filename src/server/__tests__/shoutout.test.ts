import { describe, it, expect, beforeEach } from 'vitest';
import { getDb, initDatabase } from '../db/index';
import { raidShoutoutEnabled, shoutoutText, type Helix } from '../bot/shoutout';

/**
 * `!so <Name>` — a mod points chat at another channel, and a raid does the
 * same on its own. The category comes from Twitch; without it the line still
 * goes out.
 */
describe('the shoutout', () => {
  const twitch = (channels: Record<string, { id: string; login: string; display_name: string; game_name: string }>): Helix =>
    async (path) => {
      const login = /users\?login=([^&]+)/.exec(path)?.[1];
      if (login) {
        const c = channels[login];
        return { data: c ? [{ id: c.id, login: c.login, display_name: c.display_name }] : [] };
      }
      const id = /channels\?broadcaster_id=([^&]+)/.exec(path)?.[1];
      const c = Object.values(channels).find((ch) => ch.id === id);
      return { data: c ? [{ game_name: c.game_name }] : [] };
    };

  const nachtgilde = { nachtgilde: { id: '7', login: 'nachtgilde', display_name: 'Nachtgilde', game_name: 'Art' } };

  it('names the channel, what it streamed last and where to find it', async () => {
    expect(await shoutoutText('Nachtgilde', twitch(nachtgilde)))
      .toBe('📣 Schaut bei Nachtgilde vorbei — zuletzt in „Art“: twitch.tv/nachtgilde');
  });

  it('takes the name with an @, as chat writes it', async () => {
    expect(await shoutoutText('@NACHTGILDE', twitch(nachtgilde))).toContain('twitch.tv/nachtgilde');
  });

  it('says so when the channel does not exist', async () => {
    expect(await shoutoutText('niemand', twitch(nachtgilde))).toBe('❓ Den Kanal „niemand“ gibt es auf Twitch nicht.');
  });

  it('still sends the line when Twitch cannot be asked', async () => {
    expect(await shoutoutText('Nachtgilde', async () => null))
      .toBe('📣 Schaut bei Nachtgilde vorbei: twitch.tv/nachtgilde');
  });

  it('explains itself without a name, and refuses what is no channel name', async () => {
    expect(await shoutoutText('', twitch(nachtgilde))).toBe('📣 !so <Name> — empfiehlt einen Kanal.');
    expect(await shoutoutText('a/../b', twitch(nachtgilde))).toBe('❓ Den Kanal „a/../b“ gibt es auf Twitch nicht.');
  });

  describe('after a raid', () => {
    beforeEach(() => initDatabase(':memory:'));

    it('is on until the streamer switches it off', () => {
      expect(raidShoutoutEnabled()).toBe(true);
      getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('raid_shoutout', '0');
      expect(raidShoutoutEnabled()).toBe(false);
    });
  });
});
