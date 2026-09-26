/**
 * Zeno · Provider Adapter —— OpenAI 兼容实现
 * ============================================================
 * 【职责】
 * 把「发一条对话给大模型」这件事收敛到一个纯函数里：
 *
 *   chatCompletion({ messages, baseUrl, apiKey, model, timeoutMs })
 *     → { reply, model, provider }
 *
 * DeepSeek / Moonshot / 硅基流动等 OpenAI 兼容服务都走这里；
 * 以后接非 OpenAI 协议的 Provider 时，在 providers/ 下新增适配器并在
 * index.js 注册即可，aiService 与路由层完全不用改。
 *
 * 【安全设计】
 * - apiKey 只从服务端 config 传入本函数，绝不写日志、绝不进返回值。
 * - 上游错误只透出 HTTP 状态码，不透出原始响应体（可能含密钥信息）。
 * - 超时用 AbortController，防止上游无响应拖垮 Express worker。
 * ============================================================
 */
'use strict';

const ApiError = require('../../utils/ApiError');

/**
 * 调用 OpenAI 兼容的 /chat/completions 接口
 *
 * @param {Object} p
 * @param {Array}  p.messages  [{ role, content }]
 * @param {string} p.baseUrl   OpenAI 兼容基址（如 https://api.deepseek.com/v1）
 * @param {string} p.apiKey    服务端密钥（不下发、不记录）
 * @param {string} p.model     模型名
 * @param {number} [p.timeoutMs] 超时毫秒数
 * @returns {Promise<{ reply: string, model: string, provider: string }>}
 */
async function chatCompletion(p) {
  const messages = p && Array.isArray(p.messages) ? p.messages : [];
  const baseUrl = String((p && p.baseUrl) || '').replace(/\/+$/, '');
  const apiKey = (p && p.apiKey) || '';
  const model = (p && p.model) || '';
  const timeoutMs = (p && p.timeoutMs) || 30000;
  const maxTokens = Number(p && p.maxTokens);
  // Phase 27.6.3 附加式扩展：仅当调用方显式传入有限温度时才进请求体
  //（AI Coach 从不传 → 行为不变；Agent Provider 传低温度以稳定解释输出）
  const temperature = Number(p && p.temperature);
  const hasTemperature = Number.isFinite(temperature) && temperature > 0 && temperature < 2;

  if (!apiKey) throw ApiError.internal('AI_NOT_CONFIGURED', 'AI 服务未配置，请稍后再试');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(baseUrl + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
      },
      body: JSON.stringify(
        maxTokens > 0
          ? (hasTemperature
            ? { model, messages, max_tokens: maxTokens, temperature }
            : { model, messages, max_tokens: maxTokens })
          : (hasTemperature
            ? { model, messages, temperature }
            : { model, messages })
      ),
      signal: controller.signal,
    });

    if (!res.ok) {
      // 只透出状态码与可信的错误分类，绝不透出上游响应体（其中可能包含密钥/内部信息）
      let upstreamCode = '';
      try {
        const body = await res.text();
        const parsed = JSON.parse(body);
        if (parsed && typeof parsed.error === 'object' && typeof parsed.error.code === 'string') {
          upstreamCode = parsed.error.code;
        }
      } catch (_) { /* 非 JSON 或空 → 按状态码兜底 */ }

      const http = Number(res.status) || 0;
      // 诊断细节只进服务端日志；用户文案统一人话（绝不出现 .env/后端/API Key 等运维语言，
      // 这些消息会经前端 4xx 透传路径直达学生用户——Hardening 零运维语言标准）
      console.warn('[AI] 上游错误分类:', http, upstreamCode || '(无错误码)');
      if (/ModelNotOpen|not.*activated|model.*not.*open/i.test(upstreamCode)) {
        throw ApiError.internal('AI_MODEL_NOT_OPEN', 'Learning Agent暂时不可用，请稍后再试。');
      }
      if (/InvalidEndpoint|NotFound|ModelNotFound|UnsupportedModel/i.test(upstreamCode)) {
        throw ApiError.internal('AI_MODEL_NOT_FOUND', 'Learning Agent暂时不可用，请稍后再试。');
      }
      // 认证失败：绝不知晓密钥内容，也绝不透出（只按统一不可用处理）
      if (http === 401 || http === 403 || /Unauthorized|InvalidApiKey|AuthError/i.test(upstreamCode)) {
        throw ApiError.internal('AI_UNAUTHORIZED', 'Learning Agent暂时不可用，请稍后再试。');
      }
      // 其余上游错误：统一兜底，不透出任何细节
      // Phase 27.6.3 附加式扩展：err.upstreamStatus 仅挂在错误实例上供服务端
      // Provider 层做 429 精确分类；middleware/error.js 只序列化 code/message/details，
      // 该属性绝不进入 API 响应。
      const upstreamError = ApiError.internal('AI_UPSTREAM_ERROR', `AI 服务暂时不可用（HTTP ${http}）`);
      upstreamError.upstreamStatus = http;
      throw upstreamError;
    }

    const data = await res.json();
    const reply = data && data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content
      : '';
    if (!reply || typeof reply !== 'string') {
      throw ApiError.internal('AI_EMPTY_REPLY', 'AI 服务没有返回有效内容');
    }

    return { reply, model, provider: 'openaiCompatible' };
  } catch (err) {
    if (err && (err.name === 'AbortError' || err.code === 'ESOCKETTIMEDOUT')) {
      throw ApiError.internal('AI_TIMEOUT', 'AI 请求超时，请稍后再试');
    }
    if (err instanceof TypeError) {
      throw ApiError.internal('AI_NETWORK_ERROR', '无法连接 AI 服务');
    }
    if (err && err.name === 'ApiError') throw err;
    throw ApiError.internal('AI_UNKNOWN_ERROR', 'AI 服务异常，请稍后再试');
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { name: 'openaiCompatible', chatCompletion };
