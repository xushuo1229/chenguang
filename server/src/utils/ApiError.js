/**
 * 自定义 API 错误类
 * - 业务层抛出, 由 error 中间件统一捕获并响应
 * - isOperational=true 表示可预期的业务错误 (与 bug 区分)
 *
 * 使用:
 *   throw ApiError.conflict('EMAIL_TAKEN', '邮箱已注册');
 */
class ApiError extends Error {
  /**
   * @param {number} statusCode - HTTP 状态码
   * @param {string} code - 业务错误码 (UPPER_SNAKE_CASE)
   * @param {string} message - 用户可见的错误描述
   */
  constructor(statusCode, code, message) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }

  // 常用错误工厂方法
  static badRequest(code, message) {
    return new ApiError(400, code, message);
  }
  static unauthorized(message = '未登录或凭证无效') {
    return new ApiError(401, 'UNAUTHORIZED', message);
  }
  static forbidden(message = '无权访问') {
    return new ApiError(403, 'FORBIDDEN', message);
  }
  static notFound(code = 'NOT_FOUND', message = '资源不存在') {
    return new ApiError(404, code, message);
  }
  static conflict(code, message) {
    return new ApiError(409, code, message);
  }
  static unprocessable(code, message) {
    return new ApiError(422, code, message);
  }
  static internal(message = '服务器内部错误') {
    return new ApiError(500, 'INTERNAL', message);
  }
}

module.exports = ApiError;
