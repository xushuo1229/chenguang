'use strict';

const crypto = require('node:crypto');

const agentHomeService = require('../agentHomeService');
const agentInsightService = require('../agentInsightService');
const reasoningEngine = require('../agentReasoning/reasoningEngine');
const runtimeGateway = require('../agentGateway/runtimeGateway');
const {
  deterministicUuid,
  sha256,
} = require('../agentContextSelection/contextSelectionContract');
const { understandQuery } = require('../agentQueryUnderstanding/queryUnderstandingEngine');
const { selectLearningContext } = require('../agentContextSelection/contextSelectionEngine');

const RUNTIME_VERSION = 'learning-conversation-v1';
const LEARNING_MODE_HINTS = new Map([
  ['factual_learning_question', 'fact_review'],
  ['conceptual_question', 'concept_explanation'],
  ['procedural_question', 'procedure_walkthrough'],
  ['comparison_question', 'comparison'],
  ['learning_performance_question', 'performance_review'],
  ['course_navigation_question', 'course_navigation'],
  ['reflection_question', 'reflection'],
]);
const TASK_BY_QUERY_TYPE = new Map([
  ['factual_learning_question', 'summarize_learning_context'],
  ['conceptual_question', 'summarize_learning_context'],
  ['procedural_question', 'summarize_learning_context'],
  ['comparison_question', 'summarize_learning_context'],
  ['learning_performance_question', 'explain_insights'],
  ['course_navigation_question', 'summarize_learning_context'],
  ['reflection_question', 'explain_insights'],
]);

function invalidInput(code) {
  const error = new Error(code);
  error.code = code;
  error.statusCode = 400;
  return error;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasExactFields(value, fields) {
  const actual = new Set(Object.keys(value));
  return fields.every((field) => actual.has(field)) && actual.size === fields.length;
}

function boundedText(value, maxLength) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, maxLength);
}

function normalizeInput(input) {
  if (!isPlainObject(input) || !hasExactFields(input, ['query', 'currentCourseLabel'])) {
    throw invalidInput('MALFORMED_INPUT');
  }
  if (typeof input.query !== 'string' || input.query.trim().length === 0
    || input.query.length > 1000 || /[\u0000-\u001f\u007f]/.test(input.query)) {
    throw invalidInput('INVALID_QUERY');
  }
  if (input.currentCourseLabel !== null && input.currentCourseLabel !== undefined
    && (typeof input.currentCourseLabel !== 'string' || input.currentCourseLabel.trim().length === 0
      || input.currentCourseLabel.length > 120)) {
    throw invalidInput('INVALID_COURSE_CONTEXT');
  }
  return {
    query: input.query,
    currentCourseLabel: input.currentCourseLabel === undefined ? undefined : input.currentCourseLabel.trim(),
  };
}

function buildControlPlane(userId) {
  return {
    requestId: crypto.randomUUID(),
    ownerUserId: userId,
    authorization: { read: true, write: false },
  };
}

function candidate({ id, sourceId, text, scopeKind, courseId, knowledgeNodeId, labels, confidence }) {
  return {
    id: deterministicUuid(sha256(id)),
    sourceId: boundedText(sourceId, 200),
    text: boundedText(text, 480),
    scopeKind: boundedText(scopeKind, 60),
    courseId: courseId === null ? null : boundedText(courseId, 200),
    knowledgeNodeId: knowledgeNodeId === null ? null : boundedText(knowledgeNodeId, 200),
    labels: labels.map((label) => boundedText(label, 60)).filter(Boolean),
    confidence: Number(confidence) || 0,
    observedAt: null,
    provenance: {
      adapter: 'agent_home_context',
      recordId: boundedText(id, 200),
      snapshotId: deterministicUuid(sha256(`agent-home:${id}`)),
    },
    evidenceRefs: [],
    metadata: {},
    ownerUserId: 1,
  };
}

function buildSources(context, ownerUserId) {
  const empty = {
    deterministicFacts: [],
    approvedInsights: [],
    approvedReasoning: [],
    courseKnowledge: [],
    studentKnowledgeStates: [],
    evidence: [],
    permittedUserInput: [],
    boundedConversationHistory: [],
  };
  const knowledge = context.courseKnowledge && context.courseKnowledge.value ? context.courseKnowledge.value : {};
  const states = context.knowledgeStates && context.knowledgeStates.value ? context.knowledgeStates.value : {};
  const courseNames = new Map((context.courses && context.courses.value || [])
    .filter((course) => course && course.courseId && course.name)
    .map((course) => [course.courseId, course.name]));

  empty.courseKnowledge = (knowledge.nodes || []).slice(0, 10).map((node) => candidate({
    id: `node:${node.knowledgeNodeId}`,
    sourceId: `course-node:${node.knowledgeNodeId}`,
    text: node.title,
    scopeKind: 'today',
    courseId: node.courseId,
    knowledgeNodeId: node.knowledgeNodeId,
    labels: [node.title, courseNames.get(node.courseId)].filter(Boolean),
    confidence: 1,
  }));

  empty.evidence = (knowledge.evidence || []).slice(0, 10).map((item) => candidate({
    id: `evidence:${item.evidenceId}`,
    sourceId: `course-evidence:${item.evidenceId}`,
    text: item.quote,
    scopeKind: 'today',
    courseId: item.courseId,
    knowledgeNodeId: item.nodeId,
    labels: courseNames.get(item.courseId) ? [courseNames.get(item.courseId)] : [],
    confidence: 1,
  }));

  empty.studentKnowledgeStates = [...(states.weakTopics || []), ...(states.strongTopics || [])]
    .slice(0, 10)
    .map((state) => candidate({
      id: `state:${state.knowledgeNodeId}`,
      sourceId: `knowledge-state:${state.knowledgeNodeId}`,
      text: state.title || '学习状态',
      scopeKind: 'today',
      courseId: state.courseId,
      knowledgeNodeId: state.knowledgeNodeId,
      labels: [state.title, courseNames.get(state.courseId)].filter(Boolean),
      confidence: state.confidence,
    }));

  [empty.courseKnowledge, empty.evidence, empty.studentKnowledgeStates].forEach((items) => {
    items.forEach((item) => {
      item.ownerUserId = ownerUserId;
    });
  });
  return empty;
}

