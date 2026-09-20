'use strict';

const crypto = require('node:crypto');
const {
  containsSensitiveKey,
  isObject,
  isOwnerId,
} = require('../agentFirewall/contextContract');

const SELECTION_RESULT_VERSION = 'context-selection-result-v1';
const CONTEXT_ITEM_VERSION = 'context-item-v1';
const QUERY_UNDERSTANDING_VERSION = 'query-understanding-v1';
const QUERY_MODEL_VERSION = 'query-model-v1';

const SOURCE_TYPES = new Set([
  'deterministic_fact',
  'approved_insight',
  'approved_reasoning',
  'course_knowledge',
  'student_knowledge_state',
  'evidence',
  'permitted_user_input',
  'bounded_conversation_history',
]);

const SOURCE_AUTHORITY = Object.freeze({
  deterministic_fact: 'deterministic_projection',
  approved_insight: 'approved_insight',
  approved_reasoning: 'approved_reasoning',
  course_knowledge: 'course_projection',
  student_knowledge_state: 'knowledge_state_projection',
  evidence: 'evidence',
  permitted_user_input: 'user_provided',
  bounded_conversation_history: 'user_provided',
});

const SOURCE_PRIORITY = Object.freeze({
  evidence: 0,
  approved_reasoning: 1,
  approved_insight: 2,
  deterministic_fact: 3,
  course_knowledge: 4,
  student_knowledge_state: 5,
  permitted_user_input: 6,
  bounded_conversation_history: 7,
});

const SELECTION_STATUSES = new Set([
  'selected',
  'partial',
  'insufficient_context',
  'no_relevant_context',
  'invalid_scope',
  'rejected',
]);

const BUDGET = Object.freeze({
  maxSourceCount: 8,
  maxItemsPerSource: 6,
  maxTotalItems: 24,
  maxEvidenceItems: 12,
  maxReasoningItems: 6,
  maxInsightItems: 6,
  maxCourseItems: 12,
  maxStudentStateItems: 5,
  maxHistoryTurns: 3,
  maxHistoryChars: 1200,
  maxQueryChars: 1000,
  maxSelectedContentChars: 4800,
  maxSerializedSelectionBytes: 6144,
  maxEstimatedTokens: 1536,
});

const QUERY_INTENTS = new Set([
  'explain', 'summarize', 'compare', 'clarify', 'review', 'diagnose_learning',
  'locate_knowledge', 'reflect', 'unsupported', 'unknown',
]);

const QUERY_TYPES = new Set([
  'factual_learning_question', 'conceptual_question', 'procedural_question',
  'comparison_question', 'learning_performance_question', 'course_navigation_question',
  'reflection_question', 'ambiguous_question', 'unsupported_question',
]);

const SCOPE_KINDS = new Set([
  'no_scope', 'current_course', 'explicit_course', 'multiple_courses',
  'explicit_knowledge', 'current_learning_period', 'explicit_time_period',
  'mixed_scope', 'ambiguous_scope',
]);

const REFERENCE_MATCH_STATUSES = new Set([
  'unresolved', 'explicit_id_match', 'pending_selection_resolution', 'ambiguous', 'invalid',
]);

const KNOWLEDGE_REF_KINDS = new Set([
  'knowledge_node', 'concept', 'topic', 'formula', 'procedure', 'definition',
]);

const EXPLANATION_TARGETS = new Set([
  'none', 'learning_performance', 'knowledge_concept', 'course_progress',
  'trend_change', 'comparison_result', 'reflection_summary', 'general_learning_status',
]);

const EXPLANATION_DIRECTIONS = new Set([
  'none', 'what', 'why', 'how', 'compare', 'summarize', 'locate', 'review',
]);

const USER_CONTEXT_KINDS = new Set([
  'self_report', 'preference', 'constraint', 'learning_condition',
]);

const AMBIGUITY_SOURCES = new Set([
  'ambiguous_course', 'ambiguous_knowledge', 'ambiguous_time', 'ambiguous_intent',
  'ambiguous_reference', 'insufficient_user_context', 'multiple_possible_interpretations',
]);

const CLARIFICATION_REASONS = new Set([
  'ambiguous_course', 'ambiguous_knowledge', 'ambiguous_time', 'ambiguous_intent',
  'ambiguous_reference', 'multiple_possible_interpretations', 'insufficient_user_context',
]);

const TIME_SCOPE_VALUES = new Set([
  'none', 'today', 'yesterday', 'this_week', 'last_week', 'current_month',
  'explicit_date', 'explicit_date_range', 'relative_period', 'ambiguous_period',
]);

