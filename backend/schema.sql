-- ============================================================
-- 晨光自律台 · 数据库建表 SQL (SQLite)
-- ============================================================
-- 所有业务数据均按 user_id 隔离，确保「同一账号跨设备数据一致」。
-- SQLite 用 INTEGER PRIMARY KEY AUTOINCREMENT 自增；
-- UUID 业务记录用 TEXT 主键。

-- ---------- 用户表 ----------
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE,
  nickname      TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  avatar_url    TEXT,
  created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ---------- 用户数据快照表（整份 chenguangData 落库，source of truth）----------
CREATE TABLE IF NOT EXISTS user_data (
  user_id      INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  payload      TEXT NOT NULL,
  updated_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ---------- 课程 ----------
CREATE TABLE IF NOT EXISTS courses (
  id               TEXT PRIMARY KEY,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  total_chapters   INTEGER NOT NULL DEFAULT 0,
  learned_chapters INTEGER NOT NULL DEFAULT 0,
  progress         INTEGER NOT NULL DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'todo',
  created_at       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_courses_user ON courses(user_id);

-- ---------- 运动 ----------
CREATE TABLE IF NOT EXISTS sports (
  id        TEXT PRIMARY KEY,
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date      TEXT NOT NULL,
  name      TEXT NOT NULL,
  calories  REAL NOT NULL DEFAULT 0,
  duration  REAL NOT NULL DEFAULT 0,
  type      TEXT NOT NULL DEFAULT 'general',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_sports_user ON sports(user_id);
CREATE INDEX IF NOT EXISTS idx_sports_date ON sports(user_id, date);

-- ---------- 阅读 ----------
CREATE TABLE IF NOT EXISTS readings (
  id          TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date        TEXT NOT NULL,
  book_name   TEXT NOT NULL,
  pages       INTEGER NOT NULL DEFAULT 0,
  total_pages INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_readings_user ON readings(user_id);

-- ---------- 英语 ----------
CREATE TABLE IF NOT EXISTS english (
  id       TEXT PRIMARY KEY,
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date     TEXT NOT NULL,
  words    INTEGER NOT NULL DEFAULT 0,
  minutes  INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_english_user ON english(user_id);

-- ---------- 打卡 ----------
CREATE TABLE IF NOT EXISTS checkins (
  id     TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date   TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'done',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, date)
);
CREATE INDEX IF NOT EXISTS idx_checkins_user ON checkins(user_id);

-- ---------- 待办 ----------
CREATE TABLE IF NOT EXISTS todos (
  id       TEXT PRIMARY KEY,
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text     TEXT NOT NULL,
  date     TEXT NOT NULL,
  done     INTEGER NOT NULL DEFAULT 0,
  priority TEXT NOT NULL DEFAULT 'normal',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_todos_user ON todos(user_id);

-- ---------- 专注 ----------
CREATE TABLE IF NOT EXISTS focus (
  id       TEXT PRIMARY KEY,
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date     TEXT NOT NULL,
  minutes  INTEGER NOT NULL DEFAULT 0,
  task     TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_focus_user ON focus(user_id);
