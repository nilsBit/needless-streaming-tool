import type { Helix } from './shoutout';

export interface CustomReward { id: string; title: string }

/** The channel's custom channel-point rewards, or null when Twitch can't be asked. */
export async function listCustomRewards(helix: Helix): Promise<CustomReward[] | null> {
  const users = await helix('users');
  const broadcasterId = users?.data?.[0]?.id;
  if (!broadcasterId) return null;
  const rewards = await helix(`channel_points/custom_rewards?broadcaster_id=${encodeURIComponent(broadcasterId)}`);
  if (!rewards?.data) return null;
  return rewards.data.map((r) => ({ id: String(r.id), title: String(r.title) }));
}
