'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { buildLlmContext, toProviderPayload } = require('../src/services/agentFirewall/contextFirewall');
const { CONSTRAINTS } = require('../src/services/agentFirewall/contextFirewall');

function context() {
  return {
    version: 'learning-context-v1',
    userId: 7,
    actionLevel: 'insight_only',
    readOnly: true,
    permissions: { read: ['deterministic_insights'], write: [] },
    courses: { source: 'cgstore.sync.courses', authority: 'source', type: 'source_projection', confidence: 1 },
  };
}

function evidence(value = 80) {
  return { source: 'behavior_adapter', authority: 'deterministic_projection', metric: 'focus_minutes', period: 'current_3d', value };
}

function insights() {
  return {
    version: 'agent-insight-v1',
    userId: 7,
    scope: 'agent_home',
    insights: [{
      id: 'focus-trend-7d',
      type: 'focus_increase',
      title: '过去 7 天专注趋势上升。',
      explanation: '最近 3 天日均专注时间高于此前 4 天。',
      source: 'behavior_adapter',
      authority: 'deterministic_projection',
      evidence: [evidence()],
      confidence: 1,
      actionLevel: 'insight_only',
    }],
    metadata: { readOnly: true, actionLevel: 'insight_only', contextVersion: 'learning-context-v1' },
  };
}

function reasoning() {
  return {
    version: 'agent-reasoning-v1',
    userId: 7,
    scope: 'agent_home',
    available: true,
    explanations: [{
      insightId: 'focus-trend-7d',
      insightType: 'focus_increase',
      title: '为什么出现专注趋势观察？',
      why: '该观察比较了最近 3 天与此前 4 天的专注记录。',
      evidenceRefs: [{ insightId: 'focus-trend-7d', index: 0, source: 'behavior_adapter', metric: 'focus_minutes', period: 'current_3d' }],
      confidence: 1,
      actionLevel: 'insight_only',
    }],
    permissions: { read: ['deterministic_insights'], write: [] },
    metadata: { readOnly: true, actionLevel: 'insight_only', sourceInsightVersion: 'agent-insight-v1', contextVersion: 'learning-context-v1' },
  };
}

test('builds a bounded provider-neutral firewall context', () => {
  const result = buildLlmContext({ context: context(), insights: insights(), reasoning: reasoning() });
  assert.equal(result.version, 'agent-llm-context-v1');
  assert.equal(result.ownerUserId, 7);
  assert.equal(result.available, true);
  assert.equal(result.metadata.actionLevel, 'insight_only');
  assert.deepEqual(result.metadata, { readOnly: true, actionLevel: 'insight_only', providerIndependent: true });
  assert.ok(result.insights[0].evidence[0].evidenceId);
  assert.ok(result.reasoning[0].evidenceRefs[0].metric);
  assert.ok(Buffer.byteLength(JSON.stringify(result)) <= CONSTRAINTS.maxBytes);
});

test('provider payload excludes owner identity and internal permissions', () => {
  const firewall = buildLlmContext({ context: context(), insights: insights(), reasoning: reasoning() });
  const payload = toProviderPayload(firewall);
  const serialized = JSON.stringify(payload);
  assert.equal('ownerUserId' in payload, false);
  assert.doesNotMatch(serialized, /ownerUserId|"userId"|permissions\.write/);
});

test('rejects invalid schema, task, confidence, and malformed provenance', () => {
  const invalidConfidence = insights();
  invalidConfidence.insights[0].confidence = '1';
  assert.throws(() => buildLlmContext({ context: context(), insights: invalidConfidence, reasoning: reasoning() }), /INVALID_AGENT_INSIGHTS/);

  const missingEvidence = insights();
  missingEvidence.insights[0].evidence = [];
  assert.throws(() => buildLlmContext({ context: context(), insights: missingEvidence, reasoning: reasoning() }), /INVALID_AGENT_INSIGHTS/);

  const badRef = reasoning();
  badRef.explanations[0].evidenceRefs[0].index = -1;
  assert.throws(() => buildLlmContext({ context: context(), insights: insights(), reasoning: badRef }), /INVALID_AGENT_REASONING/);

  assert.throws(() => buildLlmContext({ context: context(), insights: insights(), reasoning: reasoning(), task: 'free_prompt' }), /INVALID_FIREWALL_TASK/);
});

