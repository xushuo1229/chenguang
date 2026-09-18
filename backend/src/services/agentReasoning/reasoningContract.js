'use strict';

const REASONING_VERSION = 'agent-reasoning-v1';
const SOURCE_INSIGHT_VERSION = 'agent-insight-v1';
const CONTEXT_VERSION = 'learning-context-v1';
const ACTION_LEVEL = 'insight_only';
const SCOPE = 'agent_home';
const MAX_EXPLANATIONS = 10;
const MAX_EVIDENCE_REFS = 10;
const MAX_TEXT = 240;

function boundedText(value, maxLength = 160) {
  if (value == null) return '';
  return String(value)
    .split('')
    .filter((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127)
    .join('')
    .trim()
    .slice(0, maxLength);
}

function boundedUnit(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.min(parsed, 1);
}

function invalidInput(message) {
  const error = new Error(message);
  error.code = message;
  error.statusCode = 400;
  return error;
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validateReasoningInput({ context, insights }) {
  if (!isObject(context) || context.version !== CONTEXT_VERSION || context.readOnly !== true) {
    throw invalidInput('INVALID_LEARNING_CONTEXT');
  }

  if (!isObject(context.permissions) || !Array.isArray(context.permissions.write) || context.permissions.write.length > 0) {
    throw invalidInput('INVALID_CONTEXT_PERMISSIONS');
  }

  if (!isObject(insights) || insights.version !== SOURCE_INSIGHT_VERSION || !Array.isArray(insights.insights)) {
    throw invalidInput('INVALID_AGENT_INSIGHTS');
  }

  if (!isObject(insights.metadata) || insights.metadata.readOnly !== true || insights.metadata.actionLevel !== ACTION_LEVEL) {
    throw invalidInput('INVALID_AGENT_INSIGHTS');
  }

  if (context.userId !== insights.userId || insights.scope !== SCOPE) {
    throw invalidInput('REASONING_OWNERSHIP_MISMATCH');
  }

  const valid = insights.insights.every((insight) => {
    if (!isObject(insight) || insight.actionLevel !== ACTION_LEVEL) return false;
    if (!Number.isFinite(Number(insight.confidence)) || Number(insight.confidence) < 0 || Number(insight.confidence) > 1) return false;
    return Array.isArray(insight.evidence) && insight.evidence.length > 0;
  });
  if (!valid) throw invalidInput('INVALID_AGENT_INSIGHTS');
}

function normalizeEvidenceRef({ insightId, index, source, metric, period }) {
  const boundedIndex = Number(index);
  return {
    insightId: boundedText(insightId, 120),
    index: Number.isInteger(boundedIndex) && boundedIndex >= 0 ? boundedIndex : -1,
    source: boundedText(source, 120),
    metric: boundedText(metric, 120),
    period: boundedText(period, 20),
  };
}

function normalizeExplanation(explanation) {
  if (!isObject(explanation)) return null;
  const evidenceRefs = Array.isArray(explanation.evidenceRefs)
    ? explanation.evidenceRefs.slice(0, MAX_EVIDENCE_REFS).map(normalizeEvidenceRef).filter((ref) => ref.insightId && ref.index >= 0)
    : [];
  if (!explanation.insightId || !explanation.insightType || !explanation.title || !explanation.why || !evidenceRefs.length) {
    return null;
  }

  return {
    insightId: boundedText(explanation.insightId, 120),
    insightType: boundedText(explanation.insightType, 60),
    title: boundedText(explanation.title, MAX_TEXT),
    why: boundedText(explanation.why, MAX_TEXT),
    evidenceRefs,
    confidence: boundedUnit(explanation.confidence),
    actionLevel: ACTION_LEVEL,
  };
}

function normalizeReasoning(payload) {
  if (!isObject(payload) || payload.version !== REASONING_VERSION || payload.scope !== SCOPE) {
    throw invalidInput('INVALID_AGENT_REASONING');
  }

  const explanations = Array.isArray(payload.explanations)
    ? payload.explanations.slice(0, MAX_EXPLANATIONS).map(normalizeExplanation).filter(Boolean)
    : [];
  if (!isObject(payload.permissions) || !Array.isArray(payload.permissions.write) || payload.permissions.write.length > 0) {
    throw invalidInput('INVALID_AGENT_REASONING');
  }
  if (!isObject(payload.metadata) || payload.metadata.readOnly !== true || payload.metadata.actionLevel !== ACTION_LEVEL) {
    throw invalidInput('INVALID_AGENT_REASONING');
  }

  return {
    version: payload.version,
    generatedAt: boundedText(payload.generatedAt, 30),
    userId: payload.userId,
    scope: payload.scope,
    available: payload.available === true,
    reason: boundedText(payload.reason, 40),
    summary: isObject(payload.summary) ? {
      title: boundedText(payload.summary.title, 120),
      narrative: boundedText(payload.summary.narrative, MAX_TEXT),
      insightCount: Number(payload.summary.insightCount) || 0,
      evidenceCount: Number(payload.summary.evidenceCount) || 0,
    } : null,
    explanations,
    permissions: {
      read: Array.isArray(payload.permissions.read) ? payload.permissions.read.slice(0, 10).map((item) => boundedText(item, 60)) : [],
      write: [],
    },
    metadata: {
      readOnly: true,
      actionLevel: ACTION_LEVEL,
      sourceInsightVersion: boundedText(payload.metadata.sourceInsightVersion, 40),
      contextVersion: boundedText(payload.metadata.contextVersion, 40),
    },
  };
}

module.exports = {
  ACTION_LEVEL,
  CONTEXT_VERSION,
  MAX_EXPLANATIONS,
  MAX_EVIDENCE_REFS,
  REASONING_VERSION,
  SCOPE,
  SOURCE_INSIGHT_VERSION,
  normalizeEvidenceRef,
  normalizeReasoning,
  validateReasoningInput,
};
