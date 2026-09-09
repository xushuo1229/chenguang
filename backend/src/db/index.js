/**
 * 晨光自律台 · 数据库连接 (PostgreSQL 连接池)
 * ============================================================
 * 【文件职责】
 * 这个文件负责创建 PostgreSQL 连接池，并在首次启动时自动建表。
 * 所有数据模型（userModel、collectionModel 等）从这里获取连接。
 *
 * 【核心概念】
 *
 * 1. 什么是 PostgreSQL？
 *    PostgreSQL 是一个功能强大的开源关系型数据库。
 *    和 SQLite 不同，它是一个独立的数据库服务器，
 *    需要通过网络连接（而不是直接读写文件）。
 *    优点：支持高并发、支持复杂查询、适合生产环境。
 *
 * 2. 什么是连接池（Pool）？
 *    每次数据库操作都需要建立连接，用完后关闭。
 *    连接池预先创建一批连接，需要时直接取用，用完后归还。
 *    这样避免了频繁创建/销毁连接的开销。
 *
 * 3. 为什么用 async/await？
 *    PostgreSQL 的操作是异步的（通过网络通信），
 *    所以所有数据库操作都需要 await 等待结果。
 *    这意味着整个后端的 model → service → controller 链路都是异步的。
 *
 * 【与其他文件的关系】
 * - config/env.js：提供数据库连接字符串（DATABASE_URL）
 * - schema.sql：定义数据库表结构（建表 SQL）
 * - db/*.js（如 collectionModel.js）：引入本文件导出的 pool 来执行 SQL
 */
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');
const config = require('../config/env');

// schema.sql 文件的路径（位于 backend/schema.sql）
const schemaPath = path.join(__dirname, '..', '..', 'schema.sql');

// 创建 PostgreSQL 连接池
// connectionString 格式：postgresql://用户名:密码@主机:端口/数据库名
const pool = new Pool({
  connectionString: config.databaseUrl,
  // 最大连接数：根据云数据库限制调整
  max: 10,
  // 空闲连接超时：30秒后释放
  idleTimeoutMillis: 30000,
  // 连接超时：5秒
  connectionTimeoutMillis: 5000,
});

// 监听连接池错误（防止未捕获异常导致进程崩溃）
pool.on('error', function (err) {
  console.error('[DB] 连接池异常:', err.message);
});

/**
 * initDatabase() —— 首次启动自动建表
 *
 * 读取 schema.sql 并执行，创建所有业务表。
 * 使用 IF NOT EXISTS，重复执行不会报错。
 */
async function initDatabase() {
  var client = await pool.connect();
  try {
    var schema = fs.readFileSync(schemaPath, 'utf8');
    await client.query(schema);
    console.log('[DB] PostgreSQL 表结构初始化完成');
  } finally {
    client.release();
  }
}

// 导出连接池和初始化函数
module.exports = { pool, initDatabase };
