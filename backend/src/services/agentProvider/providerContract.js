/**
 * 知行 · Agent LLM Provider Contract (Phase 27.6.3)
 * ============================================================
 * 【职责】
 * 定义 Provider 边界的输入/输出契约。Provider 只接受：
 *   input : agent-llm-context-v1（防火墙投影上下文）+ task（推理请求）
 *   output: 原始 LLM 响应信封（raw response envelope）
 *
 * 【边界原则】
 * - 契约违规（非法上下文/非法 task）= 编排方 bug → throw，大声失败。
 * - 操作性失败（超时/未配置/不可用/限流/畸形）= 运营态 → failed 信封，不抛异常。
 * - FAIL_REASONS ⊆ outputContract.FALLBACK_REASONS（测试锁定）：
 *   Provider 的失败词汇永远是下游 Output Contract 已认识词汇的子集。
 * ============================================================
 */
'use strict';

const { CONSTRAINTS } = require('../agentFirewall/contextFirewall');
const { FIREWALL_VERSION, TASKS, containsSensitiveKey } = require('../agentFirewall/contextContract');

const PROVIDER_PROMPT_VERSION = 'agent-llm-provider-prompt-v1';
const PROVIDER_ENVELOPE_VERSION = 'agent-llm-provider-envelope-v1';

// Provider 操作性失败词汇表（全部 ∈ outputContract.FALLBACK_REASONS）
const FAIL_REASONS = new Set([
  'llm_not_configured',
  'llm_timeout',
  'llm_unavailable',
  'llm_rate_limited',
  'llm_malformed',
]);

// 信封字段白名单
const ENVELOPE_FIELDS = new Set([
  'status',
  'reply',
  'reason',
  'provider',
  'model',
  'promptVersion',
  'requestId',
  'latencyMs',
]);

const MAX_REQUEST_ID_LENGTH = 64;
const MAX_PROVIDER_NAME_LENGTH = 60;
const MAX_MODEL_LENGTH = 120;

function invalid(code) {
  const error = new Error(code);
  error.code = code;
  error.statusCode = 400;
  return error;
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isBoundedString(value, maxLength) {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength;
}

/**
 * 校验 Provider 输入：{ context, task }
 * context 必须是防火墙产出的 agent-llm-context-v1；task 必须 ∈ TASKS。
 * 返回投影 payload（toProviderPayload 产物），供适配器构建 Prompt。
 */
function validateProviderInput({ context, task }) {
  if (!isObject(context) || context.version !== FIREWALL_VERSION) {
    throw invalid('PROVIDER_INPUT_INVALID_CONTEXT');
  }
  if (typeof task !== 'string' || !TASKS.has(task)) {
    throw invalid('PROVIDER_INPUT_INVALID_TASK');
  }
  const ownerUserId = context.ownerUserId;
  if (typeof ownerUserId !== 'number' || !Number.isInteger(ownerUserId) || ownerUserId <= 0) {
    throw invalid('PROVIDER_INPUT_INVALID_OWNER');
  }
  if (!isObject(context.metadata) || context.metadata.readOnly !== true) {
    throw invalid('PROVIDER_INPUT_NOT_READ_ONLY');
  }
  if (context.metadata.actionLevel !== 'insight_only') {
    throw invalid('PROVIDER_INPUT_INVALID_ACTION_LEVEL');
  }
  if (!Array.isArray(context.insights) || !Array.isArray(context.reasoning)) {
    throw invalid('PROVIDER_INPUT_INVALID_CONTEXT');
  }

  // 敏感键扫描：与防火墙侧同一函数、同一语义（递归深度上限 6）
  if (containsSensitiveKey(context)) {
    throw invalid('PROVIDER_INPUT_SENSITIVE');
  }

  // 字节预算：与防火墙 CONSTRAINTS.maxBytes 同源（8192）
  let bytes = 0;
  try {
    bytes = Buffer.byteLength(JSON.stringify(context), 'utf8');
  } catch (_) {
    throw invalid('PROVIDER_INPUT_INVALID_CONTEXT');
  }
  if (bytes > CONSTRAINTS.maxBytes) {
    throw invalid('PROVIDER_INPUT_TOO_LARGE');
  }
  return true;
}

/**
 * 校验 Provider 输出信封（适配器返回前自检）。
 * 防止适配器自身 bug 把坏信封交给下游 Validator 链。
 */
function validateProviderOutput(envelope) {
  if (!isObject(envelope)) throw invalid('PROVIDER_ENVELOPE_INVALID');
  Object.keys(envelope).forEach((key) => {
    if (!ENVELOPE_FIELDS.has(key)) throw invalid('PROVIDER_ENVELOPE_UNKNOWN_FIELD');
  });
  if (containsSensitiveKey(envelope)) throw invalid('PROVIDER_ENVELOPE_SENSITIVE');

  if (!isBoundedString(envelope.provider, MAX_PROVIDER_NAME_LENGTH)) throw invalid('PROVIDER_ENVELOPE_INVALID');
  if (!isBoundedString(envelope.promptVersion, MAX_MODEL_LENGTH)) throw invalid('PROVIDER_ENVELOPE_INVALID');
  if (!isBoundedString(envelope.requestId, MAX_REQUEST_ID_LENGTH)) throw invalid('PROVIDER_ENVELOPE_INVALID');
  if (typeof envelope.latencyMs !== 'number' || !Number.isInteger(envelope.latencyMs) || envelope.latencyMs < 0) {
    throw invalid('PROVIDER_ENVELOPE_INVALID');
  }
  // model 允许为空串（某些上游不回模型名），但类型必须正确
  if (typeof envelope.model !== 'string' || envelope.model.length > MAX_MODEL_LENGTH) {
    throw invalid('PROVIDER_ENVELOPE_INVALID');
  }

  if (envelope.status === 'ok') {
    if (!isBoundedString(envelope.reply, 32000)) throw invalid('PROVIDER_ENVELOPE_INVALID');
    if ('reason' in envelope) throw invalid('PROVIDER_ENVELOPE_INVALID');
    return true;
  }
  if (envelope.status === 'failed') {
    if ('reply' in envelope) throw invalid('PROVIDER_ENVELOPE_INVALID');
    if (!FAIL_REASONS.has(envelope.reason)) throw invalid('PROVIDER_ENVELOPE_INVALID');
    return true;
  }
  throw invalid('PROVIDER_ENVELOPE_INVALID');
}

/**
 * 构造标准化信封（两个工厂保证 ok/failed 形态单一来源）。
 */
function buildOkEnvelope({ reply, provider, model, requestId, latencyMs }) {
  const envelope = {
    status: 'ok',
    reply,
    provider,
    model,
    promptVersion: PROVIDER_PROMPT_VERSION,
    requestId,
    latencyMs,
  };
  validateProviderOutput(envelope);
  return envelope;
}

function buildFailedEnvelope({ reason, provider, model, requestId, latencyMs }) {
  const envelope = {
    status: 'failed',
    reason,
    provider,
    model,
    promptVersion: PROVIDER_PROMPT_VERSION,
    requestId,
    latencyMs,
  };
  validateProviderOutput(envelope);
  return envelope;
}

module.exports = {
  ENVELOPE_FIELDS,
  FAIL_REASONS,
  PROVIDER_ENVELOPE_VERSION,
  PROVIDER_PROMPT_VERSION,
  buildFailedEnvelope,
  buildOkEnvelope,
  validateProviderInput,
  validateProviderOutput,
};
