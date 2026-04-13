// Shared types between server and renderer

export interface StreamState {
  id: number;
  experiment_title: string | null;
  experiment_status: 'idle' | 'in_progress' | 'done' | 'failed';
  timer_seconds: number;
  timer_running: number;
  is_live: number;
  project_name: string | null;
}

export interface Bug {
  id: number;
  title: string;
  description: string | null;
  status: 'open' | 'fixed' | 'wontfix';
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
  type: string;
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

export interface ProjectItem {
  id: number;
  title: string;
  status: 'pending' | 'in_progress' | 'done';
  sort_order: number;
  created_at: string;
}

export interface Clip {
  id: number;
  tag: string;
  note: string | null;
  session_date: string;
  created_at: string;
}

export interface Milestone {
  id: number;
  title: string;
  level: 'minor' | 'major' | 'epic';
  status: 'pending' | 'completed';
  message: string | null;
  completed_at: string | null;
  created_at: string;
}

// Valid status values for validation
export const VALID_BUG_STATUS = ['open', 'fixed', 'wontfix'] as const;
export const VALID_REWARD_STATUS = ['pending', 'done'] as const;
export const VALID_DESIGN_STATUS = ['active', 'completed'] as const;
export const VALID_EXPERIMENT_STATUS = ['idle', 'in_progress', 'done', 'failed'] as const;
export const VALID_PROJECT_ITEM_STATUS = ['pending', 'in_progress', 'done'] as const;
export const VALID_MILESTONE_LEVEL = ['minor', 'major', 'epic'] as const;
export const VALID_MILESTONE_STATUS = ['pending', 'completed'] as const;
