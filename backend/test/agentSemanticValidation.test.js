'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  FALLBACK_REASON,
  SEMANTIC_VALIDATOR_VERSION,
  validateSemanticValidation,
} = require('../src/services/agentSemanticValidator/semanticValidatorContract');

function firewallContext() {
  return {
    version: 'agent-llm-context-v1',
    ownerUserId: 7,
    task: 'explain_daily',
    available: true,
    sources: [],
    insights: [{
      id: 'focus-trend-7d',
      type: 'focus_increase',
      title: '专注趋势上升。',
      explanation: '最近 3 天专注时间上升。',
      source: 'behavior_adapter',
      authority: 'deterministic_projection',
      confidence: 1,
      actionLevel: 'insight_only',
      evidence: [{
        evidenceId: 'focus-trend-7d:0',
        source: 'behavior_adapter',
        authority: 'deterministic_projection',
        metric: 'focus_minutes',
        period: 'current_3d',
        value: 80,
      }],
      truncated: false,
    }],
    reasoning: [{
      id: 'reasoning:focus-trend-7d',
      insightId: 'focus-trend-7d',
      title: '为什么出现专注趋势观察？',
      why: '该观察比较了最近 3 天的专注记录。',
      evidenceRefs: [{
        insightId: 'focus-trend-7d',
        index: 0,
        metric: 'focus_minutes',
        period: 'current_3d',
        source: 'behavior_adapter',
      }],
      confidence: 0.9,
      actionLevel: 'insight_only',
      truncated: false,
    }],
    constraints: {},
    metadata: { readOnly: true, actionLevel: 'insight_only', providerIndependent: true },
  };
}

function output() {
  return {
    schemaVersion: 'agent-llm-output-v1',
    status: 'validated',
    available: true,
    fallback: null,
    explanations: [{
      id: 'exp-1',
      type: 'fact',
      text: '最近 3 天专注时间为 80 分钟。',
      evidenceRefs: [{
        insightId: 'focus-trend-7d',
        evidenceId: 'focus-trend-7d:0',
        metric: 'focus_minutes',
        period: 'current_3d',
      }],
      reasoningRefs: [{ reasoningId: 'reasoning:focus-trend-7d', insightId: 'focus-trend-7d' }],
    }],
    suggestions: [],
    uncertainties: [],
    metadata: { readOnly: true, actionLevel: 'insight_only', providerIndependent: true },
  };
}

function validate(candidate = output(), context = firewallContext()) {
  return validateSemanticValidation({ firewallContext: context, output: candidate });
}

test('accepts a valid explanation supported by evidence and reasoning', () => {
  const result = validate();
  assert.equal(result.version, SEMANTIC_VALIDATOR_VERSION);
  assert.equal(result.valid, true);
  assert.deepEqual(result.violations, []);
  assert.equal(result.fallback, null);
});

test('rejects hallucinated numbers', () => {
  const candidate = output();
  candidate.explanations[0].text = '最近 3 天专注时间为 12 分钟。';
  const result = validate(candidate);
  assert.equal(result.valid, false);
  assert.ok(result.violations.some((violation) => violation.code === 'NUMERIC_MISMATCH'));
  assert.equal(result.fallback.reason, FALLBACK_REASON);
});

test('rejects unsupported date ranges', () => {
  const context = firewallContext();
  context.insights[0].evidence[0].value = '2026-09-01 至 2026-09-07';
  const candidate = output();
  candidate.explanations[0].type = 'interpretation';
  candidate.explanations[0].text = '2026-09-02 至 2026-09-08 的专注记录存在。';
  candidate.explanations[0].generationConfidence = 0.9;
  const result = validate(candidate, context);
  assert.equal(result.valid, false);
  assert.ok(result.violations.some((violation) => violation.code === 'TEMPORAL_MISMATCH'));
});

test('rejects over-generalized conclusions', () => {
  const candidate = output();
  candidate.explanations[0].text = '最近 3 天专注时间为 80 分钟，学习能力下降。';
  const result = validate(candidate);
  assert.equal(result.valid, false);
  assert.ok(result.violations.some((violation) => violation.code === 'SEMANTIC_SCOPE_VIOLATION'));
});

test('rejects confidence escalation', () => {
  const candidate = output();
  candidate.explanations[0].type = 'interpretation';
  candidate.explanations[0].text = '最近 3 天专注记录说明当前状态较好。';
  candidate.explanations[0].generationConfidence = 0.95;
  const result = validate(candidate);
  assert.equal(result.valid, false);
  assert.ok(result.violations.some((violation) => violation.code === 'CONFIDENCE_ESCALATION'));
});

test('rejects empty and malformed explanations', () => {
  const empty = output();
  empty.explanations = [];
  const emptyResult = validate(empty);
  assert.equal(emptyResult.valid, false);
  assert.ok(emptyResult.violations.some((violation) => violation.code === 'EMPTY_EXPLANATION'));

  const malformed = output();
  malformed.explanations[0] = { id: 'exp-1', type: 'fact' };
  const malformedResult = validate(malformed);
  assert.equal(malformedResult.valid, false);
  assert.ok(malformedResult.violations.some((violation) => violation.code === 'EMPTY_EXPLANATION'));
});

test('rejects fallback payloads and reports multiple violations', () => {
  const fallback = output();
  fallback.status = 'fallback';
  fallback.available = false;
  const fallbackResult = validate(fallback);
  assert.equal(fallbackResult.valid, false);
  assert.ok(fallbackResult.violations.some((violation) => violation.code === 'FALLBACK_NOT_BINDABLE'));

  const candidate = output();
  candidate.explanations[0].type = 'interpretation';
  candidate.explanations[0].text = '最近 3 天专注时间为 12 分钟，学习能力下降。';
  candidate.explanations[0].generationConfidence = 0.95;
  const multipleResult = validate(candidate);
  assert.equal(multipleResult.valid, false);
  assert.ok(multipleResult.violations.some((violation) => violation.code === 'NUMERIC_MISMATCH'));
  assert.ok(multipleResult.violations.some((violation) => violation.code === 'SEMANTIC_SCOPE_VIOLATION'));
  assert.ok(multipleResult.violations.some((violation) => violation.code === 'CONFIDENCE_ESCALATION'));
});

test('semantic validation is deterministic and does not mutate input', () => {
  const candidate = output();
  const context = firewallContext();
  const before = JSON.stringify({ candidate, context });
  const first = validate(candidate, context);
  const second = validate(candidate, context);
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify({ candidate, context }), before);
});
