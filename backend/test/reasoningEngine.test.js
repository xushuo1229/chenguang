require('./setup');

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { buildReasoning } = require('../src/services/agentReasoning/reasoningEngine');

function context() {
  return {
    version: 'learning-context-v1',
    userId: 7,
    readOnly: true,
    permissions: { read: ['deterministic_insights'], write: [] },
  };
}

function insightFixture(id, type, metric, value) {
  return {
    id,
    type,
    title: '结构化观察',
    explanation: '来自确定性规则。',
    source: 'sync.activity',
    authority: 'deterministic_projection',
    evidence: [{
      source: 'behavior_adapter',
      authority: 'deterministic_projection',
      metric,
      period: 'current_3d',
      value,
    }],
    confidence: 1,
    actionLevel: 'insight_only',
  };
}

function insightsFixture(items = [insightFixture('focus-trend-7d', 'focus_increase', 'focus_minutes', 80)], overrides = {}) {
  return {
    version: 'agent-insight-v1',
    userId: 7,
    scope: 'agent_home',
    insights: items,
    metadata: { readOnly: true, actionLevel: 'insight_only', contextVersion: 'learning-context-v1' },
    ...overrides,
  };
}

describe('deterministic reasoning engine', () => {
  test('builds evidence-backed explanations without inventing facts', () => {
    const first = buildReasoning({ context: context(), insights: insightsFixture() });
    const second = buildReasoning({ context: context(), insights: insightsFixture() });

    assert.equal(first.version, 'agent-reasoning-v1');
    assert.equal(first.available, true);
    assert.equal(first.summary.insightCount, 1);
    assert.equal(first.explanations.length, 1);
    assert.equal(first.explanations[0].insightId, 'focus-trend-7d');
    assert.equal(first.explanations[0].why, '该观察比较了最近 3 天与此前 4 天的专注记录。');
    assert.equal(first.explanations[0].evidenceRefs.length, 1);
    assert.equal(first.explanations[0].evidenceRefs[0].metric, 'focus_minutes');
    assert.equal(first.explanations[0].confidence, 1);
    assert.equal(first.explanations[0].actionLevel, 'insight_only');
    assert.equal(first.explanations[0].recommendations, undefined);
    assert.equal(first.explanations[0].actions, undefined);
    assert.deepEqual(first.permissions.write, []);

    assert.deepEqual(
      first.explanations,
      second.explanations,
    );
  });

  test('bounds explanations and keeps confidence within the unit interval', () => {
    const items = Array.from({ length: 14 }, (_, index) => insightFixture(
      `insight-${index}`,
      'focus_increase',
      'focus_minutes',
      index,
    ));
    const result = buildReasoning({ context: context(), insights: insightsFixture(items) });
    assert.equal(result.explanations.length, 10);
    for (const explanation of result.explanations) {
      assert.ok(explanation.confidence >= 0 && explanation.confidence <= 1);
      assert.ok(explanation.evidenceRefs.length > 0);
    }
  });

  test('returns fallback when no insights are available', () => {
    const result = buildReasoning({ context: context(), insights: insightsFixture([]) });
    assert.equal(result.available, false);
    assert.equal(result.reason, 'no_insights');
    assert.deepEqual(result.explanations, []);
    assert.deepEqual(result.permissions.write, []);
  });

  test('rejects context and insight ownership mismatch', () => {
    assert.throws(
      () => buildReasoning({ context: context(), insights: insightsFixture(undefined, { userId: 9 }) }),
      /REASONING_OWNERSHIP_MISMATCH/,
    );
  });
});
