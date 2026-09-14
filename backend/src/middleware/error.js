/**
 * 知行 · 错误处理中间件
 * ============================================================
 * 【给初学者的说明】
 *
 * 一、什么是集中式错误处理？
 *    在 Express 中，如果某个中间件或路由出错了（抛出异常），
 *    我们不需要在每个地方都写 try-catch。
 *    而是把错误 "throw" 出去，Express 会自动找到"错误处理中间件"，
 *    把错误交给它统一处理。
 *
 *    错误处理中间件的特征：有 4 个参数 (err, req, res, next)
 *    普通中间件只有 3 个参数 (req, res, next)
 *
 * 二、两种错误类型
 *    1. ApiError（业务错误）：
 *       - 由我们主动 throw 的，比如"用户不存在"、"密码错误"
 *       - 有明确的 HTTP 状态码（400/401/403/404/409）
 *       - 有业务错误码（如 INVALID_CREDENTIALS）
 *       - 前端可以根据 code 做对应处理
 *
 *    2. 未知错误（系统错误）：
 *       - 程序 bug、数据库连接失败等意外情况
 *       - 统一返回 500 Internal Server Error
 *       - 生产环境隐藏具体错误信息（安全考虑）
 *       - 开发环境显示错误详情（方便调试）
 *
 * 三、错误响应格式
 *    {
 *      "error": {
 *        "code": "INVALID_CREDENTIALS",
 *        "message": "邮箱或密码错误"
 *      }
 *    }
 *
 *    前端通过 code 判断错误类型，通过 message 显示给用户。
 * ============================================================
 */
const ApiError = require('../utils/ApiError');
const config = require('../config/env');

/**
 * 404 兜底中间件
 *
 * 如果请求到达这里，说明没有找到匹配的路由。
 * 比如用户访问了 /api/nonexistent，没有任何路由处理它。
 * 我们抛出一个 404 错误，交给错误处理中间件。
 *
 * 注意：这个中间件必须放在所有路由之后！
 */
function notFound(req, _res, next) {
  next(ApiError.notFound('NOT_FOUND', `路径不存在: ${req.method} ${req.path}`));
}

/**
 * 统一错误处理中间件
 *
 * 必须放在中间件链的最末尾，4 个参数签名是 Express 识别它的标志。
 *
 * 工作流程：
 * 1. 收到错误对象
 * 2. 判断是否是 ApiError（业务错误）
 *    - 是 → 用它的 status/code/message 返回响应
 *    - 否 → 当成系统错误，返回 500
 * 3. 生产环境隐藏系统错误详情（防止泄露服务器信息）
 */
function handler(err, _req, res, _next) {
  // ApiError：业务错误，按其声明的 status/code/message 响应
  if (err instanceof ApiError) {
    const errBody = { code: err.code, message: err.message };
    // 额外字段（如冲突时的 serverRevision / serverData）随错误一起返回，
    // 前端据它做防线式合并
    if (err.details) Object.assign(errBody, err.details);
    return res.status(err.status).json({ error: errBody });
  }

  // 未知错误：打印错误日志（方便服务器端排查），返回 500
  console.error('[error] 未捕获异常:', err);
  return res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      // 生产环境：隐藏具体错误信息（防止泄露服务器内部实现）
      // 开发环境：显示错误详情（方便调试）
      message: config.isProd ? '服务器内部错误' : (err.message || '服务器内部错误'),
    },
  });
}

module.exports = { notFound, handler };
