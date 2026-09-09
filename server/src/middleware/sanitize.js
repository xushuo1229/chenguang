/**
 * XSS 防护中间件 — 输入净化
 * ------------------------------------------------------------
 * 对所有用户输入的字符串值进行 HTML 实体编码
 * 防止存储型 XSS (用户输入 → 数据库 → API 响应 → 前端渲染)
 *
 * 编码字符:
 *   & → &amp;    < → &lt;    > → &gt;
 *   " → &quot;   ' → &#x27;
 *
 * 额外清理:
 *   - 移除 javascript: 协议
 *   - 移除 on* 事件处理器
 *   - 移除 <script> 标签
 */

// 危险模式正则
const DANGEROUS_PATTERNS = [
  /javascript:/gi,           // javascript: 协议
  /vbscript:/gi,              // vbscript: 协议
  /on\w+\s*=/gi,              // onXxx= 事件处理器
  /<script[^>]*>/gi,          // <script> 开始标签
  /<\/script>/gi,             // </script> 结束标签
  /<iframe[^>]*>/gi,          // <iframe> 标签
  /<object[^>]*>/gi,          // <object> 标签
  /<embed[^>]*>/gi,           // <embed> 标签
];

// 不做 HTML 编码的字段 (需要原始字符, 如密码/邮箱)
const SKIP_ENCODE_FIELDS = new Set([
  'password',
  'password_hash',
  'email',
  'token',
  'oldPassword',
  'newPassword',
  'confirmPassword',
]);

/**
 * HTML 实体编码
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * 移除危险内容 (script 标签/事件处理器/脚本协议)
 * @param {string} str
 * @returns {string}
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
 * 净化单个值 (递归)
 * - 字符串: 先移除危险内容, 再 HTML 实体编码 (跳过 SKIP_ENCODE_FIELDS 中的字段)
 * - 数组: 递归处理每个元素
 * - 对象: 递归处理每个属性 (传递 key 用于判断是否跳过编码)
 * - 其他类型: 原样返回
 * @param {*} value
 * @param {string} [key] — 当前字段名 (用于判断是否跳过编码)
 * @returns {*}
 */
function sanitizeValue(value, key) {
  if (typeof value === 'string') {
    // 密码/邮箱等字段只移除危险内容, 不做 HTML 编码 (避免破坏认证)
    if (key && SKIP_ENCODE_FIELDS.has(key)) {
      return stripDangerous(value);
    }
    return escapeHtml(stripDangerous(value));
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, key));
  }
  if (value !== null && typeof value === 'object') {
    const result = {};
    for (const k of Object.keys(value)) {
      result[k] = sanitizeValue(value[k], k);
    }
    return result;
  }
  return value;
}

/**
 * XSS 净化中间件
 * 处理 req.body, req.query, req.params 中的所有字符串值
 */
function sanitizeInput(req, _res, next) {
  try {
    if (req.body && typeof req.body === 'object') {
      req.body = sanitizeValue(req.body);
    }
    if (req.query && typeof req.query === 'object') {
      req.query = sanitizeValue(req.query);
    }
    // params 由路由参数解析, 通常已被 Express 处理, 仅做兜底
    if (req.params && typeof req.params === 'object') {
      req.params = sanitizeValue(req.params);
    }
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = sanitizeInput;
module.exports.sanitizeValue = sanitizeValue;
module.exports.escapeHtml = escapeHtml;
module.exports.stripDangerous = stripDangerous;
