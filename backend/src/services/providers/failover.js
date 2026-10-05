/**
 * Zeno · AI 凭据故障转移
 * ============================================================
 * 在多组 OpenAI 兼容凭据（主 + AI_FALLBACK_*）之间按序尝试：
 * - 命中 429 / 401 / 403 / 5xx / 超时 / 网络错误 → 该 key 进入冷却，换下一 key。
 * - 404（模型不存在）等确定性错误也尝试下一凭据（可能是不同套餐）。
 * - 全部不可用 → 抛出最后一个错误，由上层给出友好兜底。
 * 不改变任何对外 API 契约；仅在服务端内部轮换密钥。
 */
'use strict';

const openaiCompatible = require('./openaiCompatible');
const config = require('../../config/env');
const ent = require('../../config/enterprise');

const cooldownUntil = new Map(); // apiKey -> epoch ms

function candidates() {
  const list = [];
  if (config.aiApiKey) {
    list.push({
      label: 'primary',
      apiKey: config.aiApiKey,
      baseUrl: config.aiBaseUrl,
      model: config.aiModel,
      timeoutMs: config.aiTimeoutMs,
    });
  }
  if (ent.aiFallback.apiKey) {
    list.push({
      label: 'fallback',
      apiKey: ent.aiFallback.apiKey,
      baseUrl: ent.aiFallback.baseUrl || config.aiBaseUrl,
      model: ent.aiFallback.model || config.aiModel,
      timeoutMs: config.aiTimeoutMs,
    });
  }
  return list;
}

function isRetryable(err) {
  if (!err) return false;
  const status = Number(err.upstreamStatus || err.status || 0);
  if ([401, 403, 404, 408, 429].includes(status) || status >= 500) return true;
  const code = String(err.code || '');
  return /AI_(UPSTREAM|UNAUTHORIZED|TIMEOUT|NETWORK|UNKNOWN|MODEL)/.test(code);
}

function cooldownMs(err) {
  const status = Number(err && (err.upstreamStatus || err.status) || 0);
  if (status === 429) return ent.aiQuotaCooldownMs;
  if (status === 401 || status === 403) return 5 * 60 * 1000;
  return 10 * 1000;
}

async function chatCompletionWithFailover(params) {
  const creds = candidates().filter((c) => {
    const until = cooldownUntil.get(c.apiKey) || 0;
    return until <= Date.now();
  });
  if (!creds.length) {
    const e = new Error('所有 AI 凭据暂时不可用（额度/鉴权），请稍后再试');
    e.code = 'AI_ALL_CREDENTIALS_COOLDOWN';
    e.upstreamStatus = 429;
    throw e;
  }

  let lastErr = null;
  for (let i = 0; i < creds.length; i++) {
    const c = creds[i];
    try {
      return await openaiCompatible.chatCompletion(Object.assign({}, params, {
        baseUrl: c.baseUrl,
        apiKey: c.apiKey,
        model: c.model,
        timeoutMs: c.timeoutMs,
      }));
    } catch (err) {
      lastErr = err;
      if (isRetryable(err) && i < creds.length - 1) {
        cooldownUntil.set(c.apiKey, Date.now() + cooldownMs(err));
        console.warn(
          `[ai-failover] ${c.label} 不可用（${err.code || err.upstreamStatus || 'ERR'}），切换下一凭据`
        );
        continue;
      }
      break;
    }
  }
  throw lastErr || new Error('AI 调用失败');
}

// 供监控/排障查看（不返回密钥明文）
function statusSnapshot() {
  return candidates().map((c) => ({
    label: c.label,
    model: c.model,
    coolingUntil: cooldownUntil.get(c.apiKey) || null,
  }));
}

module.exports = { chatCompletionWithFailover, statusSnapshot };
