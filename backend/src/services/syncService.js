/**
 * 晨光自律台 · 整份数据同步业务逻辑层
 * ============================================================
 * 【给初学者的说明】
 *
 * 一、什么是"整份数据同步"？
 *    用户的所有数据（课程、运动、阅读记录、待办等）存在一个 JSON 对象里。
 *    这个 JSON 就是"整份 chenguangData"。
 *
 *    同步流程：
 *    1. 前端打开 → GET /api/data → 调用 getData 从数据库拉取整份数据
 *    2. 用户修改数据 → 前端自动 PUT /api/data → 调用 saveData 保存到数据库
 *
 * 二、什么是 Source of Truth（数据源）？
 *    user_data 表的 payload 字段是"唯一真实数据源"。
 *    所有数据都从这里读取，所有修改都保存到这里。
 *    这样可以避免数据冲突和不一致。
 *
 * 三、全量同步 vs 增量同步
 *    全量模式（默认）：
 *    - 前端发送完整的 chenguangData
 *    - 后端用新数据完全覆盖旧数据
 *    - 简单可靠，但数据量大时效率低
 *
 *    增量模式（_syncMode: 'partial'）：
 *    - 前端只发送修改过的集合（如只发 courses）
 *    - 后端只更新这些集合，其他集合保持不变
 *    - 效率高，但逻辑更复杂
 *
 * 四、数据清洗（Clean）
 *    保存数据时，我们只保留"已知字段"（PAYLOAD_KEYS 中定义的），
 *    忽略未知字段。这叫"数据清洗"，防止脏数据写入数据库。
 * ============================================================
 */
const userDataModel = require('../db/userDataModel');
const ApiError = require('../utils/ApiError');
const { emptyPayload, PAYLOAD_KEYS } = require('../config/collectionConfig');

/**
 * 拉取用户整份数据
 *
 * 从数据库读取用户的 JSON 快照，解析后返回。
 * 如果用户没有数据记录，返回空的数据结构（与前端 store.js 一致）。
 *
 * @param {number} userId 用户 ID
 * @returns {Object} chenguangData 对象
 */
async function getData(userId) {
  // 从数据库读取原始 JSON 字符串
  const raw = await userDataModel.getUserData(userId);
  let payload = null;
  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch (_) {
    payload = null;
  }
  if (!payload) payload = emptyPayload();
  return payload;
}

/**
 * 回写用户数据（支持全量和增量模式）
 *
 * 流程：
 * 1. 验证输入数据格式
 * 2. 判断同步模式（全量 or 增量）
 * 3. 清洗数据（只保留已知字段）
 * 4. 保存到数据库
 * 5. 返回清洗后的数据
 *
 * @param {number} userId 用户 ID
 * @param {Object} payload chenguangData 对象
 * @returns {Object} 清洗后的 chenguangData
 */
async function saveData(userId, payload) {
  // 验证输入：必须是非空对象，不能是数组
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw ApiError.badRequest('INVALID_INPUT', '数据格式不正确');
  }

  // 判断同步模式
  const syncMode = payload._syncMode || 'full';

  if (syncMode === 'partial') {
    // 增量模式：只更新前端发来的集合
    const current = await getData(userId);
    PAYLOAD_KEYS.forEach((k) => {
      if (payload[k] !== undefined) {
        current[k] = payload[k];
      }
    });
    if (payload.user && typeof payload.user === 'object') {
      current.user = Object.assign(emptyPayload().user, current.user, payload.user);
    }
    await userDataModel.saveUserData(userId, JSON.stringify(current));
    return current;
  }

  // 全量模式：覆盖整份数据
  const clean = emptyPayload();
  PAYLOAD_KEYS.forEach((k) => {
    if (payload[k] !== undefined) {
      clean[k] = payload[k];
    }
  });
  if (payload.user && typeof payload.user === 'object') {
    clean.user = Object.assign(emptyPayload().user, payload.user);
  }
  await userDataModel.saveUserData(userId, JSON.stringify(clean));
  return clean;
}

module.exports = {
  getData,
  saveData,
  emptyPayload,
  PAYLOAD_KEYS,
};
