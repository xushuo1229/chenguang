/**
 * 晨光自律台 · 认证控制器
 * ============================================================
 * 【给初者的说明】
 *
 * 一、什么是控制器（Controller）？
 *    控制器是 MVC 架构中的"C"（Controller），
 *    它的职责是"HTTP 适配层"——负责：
 *    1. 从 HTTP 请求（req）中提取参数
 *    2. 调用服务层（service）执行业务逻辑
 *    3. 把结果通过 HTTP 响应（res）返回给前端
 *
 *    控制器不应该包含业务逻辑，它只是"传话的"。
 *    业务逻辑放在 service 层，这样可以复用、测试。
 *
 * 二、响应格式约定
 *    注册/登录 → { token, user }  （扁平结构，不包在 { data } 里）
 *    getMe/updateMe → { user }
 *
 *    为什么不用 res.success（{ data: ... }）？
 *    因为前端的 authService.js 依赖这个格式：
 *    const { token, user } = await api.post('/auth/login', ...)
 *    如果包一层 data，前端就要写 const { data: { token, user } }，不直观。
 *
 * 三、async/next(err) 模式
 *    注册/登录是 async 函数（因为 bcrypt 在线程池异步执行）。
 *    如果出错，catch 块调用 next(err)，把错误交给错误处理中间件。
 *    这样不需要在每个控制器里都写详细的错误处理代码。
 * ============================================================
 */
const authService = require('../services/authService');

/**
 * 用户注册
 *
 * 请求体：{ email, nickname?, password }
 * 响应体：{ token, user }
 *
 * 流程：
 * 1. 从 req.body 提取邮箱、昵称、密码
 * 2. 调用 authService.register 执行注册逻辑
 * 3. 返回 JWT 令牌和用户信息
 */
exports.register = async (req, res, next) => {
  try {
    const { email, nickname, password } = req.body || {};
    const result = await authService.register({ email, nickname, password });
    res.json(result); // { token, user }
  } catch (err) {
    next(err); // 错误交给错误处理中间件
  }
};

/**
 * 用户登录
 *
 * 请求体：{ email, password }
 * 响应体：{ token, user }
 *
 * 流程：
 * 1. 从 req.body 提取邮箱和密码
 * 2. 调用 authService.login 验证身份
 * 3. 返回 JWT 令牌和用户信息
 */
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    const result = await authService.login({ email, password });
    res.json(result); // { token, user }
  } catch (err) {
    next(err);
  }
};

/**
 * 获取当前用户资料
 *
 * 前提：请求必须通过 authRequired 中间件（req.userId 已注入）
 * 响应体：{ user }
 *
 * 流程：
 * 1. 从 req.userId 获取当前登录用户的 ID
 * 2. 调用 authService.getProfile 查询用户信息
 * 3. 返回用户资料（已移除敏感字段）
 */
exports.getMe = async (req, res, next) => {
  try {
    const user = await authService.getProfile(req.userId);
    res.json({ user });
  } catch (err) {
    next(err);
  }
};

/**
 * 更新当前用户资料
 *
 * 请求体：{ nickname?, avatar_url? }
 * 响应体：{ user }
 *
 * 流程：
 * 1. 从 req.body 提取要更新的字段
 * 2. 调用 authService.updateProfile 更新数据库
 * 3. 返回更新后的用户资料
 */
exports.updateMe = async (req, res, next) => {
  try {
    const { nickname, avatar_url } = req.body || {};
    const user = await authService.updateProfile(req.userId, { nickname, avatar_url });
    res.json({ user });
  } catch (err) {
    next(err);
  }
};
