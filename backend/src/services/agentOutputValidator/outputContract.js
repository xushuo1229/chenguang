'use strict';

const { OUTPUT_LIMITS } = require('./outputLimits');

const OUTPUT_SCHEMA_VERSION = 'agent-llm-output-v1';
const OUTPUT_STATUSES = new Set(['validated', 'partial', 'fallback']);
const CLAIM_TYPES = new Set(['fact', 'interpretation', 'suggestion', 'uncertainty']);
const ACTION_LEVEL = 'insight_only';
const SENSITIVE_KEY_PATTERN = /(jwt|authtoken|accesstoken|refreshtoken|apikey|api_key|password|secret|credential|cookie|authorization|sessionid)/i;
const EVIDENCE_REF_FIELDS = new Set(['insightId', 'evidenceId', 'metric', 'period']);
const REASONING_REF_FIELDS = new Set(['reasoningId', 'insightId']);
const EXPLANATION_FIELDS = new Set(['id', 'type', 'text', 'generationConfidence', 'evidenceRefs', 'reasoningRefs']);
const SUGGESTION_FIELDS = new Set(['id', 'type', 'text', 'generationConfidence']);
const UNCERTAINTY_FIELDS = new Set(['id', 'type', 'text']);
const METADATA_FIELDS = new Set(['readOnly', 'actionLevel', 'providerIndependent']);
const FALLBACK_FIELDS = new Set(['type', 'reason', 'source']);
const FALLBACK_REASONS = new Set([
  'llm_unavailable',
  'llm_not_configured',
  'llm_timeout',
  'llm_malformed',
  'llm_schema_invalid',
  'llm_unsafe',
  'llm_unsupported_claim',
  'llm_evidence_mismatch',
  'llm_context_mismatch',
  'llm_output_too_large',
  'llm_rate_limited',
]);

