/**
 * 晨光自律台 · 业务明细表通用 CRUD 数据访问层 (PostgreSQL)
 * ============================================================
 * 为 7 张业务明细表（courses/sports/readings/english/checkins/todos/focus）
 * 提供通用的增删查功能。
 *
 * PostgreSQL 自带查询计划缓存，不需要手动管理 prepared statement。
 * 所有函数都是 async 的，调用方需要 await。
 */
const { pool } = require('./index');
const { VALID_NAMES } = require('../config/collectionConfig');

/**
 * 校验表名是否合法（白名单防护，防止 SQL 注入）
 */
function validateTableName(table) {
  if (!VALID_NAMES.includes(table)) {
    var ApiError = require('../utils/ApiError');
    throw ApiError.notFound('INVALID_TABLE', '集合 ' + table + ' 不存在');
  }
}

/**
 * 列出某用户某集合的全部记录（按创建时间倒序）
 * @param {string} table  表名
 * @param {number} userId 用户 ID
 * @param {Object} [options]  分页参数
 * @param {number} [options.limit=500]
 * @param {number} [options.offset=0]
 * @returns {Object[]} 查询结果数组
 */
async function listByUser(table, userId, { limit = 500, offset = 0 } = {}) {
  validateTableName(table);
  var sql = 'SELECT * FROM ' + table + ' WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3';
  var result = await pool.query(sql, [userId, limit, offset]);
  return result.rows;
}

/**
 * 向指定表中新增一条记录
 * @param {string} table  表名
 * @param {number} userId 用户 ID
 * @param {Object} rec   要插入的字段对象
 * @returns {Object} 插入的记录
 */
async function insertRecord(table, userId, rec) {
  validateTableName(table);
  var cols = Object.keys(rec);
  // 构建 $1, $2, $3 占位符
  var placeholders = cols.map(function (_, i) { return '$' + (i + 2); }).join(', ');
  var sql = 'INSERT INTO ' + table + ' (user_id, ' + cols.join(', ') + ') VALUES ($1, ' + placeholders + ')';
  var values = [userId].concat(cols.map(function (c) { return rec[c]; }));
  await pool.query(sql, values);
  return rec;
}

/**
 * 删除指定用户的一条记录（带 user_id 隔离，防越权）
 * @param {string} table  表名
 * @param {number} userId 用户 ID
 * @param {string} id     要删除的记录 ID
 * @returns {number} 影响的行数
 */
async function deleteRecord(table, userId, id) {
  validateTableName(table);
  var sql = 'DELETE FROM ' + table + ' WHERE user_id = $1 AND id = $2';
  var result = await pool.query(sql, [userId, id]);
  return result.rowCount;
}

module.exports = {
  listByUser,
  insertRecord,
  deleteRecord,
};
