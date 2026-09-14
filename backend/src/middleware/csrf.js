/**
 * 知行 · CSRF 防护中间件（自定义请求头验证）
 * ============================================================
 * 【给初学者的说明】
 *
 * 一、什么是 CSRF 攻击（Cross-Site Request Forgery，跨站请求伪造）？
 *    假设你登录了网银（bank.com），浏览器保存了你的登录 Cookie。
 *    然后你访问了一个恶意网站（evil.com）。
 *    恶意网站的页面里有一段隐藏代码：
 *      <img src="https://bank.com/transfer?to=hacker&amount=1000">
 *    浏览器会自动带上 bank.com 的 Cookie，发送这个请求。
 *    网银服务器以为是你本人操作，就执行了转账！
 *
 * 二、怎么防御 CSRF？
 *    关键原理：跨域表单提交无法携带自定义 HTTP 头。
 *
 *    浏览器的安全策略：
 *    - 普通的 <form> 表单只能设置 Content-Type 等少数头
 *    - 只有 JavaScript（XMLHttpRequest 或 fetch）才能设置自定义头
 *    - 而恶意网站的 JS 无法读取你的页面（同源策略保护）
 *
 *    所以我们要求：所有修改数据的请求（POST/PUT/DELETE）必须带上
 *    X-Requested-With: XMLHttpRequest 这个自定义头。
 *    恶意网站的表单无法伪造这个头 → 请求被拒绝。
 *
 * 三、安全层级（纵深防御）：
 *    1. JWT 在 Authorization 头（不使用 Cookie，Cookie 才是 CSRF 的温床）
 *    2. CORS 白名单（只允许可信来源）
 *    3. 自定义头验证（本中间件）—— 第三道防线
 *
 * 四、哪些请求不需要检查？
 *    - GET/HEAD/OPTIONS：这些是"安全方法"，不会修改数据
 *    - 健康检查接口（/health）：无副作用，不需要保护
 * ============================================================
 */
const ApiError = require('../utils/ApiError');

// 我们要求的自定义头名称和值
const CSRF_HEADER = 'x-requested-with';
const CSRF_EXPECTED = 'XMLHttpRequest';

// 使用 Set 替代 Array，获得 O(1) 查找性能
// 这些 HTTP 方法是"安全的"，不会修改服务器数据，所以不需要 CSRF 保护
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// 不需要 CSRF 保护的路径（健康检查等无副作用接口）
// 注意：req.path 是相对于路由器挂载点的路径，所以是 /health 而非 /api/health
const WHITELIST_PATHS = new Set(['/health']);

/**
 * CSRF 验证中间件
 *
 * 工作流程：
 * 1. GET/HEAD/OPTIONS 请求 → 直接放行（安全方法）
 * 2. 白名单路径 → 直接放行
 * 3. 其他请求 → 检查 X-Requested-With 头是否为 XMLHttpRequest
 *    - 有且正确 → 放行
 *    - 没有或错误 → 抛出 403 错误
 */
function csrfProtection(req, _res, next) {
  // 安全方法不检查（Set.has 是 O(1)）
  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  // 白名单跳过（Set.has 是 O(1)）
  if (WHITELIST_PATHS.has(req.path)) {
    return next();
  }

  // 验证自定义头：必须有 X-Requested-With: XMLHttpRequest
  const headerValue = req.headers[CSRF_HEADER];
  if (headerValue !== CSRF_EXPECTED) {
    throw ApiError.forbidden(
      'CSRF_VALIDATION_FAILED',
      '请求缺少必要的安全验证头'
    );
  }

  // 验证通过，继续执行下一个中间件
  next();
}

module.exports = csrfProtection;
