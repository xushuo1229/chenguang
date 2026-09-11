-- ============================================================
-- 晨光自律台 · 数据库建表 SQL (SQLite)
-- ============================================================
-- 所有业务数据按 user_id 隔离，确保「同一账号跨设备数据一致」。
-- 数据模型：一张 user_data 快照表作为唯一真源（source of truth），
-- 前端把整份 chenguangData JSON 落库，实现整份推拉同步。
-- （早期版本的 7 张业务明细表已精简移除，避免双轨并存。）

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
-- Phase 8 新增：
--   revision  版本号，每保存一次 +1；前端用它做乐观并发校验（落后 → 409）
--   device_id 最近一次写入的设备 ID（用于提示"上次在哪台设备改的"）
CREATE TABLE IF NOT EXISTS user_data (
  user_id      INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  payload      TEXT NOT NULL,
  revision     INTEGER NOT NULL DEFAULT 1,
  device_id    TEXT NOT NULL DEFAULT '',
  updated_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);