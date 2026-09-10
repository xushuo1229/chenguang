/**
 * 晨光自律台 · API 路由聚合
 * ============================================================
 * 【文件职责】
 * 这个文件是所有 API 路由的"总调度中心"。
 * 它把各个子路由（认证、数据同步、AI 助手）统一挂载到 /api 路径下。
 *
 * 【挂载路径】
 * 在 app.js 中：app.use('/api', routes)
 * 所以这里的 /data 实际对应 /api/data
 *
 * 【接口一览】
 * - POST   /api/auth/register    注册
 * - POST   /api/auth/login       登录
 * - GET    /api/auth/me          当前用户
 * - PUT    /api/auth/me          更新资料
 * - GET    /api/data             拉取整份数据
 * - PUT    /api/data             回写整份数据
 * - POST   /api/ai/chat          AI 助手对话（OpenAI 兼容代理）
 * - GET    /api/health           健康检查（在 app.js 中）
 *
 * 【与其他文件的关系】
 * - app.js：引入本文件，挂载到 /api 路径
 * - auth.js：认证相关的子路由
 * - syncController.js：数据同步的处理逻辑
 * - ai.js：AI 助手路由
 * - middleware/auth.js：authRequired 中间件，检查用户是否登录
 * - middleware/rateLimit.js：writeLimiter / aiLimiter 中间件，限制写操作频率
 */
const express = require('express');
const router = express.Router();
const auth = require('./auth');
const syncCtrl = require('../controllers/syncController');
const ai = require('./ai');
const { authRequired } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/rateLimit');

// ===== 认证路由 =====
// /api/auth/* 的所有请求都交给 auth 子路由处理
// 认证路由不需要登录即可访问（登录本身就是获取登录状态的过程）
router.use('/auth', auth);

// ===== 整份数据同步 =====
// 这是"全量同步"接口：一次性获取/保存用户的所有数据
// authRequired：要求用户必须登录
// writeLimiter：限制写操作频率（PUT 请求会修改数据，需要限流保护）

// GET /api/data → 获取用户的整份数据（只读，不需要限流）
router.get('/data', authRequired, syncCtrl.getData);

// PUT /api/data → 保存用户的整份数据（写操作，需要限流）
router.put('/data', authRequired, writeLimiter, syncCtrl.saveData);

// ===== AI 助手 =====
// /api/ai/* 的所有请求都交给 ai 子路由处理
// 需要登录 + 限流（防止刷接口烧 token）
router.use('/ai', ai);

// ===== 课表导入 =====
// /api/course/* 的所有请求都交给 scheduleImport 子路由处理
// 内挂 POST /import（抓取并解析课表）
router.use('/course', require('./scheduleImport'));

module.exports = router;