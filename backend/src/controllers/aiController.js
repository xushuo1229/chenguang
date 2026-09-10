/**
 * 晨光自律台 · AI 助手控制器
 * ============================================================
 * 【职责】
 * 从请求中提取对话消息，转发给 aiService 调用大模型，返回回复。
 * 错误通过 next(err) 交给 Express 错误处理中间件。
 *
 * 响应体格式：{ data: { reply, model } }（与 syncController 一致）
 */
const aiService = require('../services/aiService');

exports.chat = async (req, res, next) => {
  try {
    const { messages } = req.body || {};
    const result = await aiService.chat(messages);
    res.success(result);
  } catch (err) {
    next(err);
  }
};