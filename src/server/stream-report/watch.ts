import { getDb } from '../db/index';
import { onBroadcast } from '../websocket/index';
import { getCurrentScene } from '../obs/index';
import { botHelix } from '../bot/shoutout';
import { refreshLive } from '../points/earn';
import { currentStreamId, noteActivity, noteMoment } from './log';

/** How often the tool asks Twitch for the viewer count while live. */
const WATCH_MS = 5 * 60_000;

/** The goal on stream: its title while it runs, else none. */
function noteGoal(): void {
  const state = getDb().prepare('SELECT challenge_title, challenge_status FROM stream_state WHERE id = 1').get() as { challenge_title: string | null; challenge_status: string | null } | undefined;
  noteActivity('goal', state?.challenge_status === 'in_progress' && state.challenge_title ? state.challenge_title : null);
}

/**
 * Writes down what runs on stream for "Nach dem Stream": scene changes, the
 * goal, moments — and every five minutes the viewer count. Started in
 * startServer, since it talks to Twitch and OBS. The overlay test sends
 * made-up events over the same bus, so the goal is read from the database,
 * never from the event; the wheel and polls are noted where they really run.
 */
export function watchStreams(): void {
  onBroadcast((event, data) => {
    if (currentStreamId() === null) return;
    if (event === 'obs-scene-changed') {
      const scene = (data as { scene?: unknown } | null)?.scene;
      if (typeof scene === 'string' && scene) noteActivity('scene', scene);
    }
    if (event === 'stream-state') noteGoal();
    if (event === 'clip-created') {
      const clip = data as { tag?: string; note?: string | null } | null;
      // A redemption is in the timeline already; its auto-moment would be noise.
      if (clip?.tag && clip.tag !== 'auto-reward') noteMoment(clip.note || (clip.tag === 'auto-hype' ? 'Hype im Chat' : clip.tag === 'auto-milestone' ? 'Meilenstein' : ''));
    }
  });

  const tick = async () => {
    const helix = botHelix();
    if (helix) await refreshLive(helix).catch(() => null);
    if (currentStreamId() === null) return;
    const scene = await getCurrentScene().catch(() => null);
    if (scene) noteActivity('scene', scene);
    noteGoal();
  };
  setInterval(() => void tick(), WATCH_MS);
  setTimeout(() => void tick(), 15_000);
}