function projectSelectedContext(context, selection) {
  const selectedItems = selection.selectedItems;
  const selectedRecordIds = new Set(selectedItems.map((item) => item.provenance.recordId));
  const selectedCourseIds = new Set(selectedItems
    .map((item) => item.scope.courseId)
    .filter(Boolean));

  const selectedCourseKnowledge = context.courseKnowledge
    ? {
      ...context.courseKnowledge,
      value: {
        nodes: (context.courseKnowledge.value?.nodes || [])
          .filter((node) => selectedRecordIds.has(`node:${node.knowledgeNodeId}`)),
        evidence: (context.courseKnowledge.value?.evidence || [])
          .filter((item) => selectedRecordIds.has(`evidence:${item.evidenceId}`)),
      },
    }
    : null;

  const selectedStates = [
    ...(context.knowledgeStates?.value?.weakTopics || []),
    ...(context.knowledgeStates?.value?.strongTopics || []),
  ].filter((state) => selectedRecordIds.has(`state:${state.knowledgeNodeId}`));
  const selectedKnowledgeStates = context.knowledgeStates
    ? {
      ...context.knowledgeStates,
      value: {
        weakTopics: selectedStates.filter((state) => state.state !== 'mastered'),
        strongTopics: selectedStates.filter((state) => state.state === 'mastered'),
        recentlyReviewed: selectedStates,
      },
    }
    : null;

  const selectedCourses = context.courses
    ? {
      ...context.courses,
      value: (context.courses.value || []).filter((course) => selectedCourseIds.has(course.courseId)),
    }
    : null;

  return {
    ...context,
    courses: selectedCourses,
    behavior: null,
    courseKnowledge: selectedCourseKnowledge,
    knowledgeStates: selectedKnowledgeStates,
    reflections: null,
    memories: null,
  };
}

async function runLearningConversation({ userId, query, currentCourseLabel, options = {} }) {
  const owner = Number(userId);
  if (!Number.isInteger(owner) || owner <= 0) {
    const error = new Error('UNAUTHORIZED');
    error.code = 'UNAUTHORIZED';
    error.statusCode = 401;
    throw error;
  }
  const safeInput = normalizeInput({ query, currentCourseLabel });
  const controlPlane = buildControlPlane(owner);
  const understanding = understandQuery({
    query: safeInput.query,
    currentCourseContext: safeInput.currentCourseLabel
      ? { displayLabel: safeInput.currentCourseLabel }
      : undefined,
  }, controlPlane);
  const context = await agentHomeService.buildAgentHomeContext({ userId: owner });
  const selection = selectLearningContext({
    controlPlane,
    queryUnderstanding: understanding.dataPlane,
    sources: buildSources(context, owner),
  });

  const rejected = understanding.dataPlane.intent.support === 'unsupported'
    || understanding.dataPlane.ambiguity.level === 'high'
    || selection.dataPlane.status === 'rejected'
    || selection.dataPlane.status === 'invalid_scope'
    || selection.dataPlane.selectedItems.length === 0;

  if (rejected) {
    return {
      version: RUNTIME_VERSION,
      readOnly: true,
      status: 'clarification_required',
      userId: owner,
      queryUnderstanding: understanding.dataPlane,
      contextSelection: selection.dataPlane,
      modeHint: 'clarification',
      explanation: null,
      permissions: { read: ['learning_context'], write: [] },
      metadata: { readOnly: true, actionLevel: 'insight_only', reason: 'context_not_ready' },
    };
  }

  const selectedContext = projectSelectedContext(context, selection.dataPlane);
  const insights = agentInsightService.buildInsights(selectedContext);
  const reasoning = reasoningEngine.buildReasoning({ context: selectedContext, insights });
  const task = TASK_BY_QUERY_TYPE.get(understanding.dataPlane.queryType.value) || 'summarize_learning_context';
  const explanation = await runtimeGateway.runExplanation({
    context: selectedContext,
    insights,
    reasoning,
    task,
    options,
  });

  return {
    version: RUNTIME_VERSION,
    userId: owner,
    readOnly: true,
    status: explanation.status,
    queryUnderstanding: understanding.dataPlane,
      contextSelection: selection.dataPlane,
      modeHint: LEARNING_MODE_HINTS.get(understanding.dataPlane.queryType.value) || 'context_review',
    explanation: explanation.output,
    permissions: { read: ['learning_context', 'selected_context'], write: [] },
    metadata: {
      readOnly: true,
      actionLevel: 'insight_only',
      gatewayVersion: explanation.meta.gatewayVersion,
      provider: explanation.meta.provider,
      model: explanation.meta.model,
      fallbackReason: explanation.meta.fallbackReason || null,
    },
  };
}

module.exports = {
  RUNTIME_VERSION,
  runLearningConversation,
};
