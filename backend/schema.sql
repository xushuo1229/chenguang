-- ============================================================
-- 知行 · 数据库建表 SQL (SQLite)
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

-- ---------- AI Reflection 生成归属表 ----------
-- 只记录生成事件归属，不保存 Reflection 全文、GrowthContext 或行为数据。
CREATE TABLE IF NOT EXISTS ai_reflections (
  reflection_id TEXT PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ---------- AI Reflection 用户反馈表 ----------
CREATE TABLE IF NOT EXISTS ai_reflection_feedback (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reflection_id TEXT NOT NULL REFERENCES ai_reflections(reflection_id) ON DELETE CASCADE,
  rating        TEXT NOT NULL CHECK (rating IN ('helpful', 'not_helpful')),
  created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, reflection_id)
);

-- ---------- Course Space / Knowledge Base Foundation ----------
-- Course Knowledge 与 Course System 分离；用户所有权通过 user_id 强制隔离。
CREATE TABLE IF NOT EXISTS course_space_documents (
  id          TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id   TEXT NOT NULL,
  title       TEXT NOT NULL,
  content     TEXT NOT NULL DEFAULT '',
  source_url  TEXT NOT NULL DEFAULT '',
  version     INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS course_space_nodes (
  id          TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id   TEXT NOT NULL,
  title       TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'concept',
  definition  TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'validated',
  confidence  TEXT NOT NULL DEFAULT 'medium',
  version     INTEGER NOT NULL DEFAULT 1,
  source_candidate_id TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS course_space_relations (
  id             TEXT PRIMARY KEY,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id      TEXT NOT NULL,
  source_node_id TEXT NOT NULL,
  target_node_id TEXT NOT NULL,
  relation_type  TEXT NOT NULL,
  version        INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS course_space_evidence (
  id          TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id   TEXT NOT NULL,
  document_id TEXT NOT NULL,
  node_id     TEXT NOT NULL,
  candidate_id TEXT NOT NULL DEFAULT '',
  quote       TEXT NOT NULL,
  locator     TEXT NOT NULL DEFAULT '',
  version     INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS course_space_extraction_jobs (
  id                TEXT PRIMARY KEY,
  user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id         TEXT NOT NULL,
  document_id       TEXT NOT NULL,
  document_version  INTEGER NOT NULL,
  content_hash      TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'queued',
  provider          TEXT NOT NULL,
  model             TEXT NOT NULL,
  prompt_version    TEXT NOT NULL,
  started_at        TEXT NOT NULL DEFAULT '',
  completed_at      TEXT NOT NULL DEFAULT '',
  error             TEXT NOT NULL DEFAULT '',
  created_at        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS course_space_knowledge_candidates (
  id                  TEXT PRIMARY KEY,
  user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id           TEXT NOT NULL,
  document_id         TEXT NOT NULL,
  document_version    INTEGER NOT NULL,
  extraction_job_id   TEXT NOT NULL,
  type                TEXT NOT NULL,
  title               TEXT NOT NULL,
  content             TEXT NOT NULL,
  confidence          REAL NOT NULL,
  status              TEXT NOT NULL DEFAULT 'pending',
  original_title      TEXT NOT NULL,
  original_content    TEXT NOT NULL,
  reviewed_title      TEXT NOT NULL DEFAULT '',
  reviewed_content    TEXT NOT NULL DEFAULT '',
  created_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (extraction_job_id) REFERENCES course_space_extraction_jobs(id) ON DELETE CASCADE
);
