import { describe, it, expect } from 'vitest';
import { raider } from '../bot/raid';

describe('who raids', () => {
  it('goes by the login from the tags, keeps the display name to show', () => {
    expect(raider('サルドール', { 'msg-param-login': 'saldor', 'msg-param-displayName': 'サルドール' })).toEqual({ login: 'saldor', name: 'サルドール' });
  });

  it('falls back to the name when the tags lack a login', () => {
    expect(raider('Saldor')).toEqual({ login: 'saldor', name: 'Saldor' });
  });
});
