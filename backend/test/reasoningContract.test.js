require('./setup');

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  ACTION_LEVEL,
  REASONING_VERSION,
  normalizeReasoning,
  validateReasoningInput,
} = require('../src/services/agentReasoning/reasoningContract');

function context(overrides = {}) {
  return {
    version: 'learning-context-v1',
    userId: 7,
    readOnly: true,
    permissions: { read: ['deterministic_insights'], write: [] },
    ...overrides,
  };
}

function insights(overrides = {}) {
  return {
    version: 'agent-insight-v1',
    userId: 7,
    scope: 'agent_home',
    insights: [{
      id: 'focus-trend-7d',
      type: 'focus_increase',
      title: '过去 7 天专注趋势上升。',
      explanation: '最近 3 天日均专注高于此前 4 天。',
      source: 'sync.activity',
      authority: 'deterministic_projection',
      evidence: [{
        source: 'behavior_adapter',
        authority: 'deterministic_projection',
        metric: 'focus_minutes',
        period: 'current_3d',
        value: 80,
      }],
      confidence: 1,
      actionLevel: 'insight_only',
    }],
    metadata: {
      readOnly: true,
      actionLevel: 'insight_only',
      contextVersion: 'learning-context-v1',
    },
    ...overrides,
  };
}

describe('agent reasoning contract', () => {
  test('accepts matching read-only context and insight contracts', () => {
    assert.doesNotThrow(() => validateReasoningInput({ context: context(), insights: insights() }));
  });

  test('rejects writable, mismatched, or malformed input', () => {
    assert.throws(
      () => validateReasoningInput({ context: context({ readOnly: false }), insights: insights() }),
      /INVALID_LEARNING_CONTEXT/,
    );
    assert.throws(
      () => validateReasoningInput({
        context: context({ permissions: { write: ['todos'] } }),
        insights: insights(),
      }),
      /INVALID_CONTEXT_PERMISSIONS/,
    );
    assert.throws(
      () => validateReasoningInput({ context: context(), insights: insights({ userId: 9 }) }),
      /REASONING_OWNERSHIP_MISMATCH/,
    );
    assert.throws(
      () => validateReasoningInput({ context: context(), insights: insights({ version: 'agent-insight-v2' }) }),
      /INVALID_AGENT_INSIGHTS/,
    );
    assert.throws(
      () => validateReasoningInput({
        context: context(),
        insights: insights({ insights: [{ id: 'x', evidence: [], confidence: 1, actionLevel: 'insight_only' }] }),
      }),
      /INVALID_AGENT_INSIGHTS/,
    );
  });

  test('normalizes bounded evidence-backed reasoning output', () => {
    const result = normalizeReasoning({
      version: REASONING_VERSION,
      generatedAt: '2026-09-18T00:00:00.000Z',
      userId: 7,
      scope: 'agent_home',
      available: true,
      summary: { title: '学习观察解释', narrative: '基于已有洞察。', insightCount: 1, evidenceCount: 1 },
      explanations: [{
        insightId: 'focus-trend-7d',
        insightType: 'focus_increase',
        title: '为什么出现专注趋势观察？',
        why: '该观察比较了最近 3 天与此前 4 天的专注记录。',
        evidenceRefs: [{ insightId: 'focus-trend-7d', index: 0, source: 'behavior_adapter', metric: 'focus_minutes', period: 'current_3d' }],
        confidence: 1,
        actionLevel: ACTION_LEVEL,
      }],
      permissions: { read: ['deterministic_insights'], write: [] },
      metadata: { readOnly: true, actionLevel: ACTION_LEVEL, sourceInsightVersion: 'agent-insight-v1', contextVersion: 'learning-context-v1' },
    });

    assert.equal(result.available, true);
    assert.equal(result.explanations.length, 1);
    assert.equal(result.explanations[0].actionLevel, 'insight_only');
    assert.equal(result.explanations[0].evidenceRefs[0].metric, 'focus_minutes');
    assert.deepEqual(result.permissions.write, []);
  });

  test('rejects malformed insight confidence without numeric coercion', () => {
    const invalidConfidences = [NaN, Infinity, null, undefined, '1', true, -0.1, 1.1];
    invalidConfidences.forEach((confidence) => {
      const insightsFixture = insights();
      insightsFixture.insights[0].confidence = confidence;
      assert.throws(
        () => validateReasoningInput({ context: context(), insights: insightsFixture }),
        /INVALID_AGENT_INSIGHTS/,
      );
    });
  });

  test('drops reasoning explanations whose confidence is not a bounded number', () => {
    const result = normalizeReasoning({
      version: REASONING_VERSION,
      generatedAt: '2026-09-18T00:00:00.000Z',
      userId: 7,
      scope: 'agent_home',
      available: true,
      explanations: [{
        insightId: 'focus-trend-7d',
        insightType: 'focus_increase',
        title: '为什么出现专注趋势观察？',
        why: '该观察比较了最近 3 天与此前 4 天的专注记录。',
        evidenceRefs: [{ insightId: 'focus-trend-7d', index: 0 }],
        confidence: '1',
        actionLevel: ACTION_LEVEL,
      }],
      permissions: { read: ['deterministic_insights'], write: [] },
      metadata: { readOnly: true, actionLevel: ACTION_LEVEL },
    });

    assert.equal(result.available, true);
    assert.deepEqual(result.explanations, []);
  });
});
