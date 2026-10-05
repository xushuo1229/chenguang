/**
 * Zeno · users 表数据访问层 (SQLite)
 * ------------------------------------------------------------
 * 纯数据访问：增删改查封装
 * 不含业务逻辑（校验、规则在 service 层）
 *
 * 注意：所有函数保持 async，方便将来切换数据库时调用方不用改。
 * 调用方需要用 await 等待结果。
 */
const { query } = require('./index');

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
  var result = await query(
    `INSERT INTO users (email, nickname, password_hash, avatar_url)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [email, nickname, passwordHash, avatarUrl || null]
  );
  return result.rows[0];
}

async function findUserByEmail(email) {
  var result = await query('SELECT * FROM users WHERE email = $1', [email]);
  return result.rows[0] || null;
}

async function findUserById(id) {
  var result = await query('SELECT * FROM users WHERE id = $1', [id]);
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
  await query(
    `UPDATE users SET nickname = $1, avatar_url = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3`,
    [nickname, avatarUrl || null, id]
  );
  return findUserById(id);
}

// ---------- 企业级账号体系 ----------

async function setEmailVerified(id, verified) {
  await query('UPDATE users SET email_verified = $1 WHERE id = $2', [verified ? 1 : 0, id]);
  return findUserById(id);
}

// 使该用户所有已签发 JWT 失效（登出所有设备）；返回新的 token_version
async function incrementTokenVersion(id) {
  await query(
    'UPDATE users SET token_version = token_version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
    [id]
  );
  const row = await findUserById(id);
  return row ? Number(row.token_version || 0) : 0;
}

// 写入一次性令牌（重置密码 / 邮箱验证）；同表旧令牌统一作废
async function saveHashedToken(table, userId, tokenHash, expiresAtIso) {
  await query(
    `UPDATE ${table} SET used = 1 WHERE user_id = $1 AND used = 0`,
    [userId]
  );
  await query(
    `INSERT INTO ${table} (user_id, token_hash, expires_at, used)
     VALUES ($1, $2, $3, 0)`,
    [userId, tokenHash, expiresAtIso]
  );
}

async function findValidTokenRow(table, tokenHash) {
  const result = await query(
    `SELECT * FROM ${table} WHERE token_hash = $1 AND used = 0 ORDER BY id DESC LIMIT 1`,
    [tokenHash]
  );
  return result.rows[0] || null;
}

// 标记令牌已用；可顺带重置密码并使所有会话失效
async function consumeHashedToken(table, tokenRow, newPasswordHash) {
  await query(`UPDATE ${table} SET used = 1 WHERE id = $1`, [tokenRow.id]);
  if (newPasswordHash) {
    await query(
      'UPDATE users SET password_hash = $1, token_version = token_version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [newPasswordHash, tokenRow.user_id]
    );
  }
}

async function countUsers() {
  const result = await query('SELECT COUNT(*) AS c FROM users');
  return Number(result.rows[0] && result.rows[0].c) || 0;
}

async function listUsersAdmin({ limit = 50, offset = 0 } = {}) {
  const result = await query(
    `SELECT id, email, nickname, is_admin, email_verified, created_at
     FROM users ORDER BY id DESC LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return result.rows;
}

module.exports = {
  createUser,
  findUserByEmail,
  findUserById,
  updateUserProfile,
  setEmailVerified,
  incrementTokenVersion,
  saveHashedToken,
  findValidTokenRow,
  consumeHashedToken,
  listUsersAdmin,
  countUsers,
};
