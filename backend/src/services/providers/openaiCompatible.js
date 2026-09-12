/**
 * 晨光自律台 · Provider Adapter —— OpenAI 兼容实现
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
      body: JSON.stringify({ model, messages }),
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
      // 模型相关配置错误：给用户可直接行动的中文文案（不暴露响应体）
      if (/ModelNotOpen|not.*activated|model.*not.*open/i.test(upstreamCode)) {
        throw ApiError.internal('AI_MODEL_NOT_OPEN', '当前模型未在模型服务商开通，请到控制台开通后重试');
      }
      if (/InvalidEndpoint|NotFound|ModelNotFound|UnsupportedModel/i.test(upstreamCode)) {
        throw ApiError.internal('AI_MODEL_NOT_FOUND', 'AI 模型配置不正确，请检查后端 .env 的 AI_MODEL / AI_BASE_URL');
      }
      // 认证失败：绝不知晓密钥内容，只引导检查配置
      if (http === 401 || http === 403 || /Unauthorized|InvalidApiKey|AuthError/i.test(upstreamCode)) {
        throw ApiError.internal('AI_UNAUTHORIZED', 'AI 服务鉴权失败，请检查后端的 API Key 与套餐权限');
      }
      // 其余上游错误：统一兜底，不透出任何细节
      throw ApiError.internal('AI_UPSTREAM_ERROR', `AI 服务暂时不可用（HTTP ${http}）`);
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
