/**
 * 晨光自律台 · 整份数据同步控制器 (PostgreSQL)
 * ============================================================
 * 所有 handler 都是 async 的，因为底层数据库操作是异步的。
 */
const syncService = require('../services/syncService');

exports.getData = async (req, res, next) => {
  try {
    const payload = await syncService.getData(req.userId);
    res.success(payload);
  } catch (err) {
    next(err);
  }
};

exports.saveData = async (req, res, next) => {
  try {
    const body = req.body || {};
    const payload = body.data || body;
    const clean = await syncService.saveData(req.userId, payload);
    delete clean._syncMode;
    res.success(clean);
  } catch (err) {
    next(err);
  }
};
