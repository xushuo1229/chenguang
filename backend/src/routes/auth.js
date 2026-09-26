/**
 * Zeno · 认证路由
 * ============================================================
 * 【文件职责】
 * 这个文件定义了所有与"用户认证"相关的 API 路由。
 * 包括：注册、登录、获取当前用户信息、更新个人资料。
 *
 * 【挂载路径】
 * 在 routes/index.js 中：router.use('/auth', auth)
 * 所以这里的 /register 实际对应 /api/auth/register
 *
 * 【各接口说明】
 *
 * 1. POST /api/auth/register（注册）
 *    - 前端发送：用户名 + 密码
 *    - 后端处理：校验用户名是否重复 → 加密密码 → 存入数据库 → 返回 token
 *    - authLimiter：限制注册频率，防止恶意批量注册
 *
 * 2. POST /api/auth/login（登录）
 *    - 前端发送：用户名 + 密码
 *    - 后端处理：查找用户 → 校验密码 → 生成 JWT token → 返回给前端
 *    - authLimiter：限制登录频率，防止暴力破解密码
 *
 * 3. GET /api/auth/me（获取当前用户）
 *    - 前端发送：请求头携带 token
 *    - 后端处理：解析 token → 找到用户 → 返回用户信息（不含密码）
 *    - authRequired：必须登录才能访问，未登录返回 401
 *
 * 4. PUT /api/auth/me（更新个人资料）
 *    - 前端发送：要更新的字段 + token
 *    - 后端处理：解析 token → 更新数据库中的用户信息
 *    - authRequired + writeLimiter：需要登录，且限制更新频率
 *
 * 【与其他文件的关系】
 * - routes/index.js：引入本文件，挂载到 /auth 路径
 * - controllers/authController.js：具体的业务处理逻辑（注册/登录/查询/更新）
 * - middleware/rateLimit.js：authLimiter 和 writeLimiter 限流中间件
 * - middleware/auth.js：authRequired 中间件，验证 JWT token
 */
const router = require('express').Router();
const ctrl = require('../controllers/authController');
const { authLimiter, writeLimiter } = require('../middleware/rateLimit');
const { authRequired } = require('../middleware/auth');

// POST /register → 注册新用户
// authLimiter：限制注册频率（比如每分钟最多 5 次），防止恶意注册
router.post('/register', authLimiter, ctrl.register);

// POST /login → 用户登录
// authLimiter：限制登录频率（比如每分钟最多 5 次），防止暴力破解
router.post('/login',    authLimiter, ctrl.login);

// GET /me → 获取当前登录用户的信息
// authRequired：必须在请求头中携带有效的 JWT token
router.get ('/me',       authRequired, ctrl.getMe);

// PUT /me → 更新当前用户的个人资料
// authRequired：必须登录
// writeLimiter：限制更新频率，防止恶意频繁修改
router.put ('/me',       authRequired, writeLimiter, ctrl.updateMe);

module.exports = router;
