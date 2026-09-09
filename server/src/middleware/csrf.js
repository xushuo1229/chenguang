/**
 * CSRF 防护中间件 (自定义请求头验证)
 * ------------------------------------------------------------
 * 原理:
 *   跨域表单提交 (CSRF 攻击载体) 无法携带自定义 HTTP 头
 *   要求所有状态变更请求 (POST/PUT/PATCH/DELETE) 携带
 *   X-Requested-With: XMLHttpRequest 头
 *
 * 前端 httpClient 已配置此头, 跨域表单无法伪造
 *
 * 注意: 本项目使用 JWT (localStorage) 而非 Cookie 认证
 *   CSRF 实际风险较低, 此中间件为纵深防御
 *
 * 安全层级:
 *   1. JWT 在 Authorization 头 (非自动携带的 Cookie)
 *   2. CORS 白名单 (仅允许可信来源)
 *   3. 自定义头验证 (本中间件)
 */
const ApiError = require('../utils/ApiError');

const CSRF_HEADER = 'x-requested-with';
const CSRF_EXPECTED = 'XMLHttpRequest';

// 不需要 CSRF 保护的路径
const WHITELIST_PATHS = [
  '/api/health',
];

/**
 * CSRF 验证中间件
 * - GET/HEAD/OPTIONS 请求跳过 (无副作用)
 * - 白名单路径跳过
 * - 其他请求必须携带 X-Requested-With 头
 */
function csrfProtection(req, _res, next) {
  // 安全方法不检查
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // 白名单跳过
  if (WHITELIST_PATHS.some((p) => req.path === p)) {
    return next();
  }

  // 验证自定义头
  const headerValue = req.headers[CSRF_HEADER];
  if (headerValue !== CSRF_EXPECTED) {
    throw ApiError.forbidden(
      'CSRF_VALIDATION_FAILED',
      '请求缺少必要的安全验证头'
    );
  }

  next();
}

module.exports = csrfProtection;
