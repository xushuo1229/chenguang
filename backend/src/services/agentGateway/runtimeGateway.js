/**
 * 知行 · Agent LLM Runtime Gateway (Phase 27.6.4)
 * ============================================================
 * 【职责】
 * 一次解释请求的唯一编排入口（架构 §2）：
 *
 *   runExplanation({ context, insights, reasoning, task, options })
 *     → { status:'validated', output, meta }   LLM 产出过三道 Validator
 *     → { status:'fallback',  output, meta }   确定性兜底（reason ∈ FALLBACK_REASONS）
 *
 * 【流水线（结构上不可绕过）】
 *   buildLlmContext（防火墙在网关内部构建——调用方无法传入现成上下文）
 *   → providerRegistry → provider.generateExplanation
 *   → JSON.parse(reply) → outputContract → evidenceBinding（快照绑定）
 *   → semantic → validated；任一步失败 → 确定性兜底
 *
 * 【边界】
 * - 全函数：运行时失败一律产出合法结果信封；唯一抛错例外
 *   GATEWAY_INVARIANT_BROKEN（确定性兜底违反 Output Contract 的不可能状态）。
 * - 三道 Validator 为真实模块常驻（不可注入——校验链不允许被 mock 掉）；
 *   Provider 可注入（options.provider，供测试与未来扩展）。
 * - 输入只读；无模块级可变状态；信封不含密钥/上游细节/原始 reply。
 * ============================================================
 */
'use strict';

const crypto = require('node:crypto');

const { buildLlmContext, toProviderPayload } = require('../agentFirewall/contextFirewall');
const providerRegistry = require('../agentProvider/providerRegistry');
const outputContract = require('../agentOutputValidator/outputContract');
const { validateEvidenceBinding, computeContextSnapshotId } = require('../agentEvidenceBinding/evidenceBindingContract');
const { validateSemanticValidation } = require('../agentSemanticValidator/semanticValidatorContract');
const { buildFallbackOutput } = require('./fallbackOutput');
const { GATEWAY_VERSION, validateGatewayResult } = require('./gatewayContract');

// 注意：通过模块对象调用 validateOutputContract（而非解构绑定），
// 为测试侧打桩（模拟不可能状态）保留唯一接缝；生产路径行为不变。

function invariantBroken() {
  const error = new Error('GATEWAY_INVARIANT_BROKEN');
  error.code = 'GATEWAY_INVARIANT_BROKEN';
  error.statusCode = 500;
  return error;
}

function semanticFallbackReason(semantic) {
  const violations = Array.isArray(semantic.violations) ? semantic.violations : [];
  const scopeViolated = violations.some((violation) => violation && violation.code === 'SEMANTIC_SCOPE_VIOLATION');
  return scopeViolated ? 'llm_unsupported_claim' : 'llm_unsafe';
}

/**
 * 构建兜底结果（确定性产出 → Output Contract 自检 → 信封自检）。
 */
function buildFallbackResult({ firewallContext, fallbackReason, task, requestId, startedAt, provider, model, promptVersion, latencyMs }) {
  const output = buildFallbackOutput({ firewallContext, fallbackReason });
  // 不可能状态防线：确定性数据必须通过 Output Contract（§0.1 修复后 fallback
  // 形态可被校验）；未通过 = 编程错误，大声失败，绝不交付。
  const contract = outputContract.validateOutputContract(output);
  if (!contract.valid) throw invariantBroken();

  const result = {
    status: 'fallback',
    output,
    meta: {
      gatewayVersion: GATEWAY_VERSION,
      task,
      requestId,
      contextSnapshotId: computeContextSnapshotId(firewallContext),
      provider,
      model,
      promptVersion,
      latencyMs: latencyMs === undefined ? Date.now() - startedAt : latencyMs,
      fallbackReason,
    },
  };
  validateGatewayResult(result);
  return result;
}

/**
 * Gateway 唯一公共入口。
 * @param {Object} p.context    learning-context-v1（确定性层产物）
 * @param {Object} p.insights   agent-insight-v1
 * @param {Object} p.reasoning  agent-reasoning-v1
 * @param {string} p.task       ∈ contextContract.TASKS
 * @param {Object} [p.options]  { provider }（注入覆盖；默认 registry 解析）
 */
