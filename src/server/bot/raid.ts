/**
 * Who raids, as tmi.js hands it over: `username` is the display name (it may
 * be written differently, or in another script), the login stands in the tags.
 * Own points go by login – a raid under the display name made an account that
 * !punkte and "Zuschauer vergessen" could not reach (security review 15.10.).
 */
export function raider(username: string, tags?: Record<string, unknown>): { login: string; name: string } {
  const login = typeof tags?.['msg-param-login'] === 'string' && tags['msg-param-login'] ? (tags['msg-param-login'] as string) : username;
  return { login: login.toLowerCase(), name: username };
}
