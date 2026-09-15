import type { Client } from 'tmi.js';

/**
 * Twitch refuses chat messages longer than 500 characters — not truncated, the
 * whole message is dropped. Every reply the bot sends goes through here, so no
 * command can lose its answer to that limit.
 */
export const CHAT_MESSAGE_LIMIT = 500;

/**
 * Splits a reply into chat messages that each fit the limit.
 *
 * Cuts after the last sentence that still fits, so a message ends where a
 * thought does; failing that at the last space; only a single "word" longer
 * than a whole message is cut in the middle. Sentence ends early in the window
 * are ignored, so one long sentence after a short one does not leave a message
 * of three words behind.
 *
 * Line breaks are flattened — Twitch shows every message on one line anyway.
 */
export function splitForChat(text: string, limit = CHAT_MESSAGE_LIMIT): string[] {
  let rest = text.replace(/\s+/g, ' ').trim();
  const messages: string[] = [];

  while (rest.length > limit) {
    const cut = sentenceEnd(rest, limit) ?? wordEnd(rest, limit) ?? limit;
    messages.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) messages.push(rest);

  return messages;
}

function sentenceEnd(text: string, limit: number): number | null {
  const earliest = Math.floor(limit * 0.4);
  for (let i = limit - 1; i >= earliest; i--) {
    if ('.!?…'.includes(text.charAt(i)) && text.charAt(i + 1) === ' ') return i + 1;
  }
  return null;
}

function wordEnd(text: string, limit: number): number | null {
  const space = text.lastIndexOf(' ', limit);
  return space > 0 ? space : null;
}

/** Sends a reply in as many chat messages as it needs, in order. */
export async function sayInParts(client: Client, channel: string, text: string): Promise<void> {
  for (const part of splitForChat(text)) {
    try {
      await client.say(channel, part);
    } catch (err) {
      console.error('[Bot] Say failed:', err instanceof Error ? err.message : err);
    }
  }
}