async function runExplanation({ context, insights, reasoning, task, options = {} } = {}) {
  const startedAt = Date.now();
  const requestId = crypto.randomUUID();

  // 契约违规（调用方 bug）向上抛——防火墙校验是第一道闸
  const firewallContext = buildLlmContext({ context, insights, reasoning, task });
  const providerPayload = toProviderPayload(firewallContext);
  const contextSnapshotId = computeContextSnapshotId(firewallContext);

  // Provider 解析：显式注入必须是合法适配器（形状违规 = 输入契约违规 → throw）；
  // 未注入时走 registry（解析 null → llm_not_configured 兜底路径）。
  let provider;
  if (options.provider !== undefined) {
    const injected = options.provider;
    if (!injected || typeof injected !== 'object' || typeof injected.generateExplanation !== 'function') {
      const error = new Error('GATEWAY_PROVIDER_INVALID');
      error.code = 'GATEWAY_PROVIDER_INVALID';
      error.statusCode = 400;
      throw error;
    }
    provider = injected;
  } else {
    // 通过模块对象调用（测试侧打桩接缝；生产路径行为不变）
    provider = providerRegistry.resolveAgentProvider();
  }

  if (!provider) {
    // registry 解析失败（未配置/未知名/形状非法）→ 确定性兜底（§3 registry-null 空态）
    return buildFallbackResult({
      firewallContext,
      fallbackReason: 'llm_not_configured',
      task,
      requestId,
      startedAt,
      provider: 'none',
      model: '',
      promptVersion: '',
      latencyMs: 0,
    });
  }

  // Provider 按 27.6.3 契约是全函数（永远返回信封）；防御性兜底：
  // 注入 provider 违约直接抛错时收敛为 llm_unavailable，维持 Gateway 全函数铁律。
  let envelope;
  try {
    envelope = await provider.generateExplanation({ context: providerPayload, task });
  } catch (_) {
    envelope = { status: 'failed', reason: 'llm_unavailable', provider: '', model: '', promptVersion: '' };
  }
  const baseMeta = {
    gatewayVersion: GATEWAY_VERSION,
    task,
    requestId,
    contextSnapshotId,
    provider: typeof envelope.provider === 'string' ? envelope.provider : '',
    model: typeof envelope.model === 'string' ? envelope.model : '',
    promptVersion: typeof envelope.promptVersion === 'string' ? envelope.promptVersion : '',
  };

  if (!envelope || envelope.status !== 'ok') {
    const reason = envelope && envelope.status === 'failed' ? envelope.reason : 'llm_unavailable';
    return buildFallbackResult({ ...baseMeta, firewallContext, fallbackReason: reason, startedAt });
  }

  // ok 信封 → parse → 三道 Validator（顺序固定，逐层留痕）
  let candidate;
  try {
    candidate = JSON.parse(envelope.reply);
  } catch (_) {
    return buildFallbackResult({ ...baseMeta, firewallContext, fallbackReason: 'llm_malformed', startedAt });
  }

  const contract = outputContract.validateOutputContract(candidate);
  if (!contract.valid) {
    return buildFallbackResult({ ...baseMeta, firewallContext, fallbackReason: 'llm_schema_invalid', startedAt });
  }

  const binding = validateEvidenceBinding({
    firewallContext,
    output: candidate,
    expectedSnapshotId: contextSnapshotId,
    ownerUserId: context.userId,
  });
  if (!binding.valid) {
    return buildFallbackResult({ ...baseMeta, firewallContext, fallbackReason: 'llm_evidence_mismatch', startedAt });
  }

  const semantic = validateSemanticValidation({ firewallContext, output: candidate });
  if (!semantic.valid) {
    return buildFallbackResult({ ...baseMeta, firewallContext, fallbackReason: semanticFallbackReason(semantic), startedAt });
  }

  // 全绿。candidate.status ∈ {'validated','partial'}（Output Contract 已保证）。
  const result = {
    status: 'validated',
    output: candidate,
    meta: {
      ...baseMeta,
      latencyMs: Date.now() - startedAt,
      validators: { outputContract: true, evidenceBinding: true, semantic: true },
    },
  };
  validateGatewayResult(result);
  return result;
}

module.exports = { runExplanation, GATEWAY_VERSION };
