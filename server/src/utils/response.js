/**
 * 统一成功响应工具
 * ----------------------------------------------------------
 * 通过 res.success(data, status?, meta?) 调用
 *
 * 成功响应格式:
 *   { data: <payload>, meta?: { pagination: { page, per_page, total, total_pages } } }
 *
 * 自动调用 sanitizeResponse 移除敏感字段 (password_hash 等)
 *
 * 错误格式由 error 中间件统一处理:
 *   { error: { code, message } }
 *
 * 挂载: app.use(require('./utils/response'))  (在路由前)
 */
const sanitizeResponse = require('./sanitizeResponse');

/**
 * 给 res 对象附加 success 方法
 */
function attachResponseMethods(_req, res, next) {
  /**
   * 成功响应
   * @param {*} data - 响应数据 (自动移除敏感字段)
   * @param {number} [status=200] - HTTP 状态码
   * @param {Object} [meta] - 额外元信息 (如 { pagination })
   * @param {Object} [sanitizeOpts] - 净化配置 (传 { mask: false } 关闭遮蔽)
   */
  res.success = function (data, status = 200, meta, sanitizeOpts = {}) {
    // 自动净化: 移除 password_hash 等, 不遮蔽 email (用户自己的数据)
    const cleanData = sanitizeResponse(data, { mask: false, ...sanitizeOpts });
    const body = { data: cleanData };
    if (meta) body.meta = meta;
    return res.status(status).json(body);
  };
  next();
}

module.exports = attachResponseMethods;
