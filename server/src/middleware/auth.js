/**
 * JWT 鉴权中间件
 * - 从 Authorization: Bearer <token> 提取 token
 * - 校验并解码, 将 user 信息注入 req.user
 * - 失败抛 401 ApiError (由 error 中间件统一响应)
 *
 * 用法:
 *   router.get('/me', auth(), controller.me)
 *
 * @returns {import('express').RequestHandler}
 */
const { verify } = require('../utils/jwt');
const ApiError = require('../utils/ApiError');

function auth() {
  return (req, _res, next) => {
    try {
      const header = req.headers.authorization || '';
      const [scheme, token] = header.split(' ');

      // 必须使用 Bearer 方案
      if (scheme !== 'Bearer' || !token) {
        throw ApiError.unauthorized('请求未携带有效的 Authorization 头');
      }

      // 解码 JWT, 注入用户信息到 req.user
      const payload = verify(token);
      req.user = { id: payload.sub, email: payload.email };

      next();
    } catch (err) {
      // token 过期 → 提示重新登录
      if (err.name === 'TokenExpiredError') {
        return next(ApiError.unauthorized('登录已过期, 请重新登录'));
      }
      // token 无效 → 提示凭证错误
      if (err.name === 'JsonWebTokenError') {
        return next(ApiError.unauthorized('无效的登录凭证'));
      }
      // 其他 (含我们主动抛的 ApiError)
      return next(err);
    }
  };
}

module.exports = auth;
