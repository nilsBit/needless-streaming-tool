import { broadcast } from '../websocket/index';
import { noteActivity } from '../stream-report/log';
import { announce } from './announce';
import { getCommandNames } from './command-names';

interface Vote {
  options: string[];
  votes: Map<string, string>; // username → option
  title: string;
  designId: number | null;
  timer: ReturnType<typeof setTimeout> | null;
  durationSeconds: number;
  startedAt: number;
}

let activeVote: Vote | null = null;

export function getActiveVote() {
  if (!activeVote) return null;

  const counts = getVoteCounts();
  const elapsed = Math.floor((Date.now() - activeVote.startedAt) / 1000);
  const remaining = Math.max(0, activeVote.durationSeconds - elapsed);

  return {
    title: activeVote.title,
    options: activeVote.options,
    counts,
    total: activeVote.votes.size,
    remaining,
    designId: activeVote.designId,
  };
}

function getVoteCounts(): Record<string, number> {
  if (!activeVote) return {};
  const counts: Record<string, number> = {};
  activeVote.options.forEach((o) => (counts[o] = 0));
  activeVote.votes.forEach((option) => {
    counts[option] = (counts[option] || 0) + 1;
  });
  return counts;
}

export function startVote(
  title: string,
  options: string[],
  durationSeconds: number = 60,
  designId: number | null = null
): boolean {
  if (activeVote) return false;

  activeVote = {
    title,
    options: options.map((o) => o.toLowerCase()),
    votes: new Map(),
    designId,
    durationSeconds,
    startedAt: Date.now(),
    timer: null,
  };

  activeVote.timer = setTimeout(() => {
    endVote();
  }, durationSeconds * 1000);

  // Broadcast poll start to overlays, and tell chat how to vote
  broadcastPoll();
  announce(startLine(activeVote.options, durationSeconds));
  noteActivity('poll', title);

  return true;
}

export function castVote(username: string, option: string): boolean {
  if (!activeVote) return false;
  // The option's own words first, then its number — so options that are numbers still count as words.
  const typed = option.trim().toLowerCase();
  const place = /^\d+$/.test(typed) ? Number(typed) : 0;
  const normalized = activeVote.options.includes(typed) ? typed : activeVote.options[place - 1];
  if (!normalized) return false;

  activeVote.votes.set(username.toLowerCase(), normalized);
  broadcastPoll();
  return true;
}

export function endVote(): { winner: string; counts: Record<string, number> } | null {
  if (!activeVote) return null;

  if (activeVote.timer) clearTimeout(activeVote.timer);

  const counts = getVoteCounts();
  const winner = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || activeVote.options[0];

  const result = { winner, counts, title: activeVote.title, designId: activeVote.designId, total: activeVote.votes.size };

  broadcast('vote-result', result);
  announce(resultLine(activeVote.options, counts));
  noteActivity('poll', null, result.total);
  broadcast('poll-close', {});

  activeVote = null;
  return { winner, counts };
}

/** Options the way chat votes on them: "1 rote tür | 2 blaue tür". */
export function numbered(options: string[], counts?: Record<string, number>): string {
  return options.map((option, i) => (counts ? `${i + 1} ${option} ${counts[option] || 0}` : `${i + 1} ${option}`)).join(' | ');
}

/** What chat reads when a vote starts — from the app or from `!abstimmung start`. */
export function startLine(options: string[], durationSeconds: number): string {
  return `🗳️ ABSTIMMUNG! Schreibt ${getCommandNames().vote} <Nummer> — ${numbered(options)} — ${durationSeconds}s Zeit!`;
}

/** What chat reads when a vote is over — ended by hand or by its time. Several on top share it. */
export function resultLine(options: string[], counts: Record<string, number>): string {
  const most = Math.max(0, ...options.map((o) => counts[o] || 0));
  if (most === 0) return '🗳️ Abstimmung vorbei — keine Stimmen.';
  const winners = options.filter((o) => (counts[o] || 0) === most);
  const verdict = winners.length > 1 ? `Gleichstand: ${winners.join(', ')}` : `Gewinner: ${winners[0]} 🏆`;
  return `🗳️ ERGEBNIS: ${numbered(options, counts)} — ${verdict}`;
}

export function cancelVote(): void {
  if (!activeVote) return;
  if (activeVote.timer) clearTimeout(activeVote.timer);
  activeVote = null;
  noteActivity('poll', null);
  // Called off: the overlay leaves without naming a winner.
  broadcast('poll-close', { cancelled: true });
}

/**
 * The running vote as the poll overlay draws it — what `poll-update` carries.
 * `null` while none runs. An overlay that loads mid-vote asks for this; the
 * event alone would leave it blank until the next vote comes in.
 */
export function currentPoll(): { title: string; options: { label: string; votes: number }[] } | null {
  if (!activeVote) return null;
  const counts = getVoteCounts();
  return {
    title: activeVote.title,
    options: activeVote.options.map((label) => ({
      label,
      votes: counts[label] || 0,
    })),
  };
}

function broadcastPoll() {
  const poll = currentPoll();
  if (poll) broadcast('poll-update', poll);
}
