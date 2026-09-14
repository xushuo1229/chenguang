/**
 * 知行 · 安全响应头中间件
 * ============================================================
 * 【给初学者的说明】
 *
 * 一、什么是安全响应头（Security Headers）？
 *    当服务器返回 HTTP 响应时，可以在响应头里加一些"安全指令"，
 *    告诉浏览器："请按这些规则行事"。比如：
 *    - 不要加载外部脚本
 *    - 不要被嵌入到别的网站的 iframe 里
 *    - 只能通过 HTTPS 访问
 *    这些指令就像给浏览器发了一张"安全行为规范表"。
 *
 * 二、HSTS（HTTP Strict Transport Security）
 *    HSTS 告诉浏览器："以后访问这个网站时，请自动使用 HTTPS，不要用 HTTP。"
 *    max-age=31536000 表示有效期为 1 年（31536000 秒）。
 *    includeSubDomains 表示所有子域名也遵守这个规则。
 *    这样即使用户输入 http://，浏览器也会自动跳转到 https://。
 *
 * 三、CSP（Content Security Policy，内容安全策略）
 *    CSP 是最复杂的安全头，它规定了"页面可以加载哪些资源"。
 *    比如：
 *    - default-src 'self'：默认只能加载自己网站的资源
 *    - script-src 'self'：只能执行自己网站的 JS 文件
 *    - img-src 'self' data: https:：图片可以来自自身、data URL、或 HTTPS 网站
 *    CSP 能有效防止 XSS 攻击（恶意脚本注入）。
 *
 * 四、其他安全头
 *    - Permissions-Policy：禁用摄像头、麦克风等浏览器 API（我们不需要）
 *    - Referrer-Policy：控制从本页面跳转时是否泄露来源 URL
 *    - X-Content-Type-Options: nosniff：禁止浏览器"猜测"文件类型，防止 MIME 攻击
 *    - Cross-Origin-Resource-Policy：控制资源是否允许被跨域加载
 *
 * 五、为什么只在生产环境启用 CSP？
 *    开发时我们可能需要加载本地脚本、inline 脚本等，
 *    严格 CSP 会阻断调试。所以只在生产环境开启。
 * ============================================================
 */
const config = require('../config/env');

// CSP 指令：键为 CSP 指令名（kebab-case），值为数组（元素带单引号）
// 用模板字符串 `'xxx'` 包裹单引号值，避免双引号嵌套单引号的转义问题
const cspDirectives = {
  // default-src：默认策略，其他未单独指定的资源类型都用这个
  // 'self' 表示只允许加载同源（自己网站）的资源
  'default-src': [`'self'`],

  // script-src：控制可以执行哪些 JavaScript
  // 'self' — 自己网站的 JS 文件
  // https://cdn.jsdelivr.net — Chart.js 图表库从 CDN 加载
  // 'unsafe-inline' — 允许内联脚本（前端可能有 <script> 标签）
  // 注意：unsafe-inline 会降低安全性，但纯 API 后端不渲染 HTML，风险可控
  'script-src': [
    `'self'`,
    'https://cdn.jsdelivr.net', // Chart.js 按需加载
    `'unsafe-inline'`,          // 前端内联脚本
  ],

  // style-src：控制可以使用哪些 CSS 样式
  // 'unsafe-inline' 允许内联 style 属性（如 <div style="...">）
  'style-src': [`'self'`, `'unsafe-inline'`],

  // img-src：控制图片来源
  // data: 允许 base64 内嵌图片，https: 允许任何 HTTPS 图片
  'img-src': [`'self'`, 'data:', 'https:'],

  // font-src：控制字体来源
  'font-src': [`'self'`, 'data:'],

  // connect-src：控制 JS 可以发起哪些网络请求（fetch/XHR/WebSocket）
  // 包括自身、后端 API、Supabase 数据库连接
  'connect-src': [
    `'self'`,
    'https://chenguang-api.vercel.app',
    'https://*.supabase.co',
    'wss://*.supabase.co',
  ],

  // frame-src：禁止加载任何 iframe 内容
  'frame-src': [`'none'`],

  // frame-ancestors：禁止本网站被嵌入到任何 iframe 中（防点击劫持）
  'frame-ancestors': [`'none'`],

  // form-action：表单只能提交到自己网站
  'form-action': [`'self'`],

  // base-uri：限制 <base> 标签的 href，防止修改所有链接的基础路径
  'base-uri': [`'self'`],

  // object-src：禁止加载 Flash 等插件
  'object-src': [`'none'`],

  // upgrade-insecure-requests：自动把页面中的 HTTP 请求升级为 HTTPS
  'upgrade-insecure-requests': [],
};

// 缓存 CSP header 字符串，避免每次请求重复构建
// 这是一个性能优化：CSP 指令字符串只构建一次，后续请求直接复用
let cachedCspHeader = null;

/**
 * 构建 CSP 头部字符串
 * 把 cspDirectives 对象转换成浏览器能识别的格式，例如：
 * "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net 'unsafe-inline'; ..."
 */
function buildCspHeader() {
  if (!cachedCspHeader) {
    cachedCspHeader = Object.entries(cspDirectives)
      .map(([k, vals]) => `${k} ${vals.join(' ')}`)
      .join('; ');
  }
  return cachedCspHeader;
}

// Permissions-Policy：告诉浏览器禁用哪些 API
// 每个格式为 "API名=()"，括号为空表示禁止所有来源使用
// 例如 camera=() 表示禁止网页访问摄像头
const permissionsPolicy = [
  'camera=()',           // 禁用摄像头
  'microphone=()',       // 禁用麦克风
  'geolocation=()',      // 禁用地理位置
  'interest-cohort=()',  // 禁用 FLoC（Google 的广告追踪技术）
  'payment=()',          // 禁用支付 API
  'usb=()',              // 禁用 USB 设备访问
  'magnetometer=()',     // 禁用磁力计（指南针）
  'gyroscope=()',        // 禁用陀螺仪
].join(', ');

/**
 * 安全响应头中间件
 *
 * 工作流程：
 * 1. 每个 HTTP 响应经过这个中间件时，自动添加安全头
 * 2. 调用 next() 把控制权交给下一个中间件
 * 3. 浏览器收到响应后，会读取这些头并遵守对应规则
 */
function securityHeaders(req, res, next) {
  // 限制浏览器 API 访问权限（所有环境都生效）
  res.setHeader('Permissions-Policy', permissionsPolicy);
  // 控制 Referer 头：同源请求发送完整路径，跨域只发送源
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // 资源只能被同源页面加载（防止其他网站盗用我们的资源）
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  // 禁止浏览器 MIME 类型嗅探（防止把图片当脚本执行）
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // 仅生产环境启用 CSP（开发环境避免阻断调试）
  if (config.isProd) {
    res.setHeader('Content-Security-Policy', buildCspHeader());
    // 跨源嵌入器策略：要求所有跨域资源必须明确允许被嵌入
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  }

  // HSTS：仅生产环境 + HTTPS（开发环境 http 不应设置）
  // 告诉浏览器："这个网站只通过 HTTPS 访问，有效期 1 年，包含子域名"
  if (config.isProd) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  // 调用 next()，把控制权交给下一个中间件
  next();
}

module.exports = securityHeaders;
module.exports.cspDirectives = cspDirectives;
module.exports.permissionsPolicy = permissionsPolicy;
module.exports.buildCspHeader = buildCspHeader;
