/**
 * 知行 · AI Coach 控制器（Phase 13 AI 2.0）
 * ============================================================
 * 【职责】
 * 从请求中提取 { message, history, context, contextVersion }，
 * 转发给 aiService.coachChat()，返回教练回复。
 * 错误通过 next(err) 交给 Express 错误处理中间件。
 *
 * 响应体格式：{ data: { reply, mode:'coach', suggestions, actions, model } }
 * （与 syncController 一致的 { data } 包装约定）
 */
const aiService = require('../services/aiService');

exports.chat = async (req, res, next) => {
  try {
    const { message, history, context, contextVersion } = req.body || {};
    const result = await aiService.coachChat({ message, history, context, contextVersion });
    res.success(result);
  } catch (err) {
    next(err);
  }
};
