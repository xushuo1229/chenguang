'use strict';

const { buildCourseProgressRule } = require('./rules/courseProgressRule');
const { buildFocusTrendRule } = require('./rules/focusTrendRule');
const { buildKnowledgeGapRule } = require('./rules/knowledgeGapRule');
const { buildLearningConsistencyRule } = require('./rules/learningConsistencyRule');
const {
  boundedNumber,
  boundedText,
  boundedUnit,
} = require('./ruleSupport');

const INSIGHT_VERSION = 'agent-insight-v1';
const ACTION_LEVEL = 'insight_only';
const MAX_INSIGHTS = 10;
const MAX_EVIDENCE = 10;

const RULES = [
  ['behavior', buildFocusTrendRule],
  ['behavior', buildLearningConsistencyRule],
  ['knowledgeStates', buildKnowledgeGapRule],
  ['courseKnowledge', buildCourseProgressRule],
];

function normalizeEvidence(evidence) {
  if (!evidence || typeof evidence !== 'object') return null;
  return {
    source: boundedText(evidence.source, 120),
    authority: boundedText(evidence.authority, 60),
    metric: boundedText(evidence.metric, 120),
    period: boundedText(evidence.period, 20),
    value: evidence.value,
    field: boundedText(evidence.metric || evidence.field, 120),
  };
}

function normalizeInsight(insight) {
  if (!insight || typeof insight !== 'object') return null;
  const evidence = Array.isArray(insight.evidence)
    ? insight.evidence.slice(0, MAX_EVIDENCE).map(normalizeEvidence).filter(Boolean)
    : [];
  if (!insight.id || !insight.type || !insight.title || !insight.source || !evidence.length) {
    return null;
  }

  return {
    id: boundedText(insight.id, 120),
    type: boundedText(insight.type, 60),
    title: boundedText(insight.title),
    explanation: boundedText(insight.explanation, 240),
    source: boundedText(insight.source, 120),
    authority: boundedText(insight.authority, 60),
    evidence,
    confidence: boundedUnit(insight.confidence),
    actionLevel: ACTION_LEVEL,
    kind: boundedText(insight.type, 60),
    headline: boundedText(insight.title),
  };
}

function buildInsights(context) {
  if (!context || context.version !== 'learning-context-v1' || context.readOnly !== true) {
    const error = new Error('INVALID_LEARNING_CONTEXT');
    error.code = 'INVALID_LEARNING_CONTEXT';
    error.statusCode = 400;
    throw error;
  }

  const insights = RULES
    .map(([field, rule]) => rule(context[field]))
    .filter(Boolean)
    .slice(0, MAX_INSIGHTS)
    .map(normalizeInsight)
    .filter(Boolean)
    .map((insight) => ({
      ...insight,
      confidence: boundedNumber(insight.confidence, 1) === 1 ? 1 : 0,
    }));

  return {
    version: INSIGHT_VERSION,
    generatedAt: new Date().toISOString(),
    userId: context.userId,
    scope: 'agent_home',
    insights,
    metadata: {
      readOnly: true,
      actionLevel: ACTION_LEVEL,
      contextVersion: context.version,
    },
  };
}

module.exports = {
  ACTION_LEVEL,
  INSIGHT_VERSION,
  MAX_INSIGHTS,
  buildInsights,
};
