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
 * 二、Phase 8：版本化同步（乐观并发）
 *    user_data 表新增 revision 版本号。前端推送时携带 baseRevision
 *    （发起本次修改时本地看到的版本）：
 *    - 服务器当前版本 == baseRevision → 正常保存，版本号 +1
 *    - 服务器当前版本 > baseRevision  → 说明云端已被其它设备写得更新，
 *      返回 409 SYNC_CONFLICT + 服务器最新数据；前端做防线式合并后重推，
 *      **绝不接受覆盖云端更新**。
 *    - 推送内容与服务器完全一致 → 幂等，直接返回当前（版本不增）
 *
 * 三、全量同步 vs 增量同步
 *    全量模式（默认）：前端发送完整 chenguangData，后端覆盖旧数据。
 *    增量模式（_syncMode: 'partial'）：前端只发送修改过的集合，后端只更新
 *    这些集合；user 做字段级深合并。
 *
 * 四、数据清洗（Clean）
 *    保存数据时，只保留白名单字段（PAYLOAD_KEYS），防止脏数据写库。
 * ============================================================
 */
const userDataModel = require('../db/userDataModel');
const { db } = require('../db');
const ApiError = require('../utils/ApiError');
const { emptyPayload, PAYLOAD_KEYS } = require('../config/collectionConfig');

/**
 * isDeepEqual(a, b) —— 简单深度相等比较（用于幂等判断）
 * 忽略字段顺序，处理嵌套对象与基本类型。
 */
function isDeepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
    if (!isDeepEqual(a[k], b[k])) return false;
  }
  return true;
}

/**
 * stripMetaForCompare(p) —— 比较前剔除内部字段（_syncMode/_meta/__migrated）
 * 这些是同步协议字段，不属于业务数据，不能影响幂等判断。
 */
function stripMetaForCompare(p) {
  const out = {};
  if (!p || typeof p !== 'object') return out;
  Object.keys(p).forEach((k) => {
    if (k === '_syncMode' || k === '_meta' || k === '__migrated') return;
    out[k] = p[k];
  });
  return out;
}

/**
 * 拉取用户整份数据（envelope 结构）
 *
 * @param {number} userId
 * @returns {Object} { data, revision, updatedAt, deviceId }
 */
async function getData(userId) {
  const row = await userDataModel.getUserDataRow(userId);
  let payload = null;
  if (row && row.payload) {
    try { payload = JSON.parse(row.payload); } catch (_) { payload = null; }
  }
  if (!payload || typeof payload !== 'object') payload = emptyPayload();
  return {
    data: payload,
    revision: row && row.revision ? Number(row.revision) : 1,
    updatedAt: row ? row.updated_at : null,
    deviceId: row ? row.device_id || '' : '',
  };
}

/**
 * atomicSave(userId, body, baseRevision, deviceId) —— saveData 的原子核心
 *
 * 把「读当前行 → 计算应用后数据 → 幂等/版本校验 → 写入」放进一个
 * better-sqlite3 同步事务里，事务内绝不 await（无任何让出事件循环的边界），
 * 并发 PUT /api/data 的读写不可能交错，杜绝读-改-写竞态。
 */
