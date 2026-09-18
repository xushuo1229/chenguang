'use strict';

const {
  ACTION_LEVEL,
  CONTEXT_VERSION,
  MAX_EXPLANATIONS,
  REASONING_VERSION,
  SCOPE,
  SOURCE_INSIGHT_VERSION,
  normalizeReasoning,
  validateReasoningInput,
} = require('./reasoningContract');
const { buildFallback } = require('./fallback');
const { buildExplanationForInsight } = require('./reasoningRules');

function countEvidence(insights) {
  return insights.reduce((total, insight) => total + (Array.isArray(insight.evidence) ? insight.evidence.length : 0), 0);
}

function buildReasoning({ context, insights }) {
  validateReasoningInput({ context, insights });

  if (!insights.insights.length) {
    return normalizeReasoning(buildFallback({
      userId: context.userId,
      reason: 'no_insights',
      generatedAt: new Date().toISOString(),
    }));
  }

  const explanations = insights.insights
    .slice(0, MAX_EXPLANATIONS)
    .map(buildExplanationForInsight)
    .filter(Boolean);

  if (!explanations.length) {
    return normalizeReasoning(buildFallback({
      userId: context.userId,
      reason: 'no_insights',
      generatedAt: new Date().toISOString(),
    }));
  }

  return normalizeReasoning({
    version: REASONING_VERSION,
    generatedAt: new Date().toISOString(),
    userId: context.userId,
    scope: SCOPE,
    available: true,
    summary: {
      title: '学习观察解释',
      narrative: '以下解释只基于已验证的结构化洞察。',
      insightCount: explanations.length,
      evidenceCount: countEvidence(insights.insights),
    },
    explanations,
    permissions: {
      read: ['deterministic_insights'],
      write: [],
    },
    metadata: {
      readOnly: true,
      actionLevel: ACTION_LEVEL,
      sourceInsightVersion: SOURCE_INSIGHT_VERSION,
      contextVersion: CONTEXT_VERSION,
    },
  });
}

module.exports = {
  buildReasoning,
};
