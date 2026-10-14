import { broadcast } from '../websocket/index';

/**
 * What viewers write, for the chat overlay.
 *
 * Every message the bot reads comes through here. The last few stay in memory
 * so an overlay that reloads in OBS is not empty, and whatever a moderator
 * removes on Twitch is taken back from the overlay too — a deleted message
 * must not stay on stream.
 *
 * Commands stay out — a bare `!story` tells nobody anything. The bot's answer
 * to one comes in instead (feedBotAnswer), marked as the bot's; what the bot
 * says on its own (reminders, confirmations) stays out (14.10.).
 */

export const CHAT_FEED_SIZE = 20;

export type ChatPart = { type: 'text'; text: string } | { type: 'emote'; id: string; name: string };

export interface ChatLine {
  id: string;
  /** Lower-case login — what a timeout or ban names. */
  login: string;
  /** What chat shows as the name. */
  user: string;
  color: string | null;
  parts: ChatPart[];
  /** The bot answering a command — the overlay sets it apart. */
  bot?: true;
}

/** The part of tmi.js's tags this needs. */
export interface ChatTags {
  id?: string;
  username?: string;
  'display-name'?: string;
  color?: string | null;
  emotes?: Record<string, string[]> | null;
}

let lines: ChatLine[] = [];

/** When viewers wrote, for the last minute — how busy chat is (cooldown.ts). Commands count too. */
let recent: number[] = [];

export function noteChatActivity(now = Date.now()): void {
  recent.push(now);
  if (recent.length > 400) recent = recent.filter((t) => now - t < 60_000);
}

export function chatMessagesLastMinute(now = Date.now()): number {
  recent = recent.filter((t) => now - t < 60_000);
  return recent.length;
}

/** Twitch emote ids are digits or `emotesv2_…`; anything else never reaches an image URL. */
const EMOTE_ID = /^[\w-]+$/;

/**
 * Cuts a message into text and emotes at the ranges Twitch sends.
 * Twitch counts characters, not UTF-16 units — an emoji is one.
 */
export function parseChatParts(message: string, emotes: Record<string, string[]> | null | undefined): ChatPart[] {
  const chars = Array.from(message);
  const ranges: Array<{ id: string; start: number; end: number }> = [];
  for (const [id, positions] of Object.entries(emotes ?? {})) {
    if (!EMOTE_ID.test(id)) continue;
    for (const position of positions) {
      const [start, end] = position.split('-').map(Number);
      if (Number.isInteger(start) && Number.isInteger(end) && start <= end && end < chars.length) {
        ranges.push({ id, start, end });
      }
    }
  }
  ranges.sort((a, b) => a.start - b.start);

  const parts: ChatPart[] = [];
  let at = 0;
  for (const range of ranges) {
    if (range.start < at) continue; // overlapping ranges — keep the first
    if (range.start > at) parts.push({ type: 'text', text: chars.slice(at, range.start).join('') });
    parts.push({ type: 'emote', id: range.id, name: chars.slice(range.start, range.end + 1).join('') });
    at = range.end + 1;
  }
  if (at < chars.length) parts.push({ type: 'text', text: chars.slice(at).join('') });
  return parts;
}

/** Takes a message the bot read; commands and messages without an id stay out. */
export function feedChatMessage(tags: ChatTags, message: string): void {
  noteChatActivity();
  if (message.trimStart().startsWith('!')) return;
  if (!tags.id || !tags.username) return;

  const line: ChatLine = {
    id: tags.id,
    login: tags.username.toLowerCase(),
    user: tags['display-name'] || tags.username,
    color: tags.color || null,
    parts: parseChatParts(message, tags.emotes),
  };
  lines = [...lines, line].slice(-CHAT_FEED_SIZE);
  broadcast('chat-message', line);
}

let botAnswers = 0;

/** The bot's answer to a command, for the overlay. Twitch gives the bot's own messages no id, so it gets one here. */
export function feedBotAnswer(botName: string, text: string): void {
  if (!text.trim()) return;
  botAnswers += 1;
  const line: ChatLine = {
    id: `bot-${Date.now()}-${botAnswers}`,
    login: botName.toLowerCase(),
    user: botName,
    color: null,
    bot: true,
    parts: [{ type: 'text', text }],
  };
  lines = [...lines, line].slice(-CHAT_FEED_SIZE);
  broadcast('chat-message', line);
}

export function recentChat(): ChatLine[] {
  return lines;
}

function removeWhere(gone: (line: ChatLine) => boolean): void {
  const ids = lines.filter(gone).map((line) => line.id);
  if (ids.length === 0) return;
  lines = lines.filter((line) => !gone(line));
  broadcast('chat-remove', { ids });
}

/** A moderator deleted one message. */
export function removeChatMessage(id: string): void {
  removeWhere((line) => line.id === id);
}

/** Someone was timed out or banned — all they wrote goes. */
export function removeChatUser(login: string): void {
  const who = login.toLowerCase();
  removeWhere((line) => line.login === who);
}

/**
 * Empties the feed. `announce` for a chat cleared on Twitch; without it (a
 * test starting over) nothing is sent.
 */
export function clearChatFeed(announce = false): void {
  if (announce) removeWhere(() => true);
  lines = [];
}
