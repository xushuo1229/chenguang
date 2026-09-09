/**
 * 安全响应头中间件
 * ------------------------------------------------------------
 * 补充 Helmet 未覆盖的安全头:
 *   - Permissions-Policy: 限制浏览器 API 访问权限
 *   - Referrer-Policy: 控制 Referer 泄露
 *   - Cross-Origin 资源策略
 *
 * Helmet 已覆盖: HSTS, X-Content-Type-Options, X-Frame-Options
 */
const config = require('../config/env');

/**
 * 生产环境 CSP 策略 (严格)
 * - scriptSrc: 限制同源 + Chart.js CDN (按需加载)
 * - connectSrc: 限制同源 + API + Supabase + WebSocket
 * - frame-ancestors: 'none' (禁止嵌入)
 *
 * 注意: 'unsafe-inline' 因前端使用 inline <script> 暂时保留
 * 长期方案: 将 inline script 提取为外部文件, 使用 nonce/hash 替代
 */
const cspDirectives = {
  defaultSrc: ["'self'"],
  scriptSrc: [
    "'self'",
    'https://cdn.jsdelivr.net',   // Chart.js 按需加载
    "'unsafe-inline'",             // TODO: 迁移为 nonce/hash
  ],
  styleSrc: ["'self'", "'unsafe-inline'"],
  imgSrc: ["'self'", 'data:', 'https:'],
  fontSrc: ["'self'", 'data:'],
  connectSrc: [
    "'self'",
    'https://chenguang-api.vercel.app',
    'https://*.supabase.co',
    'wss://*.supabase.co',
  ],
  frameSrc: ["'none'"],
  frameAncestors: ["'none'"],
  formAction: ["'self'"],
  baseUri: ["'self'"],
  objectSrc: ["'none'"],
  upgradeInsecureRequests: [],
};

/**
 * Permissions-Policy (特性策略)
 * 禁止第三方使用摄像头/麦克风/地理位置等敏感 API
 */
const permissionsPolicy = [
  'camera=()',
  'microphone=()',
  'geolocation=()',
  'interest-cohort=()', // 禁用 FLoC
  'payment=()',
  'usb=()',
  'magnetometer=()',
  'gyroscope=()',
].join(', ');

/**
 * 安全头中间件
 */
function securityHeaders(req, res, next) {
  // Permissions-Policy
  res.setHeader('Permissions-Policy', permissionsPolicy);

  // Referrer-Policy: 仅向同源站点发送 Referer
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Cross-Origin 资源策略: 仅同源可加载
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');

  // 禁止 MIME 嗅探 (补充 Helmet)
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // 生产环境额外加固
  if (config.isProd) {
    // 禁止引用者泄露到跨域
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  }

  next();
}

module.exports = securityHeaders;
module.exports.cspDirectives = cspDirectives;
module.exports.permissionsPolicy = permissionsPolicy;
