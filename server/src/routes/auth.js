/**
 * 认证路由 /api/auth
 * - POST /register  注册
 * - POST /login     登录
 * - GET  /me        获取当前用户 (需鉴权)
 * - PUT  /me        更新当前用户 (需鉴权)
 *
 * 每个端点都经过 zod 校验 + (登录/注册) 限流防爆破
 */
const express = require('express');
const { z } = require('zod');
const authController = require('../controllers/authController');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const wrapAsync = require('../utils/wrapAsync');
const { authLimiter } = require('../middleware/rateLimit');

const router = express.Router();

// 入参 schema (zod)
const registerSchema = z.object({
  email: z.string().email('邮箱格式不正确'),
  password: z.string().min(6, '密码至少 6 位').max(72, '密码最多 72 位'),
  nickname: z.string().min(1, '昵称不能为空').max(20, '昵称最多 20 字'),
});

const loginSchema = z.object({
  email: z.string().email('邮箱格式不正确'),
  password: z.string().min(1, '密码不能为空'),
});

const updateSchema = z.object({
  nickname: z.string().min(1, '昵称不能为空').max(20, '昵称最多 20 字').optional(),
  avatar_url: z.string().url('头像 URL 不合法').optional(),
}).refine(
  (data) => data.nickname !== undefined || data.avatar_url !== undefined,
  { message: '至少提供 nickname 或 avatar_url 中的一个' }
);

// 注册 (限流防爆破)
router.post(
  '/register',
  authLimiter,
  validate({ body: registerSchema }),
  wrapAsync(authController.register)
);

// 登录 (限流防爆破)
router.post(
  '/login',
  authLimiter,
  validate({ body: loginSchema }),
  wrapAsync(authController.login)
);

// 获取当前用户 (需登录)
router.get('/me', auth(), wrapAsync(authController.me));

// 更新当前用户 (需登录)
router.put(
  '/me',
  auth(),
  validate({ body: updateSchema }),
  wrapAsync(authController.updateMe)
);

module.exports = router;
