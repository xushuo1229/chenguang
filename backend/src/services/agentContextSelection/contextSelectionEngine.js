'use strict';

const {
  BUDGET,
  CONTEXT_ITEM_VERSION,
  SELECTION_RESULT_VERSION,
  SOURCE_AUTHORITY,
  SOURCE_PRIORITY,
  SOURCE_TYPES,
  computeSelectionFingerprint,
  deterministicUuid,
  invalid,
  isFiniteUnit,
  isUuid,
  sha256,
  validateControlPlane,
  validateQueryUnderstanding,
} = require('./contextSelectionContract');
const { isObject } = require('../agentFirewall/contextContract');

const SOURCE_KEYS = Object.freeze({
  deterministic_fact: 'deterministicFacts',
  approved_insight: 'approvedInsights',
  approved_reasoning: 'approvedReasoning',
  course_knowledge: 'courseKnowledge',
  student_knowledge_state: 'studentKnowledgeStates',
  evidence: 'evidence',
  permitted_user_input: 'permittedUserInput',
  bounded_conversation_history: 'boundedConversationHistory',
});

const CONTENT_KINDS = Object.freeze({
  deterministic_fact: 'learning_fact',
  approved_insight: 'insight',
  approved_reasoning: 'reasoning',
  course_knowledge: 'course_knowledge',
  student_knowledge_state: 'student_state',
  evidence: 'evidence',
  permitted_user_input: 'user_input',
  bounded_conversation_history: 'conversation_history',
});

const MAX_TEXT_BY_SOURCE = Object.freeze({
  deterministic_fact: 480,
  approved_insight: 480,
  approved_reasoning: 480,
  course_knowledge: 480,
  student_knowledge_state: 480,
  evidence: 240,
  permitted_user_input: 1000,
  bounded_conversation_history: 400,
});

const EVIDENCE_REQUIRED_SOURCES = new Set([
  'deterministic_fact',
  'approved_insight',
  'approved_reasoning',
]);

const QUERY_TYPE_SOURCE_AFFINITY = Object.freeze({
  factual_learning_question: new Set(['deterministic_fact', 'course_knowledge', 'evidence']),
  conceptual_question: new Set(['course_knowledge', 'approved_insight']),
  procedural_question: new Set(['course_knowledge', 'approved_reasoning']),
  comparison_question: new Set(['student_knowledge_state', 'approved_insight']),
  learning_performance_question: new Set(['deterministic_fact', 'approved_insight', 'approved_reasoning', 'student_knowledge_state']),
  course_navigation_question: new Set(['course_knowledge']),
  reflection_question: new Set(['approved_insight', 'approved_reasoning', 'student_knowledge_state']),
  ambiguous_question: new Set(),
  unsupported_question: new Set(),
});

function hasExactFields(value, fields) {
  if (!isObject(value)) return false;
  const actual = new Set(Object.keys(value));
  return fields.every((field) => actual.has(field)) && actual.size === fields.length;
}

