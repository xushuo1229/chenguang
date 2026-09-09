/**
 * CORS 配置
 * ------------------------------------------------------------
 * - 仅允许 CORS_ORIGIN 白名单中的来源访问
 * - 允许携带 Authorization 头 (JWT) + credentials
 * - 暴露 RateLimit-* 头, 供前端读取限流信息
 * - 非白名单来源: 返回不带 ACAO 头的响应 (浏览器自动拦截)
 *
 * 生产域名: https://xushuo1229.github.io
 * 开发域名: http://localhost:8000, http://127.0.0.1:8000
 */
const cors = require('cors');
const config = require('../config/env');

// 构建白名单 Set (O(1) 查找, 支持子域名通配)
const originSet = new Set(config.corsOrigin);

/**
 * 检查 origin 是否在白名单中
 * 支持:
 *   - 精确匹配: https://xushuo1229.github.io
 *   - 通配匹配: https://*.github.io (CORS_ORIGIN 中以 * 开头)
 */
function isOriginAllowed(origin) {
  if (!origin) return true; // 同源请求 (无 Origin 头), 放行
  if (originSet.has(origin)) return true; // 精确匹配
  // 通配匹配
  for (const allowed of originSet) {
    if (allowed.startsWith('*.')) {
      const suffix = allowed.slice(1); // ".github.io"
      try {
        const url = new URL(origin);
        if (url.hostname.endsWith(suffix)) return true;
      } catch (_) { /* 非法 origin, 忽略 */ }
    }
  }
  return false;
}

const corsMiddleware = cors({
  origin(origin, cb) {
    if (isOriginAllowed(origin)) {
      return cb(null, true); // 允许
    }
    // 不在白名单: 返回 false, CORS 不发送 ACAO 头, 浏览器自动拦截
    // 不抛错 (避免 500), 仅记录日志
    if (origin) {
      console.warn(`[cors] 拒绝来源: ${origin}`);
    }
    return cb(null, false);
  },
  credentials: true, // 允许携带 cookie / Authorization
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  // 暴露给前端 JS 可读的响应头 (RateLimit 限流信息)
  exposedHeaders: [
    'RateLimit-Limit',
    'RateLimit-Remaining',
    'RateLimit-Reset',
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset',
  ],
  maxAge: 86400, // 预检结果缓存 24h, 减少 OPTIONS 请求
});

module.exports = corsMiddleware;
