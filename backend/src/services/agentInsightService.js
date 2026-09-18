'use strict';

const INSIGHT_VERSION = 'agent-insight-v1';
const ALLOWED_ACTION_TYPES = new Set(['review', 'navigate']);
const MAX_INSIGHTS = 10;

function boundedNumber(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.min(parsed, 1000000);
}

function boundedConfidence(value, fallback = 1) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.min(parsed, 1);
}

function boundedText(value, maxLength = 160) {
  if (value == null) return '';
  return String(value).slice(0, maxLength).trim();
}

function createEvidence(source, authority, field, value, comparison = null) {
  return {
    source: boundedText(source, 120),
    authority: boundedText(authority, 60),
    field: boundedText(field, 120),
    value,
    comparison,
  };
}

function buildBehaviorInsight(context) {
  const behavior = context && context.behavior;
  if (!behavior || behavior.type !== 'behavior_summary') return null;

  const taskSummary = behavior.value && behavior.value.taskSummary
    ? behavior.value.taskSummary
    : {};
  const total = boundedNumber(taskSummary.total);
  if (total === 0) return null;

  const completed = boundedNumber(taskSummary.completed);
  return {
    id: 'behavior-task-completion',
    kind: 'behavior_summary',
    headline: `今日完成 ${completed}/${total} 项任务。`,
    explanation: '根据当前用户已有的任务完成记录生成。',
    evidence: [
      createEvidence(
        'learning_context.behavior',
        'deterministic_projection',
        'taskSummary.completed',
        completed,
      ),
    ],
    confidence: 1,
    recommended_actions: [
      {
        type: 'review',
        label: '查看今日任务',
      },
    ],
  };
}

function buildKnowledgeInsights(context) {
  const knowledgeStates = context && context.knowledgeStates;
  if (!knowledgeStates || knowledgeStates.type !== 'student_knowledge_state_projection') {
    return [];
  }

  const weakTopics = knowledgeStates.value && Array.isArray(knowledgeStates.value.weakTopics)
    ? knowledgeStates.value.weakTopics
    : [];

  return weakTopics.slice(0, 3).map((topic, index) => ({
    id: `knowledge-state-weak-${index}`,
    kind: 'knowledge_state',
    headline: `${boundedText(topic.title, 120)} 当前掌握度较低。`,
    explanation: '根据当前用户的 Knowledge State 记录生成。',
    evidence: [
      createEvidence(
        'student_knowledge_states',
        'source',
        `weakTopics[${index}].masteryLevel`,
        boundedNumber(topic.masteryLevel),
      ),
    ],
    confidence: boundedConfidence(topic.confidence, 0.5),
    recommended_actions: [
      {
        type: 'review',
        label: '查看知识状态',
      },
    ],
  }));
}

function buildInsights(context) {
  if (!context || context.version !== 'learning-context-v1' || context.readOnly !== true) {
    const error = new Error('INVALID_LEARNING_CONTEXT');
    error.code = 'INVALID_LEARNING_CONTEXT';
    error.statusCode = 400;
    throw error;
  }

  const insights = [buildBehaviorInsight(context), ...buildKnowledgeInsights(context)]
    .filter(Boolean)
    .slice(0, MAX_INSIGHTS)
    .map((insight) => ({
      ...insight,
      headline: boundedText(insight.headline),
      explanation: boundedText(insight.explanation),
      confidence: boundedConfidence(insight.confidence),
      recommended_actions: insight.recommended_actions.filter((action) =>
        action && ALLOWED_ACTION_TYPES.has(action.type)),
    }));

  return {
    version: INSIGHT_VERSION,
    generatedAt: new Date().toISOString(),
    userId: context.userId,
    scope: 'agent_home',
    insights,
    metadata: {
      readOnly: true,
      actionLevel: 'insight_only',
      contextVersion: context.version,
    },
  };
}

module.exports = {
  INSIGHT_VERSION,
  buildInsights,
};