function boundedText(value, maxLength) {
  if (typeof value !== 'string') return '';
  return value
    .split('')
    .filter((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127)
    .join('')
    .trim()
    .slice(0, maxLength);
}

function validateProvenance(value) {
  return hasExactFields(value, ['adapter', 'recordId', 'snapshotId'])
    && typeof value.adapter === 'string' && value.adapter.length > 0 && value.adapter.length <= 80
    && typeof value.recordId === 'string' && value.recordId.length > 0 && value.recordId.length <= 200
    && typeof value.snapshotId === 'string' && value.snapshotId.length > 0 && value.snapshotId.length <= 128;
}

function validateCandidate(candidate, sourceType) {
  if (!hasExactFields(candidate, [
    'id',
    'sourceId',
    'text',
    'scopeKind',
    'courseId',
    'knowledgeNodeId',
    'labels',
    'confidence',
    'observedAt',
    'provenance',
    'evidenceRefs',
    'metadata',
    'ownerUserId',
  ])) {
    throw invalid('INVALID_CONTEXT_SOURCE');
  }
  if (!isUuid(candidate.id)
    || typeof candidate.sourceId !== 'string' || !candidate.sourceId || candidate.sourceId.length > 200
    || typeof candidate.text !== 'string' || !candidate.text || candidate.text.length > MAX_TEXT_BY_SOURCE[sourceType]
    || typeof candidate.scopeKind !== 'string' || !candidate.scopeKind || candidate.scopeKind.length > 60
    || candidate.courseId !== null && (typeof candidate.courseId !== 'string' || candidate.courseId.length > 200)
    || candidate.knowledgeNodeId !== null && (typeof candidate.knowledgeNodeId !== 'string' || candidate.knowledgeNodeId.length > 200)
    || !Array.isArray(candidate.labels) || candidate.labels.some((label) => typeof label !== 'string' || !label || label.length > 60)
    || !isFiniteUnit(candidate.confidence)
    || candidate.observedAt !== null && (typeof candidate.observedAt !== 'string' || candidate.observedAt.length > 30)
    || !validateProvenance(candidate.provenance)
    || !Array.isArray(candidate.evidenceRefs) || candidate.evidenceRefs.some((ref) => typeof ref !== 'string' || !ref || ref.length > 200)
    || !isObject(candidate.metadata)
    || !Number.isInteger(candidate.ownerUserId) || candidate.ownerUserId <= 0) {
    throw invalid('INVALID_CONTEXT_SOURCE');
  }
  return candidate;
}

function validateSources(sources) {
  const expectedKeys = new Set(Object.values(SOURCE_KEYS));
  if (!isObject(sources)) throw invalid('INVALID_CONTEXT_SOURCES');
  const actualKeys = new Set(Object.keys(sources));
  for (const key of actualKeys) {
    if (!expectedKeys.has(key)) throw invalid('UNKNOWN_CONTEXT_SOURCE');
  }
  for (const key of expectedKeys) {
    if (!Array.isArray(sources[key])) throw invalid('INVALID_CONTEXT_SOURCE');
  }
  const normalized = {};
  const evidenceIds = new Set();

  for (const [sourceType, sourceKey] of Object.entries(SOURCE_KEYS)) {
    normalized[sourceKey] = sources[sourceKey].map((candidate) => {
      if (containsSensitiveValue(candidate)) throw invalid('SENSITIVE_CONTEXT_SOURCE');
      return validateCandidate(candidate, sourceType);
    });
  }

  normalized.evidence.forEach((candidate) => evidenceIds.add(candidate.id));

  for (const sourceKey of Object.values(SOURCE_KEYS)) {
    const ids = normalized[sourceKey].map((candidate) => candidate.id);
    if (new Set(ids).size !== ids.length) throw invalid('DUPLICATE_CONTEXT_SOURCE');
  }

  return { normalized, evidenceIds };
}

function containsSensitiveValue(value) {
  if (!value || typeof value !== 'object') return false;
  return JSON.stringify(value).match(/"(jwt|accessToken|refreshToken|apiKey|api_key|password|secret|credential|cookie|authorization|sessionId)"\s*:/i) !== null;
}

function requestedCourseIds(query) {
  return query.courseRefs
    .map((ref) => ref.resolvedCourseId || ref.displayLabel)
    .filter(Boolean);
}

function requestedKnowledgeIds(query) {
  return query.knowledgeRefs
    .map((ref) => ref.resolvedKnowledgeNodeId || ref.displayLabel)
    .filter(Boolean);
}

function normalizedTokens(value) {
  return String(value || '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

function candidateMatchesScope(candidate, query) {
  const kind = query.scope.kind;
  const courses = requestedCourseIds(query);
  const knowledge = requestedKnowledgeIds(query);

  if (kind === 'ambiguous_scope' || query.ambiguity.level === 'high') return false;
  if (kind === 'no_scope' || kind === 'current_learning_period' || kind === 'explicit_time_period') {
    return ['no_scope', 'today', 'current_learning_period', 'explicit_time_period'].includes(candidate.scopeKind);
  }
  if (kind === 'explicit_course' || kind === 'current_course') {
    return Boolean(candidate.courseId && courses.includes(candidate.courseId));
  }
  if (kind === 'multiple_courses') {
    return Boolean(candidate.courseId && courses.includes(candidate.courseId));
  }
  if (kind === 'explicit_knowledge') {
    return Boolean(candidate.knowledgeNodeId && knowledge.includes(candidate.knowledgeNodeId));
  }
  if (kind === 'mixed_scope') {
    return Boolean(
      (candidate.courseId && courses.includes(candidate.courseId))
      || (candidate.knowledgeNodeId && knowledge.includes(candidate.knowledgeNodeId))
      || ['today', 'current_learning_period', 'explicit_time_period'].includes(candidate.scopeKind),
    );
  }
  return false;
}

function relevanceScore(candidate, query) {
  const courses = requestedCourseIds(query);
  const knowledge = requestedKnowledgeIds(query);
  let score = 0;

  if (candidate.courseId && courses.includes(candidate.courseId)) score = Math.max(score, 100);
  if (candidate.knowledgeNodeId && knowledge.includes(candidate.knowledgeNodeId)) score = Math.max(score, 100);

  const normalizationSource = query.normalizedQuery || query.query;
  const queryTokens = new Set(normalizedTokens(normalizationSource.raw));
  const labelTokens = candidate.labels.flatMap((label) => normalizedTokens(label));
  if (labelTokens.some((token) => queryTokens.has(token))) score = Math.max(score, 80);
  if (['today', 'current_learning_period', 'explicit_time_period'].includes(candidate.scopeKind)) score = Math.max(score, 70);
  if (QUERY_TYPE_SOURCE_AFFINITY[query.queryType.value]?.has(candidate.sourceType)) score = Math.max(score, 60);

  return score;
}

function projectCandidate(candidate, sourceType, score) {
  return {
    contractVersion: CONTEXT_ITEM_VERSION,
    itemId: candidate.id,
    sourceType,
    sourceId: candidate.sourceId,
    content: {
      kind: CONTENT_KINDS[sourceType],
      text: boundedText(candidate.text, MAX_TEXT_BY_SOURCE[sourceType]),
      labels: candidate.labels.slice().sort((left, right) => left.localeCompare(right)),
    },
    scope: {
      kind: candidate.scopeKind,
      courseId: candidate.courseId,
      knowledgeNodeId: candidate.knowledgeNodeId,
    },
    authority: SOURCE_AUTHORITY[sourceType],
    provenance: {
      adapter: candidate.provenance.adapter,
      recordId: candidate.provenance.recordId,
      snapshotId: candidate.provenance.snapshotId,
      ownershipVerified: true,
    },
    evidenceRefs: candidate.evidenceRefs.slice().sort((left, right) => left.localeCompare(right)),
    confidence: candidate.confidence,
    observedAt: candidate.observedAt,
    metadata: {
      relevanceScore: score,
      selectionReason: score >= 100 ? 'explicit_scope_match' : 'bounded_relevance_match',
    },
  };
}

function emptyResult({ controlPlane, query, status, reasons = [], requestId }) {
  const draft = {
    contractVersion: SELECTION_RESULT_VERSION,
    selectionId: '',
    requestId,
    status,
    scope: {
      kind: query.scope.kind,
      source: query.scope.source,
      requestedCourseIds: requestedCourseIds(query),
      requestedKnowledgeIds: requestedKnowledgeIds(query),
      timeScope: query.scope.timeScope ? query.scope.timeScope.value : null,
    },
    selectedItems: [],
    omittedSources: reasons.map((reason) => (typeof reason === 'string'
      ? { sourceType: null, sourceId: null, reason }
      : { sourceType: reason.sourceType || null, sourceId: reason.sourceId || null, reason: reason.reason })),
    conflicts: query.scope.conflict.present ? [{
      type: query.scope.conflict.type || 'scope_conflict',
      resolution: 'unresolved',
    }] : [],
    budget: {
      policyVersion: 'context-selection-budget-v1',
      usedSelectedItems: 0,
      usedSourceCount: 0,
      usedContentChars: 0,
      usedSerializedBytes: 0,
      usedEstimatedTokens: 0,
      limits: BUDGET,
    },
    insufficientContext: status === 'no_relevant_context' || status === 'insufficient_context',
    evidenceAvailable: false,
    provenance: {
      allowlistVersion: 'context-source-allowlist-v1',
      relevancePolicyVersion: 'context-relevance-policy-v1',
      budgetPolicyVersion: 'context-selection-budget-v1',
      sourceSnapshotId: sha256(query),
    },
    metadata: {
      deterministic: true,
      selectionReason: reasons[0]?.reason || 'no_relevant_context',
      selectionFingerprint: '',
    },
  };
  const hash = computeSelectionFingerprint(draft);
  draft.selectionId = deterministicUuid(hash);
  draft.metadata.selectionFingerprint = hash;
  return { controlPlane, dataPlane: draft };
}

function selectLearningContext({ controlPlane, queryUnderstanding, sources }) {
  validateControlPlane(controlPlane);
  const query = validateQueryUnderstanding(queryUnderstanding);
  const requestId = controlPlane.requestId;
  const owner = controlPlane.ownerUserId;

  if (query.intent.support === 'unsupported') {
    return emptyResult({
      controlPlane,
      query,
      status: 'rejected',
      requestId,
      reasons: [{ reason: 'UNSUPPORTED_QUERY', capability: query.intent.unsupportedCapability }],
    });
  }
  if (query.clarification.required || query.ambiguity.level === 'high') {
    return emptyResult({
      controlPlane,
      query,
      status: 'rejected',
      requestId,
      reasons: [{ reason: 'CLARIFICATION_REQUIRED' }],
    });
  }
  if (query.scope.kind === 'ambiguous_scope') {
    return emptyResult({
      controlPlane,
      query,
      status: 'invalid_scope',
      requestId,
      reasons: [{ reason: 'AMBIGUOUS_SCOPE' }],
    });
  }

  const { normalized, evidenceIds } = validateSources(sources);

  const allCandidates = Object.entries(SOURCE_KEYS).flatMap(([sourceType, sourceKey]) => (
    normalized[sourceKey].map((candidate) => ({ candidate, sourceType }))
  ));

  if (allCandidates.some(({ candidate }) => candidate.ownerUserId !== owner)) {
    return emptyResult({
      controlPlane,
      query,
      status: 'rejected',
      requestId,
      reasons: [{ reason: 'CROSS_USER_SOURCE' }],
    });
  }

  const selectedItems = [];
  const omittedSources = [];
  const selectedSourceTypes = new Set();
  const selectedEvidenceIds = new Set();
  const sourceCounts = new Map();
  let usedContentChars = 0;
  let usedSerializedBytes = 0;

  const eligible = allCandidates
    .filter(({ candidate }) => {
      const score = relevanceScore(candidate, query);
      return candidateMatchesScope(candidate, query) && score >= 60;
    })
    .map(({ candidate, sourceType }) => ({
      candidate,
      sourceType,
      score: relevanceScore(candidate, query),
    }))
    .sort((left, right) => (
      right.score - left.score
      || SOURCE_PRIORITY[left.sourceType] - SOURCE_PRIORITY[right.sourceType]
      || left.candidate.sourceId.localeCompare(right.candidate.sourceId)
      || left.candidate.id.localeCompare(right.candidate.id)
    ));

  for (const { candidate, sourceType, score } of eligible) {
    if (selectedItems.length >= BUDGET.maxTotalItems) {
      omittedSources.push({ sourceType, sourceId: candidate.sourceId, reason: 'budget_exceeded' });
      continue;
    }
    if ((sourceCounts.get(sourceType) || 0) >= BUDGET.maxItemsPerSource) {
      omittedSources.push({ sourceType, sourceId: candidate.sourceId, reason: 'budget_exceeded' });
      continue;
    }
    if (sourceType === 'evidence' && selectedEvidenceIds.size >= BUDGET.maxEvidenceItems) {
      omittedSources.push({ sourceType, sourceId: candidate.sourceId, reason: 'budget_exceeded' });
      continue;
    }
    if (sourceType === 'approved_reasoning' && selectedSourceTypes.has(sourceType)
      && (sourceCounts.get(sourceType) || 0) >= BUDGET.maxReasoningItems) {
      omittedSources.push({ sourceType, sourceId: candidate.sourceId, reason: 'budget_exceeded' });
      continue;
    }
    if (sourceType === 'approved_insight' && selectedSourceTypes.has(sourceType)
      && (sourceCounts.get(sourceType) || 0) >= BUDGET.maxInsightItems) {
      omittedSources.push({ sourceType, sourceId: candidate.sourceId, reason: 'budget_exceeded' });
      continue;
    }
    if (sourceType === 'course_knowledge' && (sourceCounts.get(sourceType) || 0) >= BUDGET.maxCourseItems) {
      omittedSources.push({ sourceType, sourceId: candidate.sourceId, reason: 'budget_exceeded' });
      continue;
    }
    if (sourceType === 'student_knowledge_state' && (sourceCounts.get(sourceType) || 0) >= BUDGET.maxStudentStateItems) {
      omittedSources.push({ sourceType, sourceId: candidate.sourceId, reason: 'budget_exceeded' });
      continue;
    }
    if (sourceType === 'bounded_conversation_history' && (sourceCounts.get(sourceType) || 0) >= BUDGET.maxHistoryTurns) {
      omittedSources.push({ sourceType, sourceId: candidate.sourceId, reason: 'budget_exceeded' });
      continue;
    }

    const invalidEvidence = sourceType !== 'evidence'
      && (EVIDENCE_REQUIRED_SOURCES.has(sourceType) && candidate.evidenceRefs.length === 0
        || candidate.evidenceRefs.some((ref) => !selectedEvidenceIds.has(ref)));
    if (invalidEvidence) {
      omittedSources.push({ sourceType, sourceId: candidate.sourceId, reason: 'missing_evidence_for_fact_claim' });
      continue;
    }

    const item = projectCandidate(candidate, sourceType, score);
    const serialized = Buffer.byteLength(JSON.stringify(item), 'utf8');
    const contentChars = item.content.text.length;
    if (usedSerializedBytes + serialized > BUDGET.maxSerializedSelectionBytes
      || usedContentChars + contentChars > BUDGET.maxSelectedContentChars) {
      omittedSources.push({ sourceType, sourceId: candidate.sourceId, reason: 'budget_exceeded' });
      continue;
    }

    selectedItems.push(item);
    selectedSourceTypes.add(sourceType);
    if (sourceType === 'evidence') selectedEvidenceIds.add(candidate.id);
    sourceCounts.set(sourceType, (sourceCounts.get(sourceType) || 0) + 1);
    usedContentChars += contentChars;
    usedSerializedBytes += serialized;
  }

  if (usedSerializedBytes / 4 > BUDGET.maxEstimatedTokens) {
    return emptyResult({
      controlPlane,
      query,
      status: 'insufficient_context',
      requestId,
      reasons: [{ reason: 'CONTEXT_LIMIT_EXCEEDED' }],
    });
  }

  const evidenceInsufficient = omittedSources.some((item) => (
    item.reason === 'missing_evidence_for_fact_claim'
  ));
  const status = selectedItems.length === 0
    ? 'no_relevant_context'
    : evidenceInsufficient ? 'insufficient_context'
      : omittedSources.length > 0 ? 'partial' : 'selected';
  const draft = {
    contractVersion: SELECTION_RESULT_VERSION,
    selectionId: '',
    requestId,
    status,
    scope: {
      kind: query.scope.kind,
      source: query.scope.source,
      requestedCourseIds: requestedCourseIds(query),
      requestedKnowledgeIds: requestedKnowledgeIds(query),
      timeScope: query.scope.timeScope ? query.scope.timeScope.value : null,
    },
    selectedItems,
    omittedSources,
    conflicts: query.scope.conflict.present ? [{
      type: query.scope.conflict.type || 'scope_conflict',
      resolution: 'unresolved',
    }] : [],
    budget: {
      policyVersion: 'context-selection-budget-v1',
      usedSelectedItems: selectedItems.length,
      usedSourceCount: selectedSourceTypes.size,
      usedContentChars,
      usedSerializedBytes,
      usedEstimatedTokens: Math.ceil(usedSerializedBytes / 4),
      limits: BUDGET,
    },
    insufficientContext: selectedItems.length === 0 || evidenceInsufficient,
    evidenceAvailable: selectedSourceTypes.has('evidence'),
    provenance: {
      allowlistVersion: 'context-source-allowlist-v1',
      relevancePolicyVersion: 'context-relevance-policy-v1',
      budgetPolicyVersion: 'context-selection-budget-v1',
      sourceSnapshotId: sha256(sources),
    },
    metadata: {
      deterministic: true,
      selectionReason: selectedItems.length === 0 ? 'no_relevant_context' : 'bounded_selection_complete',
      selectionFingerprint: '',
    },
  };
  const hash = computeSelectionFingerprint(draft);
  draft.selectionId = deterministicUuid(hash);
  draft.metadata.selectionFingerprint = hash;

  return {
    controlPlane,
    dataPlane: draft,
  };
}

module.exports = {
  selectLearningContext,
};
