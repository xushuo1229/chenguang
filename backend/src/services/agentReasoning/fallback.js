'use strict';

const {
  ACTION_LEVEL,
  CONTEXT_VERSION,
  REASONING_VERSION,
  SCOPE,
  SOURCE_INSIGHT_VERSION,
} = require('./reasoningContract');

const FALLBACK_REASONS = new Set(['no_insights', 'reasoning_unavailable']);

function buildFallback({
  userId,
  reason = 'reasoning_unavailable',
  generatedAt,
}) {
  if (!FALLBACK_REASONS.has(reason)) {
    throw new Error('INVALID_REASONING_FALLBACK');
  }

  return {
    version: REASONING_VERSION,
    generatedAt,
    userId,
    scope: SCOPE,
    available: false,
    reason,
    summary: {
      title: '暂无推理解释',
      narrative: '当前没有可解释的结构化洞察。',
      insightCount: 0,
      evidenceCount: 0,
    },
    explanations: [],
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
  };
}

module.exports = {
  FALLBACK_REASONS,
  buildFallback,
};
