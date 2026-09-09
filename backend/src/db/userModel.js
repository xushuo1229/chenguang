/**
 * 晨光自律台 · users 表数据访问层 (PostgreSQL)
 * ------------------------------------------------------------
 * 纯数据访问：增删改查封装
 * 不含业务逻辑（校验、规则在 service 层）
 *
 * 注意：所有函数都是 async 的，因为 PostgreSQL 操作是异步的。
 * 调用方需要用 await 等待结果。
 */
const { pool } = require('./index');

/**
 * 创建用户
 * @param {Object} param
 * @param {string} param.email
 * @param {string} param.nickname
 * @param {string} param.passwordHash  bcrypt 哈希值
 * @param {string} [param.avatarUrl]
 * @returns {Object} 新用户记录（含 id）
 */
async function createUser({ email, nickname, passwordHash, avatarUrl }) {
  var result = await pool.query(
    `INSERT INTO users (email, nickname, password_hash, avatar_url)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [email, nickname, passwordHash, avatarUrl || null]
  );
  return result.rows[0];
}

async function findUserByEmail(email) {
  var result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  return result.rows[0] || null;
}

async function findUserById(id) {
  var result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
  return result.rows[0] || null;
}

/**
 * 更新用户资料（昵称、头像）
 * @param {number} id
 * @param {Object} param
 * @param {string} [param.nickname]
 * @param {string} [param.avatarUrl]
 * @returns {Object} 更新后的用户记录
 */
async function updateUserProfile(id, { nickname, avatarUrl }) {
  await pool.query(
    `UPDATE users SET nickname = $1, avatar_url = $2, updated_at = NOW() WHERE id = $3`,
    [nickname, avatarUrl || null, id]
  );
  return findUserById(id);
}

module.exports = {
  createUser,
  findUserByEmail,
  findUserById,
  updateUserProfile,
};
