'use strict';

const EVIDENCE_LIMIT = 10;

function boundedText(value, maxLength = 160) {
  if (value == null) return '';
  return String(value)
    .split('')
    .filter((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127)
    .join('')
    .trim()
    .slice(0, maxLength);
}

function boundedNumber(value, max = 1000000) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.min(parsed, max);
}

function boundedUnit(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.min(parsed, 1);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function boundaryHasType(boundary, type) {
  return Boolean(boundary && boundary.type === type);
}

function createEvidence({ source, authority, metric, period, value }) {
  return {
    source: boundedText(source, 120),
    authority: boundedText(authority, 60),
    metric: boundedText(metric, 120),
    period: boundedText(period, 20),
    value,
    field: boundedText(metric, 120),
  };
}

function createInsight({
  id,
  type,
  title,
  explanation,
  source,
  authority,
  evidence,
}) {
  const boundedEvidence = asArray(evidence)
    .filter(Boolean)
    .slice(0, EVIDENCE_LIMIT);
  if (!id || !type || !title || !explanation || !source || !authority || boundedEvidence.length === 0) {
    return null;
  }

  return {
    id: boundedText(id, 120),
    type: boundedText(type, 60),
    title: boundedText(title),
    explanation: boundedText(explanation, 240),
    source: boundedText(source, 120),
    authority: boundedText(authority, 60),
    evidence: boundedEvidence,
    confidence: 1,
    actionLevel: 'insight_only',
  };
}

module.exports = {
  EVIDENCE_LIMIT,
  asArray,
  boundedNumber,
  boundedText,
  boundedUnit,
  boundaryHasType,
  createEvidence,
  createInsight,
};
