import { broadcast } from '../websocket/index';

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

  // Broadcast poll start to overlays
  broadcastPoll();

  return true;
}

export function castVote(username: string, option: string): boolean {
  if (!activeVote) return false;
  const normalized = option.toLowerCase();
  if (!activeVote.options.includes(normalized)) return false;

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
  broadcast('poll-close', {});

  activeVote = null;
  return { winner, counts };
}

export function cancelVote(): void {
  if (!activeVote) return;
  if (activeVote.timer) clearTimeout(activeVote.timer);
  activeVote = null;
  broadcast('poll-close', {});
}

function broadcastPoll() {
  if (!activeVote) return;
  const counts = getVoteCounts();
  broadcast('poll-update', {
    title: activeVote.title,
    options: activeVote.options.map((label) => ({
      label,
      votes: counts[label] || 0,
    })),
  });
}
