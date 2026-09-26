/**
 * Zeno · 轻量字段校验工具
 * ------------------------------------------------------------
 * 不引入 zod/joi，保持零额外依赖
 * 用法：requireField(body, 'email') 缺失则抛 ApiError
 */
const ApiError = require('./ApiError');

/**
 * 断言必填字段存在，否则抛 400
 * @param {Object} obj
 * @param {string[]} fields
 * @param {string} [msg]
 */
function requireFields(obj, fields, msg) {
  for (const f of fields) {
    if (obj[f] === undefined || obj[f] === null || obj[f] === '') {
      throw ApiError.badRequest('INVALID_INPUT', msg || `字段 ${f} 必填`);
    }
  }
}

/**
 * 断言字符串长度区间
 * @param {string} val
 * @param {number} min
 * @param {number} [max]
 * @param {string} [msg]
 */
function assertLength(val, min, max, msg) {
  if (typeof val !== 'string' || val.length < min || (max != null && val.length > max)) {
    throw ApiError.badRequest('INVALID_INPUT', msg || `长度需在 ${min}-${max || '?'} 之间`);
  }
}

/**
 * 简单邮箱格式校验
 * @param {string} email
 */
function assertEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!re.test(String(email || ''))) {
    throw ApiError.badRequest('INVALID_EMAIL', '邮箱格式不正确');
  }
}

/**
 * 密码强度校验：至少 8 位，包含大小写字母和数字
 * @param {string} pwd
 * @param {string} [msg]
 */
function assertPassword(pwd, msg) {
  if (typeof pwd !== 'string' || pwd.length < 8) {
    throw ApiError.badRequest('WEAK_PASSWORD', msg || '密码至少 8 位');
  }
  if (!/[a-z]/.test(pwd) || !/[A-Z]/.test(pwd) || !/[0-9]/.test(pwd)) {
    throw ApiError.badRequest('WEAK_PASSWORD', '密码需包含大小写字母和数字');
  }
}

module.exports = { requireFields, assertLength, assertEmail, assertPassword };
