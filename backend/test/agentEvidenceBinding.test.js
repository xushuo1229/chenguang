'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  BINDING_VERSION,
  FALLBACK_REASON,
  computeContextSnapshotId,
  validateEvidenceBinding,
} = require('../src/services/agentEvidenceBinding/evidenceBindingContract');
const { validateOutputContract } = require('../src/services/agentOutputValidator/outputContract');

function metadata() {
  return { readOnly: true, actionLevel: 'insight_only', providerIndependent: true };
}

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
      why: '该观察比较了最近 3 天与此前 4 天。',
      evidenceRefs: [{ insightId: 'focus-trend-7d', index: 0, metric: 'focus_minutes', period: 'current_3d', source: 'behavior_adapter' }],
      confidence: 1,
      actionLevel: 'insight_only',
      truncated: false,
    }],
    constraints: {},
    metadata: { readOnly: true, actionLevel: 'insight_only', providerIndependent: true },
  };
}

function evidenceRef() {
  return {
    insightId: 'focus-trend-7d',
    evidenceId: 'focus-trend-7d:0',
    metric: 'focus_minutes',
    period: 'current_3d',
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
      text: '最近 3 天专注时间上升。',
      evidenceRefs: [evidenceRef()],
      reasoningRefs: [{ reasoningId: 'reasoning:focus-trend-7d', insightId: 'focus-trend-7d' }],
    }],
    suggestions: [],
    uncertainties: [],
    metadata: metadata(),
  };
}

function bind(context = firewallContext(), candidate = output()) {
  return validateEvidenceBinding({
    firewallContext: context,
    output: candidate,
    expectedSnapshotId: computeContextSnapshotId(context),
  });
}

test('verifies valid insight, evidence, reasoning, ownership, and snapshot', () => {
  const result = bind();
  assert.equal(result.version, BINDING_VERSION);
  assert.equal(result.valid, true);
  assert.deepEqual(result.violations, []);
  assert.equal(result.fallback, null);
  assert.ok(result.contextSnapshotId.length === 64);
  assert.ok(result.references.some((ref) => ref.type === 'evidence' && ref.verified));
  assert.ok(result.references.some((ref) => ref.type === 'reasoning' && ref.verified));
});

test('rejects missing insight reference and fake evidence id', () => {
  const missingInsight = output();
  missingInsight.explanations[0].evidenceRefs[0].insightId = 'missing-insight';
  missingInsight.explanations[0].evidenceRefs[0].evidenceId = 'missing-insight:0';
  const missingResult = bind(firewallContext(), missingInsight);
  assert.equal(missingResult.valid, false);
  assert.ok(missingResult.violations.some((violation) => violation.code === 'MISSING_INSIGHT_REFERENCE'));
  assert.equal(missingResult.fallback.reason, FALLBACK_REASON);

  const fakeEvidence = output();
  fakeEvidence.explanations[0].evidenceRefs = [
    evidenceRef(),
    { ...evidenceRef(), evidenceId: 'focus-trend-7d:1' },
  ];
  const fakeResult = bind(firewallContext(), fakeEvidence);
  assert.equal(fakeResult.valid, false);
  assert.ok(fakeResult.violations.some((violation) => violation.code === 'FAKE_EVIDENCE_REFERENCE'));
});

test('rejects cross-user output identity and wrong reference type', () => {
  const otherUser = output();
  otherUser.ownerUserId = 999;
  const otherResult = bind(firewallContext(), otherUser);
  assert.equal(otherResult.valid, false);
  assert.ok(otherResult.violations.some((violation) => violation.code === 'CROSS_USER_REFERENCE'));

  const wrongType = output();
  wrongType.explanations[0].reasoningRefs[0].reasoningId = 'insight:focus-trend-7d';
  const wrongResult = bind(firewallContext(), wrongType);
  assert.equal(wrongResult.valid, false);
  assert.ok(wrongResult.violations.some((violation) => violation.code === 'WRONG_REFERENCE_TYPE'));
});

test('rejects empty fact references and malformed output', () => {
  const emptyRefs = output();
  emptyRefs.explanations[0].evidenceRefs = [];
  emptyRefs.explanations[0].reasoningRefs = [];
  const emptyResult = bind(firewallContext(), emptyRefs);
  assert.equal(emptyResult.valid, false);
  assert.ok(emptyResult.violations.some((violation) => violation.code === 'EMPTY_REFERENCES'));

  const malformed = output();
  malformed.schemaVersion = 'wrong-version';
  const malformedResult = bind(firewallContext(), malformed);
  assert.equal(malformedResult.valid, false);
  assert.ok(malformedResult.violations.some((violation) => violation.code === 'MALFORMED_OUTPUT'));
});

test('rejects context snapshot mismatch', () => {
  const result = validateEvidenceBinding({
    firewallContext: firewallContext(),
    output: output(),
    expectedSnapshotId: 'different-snapshot',
  });
  assert.equal(result.valid, false);
  assert.ok(result.violations.some((violation) => violation.code === 'CONTEXT_SNAPSHOT_MISMATCH'));
  assert.equal(result.fallback.reason, FALLBACK_REASON);
});

test('rejects duplicate references and fallback payloads', () => {
  const duplicate = output();
  duplicate.explanations[0].evidenceRefs = [evidenceRef(), evidenceRef()];
  const duplicateResult = bind(firewallContext(), duplicate);
  assert.equal(duplicateResult.valid, false);
  assert.ok(duplicateResult.violations.some((violation) => violation.code === 'DUPLICATE_REFERENCE'));

  const fallbackOutput = output();
  fallbackOutput.status = 'fallback';
  fallbackOutput.available = false;
  const fallbackResult = bind(firewallContext(), fallbackOutput);
  assert.equal(fallbackResult.valid, false);
  assert.ok(fallbackResult.violations.some((violation) => violation.code === 'FALLBACK_NOT_BINDABLE'));
});

test('binding validation is deterministic and candidate remains valid output contract', () => {
  const candidate = output();
  assert.equal(validateOutputContract(candidate).valid, true);
  assert.deepEqual(bind(firewallContext(), candidate), bind(firewallContext(), candidate));
});
