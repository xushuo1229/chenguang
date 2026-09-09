/**
 * 统一错误处理中间件
 * - Express 4 参数顺序必须是 (err, req, res, next)
 * - 区分可预期错误 (ApiError) 和未知错误 (bug)
 * - 输出统一 JSON 错误格式: { error: { code, message } }
 *
 * 用法: app.use(errorHandler);
 */
const config = require('../config/env');
const ApiError = require('../utils/ApiError');

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // 默认 500 服务器内部错误
  const statusCode = err.statusCode || 500;
  const code = err.code || 'INTERNAL';

  // 生产环境隐藏 500 错误的内部细节
  let message;
  if (statusCode === 500 && config.isProd) {
    message = '服务器内部错误';
  } else {
    message = err.message || '服务器内部错误';
  }

  // 日志分级
  if (err.isOperational) {
    // 业务错误 (warn 级别)
    console.warn(`[api] ${req.method} ${req.path} -> ${statusCode} ${code}: ${message}`);
  } else {
    // 未知错误 (error 级别 + 完整堆栈)
    console.error(`[api] 未捕获错误 ${req.method} ${req.path}:`, err);
  }

  const body = { error: { code, message } };

  // 开发环境附加堆栈, 方便调试
  if (!config.isProd && statusCode === 500) {
    body.error.stack = err.stack;
  }

  res.status(statusCode).json(body);
}

/**
 * 404 兜底处理 (路由未匹配)
 * 转为 ApiError 让 errorHandler 统一响应
 */
function notFound(req, _res, next) {
  next(ApiError.notFound('ROUTE_NOT_FOUND', `路径 ${req.method} ${req.path} 不存在`));
}

module.exports = { errorHandler, notFound };