test('fails closed on secrets, credentials, and ownership mismatch', () => {
  const secretContext = context();
  secretContext.providerCredentials = { apiKey: 'should-not-enter' };
  assert.throws(() => buildLlmContext({ context: secretContext, insights: insights(), reasoning: reasoning() }), /SENSITIVE_FIREWALL_INPUT/);

  const tokenInsights = insights();
  tokenInsights.insights[0].authToken = 'jwt-value';
  assert.throws(() => buildLlmContext({ context: context(), insights: tokenInsights, reasoning: reasoning() }), /SENSITIVE_FIREWALL_INPUT/);

  const otherInsights = insights();
  otherInsights.userId = 8;
  assert.throws(() => buildLlmContext({ context: context(), insights: otherInsights, reasoning: reasoning() }), /FIREWALL_OWNERSHIP_MISMATCH/);

  const writable = context();
  writable.permissions.write = ['todos'];
  assert.throws(() => buildLlmContext({ context: writable, insights: insights(), reasoning: reasoning() }), /INVALID_CONTEXT_PERMISSIONS/);
});

test('enforces deterministic ordering, truncation flags, and stable output', () => {
  const manyInsights = insights();
  for (let index = 0; index < 5; index += 1) {
    manyInsights.insights.push({
      id: `a-insight-${String(index).padStart(2, '0')}`,
      type: 'course_progress_status',
      title: `观察 ${index}`,
      explanation: 'x'.repeat(240),
      source: 'course_knowledge_adapter',
      authority: 'deterministic_projection',
      evidence: [evidence(index)],
      confidence: 1,
      actionLevel: 'insight_only',
    });
  }
  const first = buildLlmContext({ context: context(), insights: manyInsights, reasoning: reasoning() });
  const second = buildLlmContext({ context: context(), insights: manyInsights, reasoning: reasoning() });
  assert.deepEqual(first, second);
  assert.equal(first.insights.length, CONSTRAINTS.maxInsights);
  assert.deepEqual(first.insights.map((insight) => insight.id), [...first.insights.map((insight) => insight.id)].sort());
  assert.equal(first.insights[1].truncated, false);
  assert.ok(Buffer.byteLength(JSON.stringify(first)) <= CONSTRAINTS.maxBytes);
});

test('filters unavailable and unsupported source authority', () => {
  const mixed = context();
  mixed.courseKnowledge = { source: 'course_space', authority: 'ai_generated', type: 'course', confidence: 1 };
  mixed.memories = { growth: { source: 'cgstore.user.memory', authority: 'derived_memory', type: 'growth_memory_projection', confidence: 0.5 } };
  const result = buildLlmContext({ context: mixed, insights: insights(), reasoning: reasoning() });
  assert.equal(result.sources.some((source) => source.authority === 'ai_generated'), false);
});

test('drops deterministic lowest-priority items before exceeding the byte budget', () => {
  const largeInsights = insights();
  for (let index = 0; index < 5; index += 1) {
    largeInsights.insights.push({
      id: `course-insight-${String(index).padStart(2, '0')}`,
      type: 'course_progress_status',
      title: `课程知识节点状态观察 ${index}。`,
      explanation: 'x'.repeat(240),
      source: 'course_knowledge_adapter',
      authority: 'deterministic_projection',
      evidence: [
        evidence('x'.repeat(160)),
        evidence('y'.repeat(160)),
        evidence('z'.repeat(160)),
      ],
      confidence: 1,
      actionLevel: 'insight_only',
    });
  }
  const result = buildLlmContext({ context: context(), insights: largeInsights, reasoning: reasoning() });
  assert.equal(result.truncated, true);
  assert.ok(result.insights.length < CONSTRAINTS.maxInsights);
  assert.ok(Buffer.byteLength(JSON.stringify(result)) <= CONSTRAINTS.maxBytes);
});
