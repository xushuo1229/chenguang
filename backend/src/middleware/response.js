/**
 * Zeno · 统一响应中间件
 * ============================================================
 * 【给初学者的说明】
 *
 * 一、什么是统一响应格式？
 *    为了让前端更容易处理响应，我们约定所有 API 响应都用统一的格式：
 *
 *    成功响应：
 *    {
 *      "data": { ... }        // 响应数据
 *    }
 *
 *    带分页的成功响应：
 *    {
 *      "data": [ ... ],
 *      "meta": { "page": 1, "total": 100 }  // 分页信息
 *    }
 *
 *    失败响应：
 *    {
 *      "error": {
 *        "code": "USER_NOT_FOUND",
 *        "message": "用户不存在"
 *      }
 *    }
 *
 *    这样前端就知道：
 *    - 有 data 字段 → 成功了，直接用 data
 *    - 有 error 字段 → 失败了，根据 error.code 做处理
 *
 * 二、res.success 和 res.fail 是什么？
 *    我们给每个响应对象 res 添加了两个"快捷方法"：
 *
 *    res.success(data)  → 返回成功响应 { data: ... }
 *    res.fail(status, code, message) → 返回失败响应
 *
 *    这样路由代码更简洁：
 *    res.success(rows)           // 而不是 res.json({ data: rows })
 *    res.fail(404, 'NOT_FOUND') // 而不是 res.status(404).json({ error: ... })
 *
 * 三、自动脱敏（sanitizeResponse）
 *    即使代码里不小心返回了敏感字段（如 password_hash），
 *    sanitizeResponse 会自动把它们移除，防止密码泄露给前端。
 * ============================================================
 */
const sanitizeResponse = require('../utils/sanitizeResponse');

/**
 * 统一响应中间件
 *
 * 给 res 对象挂载 res.success 和 res.fail 方法，
 * 然后调用 next() 继续执行后续中间件。
 */
function responseEnhancer(req, res, next) {
  /**
   * 成功响应
   *
   * @param {*} data 响应数据（会自动脱敏，移除敏感字段）
   * @param {Object} [meta] 分页等元信息（可选）
   *
   * 示例：
   *   res.success({ name: "张三" })          → { data: { name: "张三" } }
   *   res.success(rows, { page: 1 })         → { data: [...], meta: { page: 1 } }
   */
  res.success = (data, meta) => {
    // 先对数据进行脱敏（移除 password_hash 等敏感字段）
    const cleaned = sanitizeResponse(data);
    // 如果有 meta（分页信息），一起返回
    const body = meta ? { data: cleaned, meta } : { data: cleaned };
    res.json(body);
  };

  /**
   * 失败响应
   *
   * 一般直接 throw ApiError，由 error 中间件处理（更方便）。
   * 这个方法作为兜底，用于不 throw 的场景。
   *
   * @param {number} status HTTP 状态码（如 400、401、404）
   * @param {string} code 业务错误码（如 INVALID_CREDENTIALS）
   * @param {string} message 错误描述（显示给用户看的）
   *
   * 示例：
   *   res.fail(404, 'NOT_FOUND', '用户不存在')
   */
  res.fail = (status, code, message) => {
    res.status(status).json({ error: { code, message } });
  };

  // 继续执行下一个中间件
  next();
}

module.exports = responseEnhancer;
