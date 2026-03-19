export const SCHEMA = `
CREATE TABLE IF NOT EXISTS raids (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  streamer_name TEXT NOT NULL,
  viewer_count  INTEGER NOT NULL,
  enemy_tier    TEXT NOT NULL,
  enemy_name    TEXT,
  status        TEXT DEFAULT 'pending',
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bugs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  description TEXT,
  status      TEXT DEFAULT 'open',
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rewards (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_name   TEXT NOT NULL,
  reward_type TEXT NOT NULL,
  data        TEXT,
  status      TEXT DEFAULT 'pending',
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS designs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  type        TEXT NOT NULL,
  poll_data   TEXT,
  status      TEXT DEFAULT 'active',
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stream_state (
  id                INTEGER PRIMARY KEY DEFAULT 1,
  experiment_title  TEXT,
  experiment_status TEXT DEFAULT 'idle',
  timer_seconds     INTEGER DEFAULT 0,
  timer_running     INTEGER DEFAULT 0,
  is_live           INTEGER DEFAULT 0
);

INSERT OR IGNORE INTO stream_state (id) VALUES (1);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;
