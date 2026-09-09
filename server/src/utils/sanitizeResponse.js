/**
 * 敏感信息脱敏工具
 * ------------------------------------------------------------
 * 递归遍历响应数据, 移除/遮蔽敏感字段
 * 防止 password_hash, token 等意外泄露到 API 响应
 *
 * 用法:
 *   const { sanitizeResponse } = require('../utils/sanitizeResponse');
 *   res.success(sanitizeResponse(user)); // 自动移除 password_hash
 *
 * 或在控制器中:
 *   res.success(sanitizeResponse(user, { fields: ['email'] })); // 额外移除 email
 */

// 默认需要移除的敏感字段 (完全删除)
const REMOVE_FIELDS = [
  'password_hash',
  'password',
  'token',
  'secret',
  'api_key',
  'private_key',
  'session_id',
  'reset_token',
];

// 默认需要遮蔽的字段 (部分隐藏, 如 email → a***@example.com)
const MASK_FIELDS = ['email', 'phone'];

/**
 * 遮蔽邮箱: test@example.com → t***@e***.com
 * @param {string} email
 * @returns {string}
 */
function maskEmail(email) {
  if (typeof email !== 'string' || !email.includes('@')) return email;
  const [local, domain] = email.split('@');
  const maskedLocal = local.length > 1 ? local[0] + '***' : local;
  const dotIdx = domain.lastIndexOf('.');
  const maskedDomain = dotIdx > 0
    ? domain[0] + '***' + domain.slice(dotIdx)
    : domain;
  return `${maskedLocal}@${maskedDomain}`;
}

/**
 * 遮蔽手机号: 13812345678 → 138****5678
 * @param {string} phone
 * @returns {string}
 */
function maskPhone(phone) {
  if (typeof phone !== 'string' || phone.length < 7) return phone;
  return phone.slice(0, 3) + '****' + phone.slice(-4);
}

/**
 * 递归净化响应数据
 * @param {*} data — 原始数据
 * @param {Object} [opts] — 配置
 * @param {string[]} [opts.fields] — 额外移除的字段
 * @param {boolean} [opts.mask] — 是否遮蔽 email/phone (默认 true)
 * @param {boolean} [opts.removePassword] — 是否移除密码字段 (默认 true)
 * @returns {*}
 */
function sanitizeResponse(data, opts = {}) {
  const {
    fields = [],
    mask = true,
    removePassword = true,
  } = opts;

  // 合并需要移除的字段
  const removeSet = new Set(removePassword ? [...REMOVE_FIELDS, ...fields] : fields);

  // null/undefined 原样返回
  if (data === null || data === undefined) return data;

  // 字符串类型不需要处理
  if (typeof data !== 'object') return data;

  // 数组: 递归处理每个元素
  if (Array.isArray(data)) {
    return data.map((item) => sanitizeResponse(item, opts));
  }

  // 对象: 递归处理每个属性
  const result = {};
  for (const key of Object.keys(data)) {
    // 跳过需要移除的字段
    if (removeSet.has(key)) continue;

    let value = data[key];

    // 遮蔽 email/phone
    if (mask && key === 'email' && typeof value === 'string') {
      value = maskEmail(value);
    } else if (mask && key === 'phone' && typeof value === 'string') {
      value = maskPhone(value);
    } else {
      // 递归处理嵌套对象/数组
      value = sanitizeResponse(value, opts);
    }

    result[key] = value;
  }
  return result;
}

module.exports = sanitizeResponse;
module.exports.maskEmail = maskEmail;
module.exports.maskPhone = maskPhone;
module.exports.REMOVE_FIELDS = REMOVE_FIELDS;
module.exports.MASK_FIELDS = MASK_FIELDS;
