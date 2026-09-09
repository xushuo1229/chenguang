/**
 * 晨光自律台 · 统一业务错误类
 * ------------------------------------------------------------
 * 用于在 service/controller 层抛出结构化错误，由 error 中间件统一捕获
 *
 * 使用示例：
 *   throw ApiError.conflict('EMAIL_EXISTS', '该邮箱已注册');
 *   throw ApiError.badRequest('WEAK_PASSWORD', '密码至少 6 位');
 */
class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code || 'UNKNOWN_ERROR';
  }

  static badRequest(code, message) {
    return new ApiError(400, code, message);
  }

  static unauthorized(code, message) {
    return new ApiError(401, code, message);
  }

  static forbidden(code, message) {
    return new ApiError(403, code, message);
  }

  static notFound(code, message) {
    return new ApiError(404, code, message);
  }

  static conflict(code, message) {
    return new ApiError(409, code, message);
  }

  static internal(code, message) {
    return new ApiError(500, code, message);
  }
}

module.exports = ApiError;
