/**
 * 晨光自律台 · 分集合 CRUD 业务逻辑层 (PostgreSQL)
 * ============================================================
 * 为 7 种数据集合提供通用的 CRUD 操作。
 * 所有函数都是 async 的，因为底层数据库操作是异步的。
 */
const crypto = require('crypto');
const collectionModel = require('../db/collectionModel');
const ApiError = require('../utils/ApiError');
const { COLLECTIONS, VALID_NAMES } = require('../config/collectionConfig');

function assertCollection(name) {
  var cfg = COLLECTIONS[name];
  if (!cfg) {
    throw ApiError.notFound('COLLECTION_NOT_FOUND', '集合 ' + name + ' 不存在');
  }
  return cfg;
}

async function list(name, userId) {
  var cfg = assertCollection(name);
  return collectionModel.listByUser(cfg.table, userId);
}

async function create(name, userId, body) {
  var cfg = assertCollection(name);
  var rec = cfg.mapIn(body || {});
  if (!rec.id) rec.id = crypto.randomUUID();
  return collectionModel.insertRecord(cfg.table, userId, rec);
}

async function remove(name, userId, id) {
  var cfg = assertCollection(name);
  var changes = await collectionModel.deleteRecord(cfg.table, userId, id);
  if (changes === 0) {
    throw ApiError.notFound('RECORD_NOT_FOUND', '记录不存在或已删除');
  }
  return { ok: true };
}

module.exports = {
  list,
  create,
  remove,
  COLLECTIONS,
  VALID_NAMES,
};
