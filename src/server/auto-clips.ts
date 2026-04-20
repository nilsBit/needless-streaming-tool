import { onBroadcast } from './websocket/index';
import { createClip } from './api/clips';
import { getDb } from './db/index';

let lastAutoClipTime = 0;
const GLOBAL_COOLDOWN_MS = 10_000; // 10s between any auto-clips

function getSetting(key: string, defaultValue: string): string {
  try {
    const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
    return row?.value ?? defaultValue;
  } catch {
    return defaultValue;
  }
}

function isEnabled(): boolean {
  return getSetting('auto_clips_enabled', 'true') === 'true';
}

function isTriggerEnabled(trigger: string): boolean {
  return getSetting(`auto_clip_trigger_${trigger}`, 'true') === 'true';
}

function canCreateClip(): boolean {
  if (!isEnabled()) return false;
  const now = Date.now();
  if (now - lastAutoClipTime < GLOBAL_COOLDOWN_MS) return false;
  return true;
}

async function autoClip(tag: string, note: string, confidence: 'high' | 'medium') {
  if (!canCreateClip()) return;
  lastAutoClipTime = Date.now();
  const clip = await createClip(tag, note, confidence);
  if (clip) {
    console.log(`[AutoClips] Created: ${tag} — ${note}`);
  }
}

export function initAutoClips(): void {
  // Listen for broadcast events
  onBroadcast((event: string, data: unknown) => {
    if (!isEnabled()) return;

    if (event === 'reward-redeemed' && isTriggerEnabled('reward')) {
      const d = data as { user_name?: string; reward_type?: string } | null;
      const user = d?.user_name || 'Unknown';
      const type = d?.reward_type || 'reward';
      autoClip('auto-reward', `Reward: ${type} by ${user}`, 'medium');
    }

    if (event === 'compile-pray' && isTriggerEnabled('hype')) {
      autoClip('auto-hype', 'Hype moment', 'high');
    }

    if (event === 'milestone-trigger' && isTriggerEnabled('milestone')) {
      const d = data as { title?: string } | null;
      autoClip('auto-milestone', `Milestone: ${d?.title || 'Achievement'}`, 'high');
    }

    if (event === 'raid-created' && isTriggerEnabled('raid')) {
      const d = data as { streamer_name?: string; viewer_count?: number } | null;
      autoClip('auto-raid', `Raid: ${d?.streamer_name || 'Unknown'} (${d?.viewer_count || 0})`, 'high');
    }
  });

  console.log('[AutoClips] Initialized');
}
