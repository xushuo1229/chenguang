/**
 * Zeno · 数据库连接 (SQLite)
 * ============================================================
 * 【文件职责】
 * 这个文件负责打开 SQLite 数据库文件，并在首次启动时自动建表。
 * 所有数据模型（userModel、collectionModel 等）都通过这里的
 * query() 函数执行 SQL。
 *
 * 【核心概念】
 *
 * 1. 什么是 SQLite？
 *    SQLite 是一个"零安装"的文件型数据库：
 *    - 数据保存在一个 .db 文件里（默认 backend/chenguang.db）
 *    - 不需要安装数据库服务器，也不需要账号密码
 *    - 特别适合本地开发和中小型项目
 *
 * 2. query() 做了什么？
 *    为了少改动业务代码，query() 保持和原来 PostgreSQL
 *    差不多的调用方式：query(sql, 参数数组) → { rows, rowCount }。
 *    它只做了两件小事：
 *    - 把 PostgreSQL 风格的 $1、$2 占位符转成 SQLite 命名参数 @p1、@p2
 *    - 返回统一的 { rows, rowCount } 结果结构
 *
 * 【与其他文件的关系】
 * - config/env.js：提供数据库文件路径（config.dbPath）
 * - schema.sql：定义数据库表结构（建表 SQL）
 * - db/*.js：引入本文件导出的 query 来执行 SQL
 */
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const config = require('../config/env');

// schema.sql 文件的路径（位于 backend/schema.sql）
const schemaPath = path.join(__dirname, '..', '..', 'schema.sql');

// 确保数据库文件所在目录存在（例如通过 DB_PATH 指定了别的目录）
fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });

// 打开 SQLite 数据库文件（不存在会自动创建）
const db = new Database(config.dbPath);

// 开启 WAL 日志模式：读写并发更好，数据更安全（生成 .db-wal/.db-shm 文件）
db.pragma('journal_mode = WAL');

// 开启外键约束（表之间的 user_id 关联才会生效）
db.pragma('foreign_keys = ON');

/**
 * 把 PostgreSQL 风格的 $1 $2 占位符转换成 SQLite 命名参数 @p1 @p2，
 * 并顺手把参数数组转成命名参数对象。
 *
 * 为什么不用 ?：PostgreSQL 允许同一个占位符用多次（如 $2、$2），
 * 而 ? 每个位置都要单独传值。命名参数则可以重复引用同一个值。
 */
function toSqlite(sql, params) {
  var translated = sql.replace(/\$(\d+)/g, function (_, n) {
    return '@p' + n;
  });
  var bind = {};
  (params || []).forEach(function (v, i) {
    bind['p' + (i + 1)] = v;
  });
  return { sql: translated, bind: bind };
}

/**
 * query(sql, params) —— 统一查询入口
 *
 * 返回结果模拟原来的格式：
 *   { rows: [...], rowCount: 受影响行数 }
 *
 * SELECT / RETURNING 语句 → rows 里有数据
 * INSERT / UPDATE / DELETE 语句 → rowCount 是受影响行数
 */
function query(sql, params) {
  var converted = toSqlite(sql, params);
  var stmt = db.prepare(converted.sql);

  // 判断是否需要返回查询结果
  var returnsRows =
    /^\s*(SELECT|PRAGMA|WITH|EXPLAIN)\b/i.test(converted.sql) ||
    /\bRETURNING\b/i.test(converted.sql);

  if (returnsRows) {
    var rows = stmt.all(converted.bind);
    return { rows: rows, rowCount: rows.length };
  }

  var info = stmt.run(converted.bind);
  return {
    rows: [],
    rowCount: info.changes,
    changes: info.changes,
    lastInsertRowid: info.lastInsertRowid,
  };
}

/**
 * initDatabase() —— 首次启动自动建表
 *
 * 读取 schema.sql 并执行，创建所有业务表。
 * 使用 IF NOT EXISTS，重复执行不会报错。
 */
async function initDatabase() {
  var schema = fs.readFileSync(schemaPath, 'utf8');
  db.exec(schema);

  // Phase 8：老库迁移 —— 旧版 user_data 建表时没有 revision / device_id 列，
  // 这里为已存在的数据库补列（新库 schema.sql 已含，ALTER 会因列已存在而报错，
  // 用 try-catch 静默跳过，属于预期）。
  try { db.exec("ALTER TABLE user_data ADD COLUMN revision INTEGER NOT NULL DEFAULT 1"); } catch (_) {}
  try { db.exec("ALTER TABLE user_data ADD COLUMN device_id TEXT NOT NULL DEFAULT ''"); } catch (_) {}
  try { db.exec("ALTER TABLE course_space_nodes ADD COLUMN source_candidate_id TEXT NOT NULL DEFAULT ''"); } catch (_) {}
  try { db.exec("ALTER TABLE course_space_evidence ADD COLUMN candidate_id TEXT NOT NULL DEFAULT ''"); } catch (_) {}
  try { db.exec("ALTER TABLE course_space_evidence ADD COLUMN verification_status TEXT NOT NULL DEFAULT 'unverified'"); } catch (_) {}
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS uq_course_space_nodes_source_candidate ON course_space_nodes(source_candidate_id) WHERE source_candidate_id <> ''");

  console.log('[DB] SQLite 表结构初始化完成 → ' + config.dbPath);
}

// 导出数据库实例和初始化函数
module.exports = { db, query, initDatabase };
