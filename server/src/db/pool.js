/**
 * MySQL 连接池 (基于 mysql2/promise)
 * - 单例 Pool, 全应用共享, 避免每次请求新建连接
 * - 本地测试库: mysql://root:123456@127.0.0.1:3306/chenguang
 *
 * 使用方式:
 *   const { pool, query } = require('../db/pool');
 *   const [rows] = await query('SELECT * FROM users WHERE id = ?', [id]);
 *
 * 事务方式 (mysql2):
 *   const conn = await pool.getConnection();
 *   await conn.beginTransaction();
 *   await conn.query('...');
 *   await conn.commit();   // 或 await conn.rollback();
 *   conn.release();
 */
const mysql = require('mysql2/promise');
const config = require('../config/env');

const pool = mysql.createPool({
  uri: config.databaseUrl,
  waitForConnections: true,
  connectionLimit: config.dbPoolMax || 10,
  maxIdle: config.dbPoolMax || 10,
  enableKeepAlive: true,
  charset: 'utf8mb4',
  // DATE/DATETIME 以字符串 ('YYYY-MM-DD' / 'YYYY-MM-DD HH:MM:SS') 返回,
  // 与 PostgreSQL 行为一致, 避免前端拿到 JS Date 对象
  dateStrings: true,
});

// 监听连接级别的未捕获错误 (避免进程退出)
pool.on('error', (err) => {
  console.error('[db] 连接池发生未捕获错误:', err.message);
});

/**
 * 执行参数化查询 (防 SQL 注入)
 * @param {string} sql - SQL 语句, 使用 ? 占位
 * @param {Array<any>} [params] - 参数数组
 * @returns {Promise<[Array<any>, Array]>} mysql2 结果: [rows, fields]
 */
const query = (sql, params) => pool.query(sql, params);

module.exports = { pool, query };
