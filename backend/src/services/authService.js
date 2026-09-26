/**
 * Zeno · 认证业务逻辑层
 * ============================================================
 * 【给初学者的说明】
 *
 * 一、什么是 Service（服务层）？
 *    Service 层负责"业务逻辑"——具体的规则和流程。
 *    它不关心 HTTP 请求/响应，只关心"输入 → 处理 → 输出"。
 *
 *    比如登录逻辑：
 *    1. 校验邮箱和密码是否为空
 *    2. 查找用户是否存在
 *    3. 比对密码哈希
 *    4. 生成 JWT 令牌
 *    5. 返回令牌和用户信息
 *
 *    这些步骤与 HTTP 无关，放在 Service 层可以复用和测试。
 *    Controller 层只负责"从 req 提取参数 → 调用 Service → 返回 res"。
 *
 * 二、密码安全
 *    - 密码用 bcrypt 哈希后存储（不可逆）
 *    - 返回用户信息时，用 toPublic() 移除 password_hash 字段
 *    - 登录失败时，无论用户是否存在，都返回相同错误信息
 *      （防止攻击者通过错误信息判断"哪个邮箱已注册"）
 *
 * 三、计时攻击防护（Timing Attack）
 *    攻击者可以通过"响应时间"判断用户是否存在：
 *    - 用户不存在 → 响应很快（直接返回错误）
 *    - 用户存在 → 响应较慢（需要计算密码哈希）
 *
 *    防护方法：即使用户不存在，也执行一次假的哈希计算（DUMMY_HASH），
 *    让响应时间一致，攻击者无法通过时间差判断。
 * ============================================================
 */
const userModel = require('../db/userModel');
const bcryptjs = require('bcryptjs');
const { hashPassword, verifyPassword, signToken } = require('../middleware/auth');
const ApiError = require('../utils/ApiError');
const { requireFields, assertLength, assertEmail, assertPassword } = require('../utils/validator');

// 启动时生成一次，用于"用户不存在"时的空校验，抹平响应时间差
// 这是一个假的哈希值，永远不会被真正使用
// 但在用户不存在时，我们仍然执行一次哈希计算，
// 这样攻击者无法通过"响应时间长短"判断用户是否存在
const DUMMY_HASH = bcryptjs.hashSync('chenguang-timing-equalizer', 10);

/**
 * 转换为对外安全的用户对象（移除 password_hash）
 *
 * 数据库中的用户记录包含 password_hash，但我们绝对不能把它返回给前端。
 * 这个函数只保留安全的字段：id、email、nickname、头像、注册时间。
 *
 * @param {Object} u 数据库中的用户记录
 * @returns {Object} 安全的用户对象
 */
function toPublic(u) {
  return {
    id: u.id,
    email: u.email,
    nickname: u.nickname,
    avatar_url: u.avatar_url || '',
    created_at: u.created_at,
  };
}

/**
 * 用户注册
 *
 * 流程：
 * 1. 校验必填字段（邮箱、密码）
 * 2. 校验邮箱格式
 * 3. 校验密码强度
 * 4. 检查邮箱是否已被注册
 * 5. 对密码进行 bcrypt 哈希（在线程池异步执行）
 * 6. 创建用户记录
 * 7. 生成 JWT 令牌
 * 8. 返回令牌和用户信息
 *
 * @param {Object} param
 * @param {string} param.email 邮箱地址
 * @param {string} [param.nickname] 昵称（缺省取邮箱 @ 前的部分）
 * @param {string} param.password 密码
 * @returns {Promise<{ token: string, user: Object }>}
 */
async function register({ email, nickname, password }) {
  // 校验必填字段
  requireFields({ email, password }, ['email', 'password'], '邮箱和密码必填');
  // 校验邮箱格式
  assertEmail(email);
  // 校验密码强度
  assertPassword(password);

  // 检查邮箱是否已被注册
  if (await userModel.findUserByEmail(email)) {
    throw ApiError.conflict('EMAIL_EXISTS', '该邮箱已注册');
  }

  // 创建用户：密码先哈希再存储（明文密码绝不存入数据库）
  const user = await userModel.createUser({
    email,
    nickname: nickname || email.split('@')[0], // 没有昵称就用邮箱前缀
    passwordHash: await hashPassword(password),  // bcrypt 哈希（异步）
  });

  // 返回 JWT 令牌和用户信息（不含密码哈希）
  return { token: signToken(user), user: toPublic(user) };
}

/**
 * 用户登录
 *
 * 流程：
 * 1. 校验必填字段
 * 2. 根据邮箱查找用户
 * 3. 比对密码哈希
 * 4. 生成 JWT 令牌
 * 5. 返回令牌和用户信息
 *
 * 安全设计：
 * - 用户不存在和密码错误，返回完全相同的错误信息
 *   （防止攻击者通过错误信息判断"哪个邮箱已注册"）
 * - 用户不存在时也执行一次假的哈希计算
 *   （防止攻击者通过"响应时间"判断用户是否存在）
 *
 * @param {Object} param
 * @param {string} param.email 邮箱地址
 * @param {string} param.password 密码
 * @returns {Promise<{ token: string, user: Object }>}
 */
async function login({ email, password }) {
  requireFields({ email, password }, ['email', 'password'], '邮箱和密码必填');

  const user = await userModel.findUserByEmail(email);
  // 关键安全设计：用户不存在时也计算一次哈希，抹平响应时间差
  // 这样攻击者无法通过"响应快慢"判断用户是否存在
  const hashValue = user ? user.password_hash : DUMMY_HASH;
  const ok = await verifyPassword(password, hashValue);
  // 无论用户不存在还是密码错误，都返回相同错误信息
  if (!user || !ok) {
    throw ApiError.unauthorized('INVALID_CREDENTIALS', '邮箱或密码错误');
  }

  return { token: signToken(user), user: toPublic(user) };
}

/**
 * 获取当前用户资料
 *
 * @param {number} userId 用户 ID
 * @returns {Object} 安全的用户对象（不含密码哈希）
 */
async function getProfile(userId) {
  const user = await userModel.findUserById(userId);
  if (!user) {
    throw ApiError.notFound('USER_NOT_FOUND', '用户不存在');
  }
  return toPublic(user);
}

/**
 * 更新用户资料（昵称、头像）
 *
 * @param {number} userId 用户 ID
 * @param {Object} param
 * @param {string} [param.nickname] 新昵称
 * @param {string} [param.avatar_url] 新头像 URL
 * @returns {Object} 更新后的安全用户对象
 */
async function updateProfile(userId, { nickname, avatar_url }) {
  const user = await userModel.updateUserProfile(userId, {
    nickname,
    avatarUrl: avatar_url,
  });
  return toPublic(user);
}

module.exports = {
  register,
  login,
  getProfile,
  updateProfile,
  toPublic,
};
