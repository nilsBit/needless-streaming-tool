import { getDb } from './db/index';
import { broadcast } from './websocket/index';
import type {
  LeaderboardEntry,
  LeaderboardUpdateEntry,
  LeaderboardUpdate,
  RankChange,
  RankEntry,
  RankExit,
} from '../shared/types';

// In-memory cache: type key → current top 3
const cache = new Map<string, LeaderboardEntry[]>();
let initialized = false;

/**
 * Query the current Top N from the DB.
 * type="all" aggregates across all reward types.
 */
function queryTop(type: string, limit = 3): LeaderboardEntry[] {
  const db = getDb();
  let rows: Array<{ user_name: string; count: number }>;

  if (type === 'all') {
    rows = db
      .prepare(
        `SELECT user_name, SUM(count) as count
         FROM reward_stats
         GROUP BY user_name
         ORDER BY count DESC, user_name ASC
         LIMIT ?`
      )
      .all(limit) as Array<{ user_name: string; count: number }>;
  } else {
    rows = db
      .prepare(
        `SELECT user_name, count
         FROM reward_stats
         WHERE reward_type = ?
         ORDER BY count DESC, user_name ASC
         LIMIT ?`
      )
      .all(type, limit) as Array<{ user_name: string; count: number }>;
  }

  return rows.map((row, i) => ({
    rank: i + 1,
    userName: row.user_name,
    count: Number(row.count),
  }));
}

/**
 * Compare old and new leaderboards, detect changes.
 */
function detectChanges(
  oldBoard: LeaderboardEntry[],
  newBoard: LeaderboardEntry[]
): { changes: RankChange[]; entered: RankEntry[]; exited: RankExit[] } {
  const oldByName = new Map(oldBoard.map((e) => [e.userName, e]));
  const newByName = new Map(newBoard.map((e) => [e.userName, e]));

  const changes: RankChange[] = [];
  const entered: RankEntry[] = [];
  const exited: RankExit[] = [];

  // Detect entries that moved rank or are new
  for (const entry of newBoard) {
    const old = oldByName.get(entry.userName);
    if (!old) {
      entered.push({ userName: entry.userName, rank: entry.rank });
    } else if (old.rank !== entry.rank) {
      changes.push({
        userName: entry.userName,
        from: old.rank,
        to: entry.rank,
        changeType: entry.rank < old.rank ? 'up' : 'down',
      });
    }
  }

  // Detect users who fell out
  for (const entry of oldBoard) {
    if (!newByName.has(entry.userName)) {
      exited.push({ userName: entry.userName, previousRank: entry.rank });
    }
  }

  return { changes, entered, exited };
}

/**
 * Initialize cache from DB. Must be called before connectEventSub().
 */
export function initRewardLeaderboard(): void {
  // Load "all" type
  cache.set('all', queryTop('all'));

  // Load each known reward type
  const types = getDb()
    .prepare('SELECT DISTINCT reward_type FROM reward_stats')
    .all() as Array<{ reward_type: string }>;

  for (const { reward_type } of types) {
    cache.set(reward_type, queryTop(reward_type));
  }

  initialized = true;
  console.log('[Leaderboard] Initialized with', cache.size, 'type(s)');
}

/**
 * Check if the Top 3 changed for a given type and broadcast if so.
 */
export function checkAndBroadcast(type: string): void {
  if (!initialized) return;

  const newBoard = queryTop(type);
  const oldBoard = cache.get(type) || [];

  // Check if anything actually changed (rank or count)
  const changed =
    newBoard.length !== oldBoard.length ||
    newBoard.some((entry, i) => {
      const old = oldBoard[i];
      return !old || old.userName !== entry.userName || old.count !== entry.count;
    });

  if (!changed) return;

  const { changes, entered, exited } = detectChanges(oldBoard, newBoard);

  // Build update payload
  const leaderboard: LeaderboardUpdateEntry[] = newBoard.map((entry) => {
    const old = oldBoard.find((o) => o.userName === entry.userName);
    return { ...entry, previousRank: old?.rank ?? null };
  });

  const update: LeaderboardUpdate = {
    type,
    leaderboard,
    changes,
    entered,
    exited,
  };

  // Update cache
  cache.set(type, newBoard);

  // Broadcast to all connected clients
  broadcast('reward-leaderboard-update', update);
}

/**
 * Get current Top N for a given type (used by public endpoint).
 */
export function getTopRewards(type: string, limit = 3): LeaderboardEntry[] {
  return queryTop(type, limit);
}
