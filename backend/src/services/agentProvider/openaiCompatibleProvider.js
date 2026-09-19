/**
 * 知行 · Agent LLM Provider —— OpenAI 兼容适配器 (Phase 27.6.3)
 * ============================================================
 * 【职责】
 * 把「用防火墙上下文请求一次解释」收敛为有契约的单一入口：
 *
 *   generateExplanation({ context, task, options })
 *     → { status:'ok', reply, ... }        原始 LLM 响应（未解析、未修复）
 *     → { status:'failed', reason, ... }   操作性失败（∈ FAIL_REASONS）
 *
 * 【边界】
 * - 输入只接受 agent-llm-context-v1（contextContract.validateProviderInput 把关）。
 * - 传输复用共享适配器 services/providers/openaiCompatible.chatCompletion，
 *   不引入第二套 HTTP 实现。
 * - 对输入只读：调用前后 context 逐字节不变（测试强制）。
 * - reply 原样透传：不 parse、不 strip code fence、不修复 JSON、不截断。
 *   解析与校验属于下游 Validator 链（Output Contract → Evidence Binding → Semantic）。
 * - 密钥只在进程内存中随参数流入传输层；绝不进信封、日志、Prompt、错误消息。
 * ============================================================
 */
'use strict';

const crypto = require('node:crypto');

const config = require('../../config/env');
const sharedTransport = require('../providers/openaiCompatible');
const ApiError = require('../../utils/ApiError');
const {
  FAIL_REASONS,
  buildFailedEnvelope,
  buildOkEnvelope,
  validateProviderInput,
} = require('./providerContract');

const PROVIDER_NAME = 'openaiCompatible';

// 与 OUTPUT_LIMITS.MAX_TOTAL_OUTPUT_BYTES(8192B) 对齐的生成上限：
// 中文约 1 token ≈ 1.5~2.5 字节，1200 tokens 足以容纳合法输出并留出截断余量。
const DEFAULT_MAX_TOKENS = 1200;
const DEFAULT_TEMPERATURE = 0.2;

/**
 * 构建 Prompt（纯函数、确定性、可单测）。
 * System 描述目标 Schema 与硬规则；User 是投影 payload 的 JSON 文本。
 * Prompt 不含任何密钥/用户身份/指令类可写操作。
 */
function buildProviderMessages(payload) {
  const system = [
    'You are the explanation generator of the ZHIXING agent home (read-only, insight_only).',
    'You receive one JSON payload: a bounded learning context (agent-llm-context-v1) containing deterministic insights, evidence and reasoning.',
    'Return ONLY one minified JSON object with EXACTLY this schema and nothing else:',
    '{"schemaVersion":"agent-llm-output-v1","status":"validated","available":true,"fallback":null,',
    '"explanations":[{"id":"exp-1","type":"fact|interpretation|suggestion|uncertainty","text":"<=240 chars","generationConfidence":0.0,',
    '"evidenceRefs":[{"insightId":"...","evidenceId":"<insightId>:<index>","metric":"...","period":"..."}],',
    '"reasoningRefs":[{"reasoningId":"reasoning:<insightId>","insightId":"..."}]}],',
    '"suggestions":[],"uncertainties":[],"metadata":{"readOnly":true,"actionLevel":"insight_only","providerIndependent":true}}',
    'Hard rules:',
    '1. Use ONLY ids, evidence and reasoning present in the payload. Never invent references.',
    '2. type "fact" and "interpretation" require evidenceRefs (max 3, resolvable in payload insights).',
    '3. type "fact" requires exactly one reasoningRefs entry (max 1). type "suggestion" and "uncertainty" forbid evidenceRefs and reasoningRefs.',
    '4. "fact" must NOT include generationConfidence. "interpretation" generationConfidence must not exceed the referenced reasoning confidence.',
    '5. Max 5 explanations, max 3 suggestions, max 2 uncertainties. Text lengths: explanation<=240, suggestion<=180, uncertainty<=180. Use the user\'s language (Chinese).',
    '6. Numbers and dates in text must come from the referenced evidence values or periods. No absolute claims about ability, intelligence or personality.',
    '7. If the payload has no available insights (available=false) or you cannot ground a claim, return {"schemaVersion":"agent-llm-output-v1","status":"fallback","available":false,',
    '"fallback":{"type":"deterministic_reasoning","reason":"llm_unsafe","source":"agent-reasoning-v1"},',
    '"explanations":[],"suggestions":[],"uncertainties":[],"metadata":{"readOnly":true,"actionLevel":"insight_only","providerIndependent":true}}.',
    '8. Output JSON only. No markdown, no code fence, no commentary.',
  ].join('\n');

  return [
    { role: 'system', content: system },
    { role: 'user', content: JSON.stringify(payload) },
  ];
}

