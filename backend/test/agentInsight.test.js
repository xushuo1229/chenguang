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
        recent7: {
          focusMinutes: 0,
          current3FocusMinutes: 0,
          previous4FocusMinutes: 0,
          studyActiveDays: 0,
        },
      },
      source: 'sync.activity',
      authority: 'deterministic_projection',
      type: 'behavior_summary',
      confidence: 1,
    },
    knowledgeStates: {
      value: {
        weakTopics: [{
          knowledgeNodeId: 'node-1',
          title: 'Promise',
          masteryLevel: 0.2,
          confidence: 0.8,
          state: 'weak',
          evidenceCount: 2,
        }],
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
  test('builds a stable agent-insight-v1 payload', () => {
    const result = agentInsightService.buildInsights(createContext());

    assert.equal(result.version, 'agent-insight-v1');
    assert.equal(result.scope, 'agent_home');
    assert.equal(result.userId, 1);
    assert.equal(result.metadata.readOnly, true);
    assert.equal(result.metadata.actionLevel, 'insight_only');
    assert.equal(result.metadata.contextVersion, 'learning-context-v1');
    assert.equal(result.insights.length, 1);

    const knowledge = result.insights[0];
    assert.equal(knowledge.type, 'knowledge_gap_detected');
    assert.equal(knowledge.title, '检测到 1 个薄弱知识主题。');
    assert.equal(knowledge.actionLevel, 'insight_only');
    assert.equal(knowledge.confidence, 1);
    assert.equal(knowledge.evidence.length, 1);
    assert.equal(knowledge.evidence[0].source, 'student_knowledge_adapter');
    assert.equal(knowledge.recommended_actions, undefined);
  });

  test('rejects invalid or writable learning context', () => {
    assert.throws(() => agentInsightService.buildInsights(null), /INVALID_LEARNING_CONTEXT/);
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
