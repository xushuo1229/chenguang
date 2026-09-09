/**
 * 日期范围解析工具
 * ----------------------------------------------------------
 * 从 req.query 解析 from / to (YYYY-MM-DD), 用于日期范围筛选
 *
 * - 支持单边 (只 from 或只 to)
 * - to 默认包含当天 (扩展到 23:59:59.999 UTC)
 * - 校验格式 + from 不能晚于 to
 *
 * 用法:
 *   const { from, to, errors } = parseDateRange(req.query);
 *   if (errors.length) throw ApiError.badRequest('DATE_RANGE_INVALID', errors.join('; '));
 *   // from/to 为 null 表示未限制
 */

/**
 * 校验 YYYY-MM-DD 格式且为合法日期
 * @param {string} s
 * @returns {boolean}
 */
function isValidDate(s) {
  if (typeof s !== 'string') return false;
  // 必须严格匹配 YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00.000Z');
  return !isNaN(d.getTime());
}

/**
 * 解析日期范围
 * @param {Object} query - req.query
 * @returns {{ from: Date|null, to: Date|null, errors: string[] }}
 */
function parseDateRange(query = {}) {
  const errors = [];
  let from = null;
  let to = null;

  if (query.from) {
    if (!isValidDate(query.from)) {
      errors.push('from 必须为 YYYY-MM-DD 格式');
    } else {
      // 从当天 00:00:00 UTC 开始
      from = new Date(query.from + 'T00:00:00.000Z');
    }
  }

  if (query.to) {
    if (!isValidDate(query.to)) {
      errors.push('to 必须为 YYYY-MM-DD 格式');
    } else {
      // 到当天 23:59:59.999 UTC 结束 (包含当天)
      to = new Date(query.to + 'T23:59:59.999Z');
    }
  }

  if (from && to && from > to) {
    errors.push('from 不能晚于 to');
  }

  return { from, to, errors };
}

module.exports = { parseDateRange, isValidDate };
