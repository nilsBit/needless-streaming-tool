// Shared types between server and renderer

export interface StreamState {
  id: number;
  experiment_title: string | null;
  experiment_status: 'idle' | 'in_progress' | 'done' | 'failed';
  timer_seconds: number;
  timer_running: number;
  is_live: number;
}

export interface Bug {
  id: number;
  title: string;
  description: string | null;
  status: 'open' | 'fixed' | 'wontfix';
  created_at: string;
}

export interface Raid {
  id: number;
  streamer_name: string;
  viewer_count: number;
  enemy_tier: 'mob' | 'elite' | 'mini-boss' | 'boss';
  enemy_name: string | null;
  status: 'pending' | 'built' | 'in-game';
  created_at: string;
}

export interface Reward {
  id: number;
  user_name: string;
  reward_type: string;
  data: string | null;
  status: 'pending' | 'done';
  created_at: string;
}

export interface Design {
  id: number;
  title: string;
  type: 'enemy' | 'weapon' | 'upgrade';
  poll_data: string | null;
  status: 'active' | 'completed';
  created_at: string;
}

export interface Todo {
  id: number;
  title: string;
  done: number;
  sort_order: number;
  created_at: string;
}

export interface BotConfig {
  channel: string;
  username: string;
  oauth_token: string;
}

export interface BotStatus {
  connected: boolean;
  channel: string | null;
}

export interface TwitchConfigResponse {
  configured: boolean;
  channel?: string;
  username?: string;
  has_token?: boolean;
}

// Valid status values for validation
export const VALID_BUG_STATUS = ['open', 'fixed', 'wontfix'] as const;
export const VALID_RAID_STATUS = ['pending', 'built', 'in-game'] as const;
export const VALID_REWARD_STATUS = ['pending', 'done'] as const;
export const VALID_DESIGN_STATUS = ['active', 'completed'] as const;
export const VALID_EXPERIMENT_STATUS = ['idle', 'in_progress', 'done', 'failed'] as const;
export const VALID_DESIGN_TYPE = ['enemy', 'weapon', 'upgrade'] as const;

export function calculateTier(viewerCount: number): Raid['enemy_tier'] {
  if (viewerCount >= 100) return 'boss';
  if (viewerCount >= 50) return 'mini-boss';
  if (viewerCount >= 10) return 'elite';
  return 'mob';
}
