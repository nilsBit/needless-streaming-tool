import { getPointsConfig } from './config';
import { adjustPoints, standing } from './ledger';
import { listPointRewards } from './rewards';

/**
 * What the bot says about own points. `!punkte` and `!belohnungen` only tell
 * something and answer through chat-answers.ts, so the app's "try it" box
 * shows the same; giving and taking change the account and run in the bot.
 */

const LOGIN = /^[a-z0-9_]{1,25}$/i;
/** A chat message holds 500 characters; the list stops before that. */
const LIST_MAX = 450;

/** `!punkte` — your own standing; `!punkte <Name>` someone else's. Only a login is echoed. */
export function pointsReply(message: string, viewer?: string): string {
  const { currency } = getPointsConfig();
  const asked = message.trim().split(/\s+/)[1]?.replace(/^@/, '') ?? '';
  const target = LOGIN.test(asked) ? asked.toLowerCase() : viewer?.toLowerCase();
  if (!target) return `Wessen ${currency}? !punkte <Name>`;
  const s = standing(target);
  const own = target === viewer?.toLowerCase();
  if (!s) return own ? `@${target} du hast noch keine ${currency} — Zuschauen und Chatten im Stream bringt welche.` : `${target} hat noch keine ${currency}.`;
  return `${own ? `@${s.display_name} du hast` : `${s.display_name} hat`} ${s.balance} ${currency} · Beitrag ${s.total} · Platz ${s.rank}`;
}

/** `!belohnungen` — what can be bought, cheapest first, in one message. */
export function rewardsListReply(): string {
  const { currency } = getPointsConfig();
  const rewards = listPointRewards().filter((r) => r.enabled);
  if (rewards.length === 0) return `Noch keine Belohnungen für ${currency}.`;
  const head = `Belohnungen (!einlösen <Name>): `;
  let line = head;
  for (const [i, r] of rewards.entries()) {
    const part = `${i ? ' · ' : ''}${r.name} ${r.cost}`;
    if (line.length + part.length > LIST_MAX) { line += ' …'; break; }
    line += part;
  }
  return `${line} ${currency}`;
}

/**
 * `!punkte geben @name 50` / `!punkte nehmen @name 50` — mods only, checked by
 * the caller. Null when the message is not a give or take, so it answers as
 * `!punkte <Name>` instead.
 */
export function adjustReply(message: string): string | null {
  const [, verb, rawName, rawAmount] = message.trim().split(/\s+/);
  const sign = verb?.toLowerCase() === 'geben' ? 1 : verb?.toLowerCase() === 'nehmen' ? -1 : 0;
  if (!sign) return null;
  const { currency } = getPointsConfig();
  const name = rawName?.replace(/^@/, '') ?? '';
  const amount = Number(rawAmount);
  if (!LOGIN.test(name) || !Number.isInteger(amount) || amount <= 0 || amount > 1_000_000) {
    return `!punkte ${sign > 0 ? 'geben' : 'nehmen'} @Name <Anzahl>`;
  }
  const s = adjustPoints(name, sign * amount);
  if (!s) return `${name.toLowerCase()} hat keine ${currency}.`;
  return `${s.display_name}: ${sign > 0 ? '+' : '−'}${amount} ${currency}, jetzt ${s.balance} (Beitrag ${s.total}).`;
}
