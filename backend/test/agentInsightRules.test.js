require('./setup');

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const insightEngine = require('../src/services/agentInsights/insightEngine');
const { buildCourseProgressRule } = require('../src/services/agentInsights/rules/courseProgressRule');
const { buildFocusTrendRule } = require('../src/services/agentInsights/rules/focusTrendRule');
const { buildKnowledgeGapRule } = require('../src/services/agentInsights/rules/knowledgeGapRule');
const { buildLearningConsistencyRule } = require('../src/services/agentInsights/rules/learningConsistencyRule');

function behavior(overrides = {}) {
  return {
    type: 'behavior_summary',
    source: 'sync.activity',
    authority: 'deterministic_projection',
    value: {
      recent7: {
        focusMinutes: 120,
        current3FocusMinutes: 80,
        previous4FocusMinutes: 40,
        studyActiveDays: 4,
        current3StudyDays: 2,
        previous4StudyDays: 2,
        ...overrides,
      },
    },
  };
}

function context(overrides = {}) {
  return {
    version: 'learning-context-v1',
    userId: 7,
    readOnly: true,
    behavior: behavior(),
    knowledgeStates: {
      type: 'student_knowledge_state_projection',
      source: 'student_knowledge_states',
      authority: 'source',
      value: {
        weakTopics: [
          { title: 'Promise', masteryLevel: 0.2, confidence: 0.8 },
          { title: 'Event Loop', masteryLevel: 0.35, confidence: 0.7 },
        ],
      },
    },
    courseKnowledge: {
      type: 'course_knowledge_projection',
      source: 'course_space',
      authority: 'source',
      value: {
        nodes: [
          { title: 'Promise', status: 'accepted' },
          { title: 'Event Loop', status: 'validated' },
          { title: 'Macrotask', status: 'candidate' },
        ],
      },
    },
    ...overrides,
  };
}

describe('deterministic insight rules', () => {
  test('focus trend produces increase, decline, or nothing without guessing', () => {
    const increase = buildFocusTrendRule(behavior());
    assert.equal(increase.type, 'focus_increase');
    assert.equal(increase.confidence, 1);
    assert.equal(increase.evidence[0].metric, 'focus_minutes');

    const decline = buildFocusTrendRule(behavior({
      current3FocusMinutes: 20,
      previous4FocusMinutes: 80,
    }));
    assert.equal(decline.type, 'focus_decline');

    assert.equal(buildFocusTrendRule(behavior({
      focusMinutes: 0,
      current3FocusMinutes: 0,
      previous4FocusMinutes: 0,
    })), null);
  });

  test('learning consistency is derived only from projected study days', () => {
    const stable = buildLearningConsistencyRule(behavior());
    assert.equal(stable.type, 'consistency_stable');
    assert.equal(stable.evidence[0].metric, 'study_active_days');

    const drop = buildLearningConsistencyRule(behavior({
      current3StudyDays: 0,
      studyActiveDays: 2,
    }));
    assert.equal(drop.type, 'consistency_drop');

    assert.equal(buildLearningConsistencyRule(behavior({ studyActiveDays: 0 })), null);
  });

  test('knowledge gap aggregates bounded weak topics with evidence', () => {
    const insight = buildKnowledgeGapRule(context().knowledgeStates);
    assert.equal(insight.type, 'knowledge_gap_detected');
    assert.equal(insight.evidence.length, 2);
    assert.equal(insight.evidence[0].value, 0.2);
    assert.equal(buildKnowledgeGapRule(null), null);
  });

  test('course progress reports bounded node lifecycle facts', () => {
    const nodes = Array.from({ length: 14 }, (_, index) => ({
      title: `Node ${index}`,
      status: index < 6 ? 'accepted' : 'validated',
    }));
    const insight = buildCourseProgressRule({
      type: 'course_knowledge_projection',
      source: 'course_space',
      authority: 'source',
      value: { nodes },
    });

    assert.equal(insight.type, 'course_progress_status');
    assert.equal(insight.explanation, '其中 accepted 6 个，validated 4 个。');
    assert.equal(insight.evidence[0].value, 10);
    assert.equal(buildCourseProgressRule({ type: 'course_knowledge_projection', value: { nodes: [] } }), null);
  });

  test('engine output is deterministic, bounded, evidence-backed and insight-only', () => {
    const first = insightEngine.buildInsights(context());
    const second = insightEngine.buildInsights(context());
    assert.equal(first.insights.length, 4);
    assert.deepEqual(
      first.insights.map(({ generatedAt, ...insight }) => insight),
      second.insights.map(({ generatedAt, ...insight }) => insight),
    );

    for (const insight of first.insights) {
      assert.equal(insight.actionLevel, 'insight_only');
      assert.equal(insight.confidence, 1);
      assert.ok(insight.evidence.length > 0);
      assert.equal(insight.recommended_actions, undefined);
      assert.equal(insight.actions, undefined);
    }
  });

  test('empty adapter data creates no insights', () => {
    const result = insightEngine.buildInsights({
      version: 'learning-context-v1',
      userId: 7,
      readOnly: true,
      behavior: behavior({ focusMinutes: 0, current3FocusMinutes: 0, previous4FocusMinutes: 0, studyActiveDays: 0 }),
      knowledgeStates: { type: 'student_knowledge_state_projection', value: { weakTopics: [] } },
      courseKnowledge: { type: 'course_knowledge_projection', value: { nodes: [] } },
    });
    assert.deepEqual(result.insights, []);
  });

  test('output keeps the caller-owned user boundary and rejects writable context', () => {
    const owner = insightEngine.buildInsights(context());
    const other = insightEngine.buildInsights(context({ userId: 9 }));
    assert.equal(owner.userId, 7);
    assert.equal(other.userId, 9);

    assert.throws(() => insightEngine.buildInsights(context({ readOnly: false })), /INVALID_LEARNING_CONTEXT/);
    assert.throws(() => insightEngine.buildInsights(context({ version: 'learning-context-v2' })), /INVALID_LEARNING_CONTEXT/);
  });
});
