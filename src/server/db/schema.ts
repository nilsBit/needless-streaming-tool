export const SCHEMA_VERSION = 13;

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS raids (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  streamer_name TEXT NOT NULL,
  viewer_count  INTEGER NOT NULL,
  enemy_tier    TEXT NOT NULL,
  enemy_name    TEXT,
  status        TEXT DEFAULT 'pending',
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS issues (
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
  challenge_title  TEXT,
  challenge_status TEXT DEFAULT 'idle',
  timer_seconds     INTEGER DEFAULT 0,
  timer_running     INTEGER DEFAULT 0,
  is_live           INTEGER DEFAULT 0,
  is_recording      INTEGER DEFAULT 0,
  project_name      TEXT
);

INSERT OR IGNORE INTO stream_state (id) VALUES (1);

CREATE TABLE IF NOT EXISTS todos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  done        INTEGER DEFAULT 0,
  sort_order  INTEGER DEFAULT 0,
  parent_id   INTEGER,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS project_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  status      TEXT DEFAULT 'pending',
  sort_order  INTEGER DEFAULT 0,
  time_spent  INTEGER DEFAULT 0,
  external_id TEXT,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS clips (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  tag                 TEXT NOT NULL,
  note                TEXT,
  session_date        TEXT NOT NULL,
  stream_timecode     TEXT,
  recording_timecode  TEXT,
  confidence          TEXT,
  created_at          DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS milestones (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  title         TEXT NOT NULL,
  level         TEXT NOT NULL,
  status        TEXT DEFAULT 'pending',
  message       TEXT,
  completed_at  DATETIME,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS song_requests (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  url           TEXT NOT NULL,
  title         TEXT NOT NULL,
  artist        TEXT,
  source        TEXT NOT NULL,
  requested_by  TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending',
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);
`;
