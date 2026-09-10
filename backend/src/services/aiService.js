/**
 * 晨光自律台 · AI 助手业务逻辑层 (OpenAI 兼容代理)
 * ============================================================
 * 【职责】
 * 在后端把前端发来的对话消息转发给 OpenAI 兼容的大模型接口
 * （默认 DeepSeek，可通过 AI_BASE_URL / AI_MODEL 切换）。
 *
 * 【安全设计】
 * - API Key 只存在于服务端环境变量（config.aiApiKey），绝不下发浏览器。
 * - 请求需登录（routes/ai.js 挂载 authRequired）+ 限流（aiLimiter）。
 * - 对前端传入的 messages 做校验：数组、条数上限、role 白名单、长度上限，
 *   防止恶意构造请求内容。
 *
 * 【离线/未配置行为】
 * 未配置 AI_API_KEY 或上游请求失败时，抛出带状态码的 ApiError，
 * 前端捕获后回退本地友好提示（应用保持离线优先）。
 */
const config = require('../config/env');
const ApiError = require('../utils/ApiError');

// 允许的 role 白名单（防止注入非法角色）
const ALLOWED_ROLES = ['system', 'user', 'assistant'];

/**
 * 校验并规整前端传入的对话消息
 *
 * @param {Array} messages 前端传来的消息数组
 * @returns {Array} 规整后的消息数组 [{ role, content }]
 */
function validateMessages(messages) {
  if (!Array.isArray(messages)) {
    throw ApiError.badRequest('INVALID_MESSAGES', '消息格式不正确');
  }
  if (messages.length > config.aiMaxMessages) {
    throw ApiError.badRequest('TOO_MANY_MESSAGES', '对话消息过多，请开始新会话');
  }
  return messages.map((m) => {
    const role = m && m.role;
    if (!ALLOWED_ROLES.includes(role)) {
      throw ApiError.badRequest('INVALID_ROLE', '非法的消息角色');
    }
    const content = m.content;
    if (typeof content !== 'string' || !content.trim()) {
      throw ApiError.badRequest('INVALID_CONTENT', '消息内容不能为空');
    }
    if (content.length > config.aiMaxMsgLength) {
      throw ApiError.badRequest('CONTENT_TOO_LONG', '单条消息过长');
    }
    return { role, content: content.trim() };
  });
}

/**
 * 调用 OpenAI 兼容的 /chat/completions 接口
 *
 * @param {Array} messages 对话消息 [{ role, content }]
 * @returns {Promise<{ reply: string, model: string }>}
 */
async function chat(messages) {
  // 未配置 Key：直接报错，前端走离线兜底
  if (!config.aiApiKey) {
    throw ApiError.internal('AI_NOT_CONFIGURED', 'AI 服务未配置，请在后端环境变量设置 AI_API_KEY');
  }

  const clean = validateMessages(messages);

  // 用 AbortController 实现超时，防止上游长时间无响应阻塞请求
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.aiTimeoutMs);

  try {
    const url = config.aiBaseUrl.replace(/\/+$/, '') + '/chat/completions';
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + config.aiApiKey,
      },
      body: JSON.stringify({
        model: config.aiModel,
        messages: clean,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const upstream = await res.text().catch(() => '');
      throw ApiError.badRequest(
        'AI_UPSTREAM_ERROR',
        `AI 服务暂时不可用（HTTP ${res.status}）`
      );
    }

    const data = await res.json();
    const reply = data && data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content
      : '';

    if (!reply) {
      throw ApiError.internal('AI_EMPTY_REPLY', 'AI 服务没有返回有效内容');
    }

    return { reply, model: config.aiModel };
  } catch (err) {
    // AbortController 超时触发 AbortError
    if (err && (err.name === 'AbortError' || err.code === 'ESOCKETTIMEDOUT')) {
      throw ApiError.internal('AI_TIMEOUT', 'AI 请求超时，请稍后再试');
    }
    // 网络层错误（DNS / 拒绝连接等）
    if (err instanceof TypeError) {
      throw ApiError.internal('AI_NETWORK_ERROR', '无法连接 AI 服务');
    }
    // 已是 ApiError 则直接透传，否则转成通用内部错误
    if (err && err.name === 'ApiError') throw err;
    throw ApiError.internal('AI_UNKNOWN_ERROR', 'AI 服务异常，请稍后再试');
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  chat,
  validateMessages,
};