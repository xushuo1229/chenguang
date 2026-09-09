/**
 * 晨光自律台 · 分集合 CRUD 控制器 (SQLite)
 * ============================================================
 * 所有 handler 都是 async 的，因为底层数据库操作是异步的。
 * 错误通过 next(err) 交给 Express 错误处理中间件。
 */
const collectionService = require('../services/collectionService');

exports.list = async (req, res, next) => {
  try {
    const rows = await collectionService.list(req.params.name, req.userId);
    res.success(rows);
  } catch (err) {
    next(err);
  }
};

exports.create = async (req, res, next) => {
  try {
    const rec = await collectionService.create(req.params.name, req.userId, req.body);
    res.success(rec);
  } catch (err) {
    next(err);
  }
};

exports.remove = async (req, res, next) => {
  try {
    const result = await collectionService.remove(req.params.name, req.userId, req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
};
