/**
 * 知行 · 响应数据脱敏工具
 * ------------------------------------------------------------
 * 递归遍历响应数据，移除/遮蔽敏感字段
 * 防止 password_hash、token 等意外泄露到 API 响应
 *
 * 由 middleware/response.js 在 res.success 时自动调用
 * 也可在控制器中手动调用：
 *   res.success(sanitizeResponse(user, { fields: ['email'] }))
 */

// 默认需要移除的敏感字段（完全删除）
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

// 默认需要遮蔽的字段（部分隐藏，如 email → t***@e***.com）
const MASK_FIELDS = ['email', 'phone'];

/**
 * 遮蔽邮箱：test@example.com → t***@e***.com
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
 * 遮蔽手机号：13812345678 → 138****5678
 */
function maskPhone(phone) {
  if (typeof phone !== 'string' || phone.length < 7) return phone;
  return phone.slice(0, 3) + '****' + phone.slice(-4);
}

/**
 * 递归净化响应数据
 * @param {*} data
 * @param {Object} [opts]
 * @param {string[]} [opts.fields]        额外移除的字段
 * @param {boolean} [opts.mask=true]     是否遮蔽 email/phone
 * @param {boolean} [opts.removePassword=true] 是否移除密码字段
 * @returns {*}
 */
function sanitizeResponse(data, opts = {}) {
  const {
    fields = [],
    mask = false, // 默认不遮蔽 email/phone，避免破坏登录响应（前端需要完整 email）
    removePassword = true,
  } = opts;

  const removeSet = new Set(removePassword ? [...REMOVE_FIELDS, ...fields] : fields);

  if (data === null || data === undefined) return data;
  if (typeof data !== 'object') return data;

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeResponse(item, opts));
  }

  const result = {};
  for (const key of Object.keys(data)) {
    if (removeSet.has(key)) continue;

    let value = data[key];

    if (mask && key === 'email' && typeof value === 'string') {
      value = maskEmail(value);
    } else if (mask && key === 'phone' && typeof value === 'string') {
      value = maskPhone(value);
    } else {
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
