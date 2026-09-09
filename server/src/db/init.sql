-- ============================================================
-- 晨光自律台 - 数据库初始化脚本 (MySQL 8)
-- 幂等: 可重复执行 (IF NOT EXISTS / DROP TRIGGER IF EXISTS)
-- 运行方式: npm run db:init
-- ============================================================

-- ------------------------------------------------------------
-- users 用户表
-- id 用 CHAR(36) 存 UUID (由应用层 crypto.randomUUID() 生成)
-- updated_at 用 MySQL 原生 ON UPDATE CURRENT_TIMESTAMP 自动维护
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id              CHAR(36)     NOT NULL,
  email           VARCHAR(255) NOT NULL,
  password_hash   VARCHAR(255) NOT NULL,                 -- BCrypt 哈希 (~60 字符)
  nickname        VARCHAR(64)  NOT NULL,
  avatar_url      VARCHAR(1024),
  created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  last_login_at   DATETIME(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ------------------------------------------------------------
-- tasks 任务表
-- 每个任务带目标天数 (target_days) 和当前连续打卡天数 (current_streak)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tasks (
  id              CHAR(36)    NOT NULL,
  user_id         CHAR(36)    NOT NULL,
  task_name       VARCHAR(128) NOT NULL,
  target_days     INT         NOT NULL,
  current_streak  INT         NOT NULL DEFAULT 0,
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_tasks_user_id (user_id),
  CONSTRAINT fk_tasks_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT chk_tasks_target CHECK (target_days > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ------------------------------------------------------------
-- checkins 打卡记录表
-- 一个任务一天只能打卡一次 (UNIQUE 约束)
-- status: done(完成) / skipped(跳过) / pending(待完成)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS checkins (
  id           CHAR(36)    NOT NULL,
  user_id      CHAR(36)    NOT NULL,
  task_id      CHAR(36)    NOT NULL,
  checkin_date DATE        NOT NULL,
  status       VARCHAR(16) NOT NULL DEFAULT 'done',
  note         TEXT,
  created_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_checkins_task_date (task_id, checkin_date),
  KEY idx_checkins_user_id (user_id),
  KEY idx_checkins_task_id (task_id),
  KEY idx_checkins_user_date (user_id, checkin_date),
  CONSTRAINT fk_checkins_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_checkins_task FOREIGN KEY (task_id) REFERENCES tasks (id) ON DELETE CASCADE,
  CONSTRAINT chk_checkins_status CHECK (status IN ('done', 'skipped', 'pending'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ------------------------------------------------------------
-- study_records 学习记录表
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS study_records (
  id               CHAR(36)    NOT NULL,
  user_id          CHAR(36)    NOT NULL,
  date             DATE        NOT NULL,
  duration_minutes INT         NOT NULL,
  subject          VARCHAR(64) NOT NULL,
  content          TEXT,
  created_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_study_user_date (user_id, date),
  KEY idx_study_user_subject (user_id, subject),
  CONSTRAINT fk_study_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT chk_study_duration CHECK (duration_minutes >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
