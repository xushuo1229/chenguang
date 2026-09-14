/**
 * 知行 · 整份数据同步控制器 (SQLite)
 * ============================================================
 * 所有 handler 都是 async 的，因为底层数据库操作是异步的。
 *
 * GET /api/data  → 返回 envelope { data, revision, updatedAt, deviceId }
 * PUT /api/data  → 接收 envelope { data, baseRevision, deviceId }，
 *                 校验版本后保存，返回最终 envelope（data 为服务器融合结果）。
 */
const syncService = require('../services/syncService');

exports.getData = async (req, res, next) => {
  try {
    const result = await syncService.getData(req.userId);
    res.success(result);
  } catch (err) {
    next(err);
  }
};

exports.saveData = async (req, res, next) => {
  try {
    const body = req.body || {};
    const result = await syncService.saveData(
      req.userId,
      body,
      { baseRevision: body.baseRevision, deviceId: body.deviceId }
    );
    delete result.idempotent;
    // 统一返回 envelope：{ data, revision, updatedAt, deviceId }
    res.success(result);
  } catch (err) {
    next(err);
  }
};
