/**
 * 知行 · CORS 中间件
 * ============================================================
 * 【给初者的说明】
 *
 * 一、什么是 CORS（Cross-Origin Resource Sharing，跨域资源共享）？
 *    浏览器有一个安全机制叫"同源策略"（Same-Origin Policy）：
 *    网页 A (http://localhost:3000) 不能直接请求 网页 B (http://localhost:8080) 的 API。
 *    "同源"的定义是：协议 + 域名 + 端口 都相同。
 *
 *    但现实中，前端和后端经常不在同一个端口（比如前端 3000，后端 8080），
 *    这时候就需要 CORS 来"放行"跨域请求。
 *
 * 二、CORS 是怎么工作的？
 *    1. 浏览器发送跨域请求时，会在请求头里加上 Origin 字段
 *       例如：Origin: http://localhost:3000
 *    2. 服务器收到请求后，检查 Origin 是否在"白名单"里
 *    3. 如果在白名单，服务器在响应头里加上：
 *       Access-Control-Allow-Origin: http://localhost:3000
 *       Access-Control-Allow-Credentials: true
 *    4. 浏览器看到这些头，就放行请求，前端 JS 能拿到数据
 *    5. 如果不在白名单，浏览器直接拦截响应，前端拿不到数据
 *
 * 三、为什么需要 CORS？
 *    没有 CORS，前端就无法调用后端 API，网站就没法工作。
 *    但也不能随便放行所有来源，否则任何网站都能调你的 API。
 *    所以我们需要"白名单"——只允许信任的前端域名访问。
 *
 * 四、credentials: true 是什么意思？
 *    允许请求携带 Cookie 和 Authorization 头（JWT 令牌）。
 *    如果不设置这个，浏览器不会发送认证信息。
 *
 * 五、maxAge: 86400 是什么意思？
 *    浏览器在发送真正的跨域请求前，会先发一个 OPTIONS "预检请求"。
 *    maxAge 表示这个预检结果可以缓存 24 小时（86400 秒），
 *    减少不必要的 OPTIONS 请求，提升性能。
 * ============================================================
 */
const cors = require('cors');
const config = require('../config/env');

// 构建白名单 Set（用 Set 而不是 Array，因为 Set 的查找速度是 O(1)，Array 是 O(n)）
const originSet = new Set(config.corsOrigin);

/**
 * 检查 origin 是否在白名单中
 * 支持：
 *   - 精确匹配：https://xushuo1229.github.io
 *   - 通配匹配：*.github.io（匹配所有 .github.io 子域名）
 */
function isOriginAllowed(origin) {
  if (!origin) return true;                 // 同源请求（无 Origin 头），放行
  if (originSet.size === 0) return true;   // 开发环境留空 → 放行所有（方便调试）
  if (originSet.has(origin)) return true;  // 精确匹配
  // 通配匹配：遍历白名单，检查是否以 *. 开头
  for (const allowed of originSet) {
    if (allowed.startsWith('*.')) {
      const suffix = allowed.slice(1);     // ".github.io"
      try {
        const url = new URL(origin);
        // 如果 origin 的主机名以 ".github.io" 结尾，则匹配
        if (url.hostname.endsWith(suffix)) return true;
      } catch (_) { /* 非法 origin，忽略 */ }
    }
  }
  return false;
}

// 使用 cors 库创建 CORS 中间件
const corsMiddleware = cors({
  // origin 回调：动态检查每个请求的 Origin 是否允许
  origin(origin, cb) {
    if (isOriginAllowed(origin)) {
      return cb(null, true); // 允许
    }
    // 不在白名单：返回 false，CORS 不发送 ACAO 头，浏览器自动拦截
    if (origin) {
      console.warn(`[cors] 拒绝来源: ${origin}`);
    }
    return cb(null, false); // 拒绝
  },
  // 允许携带 Cookie 和 Authorization 头（JWT 认证需要）
  credentials: true,
  // 允许的 HTTP 方法
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  // 允许的请求头（Authorization 用于 JWT，X-Requested-With 用于 CSRF 防护）
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  // 暴露给前端 JS 可读的响应头（浏览器默认只暴露少数安全头）
  // 包括限流信息、数据 ETag、滑动续期令牌
  exposedHeaders: [
    'RateLimit-Limit',
    'RateLimit-Remaining',
    'RateLimit-Reset',
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset',
    'ETag',
    'X-Renewed-Token',
  ],
  // 预检结果缓存 24 小时，减少 OPTIONS 请求（性能优化）
  maxAge: 86400,
});

module.exports = corsMiddleware;
module.exports.isOriginAllowed = isOriginAllowed;
