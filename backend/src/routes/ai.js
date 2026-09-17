/**
 * 知行 · AI 助手路由
 * ============================================================
 * 【文件职责】
 * 定义 AI 助手相关的 API 路由。当前只有一个对话接口：
 * POST /api/ai/chat —— 把用户消息转发给大模型，返回回复。
 *
 * 【安全设计】
 * - authRequired：必须登录才能调用，防止未授权用户消耗额度。
 * - aiLimiter：限流（每分钟 15 次），防止被刷爆接口。
 *
 * 【与其他文件的关系】
 * - routes/index.js：引入本文件，挂载到 /ai 路径
 * - controllers/aiController.js：对话业务处理
 * - middleware/auth.js：authRequired 中间件
 * - middleware/rateLimit.js：aiLimiter 限流
 */
const router = require('express').Router();
const ctrl = require('../controllers/aiController');
const aiService = require('../services/aiService');
const feedbackService = require('../services/aiReflectionFeedbackService');
const reflectionContextSource = require('../services/reflectionContextSource');
const { aiLimiter } = require('../middleware/rateLimit');
const { authRequired } = require('../middleware/auth');

// POST /api/ai/chat → AI 对话
// 请求体：{ messages: [{ role, content }, ...] }
// 响应体：{ data: { reply, model } }
router.post('/chat', authRequired, aiLimiter, ctrl.chat);

// POST /api/ai/reflection → AI Daily Reflection
  // 请求体：{ context?: { userNote?: string } }
  // Reflection 系统事实由 user_data 在服务端派生；客户端 context 不是事实来源。
  // 响应体：{ data: { reflection }, meta: { contextVersion, model } }
router.post('/reflection', authRequired, aiLimiter, async (req, res, next) => {
  try {
    const growthContext = await reflectionContextSource.buildAuthoritativeReflectionContext({
      userId: req.userId,
    });
    const result = await aiService.dailyReflection({ growthContext, userId: req.userId });
    const reflectionId = await feedbackService.recordReflectionGeneration(req.userId);
    res.success({ reflection: result.reflection, reflectionId }, {
      contextVersion: result.contextVersion,
      model: result.model,
      contextSource: 'authenticated-authoritative',
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/ai/reflection/feedback → 用户对 Reflection 的二值反馈
// 只保存归属、ID、rating、时间；不保存 Reflection 内容或 GrowthContext。
router.post('/reflection/feedback', authRequired, aiLimiter, async (req, res, next) => {
  try {
    const { reflectionId, rating } = req.body || {};
    await feedbackService.submitReflectionFeedback({ userId: req.userId, reflectionId, rating });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