/**
 * 传输层错误 → 失败词汇。未知错误一律收敛到 llm_unavailable。
 */
function mapTransportError(err) {
  const code = err && err.name === 'ApiError' ? err.code : '';
  if (code === 'AI_NOT_CONFIGURED') return 'llm_not_configured';
  if (code === 'AI_TIMEOUT') return 'llm_timeout';
  if (code === 'AI_EMPTY_REPLY') return 'llm_malformed';
  const upstreamStatus = err && Number(err.upstreamStatus);
  if (upstreamStatus === 429) return 'llm_rate_limited';
  return 'llm_unavailable';
}

/**
 * Provider 唯一入口。
 * @param {Object}   p.context  agent-llm-context-v1（防火墙投影产物）
 * @param {string}   p.task     ∈ contextContract.TASKS
 * @param {Object}   [p.options] 可注入覆盖：baseUrl/apiKey/model/timeoutMs/maxTokens/temperature/transport
 * @returns {Promise<{status:'ok',reply:string,...}|{status:'failed',reason:string,...}>}
 */
async function generateExplanation({ context, task, options = {} } = {}) {
  const startedAt = Date.now();
  const requestId = crypto.randomUUID();

  // 契约违规（程序性错误）→ throw；操作性失败 → failed 信封
  validateProviderInput({ context, task });

  const cfg = config || {};
  const baseUrl = options.baseUrl || cfg.agentLlmBaseUrl || cfg.aiBaseUrl || '';
  const apiKey = options.apiKey || cfg.agentLlmApiKey || cfg.aiApiKey || '';
  const model = options.model || cfg.agentLlmModel || cfg.aiModel || '';
  const timeoutMs = Number(options.timeoutMs || cfg.agentLlmTimeoutMs || 15000);
  const maxTokens = Number(options.maxTokens || cfg.agentLlmMaxTokens || DEFAULT_MAX_TOKENS);
  const temperature = options.temperature === undefined ? DEFAULT_TEMPERATURE : options.temperature;
  const transport = options.transport || sharedTransport.chatCompletion;

  try {
    // 超时策略在 Provider 边界强制执行（对任何注入 transport 都生效）：
    // 与传输调用竞速，timeoutMs 到点即产出 llm_timeout 信封。
    // 共享传输内部的 AbortController 负责 HTTP 层中止，两层互为纵深。
    let timer;
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => reject(ApiError.internal('AI_TIMEOUT', 'Agent LLM 请求超时')), timeoutMs);
    });
    let result;
    try {
      result = await Promise.race([
        Promise.resolve(transport({
          messages: buildProviderMessages(context),
          baseUrl,
          apiKey,
          model,
          timeoutMs,
          maxTokens,
          temperature,
        })),
        timeoutPromise,
      ]);
    } finally {
      clearTimeout(timer);
    }

    const reply = result && result.reply;
    if (typeof reply !== 'string' || !reply.trim()) {
      // 传输层返回 200 但响应体非法（防御：正常路径由 AI_EMPTY_REPLY 覆盖）
      return buildFailedEnvelope({
        reason: 'llm_malformed',
        provider: PROVIDER_NAME,
        model,
        requestId,
        latencyMs: Date.now() - startedAt,
      });
    }

    return buildOkEnvelope({
      reply,
      provider: PROVIDER_NAME,
      model: (result && result.model) || model,
      requestId,
      latencyMs: Date.now() - startedAt,
    });
  } catch (err) {
    return buildFailedEnvelope({
      reason: mapTransportError(err),
      provider: PROVIDER_NAME,
      model,
      requestId,
      latencyMs: Date.now() - startedAt,
    });
  }
}

module.exports = {
  name: PROVIDER_NAME,
  generateExplanation,
  buildProviderMessages,
  FAIL_REASONS,
};