function createError(path, code) {
  return { path, code };
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isFiniteUnit(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isBoundedString(value, maxLength) {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength;
}

function rejectSensitiveKeys(value, path, errors) {
  if (!value || typeof value !== 'object') return;
  Object.keys(value).forEach((key) => {
    const keyPath = `${path}.${key}`;
    if (SENSITIVE_KEY_PATTERN.test(key.replace(/[-_\s]/g, ''))) {
      errors.push(createError(keyPath, 'SENSITIVE_FIELD'));
    }
    if (value[key] && typeof value[key] === 'object') rejectSensitiveKeys(value[key], keyPath, errors);
  });
}

function checkUnknownFields(value, allowed, path, errors) {
  Object.keys(value).forEach((key) => {
    if (!allowed.has(key)) errors.push(createError(`${path}.${key}`, 'UNKNOWN_FIELD'));
  });
}

function validateEvidenceRef(ref, path, errors, index = 0) {
  if (!isObject(ref)) {
    errors.push(createError(path, 'INVALID_FIELD_TYPE'));
    return;
  }
  checkUnknownFields(ref, EVIDENCE_REF_FIELDS, path, errors);
  ['insightId', 'evidenceId', 'metric', 'period'].forEach((field) => {
    if (!isBoundedString(ref[field], field === 'period' ? 20 : 120)) {
      errors.push(createError(`${path}.${field}`, 'INVALID_REFERENCE'));
    }
  });
  const expectedEvidenceId = `${ref.insightId}:${index}`;
  if (ref.evidenceId !== expectedEvidenceId) {
    errors.push(createError(`${path}.evidenceId`, 'INVALID_REFERENCE'));
  }
}

function validateReasoningRef(ref, path, errors) {
  if (!isObject(ref)) {
    errors.push(createError(path, 'INVALID_FIELD_TYPE'));
    return;
  }
  checkUnknownFields(ref, REASONING_REF_FIELDS, path, errors);
  if (!isBoundedString(ref.reasoningId, 140)) {
    errors.push(createError(`${path}.reasoningId`, 'INVALID_REFERENCE'));
  }
  if (!isBoundedString(ref.insightId, 120)) {
    errors.push(createError(`${path}.insightId`, 'INVALID_REFERENCE'));
  }
  if (ref.insightId && ref.reasoningId && ref.reasoningId !== `reasoning:${ref.insightId}`) {
    errors.push(createError(`${path}.reasoningId`, 'INVALID_REFERENCE'));
  }
}

function validateExplanation(item, index, errors) {
  const path = `explanations[${index}]`;
  if (!isObject(item)) {
    errors.push(createError(path, 'INVALID_FIELD_TYPE'));
    return;
  }
  checkUnknownFields(item, EXPLANATION_FIELDS, path, errors);
  if (!isBoundedString(item.id, OUTPUT_LIMITS.MAX_ID_LENGTH)) {
    errors.push(createError(`${path}.id`, 'MISSING_REQUIRED_FIELD'));
  }
  if (!CLAIM_TYPES.has(item.type)) {
    errors.push(createError(`${path}.type`, 'INVALID_EXPLANATION_TYPE'));
  }
  if (!isBoundedString(item.text, OUTPUT_LIMITS.MAX_EXPLANATION_LENGTH)) {
    errors.push(createError(`${path}.text`, 'INVALID_EXPLANATION_LENGTH'));
  }
  if (item.generationConfidence !== undefined && !isFiniteUnit(item.generationConfidence)) {
    errors.push(createError(`${path}.generationConfidence`, 'INVALID_CONFIDENCE'));
  }
  if (item.type === 'fact') {
    if (!Array.isArray(item.evidenceRefs) || !item.evidenceRefs.length || item.evidenceRefs.length > OUTPUT_LIMITS.MAX_EVIDENCE_REFS_PER_CLAIM) {
      errors.push(createError(`${path}.evidenceRefs`, 'INVALID_EVIDENCE_REFS'));
    } else {
      item.evidenceRefs.forEach((ref, refIndex) => validateEvidenceRef(ref, `${path}.evidenceRefs[${refIndex}]`, errors, refIndex));
    }
    if (!Array.isArray(item.reasoningRefs) || !item.reasoningRefs.length || item.reasoningRefs.length > OUTPUT_LIMITS.MAX_REASONING_REFS_PER_CLAIM) {
      errors.push(createError(`${path}.reasoningRefs`, 'INVALID_REASONING_REFS'));
    } else {
      item.reasoningRefs.forEach((ref, refIndex) => validateReasoningRef(ref, `${path}.reasoningRefs[${refIndex}]`, errors));
    }
    if (item.generationConfidence !== undefined) {
      errors.push(createError(`${path}.generationConfidence`, 'FORBIDDEN_FACT_CONFIDENCE'));
    }
  }
  if (item.type === 'interpretation') {
    if (!Array.isArray(item.evidenceRefs) || !item.evidenceRefs.length || item.evidenceRefs.length > OUTPUT_LIMITS.MAX_EVIDENCE_REFS_PER_CLAIM) {
      errors.push(createError(`${path}.evidenceRefs`, 'INVALID_EVIDENCE_REFS'));
    } else {
      item.evidenceRefs.forEach((ref, refIndex) => validateEvidenceRef(ref, `${path}.evidenceRefs[${refIndex}]`, errors, refIndex));
    }
    if (item.reasoningRefs !== undefined) {
      if (!Array.isArray(item.reasoningRefs) || item.reasoningRefs.length > OUTPUT_LIMITS.MAX_REASONING_REFS_PER_CLAIM) {
        errors.push(createError(`${path}.reasoningRefs`, 'INVALID_REASONING_REFS'));
      } else {
        item.reasoningRefs.forEach((ref, refIndex) => validateReasoningRef(ref, `${path}.reasoningRefs[${refIndex}]`, errors));
      }
    }
  }
  if ((item.type === 'suggestion' || item.type === 'uncertainty') && (item.evidenceRefs !== undefined || item.reasoningRefs !== undefined)) {
    errors.push(createError(`${path}.evidenceRefs`, 'FORBIDDEN_PROVENANCE'));
  }
}

function validateSimpleItems(items, allowedFields, code, maxLength, path, errors) {
  items.forEach((item, index) => {
    const itemPath = `${path}[${index}]`;
    if (!isObject(item)) {
      errors.push(createError(itemPath, 'INVALID_FIELD_TYPE'));
      return;
    }
    checkUnknownFields(item, allowedFields, itemPath, errors);
    if (!isBoundedString(item.id, OUTPUT_LIMITS.MAX_ID_LENGTH)) {
      errors.push(createError(`${itemPath}.id`, 'MISSING_REQUIRED_FIELD'));
    }
    if (item.type !== code) {
      errors.push(createError(`${itemPath}.type`, 'INVALID_EXPLANATION_TYPE'));
    }
    if (!isBoundedString(item.text, maxLength)) {
      errors.push(createError(`${itemPath}.text`, `${code.toUpperCase()}_TOO_LONG`));
    }
    if (item.generationConfidence !== undefined && !isFiniteUnit(item.generationConfidence)) {
      errors.push(createError(`${itemPath}.generationConfidence`, 'INVALID_CONFIDENCE'));
    }
  });
}

function validateFallbackExplanation(item, index, errors) {
  const path = `explanations[${index}]`;
  if (!isObject(item)) {
    errors.push(createError(path, 'INVALID_FIELD_TYPE'));
    return;
  }
  checkUnknownFields(item, new Set(['id', 'insightId', 'title', 'why', 'evidenceRefs']), path, errors);
  if (!isBoundedString(item.id, OUTPUT_LIMITS.MAX_ID_LENGTH)) errors.push(createError(`${path}.id`, 'MISSING_REQUIRED_FIELD'));
  if (!isBoundedString(item.insightId, OUTPUT_LIMITS.MAX_ID_LENGTH)) errors.push(createError(`${path}.insightId`, 'MISSING_REQUIRED_FIELD'));
  if (!isBoundedString(item.title, OUTPUT_LIMITS.MAX_EXPLANATION_LENGTH)) errors.push(createError(`${path}.title`, 'INVALID_EXPLANATION_LENGTH'));
  if (!isBoundedString(item.why, OUTPUT_LIMITS.MAX_EXPLANATION_LENGTH)) errors.push(createError(`${path}.why`, 'INVALID_EXPLANATION_LENGTH'));
  if (!Array.isArray(item.evidenceRefs) || !item.evidenceRefs.length || item.evidenceRefs.length > OUTPUT_LIMITS.MAX_EVIDENCE_REFS_PER_CLAIM) {
    errors.push(createError(`${path}.evidenceRefs`, 'INVALID_EVIDENCE_REFS'));
  } else {
    item.evidenceRefs.forEach((ref, refIndex) => validateEvidenceRef(ref, `${path}.evidenceRefs[${refIndex}]`, errors, refIndex));
  }
}

function validateMetadata(metadata, errors) {
  if (!isObject(metadata)) {
    errors.push(createError('metadata', 'MISSING_REQUIRED_FIELD'));
    return;
  }
  checkUnknownFields(metadata, METADATA_FIELDS, 'metadata', errors);
  if (metadata.readOnly !== true) errors.push(createError('metadata.readOnly', 'INVALID_FIELD_TYPE'));
  if (metadata.actionLevel !== ACTION_LEVEL) errors.push(createError('metadata.actionLevel', 'INVALID_ACTION_LEVEL'));
  if (metadata.providerIndependent !== true) errors.push(createError('metadata.providerIndependent', 'INVALID_FIELD_TYPE'));
}

function validateFallback(fallback, errors) {
  if (!isObject(fallback)) {
    errors.push(createError('fallback', 'MISSING_REQUIRED_FIELD'));
    return;
  }
  checkUnknownFields(fallback, FALLBACK_FIELDS, 'fallback', errors);
  if (fallback.type !== 'deterministic_reasoning') errors.push(createError('fallback.type', 'INVALID_FALLBACK'));
  if (!FALLBACK_REASONS.has(fallback.reason)) errors.push(createError('fallback.reason', 'INVALID_FALLBACK'));
  if (fallback.source !== 'agent-reasoning-v1') errors.push(createError('fallback.source', 'INVALID_FALLBACK'));
}

function validateOutputContract(candidate) {
  const errors = [];
  if (!isObject(candidate)) {
    return { valid: false, errors: [createError('$root', 'INVALID_FIELD_TYPE')] };
  }

  rejectSensitiveKeys(candidate, '$root', errors);
  const rootFields = new Set(['schemaVersion', 'status', 'available', 'fallback', 'explanations', 'suggestions', 'uncertainties', 'metadata']);
  ['schemaVersion', 'status', 'available', 'fallback', 'explanations', 'suggestions', 'uncertainties', 'metadata']
    .forEach((field) => {
      if (!(field in candidate)) errors.push(createError(field, 'MISSING_REQUIRED_FIELD'));
    });
  checkUnknownFields(candidate, rootFields, '$root', errors);
  if (candidate.schemaVersion !== OUTPUT_SCHEMA_VERSION) {
    errors.push(createError('schemaVersion', 'INVALID_SCHEMA_VERSION'));
  }
  if (!OUTPUT_STATUSES.has(candidate.status)) {
    errors.push(createError('status', 'INVALID_STATUS'));
  }
  if (!Array.isArray(candidate.explanations)) {
    errors.push(createError('explanations', 'INVALID_FIELD_TYPE'));
  } else if (candidate.explanations.length > OUTPUT_LIMITS.MAX_EXPLANATIONS) {
    errors.push(createError('explanations', 'TOO_MANY_EXPLANATIONS'));
  } else {
    const factCount = candidate.explanations.filter((item) => item && item.type === 'fact').length;
    if (factCount > OUTPUT_LIMITS.MAX_FACTS) errors.push(createError('explanations', 'TOO_MANY_FACTS'));
    candidate.explanations.forEach((item, index) => validateExplanation(item, index, errors));
  }
  if (!Array.isArray(candidate.suggestions)) {
    errors.push(createError('suggestions', 'INVALID_FIELD_TYPE'));
  } else if (candidate.suggestions.length > OUTPUT_LIMITS.MAX_SUGGESTIONS) {
    errors.push(createError('suggestions', 'TOO_MANY_SUGGESTIONS'));
  } else {
    validateSimpleItems(candidate.suggestions, SUGGESTION_FIELDS, 'suggestion', OUTPUT_LIMITS.MAX_SUGGESTION_LENGTH, 'suggestions', errors);
  }
  if (!Array.isArray(candidate.uncertainties)) {
    errors.push(createError('uncertainties', 'INVALID_FIELD_TYPE'));
  } else if (candidate.uncertainties.length > OUTPUT_LIMITS.MAX_UNCERTAINTIES) {
    errors.push(createError('uncertainties', 'TOO_MANY_UNCERTAINTIES'));
  } else {
    validateSimpleItems(candidate.uncertainties, UNCERTAINTY_FIELDS, 'uncertainty', OUTPUT_LIMITS.MAX_UNCERTAINTY_LENGTH, 'uncertainties', errors);
  }
  validateMetadata(candidate.metadata, errors);

  if (candidate.status === 'fallback') {
    validateFallback(candidate.fallback, errors);
    if (Array.isArray(candidate.explanations) && candidate.explanations.length > OUTPUT_LIMITS.MAX_EXPLANATIONS) {
      errors.push(createError('explanations', 'TOO_MANY_EXPLANATIONS'));
    } else if (Array.isArray(candidate.explanations)) {
      candidate.explanations.forEach((item, index) => validateFallbackExplanation(item, index, errors));
    }
    if (Array.isArray(candidate.suggestions) && candidate.suggestions.length) {
      errors.push(createError('suggestions', 'FORBIDDEN_FALLBACK_CONTENT'));
    }
    if (Array.isArray(candidate.uncertainties) && candidate.uncertainties.length) {
      errors.push(createError('uncertainties', 'FORBIDDEN_FALLBACK_CONTENT'));
    }
    if (candidate.available !== false) errors.push(createError('available', 'INVALID_STATUS'));
  } else if (candidate.status === 'validated' || candidate.status === 'partial') {
    if (typeof candidate.available !== 'boolean') errors.push(createError('available', 'INVALID_FIELD_TYPE'));
    if (candidate.fallback !== null && candidate.fallback !== undefined) {
      errors.push(createError('fallback', 'FORBIDDEN_SUCCESS_FALLBACK'));
    }
  }

  try {
    if (Buffer.byteLength(JSON.stringify(candidate), 'utf8') > OUTPUT_LIMITS.MAX_TOTAL_OUTPUT_BYTES) {
      errors.push(createError('$root', 'OUTPUT_TOO_LARGE'));
    }
  } catch {
    errors.push(createError('$root', 'INVALID_FIELD_TYPE'));
  }

  return { valid: errors.length === 0, errors };
}

module.exports = {
  ACTION_LEVEL,
  CLAIM_TYPES,
  FALLBACK_REASONS,
  OUTPUT_LIMITS,
  OUTPUT_SCHEMA_VERSION,
  OUTPUT_STATUSES,
  validateOutputContract,
};
