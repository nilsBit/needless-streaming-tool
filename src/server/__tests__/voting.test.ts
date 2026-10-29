import { describe, it, expect, beforeEach } from 'vitest';
import { initDatabase } from '../db/index';
import { cancelVote, castVote, getActiveVote, startVote } from '../bot/voting';

/**
 * A viewer votes with `!vote <Nummer>` — the option's place in the list, as
 * the card and the chat number them — or with the option's own words.
 */
describe('casting a vote', () => {
  beforeEach(() => {
    initDatabase(':memory:');
    cancelVote();
    startVote('Abstimmung', ['Rote Tür', 'Blaue Tür', 'Keller'], 60);
  });

  it('takes the number of an option', () => {
    expect(castVote('anna', '2')).toBe(true);
    expect(getActiveVote()?.counts['blaue tür']).toBe(1);
  });

  it('still takes the words of an option', () => {
    expect(castVote('anna', 'Keller')).toBe(true);
    expect(getActiveVote()?.counts.keller).toBe(1);
  });

  it('refuses a number with no option', () => {
    expect(castVote('anna', '0')).toBe(false);
    expect(castVote('anna', '4')).toBe(false);
    expect(getActiveVote()?.total).toBe(0);
  });
});
