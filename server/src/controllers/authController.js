/**
 * 认证控制器
 * - register:  用户注册 (BCrypt 哈希 + 签发 token)
 * - login:     用户登录 (比对密码 + 签发 token)
 * - me:        获取当前用户信息
 * - updateMe:  更新当前用户资料
 *
 * 约定: 通过 wrapAsync 包装后挂载到路由, 错误自动交给 next(err)
 */
const userModel = require('../models/userModel');
const passwordUtil = require('../utils/password');
const jwtUtil = require('../utils/jwt');
const ApiError = require('../utils/ApiError');

/**
 * 注册新用户
 * POST /api/auth/register
 * body: { email, password, nickname }
 */
exports.register = async (req, res) => {
  const { email, password, nickname } = req.body;

  // 哈希密码 (BCrypt, 自动加 salt)
  const passwordHash = await passwordUtil.hash(password);

  // 写入数据库 (邮箱冲突由 model 抛 409)
  const user = await userModel.create({ email, passwordHash, nickname });

  // 注册即签发 token, 减少一次登录往返
  const token = jwtUtil.sign({ sub: user.id, email: user.email });

  res.status(201).json({ token, user });
};

/**
 * 用户登录
 * POST /api/auth/login
 * body: { email, password }
 */
exports.login = async (req, res) => {
  const { email, password } = req.body;

  // 查用户 (含 password_hash, 用于比对)
  const user = await userModel.findByEmailWithPassword(email);
  if (!user) {
    // 邮箱不存在 - 用统一错误信息, 防止用户枚举攻击
    throw ApiError.unauthorized('邮箱或密码错误');
  }

  // 比对密码
  const ok = await passwordUtil.compare(password, user.password_hash);
  if (!ok) {
    throw ApiError.unauthorized('邮箱或密码错误');
  }

  // 异步刷新登录时间, 不阻塞响应 (失败仅告警, 不影响登录)
  userModel.touchLastLogin(user.id).catch((e) => {
    console.warn('[auth] 刷新 last_login_at 失败:', e.message);
  });

  // 签发 token
  const token = jwtUtil.sign({ sub: user.id, email: user.email });

  // 响应体不包含 password_hash
  const safeUser = {
    id: user.id,
    email: user.email,
    nickname: user.nickname,
    avatar_url: user.avatar_url,
    created_at: user.created_at,
  };

  res.json({ token, user: safeUser });
};

/**
 * 获取当前登录用户信息
 * GET /api/auth/me  (需登录)
 */
exports.me = async (req, res) => {
  // req.user 由 auth() 中间件注入
  const user = await userModel.findById(req.user.id);
  if (!user) {
    throw ApiError.notFound('USER_NOT_FOUND', '用户不存在');
  }
  res.json({ user });
};

/**
 * 更新当前登录用户资料
 * PUT /api/auth/me  (需登录)
 * body: { nickname?, avatar_url? }
 */
exports.updateMe = async (req, res) => {
  const { nickname, avatar_url } = req.body;

  const user = await userModel.updateProfile(req.user.id, { nickname, avatar_url });
  if (!user) {
    throw ApiError.notFound('USER_NOT_FOUND', '用户不存在');
  }
  res.json({ user });
};