function atomicSave(userId, body, baseRevision, deviceIdRaw) {
  var tx = db.transaction(function (uid, b, baseRev, did) {
    // ---- 同步读取服务器当前行（事务内，无 await）----
    var row = db
      .prepare(
        'SELECT payload, revision, device_id, updated_at FROM user_data WHERE user_id = ?'
      )
      .get(uid);
    var currentPayload = null;
    if (row && row.payload) {
      try { currentPayload = JSON.parse(row.payload); } catch (_) { currentPayload = null; }
    }
    if (!currentPayload || typeof currentPayload !== 'object') currentPayload = emptyPayload();
    var currentRev = row && row.revision ? Number(row.revision) : 1;

    // ---- 应用数据（全量覆盖 / 增量合并）----
    var syncMode = b._syncMode || 'full';
    var clean = emptyPayload();
    if (syncMode === 'partial') {
      Object.assign(clean, currentPayload);
      PAYLOAD_KEYS.forEach(function (k) {
        if (k === 'user') return;
        if (b[k] !== undefined) clean[k] = b[k];
      });
      if (b.user && typeof b.user === 'object') {
        clean.user = Object.assign(emptyPayload().user, currentPayload.user, b.user);
      }
    } else {
      PAYLOAD_KEYS.forEach(function (k) { if (b[k] !== undefined) clean[k] = b[k]; });
      if (b.user && typeof b.user === 'object') {
        clean.user = Object.assign(emptyPayload().user, b.user);
      }
    }

    // ---- 幂等：应用后结果与服务器当前完全一致 → 直接返回当前（不 bump）----
    if (isDeepEqual(stripMetaForCompare(clean), stripMetaForCompare(currentPayload))) {
      return {
        data: currentPayload,
        revision: currentRev,
        updatedAt: row ? row.updated_at : null,
        deviceId: row ? row.device_id || '' : '',
        idempotent: true,
      };
    }

    // ---- 版本校验：本地 baseRevision 落后 → 409（拒绝覆盖云端更新）----
    // 【已知边界】revision 是"操作计数"而非内容指纹：极端情况下两台离线设备各自
    // 攒了相同数量的本地操作（clientRev 追平 currentRev），内容却分叉 —— 此时按
    // 数判断不触发 409，后推的一方会用本地分支覆盖云端分支。属乐观并发的固有取舍
    // （代价是零额外存储）；如需内容级仲裁，应把 revision 换成内容指纹/历史链。
    if (
      baseRev !== undefined && baseRev !== null && !Number.isNaN(baseRev) &&
      baseRev < currentRev
    ) {
      throw ApiError.conflict('SYNC_CONFLICT', '数据版本冲突：本地修改晚于云端，请合并后重试', {
        serverRevision: currentRev,
        serverData: currentPayload,
      });
    }

    // ---- 版本号 = 双方较大版本 + 1（仅真正的本地/合并写入才递增）----
    var clientRev = baseRev !== undefined && !Number.isNaN(baseRev) ? baseRev : 0;
    var newRevision = Math.max(currentRev, clientRev) + 1;
    var deviceId = did || '';

    // 直接使用 better-sqlite3 的原生 ? 位置占位符（本事务全程同步，无 query() 包装）
    db.prepare(
      `INSERT INTO user_data (user_id, payload, revision, device_id, updated_at)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(user_id) DO UPDATE
         SET payload = ?, revision = ?, device_id = ?, updated_at = CURRENT_TIMESTAMP`
    ).run(uid, JSON.stringify(clean), newRevision, deviceId, JSON.stringify(clean), newRevision, deviceId);

    return {
      data: clean,
      revision: newRevision,
      updatedAt: new Date().toISOString(),
      deviceId: deviceId,
    };
  });

  return tx(userId, body, baseRevision, deviceIdRaw || '');
}

/**
 * saveData —— 回写用户数据（支持全量和增量模式，启用版本乐观并发）
 *
 * 入参兼容两种形态：
 *   1. 新契约：saveData(userId, { data, baseRevision, deviceId })
 *   2. 旧调用：saveData(userId, payload)（不校验版本，版本号照常 +1）
 *
 * @param {number} userId
 * @param {Object} payload  envelope 或直接业务 payload
 * @param {Object} [opts]   { baseRevision, deviceId }（controller 从外层提取传入）
 * @returns {Object} { data, revision, updatedAt, deviceId }
 */
async function saveData(userId, payload, opts) {
  // ---- 解析 envelope：把纯业务负载从包装中剥离出来 ----
  var body = payload;
  var baseRevision = opts && opts.baseRevision;
  var deviceId = opts && opts.deviceId;
  if (
    body && typeof body === 'object' &&
    body.data && typeof body.data === 'object' && !Array.isArray(body.data)
  ) {
    baseRevision = body.baseRevision !== undefined ? Number(body.baseRevision) : baseRevision;
    deviceId = body.deviceId !== undefined ? String(body.deviceId) : deviceId;
    body = body.data;
  }

  // 验证输入：必须是非空对象，不能是数组
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw ApiError.badRequest('INVALID_INPUT', '数据格式不正确');
  }

  // 原子读-改-写（见 atomicSave）
  return atomicSave(userId, body, baseRevision, deviceId);
}

module.exports = {
  getData,
  saveData,
  emptyPayload,
  PAYLOAD_KEYS,
  isDeepEqual,
};