'use strict';

require('./setup');

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const agentInsightService = require('../src/services/agentInsightService');

function createContext(overrides = {}) {
  return {
    version: 'learning-context-v1',
    userId: 1,
    readOnly: true,
    behavior: {
      value: {
        taskSummary: { completed: 2, total: 4 },
      },
      source: 'reflection_context_source',
      authority: 'deterministic_projection',
      type: 'behavior_summary',
      confidence: 1,
    },
    knowledgeStates: {
      value: {
        weakTopics: [
          {
            knowledgeNodeId: 'node-1',
            title: 'Promise',
            masteryLevel: 0.2,
            confidence: 0.8,
            state: 'weak',
            evidenceCount: 2,
          },
        ],
      },
      source: 'student_knowledge_states',
      authority: 'source',
      type: 'student_knowledge_state_projection',
      confidence: 1,
    },
    ...overrides,
  };
}

describe('agent insight contract', () => {
  test('builds deterministic evidence-backed insights', () => {
    const result = agentInsightService.buildInsights(createContext());

    assert.equal(result.version, 'agent-insight-v1');
    assert.equal(result.scope, 'agent_home');
    assert.equal(result.metadata.readOnly, true);
    assert.equal(result.metadata.actionLevel, 'insight_only');
    assert.equal(result.metadata.contextVersion, 'learning-context-v1');
    assert.equal(result.insights.length, 2);

    const behavior = result.insights[0];
    assert.equal(behavior.kind, 'behavior_summary');
    assert.equal(behavior.headline, '今日完成 2/4 项任务。');
    assert.equal(behavior.evidence.length, 1);
    assert.equal(behavior.evidence[0].source, 'learning_context.behavior');
    assert.equal(behavior.evidence[0].authority, 'deterministic_projection');
    assert.equal(behavior.evidence[0].value, 2);

    const knowledge = result.insights[1];
    assert.equal(knowledge.kind, 'knowledge_state');
    assert.equal(knowledge.evidence[0].source, 'student_knowledge_states');
    assert.equal(knowledge.evidence[0].authority, 'source');
    assert.equal(knowledge.confidence, 0.8);
  });

  test('bounds confidence and only allows review or navigation actions', () => {
    const context = createContext();
    context.behavior.value.taskSummary.completed = 99;
    context.knowledgeStates.value.weakTopics[0].confidence = 2;

    const result = agentInsightService.buildInsights(context);
    for (const insight of result.insights) {
      assert.ok(insight.confidence >= 0 && insight.confidence <= 1);
      assert.ok(insight.evidence.length > 0);
      for (const action of insight.recommended_actions) {
        assert.ok(['review', 'navigate'].includes(action.type));
      }
    }
  });

  test('rejects invalid or writable learning context', () => {
    assert.throws(
      () => agentInsightService.buildInsights(null),
      /INVALID_LEARNING_CONTEXT/,
    );
    assert.throws(
      () => agentInsightService.buildInsights(createContext({ version: 'learning-context-v2' })),
      /INVALID_LEARNING_CONTEXT/,
    );
    assert.throws(
      () => agentInsightService.buildInsights(createContext({ readOnly: false })),
      /INVALID_LEARNING_CONTEXT/,
    );
  });
});
