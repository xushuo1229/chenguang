/**
 * JWT 工具
 * - sign:   登录/注册成功后签发 token
 * - verify: auth 中间件校验 token
 *
 * payload 约定:
 *   { sub: <user_id>, email: <user_email> }
 */
const jwt = require('jsonwebtoken');
const config = require('../config/env');

/**
 * 签发 JWT
 * @param {Object} payload - 载荷 (通常 { sub, email })
 * @returns {string} token
 */
function sign(payload) {
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
}

/**
 * 校验 JWT
 * @param {string} token - 客户端传来的 token
 * @returns {Object} 解码后的 payload
 * @throws {jwt.TokenExpiredError} token 过期
 * @throws {jwt.JsonWebTokenError} token 无效
 */
function verify(token) {
  return jwt.verify(token, config.jwtSecret);
}

module.exports = { sign, verify };
