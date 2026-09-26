/**
 * Zeno · user_data 整份快照数据访问层 (SQLite)
 * ------------------------------------------------------------
 * 整份 chenguangData JSON 的 source of truth
 * 支持整份拉取（GET /api/data）与覆盖回写（PUT /api/data）
 *
 * Phase 8：表里额外保存 revision（版本号）与 device_id（最近写入设备），
 * 供乐观并发校验与跨设备提示使用。
 */
const { query } = require('./index');

/**
 * 读取用户数据的一整行（payload + 版本元信息）
 * @param {number} userId
 * @returns {Object|null} { payload, revision, device_id, updated_at }，无记录返回 null
 */
async function getUserDataRow(userId) {
  var result = await query(
    'SELECT payload, revision, device_id, updated_at FROM user_data WHERE user_id = $1',
    [userId]
  );
  return result.rows[0] || null;
}

/**
 * 读取用户的整份数据
 * @param {number} userId
 * @returns {string|null}  JSON 字符串（payload），无记录返回 null
 */
async function getUserData(userId) {
  var row = await getUserDataRow(userId);
  return row ? row.payload : null;
}

/**
 * 覆盖写入用户的整份数据（UPSERT，同时记录版本号与设备 ID）
 * @param {number} userId
 * @param {string} payload       JSON 字符串
 * @param {number} [revision=1]  新版本号
 * @param {string} [deviceId=''] 写入来源设备 ID
 * @returns {boolean} 成功返回 true
 */
async function saveUserData(userId, payload, revision, deviceId) {
  await query(
    `INSERT INTO user_data (user_id, payload, revision, device_id, updated_at)
     VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
     ON CONFLICT(user_id) DO UPDATE
       SET payload = $2, revision = $3, device_id = $4, updated_at = CURRENT_TIMESTAMP`,
    [userId, payload, revision || 1, deviceId || '']
  );
  return true;
}

module.exports = {
  getUserDataRow,
  getUserData,
  saveUserData,
};