const SELECTABLE_SOURCE_HINTS = new Set([
  'deterministic_fact', 'approved_insight', 'approved_reasoning', 'course_knowledge',
  'student_knowledge_state', 'evidence',
]);

function invalid(code) {
  const error = new Error(code);
  error.code = code;
  error.statusCode = 400;
  return error;
}

function isUuid(value) {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function isFiniteUnit(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function hasExactFields(value, fields) {
  if (!isObject(value)) return false;
  const actual = new Set(Object.keys(value));
  return fields.every((field) => actual.has(field)) && actual.size === fields.length;
}

function boundedString(value, maxLength) {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength;
}

function optionalBoundedString(value, maxLength) {
  return value === null || value === undefined || boundedString(value, maxLength);
}

function validateControlPlane(controlPlane) {
  if (!hasExactFields(controlPlane, ['requestId', 'ownerUserId', 'authorization'])) {
    throw invalid('INVALID_CONTEXT_SELECTION_CONTROL_PLANE');
  }
  if (!isUuid(controlPlane.requestId) || !isOwnerId(controlPlane.ownerUserId)) {
    throw invalid('INVALID_CONTEXT_SELECTION_CONTROL_PLANE');
  }
  const authorization = controlPlane.authorization;
  if (!hasExactFields(authorization, ['read', 'write'])
    || authorization.read !== true
    || authorization.write !== false) {
    throw invalid('CONTEXT_SELECTION_READ_ONLY_REQUIRED');
  }
  return controlPlane;
}

function validateQueryModel(value, { required = true } = {}) {
  if (!required && value === undefined) return true;
  if (!hasExactFields(value, [
    'contractVersion',
    'raw',
    'normalized',
    'charCount',
    'normalizedCharCount',
    'languageScripts',
    'containsMixedLanguage',
    'normalizationApplied',
  ])) return false;
  if (value.contractVersion !== QUERY_MODEL_VERSION) return false;
  if (!boundedString(value.raw, BUDGET.maxQueryChars)) return false;
  if (!boundedString(value.normalized, BUDGET.maxQueryChars)) return false;
  if (/[\u0000-\u001f\u007f]/.test(value.raw) || /[\u0000-\u001f\u007f]/.test(value.normalized)) return false;
  if (value.charCount !== value.raw.length || value.normalizedCharCount !== value.normalized.length) return false;
  if (!Number.isInteger(value.charCount) || value.charCount < 1 || value.charCount > BUDGET.maxQueryChars) return false;
  if (!Number.isInteger(value.normalizedCharCount) || value.normalizedCharCount < 1
    || value.normalizedCharCount > BUDGET.maxQueryChars) return false;
  if (!Array.isArray(value.languageScripts) || value.languageScripts.some((item) => !boundedString(item, 40))) return false;
  if (typeof value.containsMixedLanguage !== 'boolean') return false;
  if (!Array.isArray(value.normalizationApplied)
    || value.normalizationApplied.some((item) => !boundedString(item, 40))) return false;
  return true;
}

function validateQueryUnderstanding(value) {
  if (!hasExactFields(value, [
    'contractVersion',
    'interpretationId',
    'query',
    'normalizedQuery',
    'intent',
    'queryType',
    'scope',
    'courseRefs',
    'knowledgeRefs',
    'requestedExplanation',
    'userProvidedContext',
    'ambiguity',
    'clarification',
    'selectionHints',
    'confidence',
    'conversationContext',
    'metadata',
  ]) || value.contractVersion !== QUERY_UNDERSTANDING_VERSION || !isUuid(value.interpretationId)) {
    throw invalid('INVALID_QUERY_UNDERSTANDING');
  }
  if (!validateQueryModel(value.query) || (value.normalizedQuery !== null && !validateQueryModel(value.normalizedQuery))) {
    throw invalid('INVALID_QUERY_UNDERSTANDING');
  }

  if (!hasExactFields(value.intent, ['contractVersion', 'value', 'support', 'source', 'unsupportedCapability'])
    || value.intent.contractVersion !== 'query-intent-v1'
    || !QUERY_INTENTS.has(value.intent.value)
    || !['supported', 'unsupported', 'unknown'].includes(value.intent.support)
    || !boundedString(value.intent.source, 40)
    || !optionalBoundedString(value.intent.unsupportedCapability, 60)) {
    throw invalid('INVALID_QUERY_UNDERSTANDING');
  }

  if (!hasExactFields(value.queryType, ['contractVersion', 'value', 'source'])
    || value.queryType.contractVersion !== 'query-type-v1'
    || !QUERY_TYPES.has(value.queryType.value)
    || !boundedString(value.queryType.source, 40)) {
    throw invalid('INVALID_QUERY_UNDERSTANDING');
  }

  if (!hasExactFields(value.scope, ['contractVersion', 'kind', 'source', 'courseScope', 'timeScope', 'knowledgeScope', 'conflict'])
    || value.scope.contractVersion !== 'query-scope-v1'
    || !SCOPE_KINDS.has(value.scope.kind)
    || !boundedString(value.scope.kind, 40)
    || !['user_explicit', 'system_context', 'system_inferred'].includes(value.scope.source)
    || !isObject(value.scope.courseScope)
    || !isObject(value.scope.knowledgeScope)
    || !hasExactFields(value.scope.conflict, ['present', 'type'])
    || typeof value.scope.conflict.present !== 'boolean') {
    throw invalid('INVALID_QUERY_UNDERSTANDING');
  }

  const validateRef = (ref, fields, { knowledge = false } = {}) => hasExactFields(ref, fields)
    && isUuid(ref.refId)
    && boundedString(ref.displayLabel, 120)
    && optionalBoundedString(ref.resolvedCourseId || ref.resolvedKnowledgeNodeId, 200)
    && REFERENCE_MATCH_STATUSES.has(ref.matchStatus)
    && ['user_explicit', 'system_context', 'system_inferred'].includes(ref.source)
    && typeof ref.explicit === 'boolean'
    && isFiniteUnit(ref.confidence)
    && isObject(ref.provenance)
    && (!knowledge || KNOWLEDGE_REF_KINDS.has(ref.kind));

  if (!Array.isArray(value.courseRefs) || value.courseRefs.length > 3
    || !value.courseRefs.every((ref) => validateRef(ref, [
      'contractVersion', 'refId', 'displayLabel', 'resolvedCourseId', 'matchStatus',
      'source', 'explicit', 'confidence', 'provenance',
    ]))
    || !value.courseRefs.every((ref) => ref.contractVersion === 'course-ref-v1')) {
    throw invalid('INVALID_QUERY_UNDERSTANDING');
  }

  if (!Array.isArray(value.knowledgeRefs) || value.knowledgeRefs.length > 5
    || !value.knowledgeRefs.every((ref) => validateRef(ref, [
      'contractVersion', 'refId', 'kind', 'displayLabel', 'resolvedKnowledgeNodeId', 'matchStatus',
      'source', 'explicit', 'confidence', 'provenance',
    ], { knowledge: true }))
    || !value.knowledgeRefs.every((ref) => ref.contractVersion === 'knowledge-ref-v1')) {
    throw invalid('INVALID_QUERY_UNDERSTANDING');
  }

  if (!hasExactFields(value.requestedExplanation, ['contractVersion', 'target', 'direction', 'comparisonTarget', 'source'])
    || value.requestedExplanation.contractVersion !== 'requested-explanation-v1'
    || !EXPLANATION_TARGETS.has(value.requestedExplanation.target)
    || !EXPLANATION_DIRECTIONS.has(value.requestedExplanation.direction)
    || !optionalBoundedString(value.requestedExplanation.comparisonTarget, 60)
    || !boundedString(value.requestedExplanation.source, 40)) {
    throw invalid('INVALID_QUERY_UNDERSTANDING');
  }

  const context = value.userProvidedContext;
  if (!hasExactFields(context, ['contractVersion', 'items', 'totalChars', 'persistent'])
    || context.contractVersion !== 'user-provided-context-v1'
    || !Array.isArray(context.items) || context.items.length > 3
    || context.persistent !== false
    || !Number.isInteger(context.totalChars) || context.totalChars < 0 || context.totalChars > 1200
    || !context.items.every((item) => hasExactFields(item, [
      'itemId', 'kind', 'text', 'authority', 'provenance', 'retention',
    ])
      && isUuid(item.itemId)
      && USER_CONTEXT_KINDS.has(item.kind)
      && boundedString(item.text, 400)
      && item.authority === 'user_provided'
      && isObject(item.provenance)
      && hasExactFields(item.retention, ['persistent'])
      && item.retention.persistent === false)
    || context.items.reduce((sum, item) => sum + item.text.length, 0) !== context.totalChars) {
    throw invalid('INVALID_QUERY_UNDERSTANDING');
  }

  if (!hasExactFields(value.ambiguity, ['contractVersion', 'level', 'sources', 'details', 'conflictPresent'])
    || value.ambiguity.contractVersion !== 'ambiguity-v1'
    || !['none', 'low', 'medium', 'high'].includes(value.ambiguity.level)
    || !Array.isArray(value.ambiguity.sources)
    || value.ambiguity.sources.some((item) => !AMBIGUITY_SOURCES.has(item))
    || !Array.isArray(value.ambiguity.details)
    || value.ambiguity.details.some((item) => !isObject(item)
      || !boundedString(item.kind, 60)
      || !boundedString(item.target, 120)
      || !boundedString(item.reasonCode, 60))
    || typeof value.ambiguity.conflictPresent !== 'boolean') {
    throw invalid('INVALID_QUERY_UNDERSTANDING');
  }

  const clarification = value.clarification;
  if (!hasExactFields(clarification, [
    'contractVersion', 'required', 'reason', 'round', 'maxRounds', 'questions', 'fallback',
  ])
    || clarification.contractVersion !== 'clarification-v1'
    || typeof clarification.required !== 'boolean'
    || (clarification.reason !== null && clarification.reason !== undefined
      && !CLARIFICATION_REASONS.has(clarification.reason))
    || !Number.isInteger(clarification.round) || clarification.round < 0
    || clarification.maxRounds !== 1
    || !Array.isArray(clarification.questions) || clarification.questions.length > 2
    || !['safe_unknown', 'unsupported_or_ambiguous'].includes(clarification.fallback)) {
    throw invalid('INVALID_QUERY_UNDERSTANDING');
  }

  const hints = value.selectionHints;
  if (!hasExactFields(hints, [
    'contractVersion', 'preferredCourseScope', 'preferredKnowledgeRefs', 'requestedTimeRange',
    'preferredSourceTypes', 'comparisonScope', 'userConstraints', 'priority',
  ])
    || hints.contractVersion !== 'selection-hints-v1'
    || !Array.isArray(hints.preferredCourseScope) || hints.preferredCourseScope.length > 3
    || !Array.isArray(hints.preferredKnowledgeRefs) || hints.preferredKnowledgeRefs.length > 5
    || !hasExactFields(hints.requestedTimeRange, ['value'])
    || !TIME_SCOPE_VALUES.has(hints.requestedTimeRange.value)
    || !Array.isArray(hints.preferredSourceTypes) || hints.preferredSourceTypes.length > 6
    || hints.preferredSourceTypes.some((type) => !SELECTABLE_SOURCE_HINTS.has(type))
    || !hasExactFields(hints.comparisonScope, ['courseRefIds', 'target'])
    || !Array.isArray(hints.comparisonScope.courseRefIds)
    || hints.comparisonScope.courseRefIds.some((refId) => !isUuid(refId))
    || (hints.comparisonScope.target !== null && !boundedString(hints.comparisonScope.target, 60))
    || !Array.isArray(hints.userConstraints) || hints.userConstraints.length > 3
    || hints.userConstraints.some((constraint) => !boundedString(constraint, 120))
    || !['normal', 'high'].includes(hints.priority)) {
    throw invalid('INVALID_QUERY_UNDERSTANDING');
  }

  if (!hasExactFields(value.confidence, ['contractVersion', 'overall', 'components', 'source'])
    || value.confidence.contractVersion !== 'confidence-v1'
    || !isFiniteUnit(value.confidence.overall)
    || !isObject(value.confidence.components)
    || !Object.values(value.confidence.components).every(isFiniteUnit)
    || !boundedString(value.confidence.source, 40)) {
    throw invalid('INVALID_QUERY_UNDERSTANDING');
  }

  const conversation = value.conversationContext;
  if (!hasExactFields(conversation, ['contractVersion', 'enabled', 'turns', 'totalChars', 'persistent', 'provenance'])
    || conversation.contractVersion !== 'conversation-context-v1'
    || typeof conversation.enabled !== 'boolean'
    || !Array.isArray(conversation.turns) || conversation.turns.length > 3
    || !conversation.turns.every((turn) => isObject(turn)
      && boundedString(turn.role, 20)
      && boundedString(turn.text, 400))
    || !Number.isInteger(conversation.totalChars) || conversation.totalChars < 0
    || conversation.totalChars > BUDGET.maxHistoryChars
    || conversation.persistent !== false
    || !boundedString(conversation.provenance, 60)) {
    throw invalid('INVALID_QUERY_UNDERSTANDING');
  }

  if (!hasExactFields(value.metadata, ['parserPolicyVersion', 'fingerprint'])
    || !boundedString(value.metadata.parserPolicyVersion, 80)
    || !boundedString(value.metadata.fingerprint, 128)) {
    throw invalid('INVALID_QUERY_UNDERSTANDING');
  }

  if (containsSensitiveKey(value)) throw invalid('SENSITIVE_QUERY_UNDERSTANDING');
  return value;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (!isObject(value)) return value;
  return Object.keys(value).sort().reduce((output, key) => {
    output[key] = canonicalJson(value[key]);
    return output;
  }, {});
}

function sha256(value) {
  return crypto.createHash('sha256').update(JSON.stringify(canonicalJson(value))).digest('hex');
}

function deterministicUuid(hash) {
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    hash.slice(12, 16),
    hash.slice(16, 20),
    hash.slice(20, 32),
  ].join('-');
}

function computeSelectionFingerprint(dataPlane) {
  return sha256(dataPlane);
}

function validateContextItem(item) {
  if (!hasExactFields(item, [
    'contractVersion', 'itemId', 'sourceType', 'sourceId', 'content', 'scope', 'authority',
    'provenance', 'evidenceRefs', 'confidence', 'observedAt', 'metadata',
  ])
    || item.contractVersion !== CONTEXT_ITEM_VERSION
    || !isUuid(item.itemId)
    || !SOURCE_TYPES.has(item.sourceType)
    || !boundedString(item.sourceId, 200)
    || !isObject(item.content)
    || !boundedString(item.content.text, item.sourceType === 'permitted_user_input' ? 1000 : item.sourceType === 'bounded_conversation_history' ? 400 : item.sourceType === 'evidence' ? 240 : 480)
    || !isObject(item.scope)
    || !SOURCE_AUTHORITY[item.sourceType]
    || item.authority !== SOURCE_AUTHORITY[item.sourceType]
    || !isObject(item.provenance)
    || item.provenance.ownershipVerified !== true
    || !Array.isArray(item.evidenceRefs) || item.evidenceRefs.length > 12
    || !isFiniteUnit(item.confidence)
    || !optionalBoundedString(item.observedAt, 30)
    || !isObject(item.metadata)) {
    throw invalid('INVALID_CONTEXT_ITEM');
  }
  if (containsSensitiveKey(item)) throw invalid('SENSITIVE_CONTEXT_ITEM');
  return item;
}

function validateSelectionResult(result) {
  if (!isObject(result)
    || !hasExactFields(result, ['controlPlane', 'dataPlane'])) {
    throw invalid('INVALID_CONTEXT_SELECTION_RESULT');
  }
  validateControlPlane(result.controlPlane);
  const dataPlane = result.dataPlane;
  if (!hasExactFields(dataPlane, [
    'contractVersion', 'selectionId', 'requestId', 'status', 'scope', 'selectedItems',
    'omittedSources', 'conflicts', 'budget', 'insufficientContext', 'evidenceAvailable',
    'provenance', 'metadata',
  ])
    || dataPlane.contractVersion !== SELECTION_RESULT_VERSION
    || !isUuid(dataPlane.selectionId)
    || !isUuid(dataPlane.requestId)
    || dataPlane.requestId !== result.controlPlane.requestId
    || !SELECTION_STATUSES.has(dataPlane.status)
    || !isObject(dataPlane.scope)
    || !Array.isArray(dataPlane.selectedItems)
    || !Array.isArray(dataPlane.omittedSources)
    || !Array.isArray(dataPlane.conflicts)
    || !isObject(dataPlane.budget)
    || typeof dataPlane.insufficientContext !== 'boolean'
    || typeof dataPlane.evidenceAvailable !== 'boolean'
    || !isObject(dataPlane.provenance)
    || !isObject(dataPlane.metadata)) {
    throw invalid('INVALID_CONTEXT_SELECTION_RESULT');
  }
  dataPlane.selectedItems.forEach(validateContextItem);
  if (containsSensitiveKey(dataPlane)) throw invalid('SENSITIVE_CONTEXT_SELECTION_RESULT');
  return result;
}

module.exports = {
  BUDGET,
  CONTEXT_ITEM_VERSION,
  QUERY_UNDERSTANDING_VERSION,
  SELECTION_RESULT_VERSION,
  SOURCE_AUTHORITY,
  SOURCE_PRIORITY,
  SOURCE_TYPES,
  SELECTION_STATUSES,
  computeSelectionFingerprint,
  deterministicUuid,
  hasExactFields,
  invalid,
  isFiniteUnit,
  isOwnerId,
  isUuid,
  sha256,
  validateControlPlane,
  validateContextItem,
  validateQueryUnderstanding,
  validateSelectionResult,
};
