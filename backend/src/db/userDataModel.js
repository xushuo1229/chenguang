/**
 * 晨光自律台 · user_data 整份快照数据访问层 (SQLite)
 * ------------------------------------------------------------
 * 整份 chenguangData JSON 的 source of truth
 * 支持整份拉取（GET /api/data）与覆盖回写（PUT /api/data）
 */
const { query } = require('./index');

/**
 * 读取用户的整份数据
 * @param {number} userId
 * @returns {string|null}  JSON 字符串（payload），无记录返回 null
 */
async function getUserData(userId) {
  var result = await query(
    'SELECT payload, updated_at FROM user_data WHERE user_id = $1',
    [userId]
  );
  var row = result.rows[0];
  return row ? row.payload : null;
}

/**
 * 覆盖写入用户的整份数据（UPSERT）
 * @param {number} userId
 * @param {string} payload  JSON 字符串
 * @returns {boolean} 成功返回 true
 */
async function saveUserData(userId, payload) {
  await query(
    `INSERT INTO user_data (user_id, payload, updated_at)
     VALUES ($1, $2, CURRENT_TIMESTAMP)
     ON CONFLICT(user_id) DO UPDATE
       SET payload = $2, updated_at = CURRENT_TIMESTAMP`,
    [userId, payload]
  );
  return true;
}

module.exports = {
  getUserData,
  saveUserData,
};
