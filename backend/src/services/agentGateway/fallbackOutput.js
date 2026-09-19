/**
 * 知行 · Agent 兜底输出生成器 (Phase 27.6.4)
 * ============================================================
 * 【职责】
 * 把防火墙投影后的确定性 reasoning（agent-reasoning-v1）翻译成
 * agent-llm-output-v1 的 fallback 形态。文本全部来自确定性层，
 * Gateway/本模块不编造任何解释文字。
 *
 * 【规则（架构 §3）】
 * - 截取前 OUTPUT_LIMITS.MAX_EXPLANATIONS(5) 条；
 * - 整条治理（M-1）：条目内任一 ref 不合格（index 非整数/负数、metric/period
 *   空、insightId 不可回查、index 越界）→ 整条丢弃；过滤后 refs 不满足稠密性
 *   （ref.index !== 数组位置）→ 整条丢弃。杜绝稀疏 refs 导致 evidenceId 位置错配。
 * - evidenceId 一律取 <insightId>:<数组位置>（稠密性下与 ref.index 相等）。
 * - id 有界化：'fallback:' + reasoning.id；超 MAX_ID_LENGTH(120) 改用
 *   'fallback:' + sha256 前 24 hex（96-bit 截断，确定性）。
 * - 字节压力：从尾部整条丢弃直至 ≤ MAX_TOTAL_OUTPUT_BYTES(8192)。
 * ============================================================
 */
'use strict';

const crypto = require('node:crypto');

const { ACTION_LEVEL } = require('../agentFirewall/contextContract');
const { OUTPUT_LIMITS, OUTPUT_SCHEMA_VERSION } = require('../agentOutputValidator/outputContract');
const { REASONING_VERSION } = require('../agentReasoning/reasoningContract');

const MAX_ID_LENGTH = OUTPUT_LIMITS.MAX_ID_LENGTH;
const MAX_TOTAL_OUTPUT_BYTES = OUTPUT_LIMITS.MAX_TOTAL_OUTPUT_BYTES;

function boundedEntryId(reasoningId) {
  const composed = `fallback:${reasoningId}`;
  if (composed.length <= MAX_ID_LENGTH) return composed;
  const digest = crypto.createHash('sha256').update(reasoningId, 'utf8').digest('hex').slice(0, 24);
  return `fallback:${digest}`;
}

function isUsableRef(ref) {
  return Boolean(ref)
    && typeof ref.insightId === 'string' && ref.insightId
    && Number.isInteger(ref.index) && ref.index >= 0
    && typeof ref.metric === 'string' && ref.metric.trim()
    && typeof ref.period === 'string' && ref.period.trim();
}

/**
 * 整条治理（M-1）：返回该条目翻译后的 evidenceRefs，不可用整条返回 null。
 */
function translateEvidenceRefs(explanation, insightById) {
  const refs = Array.isArray(explanation.evidenceRefs) ? explanation.evidenceRefs : [];
  if (!refs.length) return null;
  const insight = insightById.get(explanation.insightId);
  if (!insight || !Array.isArray(insight.evidence)) return null;

  const validRefs = [];
  for (const ref of refs) {
    if (!isUsableRef(ref)) return null;                       // 任一 ref 不合格 → 整条丢弃
    if (ref.insightId !== explanation.insightId) return null; // 引用漂移 → 整条丢弃
    if (ref.index >= insight.evidence.length) return null;    // 越界（不可回查）→ 整条丢弃
    if (!insight.evidence[ref.index]) return null;
    validRefs.push(ref);
  }
  // 稠密性：ref.index === 输出数组位置（杜绝稀疏 refs 的 evidenceId 错配）
  const dense = validRefs.every((ref, position) => ref.index === position);
  if (!dense) return null;

  return validRefs.map((ref, position) => ({
    insightId: explanation.insightId,
    evidenceId: `${explanation.insightId}:${position}`,
    metric: ref.metric,
    period: ref.period,
  }));
}

function serializedBytes(value) {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

/**
 * 构建确定性兜底输出（完整 agent-llm-output-v1 对象）。
 * @param {Object} p.firewallContext  防火墙投影上下文（agent-llm-context-v1）
 * @param {string} p.fallbackReason   ∈ outputContract.FALLBACK_REASONS
 */
function buildFallbackOutput({ firewallContext, fallbackReason }) {
  const projectedReasoning = Array.isArray(firewallContext.reasoning) ? firewallContext.reasoning : [];
  const insightById = new Map(
    (Array.isArray(firewallContext.insights) ? firewallContext.insights : [])
      .filter((insight) => insight && typeof insight.id === 'string')
      .map((insight) => [insight.id, insight])
  );

  let entries = [];
  for (const explanation of projectedReasoning.slice(0, OUTPUT_LIMITS.MAX_EXPLANATIONS)) {
    if (!explanation || typeof explanation.insightId !== 'string' || !explanation.insightId) continue;
    const evidenceRefs = translateEvidenceRefs(explanation, insightById);
    if (!evidenceRefs) continue; // 整条治理：不可翻译的条目直接丢弃
    entries.push({
      id: boundedEntryId(explanation.id),
      insightId: explanation.insightId,
      title: explanation.title,
      why: explanation.why,
      evidenceRefs,
    });
  }

  const base = () => ({
    schemaVersion: OUTPUT_SCHEMA_VERSION,
    status: 'fallback',
    available: false,
    fallback: { type: 'deterministic_reasoning', reason: fallbackReason, source: REASONING_VERSION },
    explanations: entries,
    suggestions: [],
    uncertainties: [],
    metadata: { readOnly: true, actionLevel: ACTION_LEVEL, providerIndependent: true },
  });

  // 字节压力：从尾部整条丢弃（与 contextFirewall.fitToBudget 同策略）
  let output = base();
  while (entries.length && serializedBytes(output) > MAX_TOTAL_OUTPUT_BYTES) {
    entries = entries.slice(0, -1);
    output = base();
  }
  if (serializedBytes(output) > MAX_TOTAL_OUTPUT_BYTES) {
    // 数学上不可达（空解释信封 ~315 字节）：编程错误防线
    const error = new Error('GATEWAY_INVARIANT_BROKEN');
    error.code = 'GATEWAY_INVARIANT_BROKEN';
    error.statusCode = 500;
    throw error;
  }
  return output;
}

module.exports = { buildFallbackOutput, boundedEntryId, translateEvidenceRefs };
