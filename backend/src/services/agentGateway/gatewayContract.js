/**
 * 知行 · Agent LLM Runtime Gateway Contract (Phase 27.6.4)
 * ============================================================
 * 【职责】
 * 定义 Gateway 结果信封契约（docs/PHASE_27_6_4 §1.3）：
 *
 *   { status: 'validated' | 'fallback', output: <agent-llm-output-v1>, meta: {...} }
 *
 * - validated：LLM 产出通过三道 Validator（信封 status 统一记 'validated'，
 *   内层 output.status 保留 'validated'/'partial' 原值，信息无损）。
 * - fallback：确定性兜底（meta.fallbackReason ∈ outputContract.FALLBACK_REASONS）。
 *
 * 【边界】
 * 纯校验函数；无状态、无 IO、无业务数据感知。
 * ============================================================
 */
'use strict';

const { OUTPUT_SCHEMA_VERSION, FALLBACK_REASONS } = require('../agentOutputValidator/outputContract');
const { containsSensitiveKey } = require('../agentFirewall/contextContract');

const GATEWAY_VERSION = 'agent-runtime-gateway-v1';

const RESULT_FIELDS = new Set(['status', 'output', 'meta']);
const META_FIELDS = new Set([
  'gatewayVersion',
  'task',
  'requestId',
  'contextSnapshotId',
  'provider',
  'model',
  'promptVersion',
  'latencyMs',
  'validators',
  'fallbackReason',
]);
const VALIDATOR_KEYS = new Set(['outputContract', 'evidenceBinding', 'semantic']);
const MAX_BOUNDED_STRING = 140;

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

/** 校验 Gateway 结果信封（产出方返回前自检；坏信封绝不交付调用方） */
function validateGatewayResult(result) {
  if (!isObject(result)) throw invalid('GATEWAY_RESULT_INVALID');
  Object.keys(result).forEach((key) => {
    if (!RESULT_FIELDS.has(key)) throw invalid('GATEWAY_RESULT_UNKNOWN_FIELD');
  });
  if (containsSensitiveKey(result)) throw invalid('GATEWAY_RESULT_SENSITIVE');

  const { status, output, meta } = result;
  if (status !== 'validated' && status !== 'fallback') throw invalid('GATEWAY_RESULT_INVALID');
  if (!isObject(output) || output.schemaVersion !== OUTPUT_SCHEMA_VERSION) throw invalid('GATEWAY_RESULT_INVALID');

  if (!isObject(meta)) throw invalid('GATEWAY_RESULT_INVALID');
  Object.keys(meta).forEach((key) => {
    if (!META_FIELDS.has(key)) throw invalid('GATEWAY_RESULT_UNKNOWN_FIELD');
  });
  if (meta.gatewayVersion !== GATEWAY_VERSION) throw invalid('GATEWAY_RESULT_INVALID');
  if (!isBoundedString(meta.task, MAX_BOUNDED_STRING)) throw invalid('GATEWAY_RESULT_INVALID');
  if (!isBoundedString(meta.requestId, 64)) throw invalid('GATEWAY_RESULT_INVALID');
  if (!isBoundedString(meta.contextSnapshotId, 128)) throw invalid('GATEWAY_RESULT_INVALID');
  if (typeof meta.provider !== 'string' || meta.provider.length > MAX_BOUNDED_STRING) throw invalid('GATEWAY_RESULT_INVALID');
  if (typeof meta.model !== 'string' || meta.model.length > MAX_BOUNDED_STRING) throw invalid('GATEWAY_RESULT_INVALID');
  if (typeof meta.promptVersion !== 'string' || meta.promptVersion.length > MAX_BOUNDED_STRING) throw invalid('GATEWAY_RESULT_INVALID');
  if (typeof meta.latencyMs !== 'number' || !Number.isInteger(meta.latencyMs) || meta.latencyMs < 0) {
    throw invalid('GATEWAY_RESULT_INVALID');
  }

  if (status === 'validated') {
    if ('fallbackReason' in meta) throw invalid('GATEWAY_RESULT_INVALID');
    if (!isObject(meta.validators)) throw invalid('GATEWAY_RESULT_INVALID');
    Object.keys(meta.validators).forEach((key) => {
      if (!VALIDATOR_KEYS.has(key)) throw invalid('GATEWAY_RESULT_UNKNOWN_FIELD');
    });
    if (VALIDATOR_KEYS.size !== Object.keys(meta.validators).length) throw invalid('GATEWAY_RESULT_INVALID');
    VALIDATOR_KEYS.forEach((key) => {
      if (meta.validators[key] !== true) throw invalid('GATEWAY_RESULT_INVALID');
    });
    if (output.status !== 'validated' && output.status !== 'partial') throw invalid('GATEWAY_RESULT_INVALID');
    return true;
  }

  // fallback
  if ('validators' in meta) throw invalid('GATEWAY_RESULT_INVALID');
  if (!FALLBACK_REASONS.has(meta.fallbackReason)) throw invalid('GATEWAY_RESULT_INVALID');
  if (output.status !== 'fallback') throw invalid('GATEWAY_RESULT_INVALID');
  return true;
}

module.exports = { GATEWAY_VERSION, META_FIELDS, RESULT_FIELDS, validateGatewayResult };
