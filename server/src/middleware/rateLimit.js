/**
 * 限流中间件 (express-rate-limit)
 * ------------------------------------------------------------
 * 三级限流体系:
 *   1. apiLimiter   — 全局 /api 限流 (每分钟 100 次)
 *   2. authLimiter  — 登录/注册专用 (每 15 分钟 5 次, 防暴力破解)
 *   3. writeLimiter — 写操作 POST/PUT/DELETE (每分钟 30 次, 防滥用)
 *
 * 基于 req.ip 计数 (反向代理后需 app.set('trust proxy', 1))
 */
const rateLimit = require('express-rate-limit');
const config = require('../config/env');

// 全局 API 限流: 每分钟 100 次
const apiLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: { code: 'RATE_LIMITED', message: '请求过于频繁, 请稍后再试' },
  },
});

// 登录/注册限流: 每 15 分钟 5 次 (防暴力破解)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // 成功的请求不计数 (只限失败尝试)
  message: {
    error: { code: 'TOO_MANY_AUTH_ATTEMPTS', message: '登录/注册失败次数过多, 请 15 分钟后再试' },
  },
});

// 写操作限流: 每分钟 30 次 (防滥用创建/删除)
const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  // 仅对写操作生效
  skip: (req) => req.method === 'GET',
  message: {
    error: { code: 'WRITE_RATE_LIMITED', message: '操作过于频繁, 请稍后再试' },
  },
});

module.exports = { apiLimiter, authLimiter, writeLimiter };
