// Shared types between server and renderer

export interface StreamState {
  id: number;
  challenge_title: string | null;
  challenge_status: 'idle' | 'in_progress' | 'done' | 'failed';
  timer_seconds: number;
  timer_running: number;
  is_live: number;
  is_recording: number;
  project_name: string | null;
  /** A reward's countdown: when it ends (ms), who redeemed it, what was left when paused (spec 2026-10-14). */
  timer_ends_at: number | null;
  timer_task_by: string | null;
  timer_paused_left: number | null;
  saved_challenge: string | null;
}

export interface Issue {
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

export interface SongData {
  title: string;
  artist: string;
  source: string;
  artworkUrl?: string;
}

export interface LeaderboardEntry {
  rank: number;
  userName: string;
  count: number;
}

export interface LeaderboardUpdateEntry extends LeaderboardEntry {
  previousRank: number | null;
}

export interface RankChange {
  userName: string;
  from: number;
  to: number;
  changeType: 'up' | 'down';
}

export interface RankEntry {
  userName: string;
  rank: number;
}

export interface RankExit {
  userName: string;
  previousRank: number;
}

export interface LeaderboardUpdate {
  type: string;
  /** The Bestenliste's title, so one overlay address can show any list. */
  title: string | null;
  leaderboard: LeaderboardUpdateEntry[];
  changes: RankChange[];
  entered: RankEntry[];
  exited: RankExit[];
}

export interface LeaderboardResponse {
  type: string;
  leaderboard: LeaderboardEntry[];
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
  parent_id: number;
  milestone_id: number | null;
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
  /** Why the bot is not connected, when it is not. */
  error?: string | null;
}

export interface TwitchConfigResponse {
  configured: boolean;
  channel?: string;
  username?: string;
  has_token?: boolean;
}

export type ProjectKind = 'steps' | 'count' | 'goal';

/** Projekt (2026-10-12): what the stream works on, over many streams. */
export interface Project {
  id: number;
  name: string;
  kind: ProjectKind;
  /** Kind steps: the steps in order. */
  steps: string[];
  /** Steps: the index of the step being worked on (= steps.length when all are done). Else the number reached. */
  position: number;
  total: number | null;
  unit: string | null;
  /** Goal: how much one click adds. */
  step_by: number;
  /** Goal: begins anew each Monday. */
  weekly: boolean;
  /** Streams it was worked on, the one on air included. */
  streams: number;
  /** The stream on air counts for it. */
  live: boolean;
  created_at: string;
  last_worked_at: string;
  finished_at: string | null;
  /** Steps: the step being worked on. */
  step: string | null;
  /** "Farbe · Schritt 3 von 4", "12 von 30 Figuren". */
  stand: string;
  pct: number;
  finished: boolean;
}

export interface ProjectsState {
  current: Project | null;
  /** The other open projects, last worked on first. */
  open: Project[];
}

export interface Clip {
  id: number;
  tag: string;
  note: string | null;
  session_date: string;
  stream_timecode: string | null;
  recording_timecode: string | null;
  confidence: 'high' | 'medium' | null;
  notion_page_id: string | null;
  /** Where the moment stands on the content board. */
  status: ClipStatus;
  /** Where it is meant to go: 'tiktok', 'shorts', 'reels', 'discord', … */
  platforms: string[];
  /** YYYY-MM-DD, when it is planned to go out. */
  planned_for: string | null;
  published_at: string | null;
  /** The title or hook for the post. */
  hook: string | null;
  /** Set once a published moment left the board (30 days after publishing). */
  archived_at: string | null;
  created_at: string;
}

export type ClipStatus = 'new' | 'planned' | 'cut' | 'published';
export const CLIP_STATUSES: ClipStatus[] = ['new', 'planned', 'cut', 'published'];

export interface Milestone {
  id: number;
  title: string;
  level: 'minor' | 'major' | 'epic';
  status: 'pending' | 'completed';
  message: string | null;
  project_id: number | null;
  completed_at: string | null;
  created_at: string;
  linkedTodoCount?: number;
  linkedTodoDone?: number;
}

export interface Stats {
  today: {
    clips: number;
    delta_clips: number;
    todos_done: number;
    delta_todos: number;
    new_issues: number;
    delta_issues: number;
    milestones: number;
    delta_milestones: number;
  };
  progress: {
    todos:      { done: number; total: number };
    milestones: { completed: number; total: number };
    issues:     { open: number; total: number };
  };
  totals: {
    clips: number;
    rewards: number;
    active_days_30d: number;
  };
  trends: {
    clips:   number[]; // 14 entries, oldest first
    rewards: number[];
    active:  number[]; // 1 if day had ≥1 clip, else 0
  };
}

// Valid status values for validation
export const VALID_ISSUE_STATUS = ['open', 'fixed', 'wontfix'] as const;
export const VALID_REWARD_STATUS = ['pending', 'done'] as const;
export const VALID_DESIGN_STATUS = ['active', 'completed'] as const;
export const VALID_CHALLENGE_STATUS = ['idle', 'in_progress', 'done', 'failed'] as const;
export const VALID_MILESTONE_LEVEL = ['minor', 'major', 'epic'] as const;
export const VALID_MILESTONE_STATUS = ['pending', 'completed'] as const;

