/**
 * 晨光自律台 · 请求日志中间件（零依赖自实现）
 * ------------------------------------------------------------
 * 输出格式：<METHOD> <path> <status> <耗时ms>ms
 * 生产环境默认不打印健康检查，避免日志噪音
 */
const config = require('../config/env');

function logger(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    // 健康检查在非开发环境静默
    if (!config.isDev && req.path === '/api/health') return;
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms`);
  });
  next();
}

module.exports = logger;
