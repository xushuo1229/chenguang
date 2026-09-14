/**
 * 知行 · 鉴权工具与中间件 (JWT + bcrypt)
 * ============================================================
 * 【给初学者的说明】
 *
 * 一、什么是 JWT（JSON Web Token）？
 *    JWT 是一种"令牌"，用于证明"我是谁"。
 *
 *    工作流程：
 *    1. 用户登录成功 → 服务器生成一个 JWT 令牌，返回给前端
 *    2. 前端把令牌存起来（localStorage 或 Cookie）
 *    3. 以后每次请求，前端在 Authorization 头里带上令牌：
 *       Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 *    4. 服务器收到请求，验证令牌是否合法
 *    5. 合法 → 知道是谁在请求，继续处理
 *       非法/过期 → 拒绝请求，返回 401
 *
 *    JWT 令牌的结构（三部分用 . 分隔）：
 *    - Header：算法信息（如 HS256）
 *    - Payload：用户信息（如 { uid: 1, email: "test@example.com" }）
 *    - Signature：签名（防止篡改）
 *
 * 二、什么是 bcrypt？
 *    bcrypt 是一种"密码哈希"算法，用于安全地存储密码。
 *
 *    为什么不能存明文密码？
 *    如果数据库泄露，攻击者能看到所有用户的明文密码！
 *
 *    bcrypt 的特点：
 *    - 同一个密码，每次哈希结果都不同（加了随机"盐"）
 *    - 哈希速度很慢（故意设计的，防止暴力破解）
 *    - 只能单向计算（不能从哈希值反推出密码）
 *
 *    我们把 bcrypt 放在线程池（worker thread）里执行，
 *    因为它计算很慢，放在主线程会阻塞其他请求。
 *
 * 三、滑动续期（Sliding Renewal）
 *    令牌有过期时间（如 30 天），但我们不想让用户突然被踢出。
 *    所以当令牌使用超过 7 天时，服务器会在响应头里返回一个新的令牌。
 *    前端自动替换旧令牌 → 用户无感续期。
 * ============================================================
 */
const jwt = require('jsonwebtoken');
const config = require('../config/env');
const ApiError = require('../utils/ApiError');
const hashPool = require('../utils/hashPool');

// 令牌签发超过该天数后，在响应头下发续期令牌
// 例如：7 天后使用，服务器会返回新令牌
const RENEW_AFTER_DAYS = 7;

/**
 * 密码哈希（线程池异步执行）
 *
 * 把明文密码转换成不可逆的哈希值。
 * 例如：密码 "123456" → "$2a$10$N9qo8uLOickgx2ZMRZoMy..."
 *
 * @param {string} plain 明文密码
 * @returns {Promise<string>} bcrypt 哈希值
 */
async function hashPassword(plain) {
  return hashPool.hash(plain, config.bcryptRounds);
}

/**
 * 校验密码与哈希（线程池异步执行）
 *
 * 比较用户输入的密码和数据库中存储的哈希值是否匹配。
 * 注意：不是简单的字符串比较，bcrypt 会重新计算哈希再对比。
 *
 * @param {string} plain 用户输入的明文密码
 * @param {string} hash 数据库中存储的哈希值
 * @returns {Promise<boolean>} 密码是否匹配
 */
async function verifyPassword(plain, hash) {
  return hashPool.compare(plain, hash);
}

/**
 * 签发 JWT 令牌
 *
 * 把用户信息打包成一个加密的字符串（令牌）。
 * 这个令牌可以安全地在网络上传输，任何人无法篡改。
 *
 * @param {Object} user 用户对象，必须包含 id 和 email
 * @returns {string} JWT 令牌字符串
 */
function signToken(user) {
  return jwt.sign(
    { uid: user.id, email: user.email },  // Payload：存入令牌的用户信息
    config.jwtSecret,                      // 密钥：用于签名，不能泄露
    { expiresIn: config.jwtExpiresIn }     // 过期时间：如 30d（30 天）
  );
}

/**
 * 校验 token，失败返回 null（不抛错，由调用方处理）
 *
 * 验证令牌是否合法、是否过期、签名是否正确。
 * 如果一切正常，返回解码后的用户信息。
 *
 * @param {string} token JWT 令牌字符串
 * @returns {Object|null} 解码后的用户信息，或 null（验证失败）
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, config.jwtSecret);
  } catch (_) {
    // 令牌过期、签名错误、格式错误等都会返回 null
    return null;
  }
}

/**
 * Express 中间件：校验 Authorization: Bearer <token>
 *
 * 工作流程：
 * 1. 从请求头中提取 Authorization 字段
 * 2. 解析出 Bearer 后面的 token
 * 3. 验证 token 是否合法
 * 4. 合法 → 把用户 ID 注入 req.userId，交给下一个中间件
 *    非法 → 抛出 401 错误
 * 5. 滑动续期：如果令牌已使用超过 7 天，在响应头返回新令牌
 *
 * @param {Object} req Express 请求对象
 * @param {Object} res Express 响应对象
 * @param {Function} next 下一个中间件
 */
function authRequired(req, res, next) {
  // 从请求头获取 Authorization 字段
  const header = req.headers['authorization'] || '';
  // 用正则提取 Bearer 后面的 token
  // 例如 "Bearer eyJhbGci..." → 匹配出 "eyJhbGci..."
  const m = header.match(/^Bearer\s+(.+)$/i);
  if (!m) {
    throw ApiError.unauthorized('UNAUTHORIZED', '未登录或令牌缺失');
  }

  // 验证 token
  const decoded = verifyToken(m[1]);
  if (!decoded) {
    throw ApiError.unauthorized('TOKEN_INVALID', '令牌无效或已过期');
  }

  // 验证成功：把用户 ID 注入请求对象，后续中间件/路由可以通过 req.userId 获取
  req.userId = decoded.uid;

  // 滑动续期：只对超过阈值的老令牌下发新令牌，避免每次请求都签发
  // decoded.iat 是令牌签发时间（issued at）
  if (decoded.iat) {
    const ageDays = (Date.now() / 1000 - decoded.iat) / 86400; // 计算令牌已存在多少天
    if (ageDays > RENEW_AFTER_DAYS) {
      try {
        // 签发新令牌，通过响应头返回给前端
        res.setHeader('X-Renewed-Token', signToken({ id: decoded.uid, email: decoded.email }));
      } catch (_) { /* 续期失败不影响本次请求 */ }
    }
  }

  // 继续执行下一个中间件
  next();
}

module.exports = {
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  authRequired,
};
