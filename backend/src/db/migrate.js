/**
 * Zeno · 轻量数据库迁移（SQLite）
 * ============================================================
 * 设计原则（与既有 initDatabase 的幂 ALTER 风格一致）：
 * - 只用 IF NOT EXISTS 建表、用 try/catch 容错 ADD COLUMN，可重复执行。
 * - 纯加法迁移，绝不 DROP/改写既有列，保证旧数据与旧 MPA 数据不受影响。
 * - 每次迁移用 PRAGMA user_version 记录版本，只向前推进。
 */
'use strict';

const ent = require('../config/enterprise');

function addColumnIfMissing(database, table, definition) {
  try {
    database.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
  } catch (_) {
    // 列已存在 → 预期内，静默跳过
  }
}

function runMigrations(database, config) {
  // users 扩展列（企业级账号体系）
  addColumnIfMissing(database, 'users', 'token_version INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing(database, 'users', 'is_admin INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing(database, 'users', 'email_verified INTEGER NOT NULL DEFAULT 0');

  database.exec(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used       INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_password_reset_user ON password_reset_tokens(user_id);

    CREATE TABLE IF NOT EXISTS email_verification_tokens (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used       INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_email_verify_user ON email_verification_tokens(user_id);
  `);

  // 声明式管理员：ADMIN_EMAILS 命中的账号授予 is_admin（不在列表中的不收回，
  // 避免误删人工授权；收回请直接更新数据库）。
  const adminEmails = ent.adminEmails;
  if (adminEmails.length) {
    const placeholders = adminEmails.map(() => '?').join(',');
    database
      .prepare(`UPDATE users SET is_admin = 1 WHERE email IN (${placeholders})`)
      .run(...adminEmails);
  }

  const userVersion = database.pragma('user_version', { simple: true });
  if (!userVersion) database.pragma('user_version = 1');
}

module.exports = { runMigrations };
