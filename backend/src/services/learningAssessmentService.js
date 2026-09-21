'use strict';

const crypto = require('node:crypto');
const ApiError = require('../utils/ApiError');
const { db } = require('../db');
const courseSpaceModel = require('../db/courseSpaceModel');
const practiceModel = require('../db/studentPracticeModel');
const stateModel = require('../db/studentKnowledgeStateModel');
const actionModel = require('../db/learningActionModel');
const stateService = require('./studentKnowledgeStateService');
const syncService = require('./syncService');

const ASSESSMENT_VERSION = 'assessment-item-v1';
const RESULT_VERSION = 'assessment-result-v1';
const MAX_ITEMS = 5;
const MAX_ATTEMPTS = 50;

function requiredText(value, field, max) {
  const text = String(value == null ? '' : value).trim();
  if (!text) throw ApiError.badRequest('INVALID_INPUT', `${field}必填`);
  if (text.length > max) throw ApiError.badRequest('INVALID_INPUT', `${field}长度不能超过${max}`);
  return text;
}

function boundedDuration(value) {
  if (value === undefined || value === null || value === '') return 0;
  const duration = Number(value);
  if (!Number.isInteger(duration) || duration < 0 || duration > 3600000) {
    throw ApiError.badRequest('INVALID_INPUT', 'durationMs不正确');
  }
  return duration;
}

function normalizedText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function keywords(value) {
  const normalized = normalizedText(value);
  const tokens = new Set(normalized.match(/[a-z0-9]{2,}/g) || []);
  const cjk = normalized.match(/[\u4e00-\u9fff]/g) || [];
  for (let index = 0; index + 1 < cjk.length; index += 1) {
    tokens.add(cjk[index] + cjk[index + 1]);
  }
  return [...tokens].slice(0, 8);
}

function gradeAnswer(response, expected) {
  const expectedTokens = keywords(expected);
  if (!expectedTokens.length) return String(response || '').trim() ? 1 : 0;
  const responseText = normalizedText(response);
  const responseTokens = new Set(responseText.match(/[a-z0-9]{2,}/g) || []);
  const responseCjk = responseText.match(/[\u4e00-\u9fff]/g) || [];
  for (let index = 0; index + 1 < responseCjk.length; index += 1) {
    responseTokens.add(responseCjk[index] + responseCjk[index + 1]);
  }
  if (responseText && responseText.includes(normalizedText(expected))) return 1;
  const hits = expectedTokens.filter((token) => responseTokens.has(token)).length;
  return Math.min(1, hits / Math.min(3, expectedTokens.length));
}

function item({ id, kind, prompt, expected, evidenceId = null, locator = '' }) {
  return {
    internal: {
      id: `assessment:${id}`,
      expected,
    },
    public: {
      version: ASSESSMENT_VERSION,
      itemId: `assessment:${id}`,
      kind,
      prompt,
      evidenceId,
      hints: locator ? [{ kind: 'source_locator', value: locator }] : [],
    },
  };
}

function buildAssessmentItems(node, evidenceRows) {
  const items = [];
  if (node.definition && node.definition.trim()) {
    items.push(item({
      id: `node:${node.id}`,
      kind: 'concept_recall',
      prompt: `请解释「${node.title}」。`,
      expected: node.definition,
    }));
  }
  for (const row of evidenceRows) {
    if (items.length >= MAX_ITEMS) break;
    items.push(item({
      id: `evidence:${row.id}`,
      kind: 'evidence_quote',
      prompt: `根据课程证据说明「${node.title}」：${row.quote}`,
      expected: row.quote,
      evidenceId: row.id,
      locator: row.locator,
    }));
  }
  return items;
}

async function assertOwnedCourse(userId, courseId) {
  const ownedCourseId = requiredText(courseId, 'courseId', 200);
  const envelope = await syncService.getData(userId);
  const courses = envelope && envelope.data && Array.isArray(envelope.data.courses)
    ? envelope.data.courses
    : [];
  if (!courses.some((course) => course && String(course.id) === ownedCourseId)) {
    throw ApiError.badRequest('INVALID_COURSE', '课程不存在或不属于当前用户');
  }
  return ownedCourseId;
}

async function buildAssessment({ userId, courseId, knowledgeNodeId }) {
  const owner = Number(userId);
  if (!Number.isInteger(owner) || owner <= 0) {
    throw ApiError.unauthorized('UNAUTHORIZED', '请先登录');
  }
  const ownedCourseId = await assertOwnedCourse(owner, courseId);
  const nodeId = requiredText(knowledgeNodeId, 'knowledgeNodeId', 100);
  const node = await courseSpaceModel.findNode({ userId: owner, nodeId });
  if (!node || node.course_id !== ownedCourseId) {
    throw ApiError.badRequest('INVALID_REFERENCE', '知识节点不存在或不属于当前课程');
  }
  const evidenceRows = (await courseSpaceModel.listEvidence(owner, ownedCourseId))
    .filter((row) => row.node_id === nodeId)
    .slice(0, MAX_ITEMS);
  const items = buildAssessmentItems(node, evidenceRows);
  if (!items.length) {
    throw ApiError.badRequest('INSUFFICIENT_ASSESSMENT_SOURCE', '当前知识节点缺少可评估来源');
  }
  return {
    version: RESULT_VERSION,
    courseId: ownedCourseId,
    knowledgeNodeId: nodeId,
    nodeTitle: node.title,
    generatedFrom: {
      nodeId: node.id,
      nodeVersion: node.version,
      evidenceCount: evidenceRows.length,
    },
    items: items.map((entry) => entry.public),
    permissions: { read: ['course_knowledge', 'course_evidence'], write: [] },
    metadata: {
      deterministic: true,
      aiGenerated: false,
      maxItems: MAX_ITEMS,
    },
  };
}

function toAttempt(row) {
  return {
    id: row.id,
    courseId: row.course_id,
    knowledgeNodeId: row.knowledge_node_id,
    mode: row.mode,
    score: row.score,
    durationMs: row.duration_ms,
    confirmed: true,
    createdAt: row.created_at,
  };
}

function toState(row) {
  return {
    id: row.id,
    courseId: row.course_id,
    knowledgeNodeId: row.knowledge_node_id,
    masteryLevel: row.mastery_level,
    confidence: row.confidence,
    state: row.state,
    evidenceCount: row.evidence_count,
    updatedAt: row.updated_at,
  };
}

async function recordAssessment({ userId, body }) {
  const owner = Number(userId);
  if (!Number.isInteger(owner) || owner <= 0) {
    throw ApiError.unauthorized('UNAUTHORIZED', '请先登录');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw ApiError.badRequest('INVALID_INPUT', '数据格式不正确');
  }
  if (body.confirmed !== true) {
    throw ApiError.badRequest('USER_CONFIRMATION_REQUIRED', '评估提交必须由用户确认');
  }
  const ownedCourseId = await assertOwnedCourse(owner, body.courseId);
  const nodeId = requiredText(body.knowledgeNodeId, 'knowledgeNodeId', 100);
  const node = await courseSpaceModel.findNode({ userId: owner, nodeId });
  if (!node || node.course_id !== ownedCourseId) {
    throw ApiError.badRequest('INVALID_REFERENCE', '知识节点不存在或不属于当前课程');
  }
  let confirmedProposal = null;
  if (body.proposalId) {
    const proposalId = requiredText(body.proposalId, 'proposalId', 64);
    confirmedProposal = actionModel.findProposal({ userId: owner, proposalId });
    if (!confirmedProposal
      || confirmedProposal.course_id !== ownedCourseId
      || confirmedProposal.knowledge_node_id !== nodeId
      || confirmedProposal.kind !== 'assessment'
      || confirmedProposal.status !== 'confirmed') {
      throw ApiError.badRequest('INVALID_ACTION_PROPOSAL', '学习行动不可评估');
    }
  }
  const evidenceRows = (await courseSpaceModel.listEvidence(owner, ownedCourseId))
    .filter((row) => row.node_id === nodeId)
    .slice(0, MAX_ITEMS);
  const internalItems = buildAssessmentItems(node, evidenceRows);
  if (!internalItems.length) {
    throw ApiError.badRequest('INSUFFICIENT_ASSESSMENT_SOURCE', '当前知识节点缺少可评估来源');
  }
  const internalById = new Map(internalItems.map((entry) => [entry.internal.id, entry.internal]));
  if (!Array.isArray(body.answers) || body.answers.length === 0 || body.answers.length > internalItems.length) {
    throw ApiError.badRequest('INVALID_INPUT', 'answers数量不正确');
  }

  const graded = body.answers.map((answer) => {
    if (!answer || typeof answer !== 'object' || Array.isArray(answer)
      || typeof answer.itemId !== 'string'
      || typeof answer.response !== 'string'
      || answer.response.length > 2000) {
      throw ApiError.badRequest('INVALID_INPUT', 'answer格式不正确');
    }
    const expected = internalById.get(answer.itemId);
    if (!expected) throw ApiError.badRequest('INVALID_ASSESSMENT_ITEM', '评估题不存在');
    const score = gradeAnswer(answer.response, expected.expected);
    return {
      itemId: answer.itemId,
      kind: internalItems.find((entry) => entry.internal.id === answer.itemId).public.kind,
      score,
    };
  });
  const duplicateIds = new Set();
  for (const entry of graded) {
    if (duplicateIds.has(entry.itemId)) {
      throw ApiError.badRequest('INVALID_INPUT', 'answers包含重复题');
    }
    duplicateIds.add(entry.itemId);
  }
  const score = graded.reduce((total, entry) => total + entry.score, 0) / graded.length;
  const attemptId = crypto.randomUUID();
  const evidenceId = crypto.randomUUID();
  const stateId = crypto.randomUUID();
  const existing = stateModel.findState({
    userId: owner,
    courseId: ownedCourseId,
    knowledgeNodeId: nodeId,
  });
  const previousEvidence = existing
    ? stateModel.listEvidence({ userId: owner, knowledgeStateId: existing.id })
    : [];
  const candidateEvidence = previousEvidence.map((row) => ({
    source_type: row.source_type,
    evidence_data: row.evidence_data,
  }));
  const evidenceData = JSON.stringify({ score, practice: true, mode: 'assessment', graded });
  candidateEvidence.push({ source_type: 'assessment', evidence_data: evidenceData });
  const derived = stateService.aggregateEvidence(candidateEvidence);
  const attempt = {
    id: attemptId,
    userId: owner,
    courseId: ownedCourseId,
    knowledgeNodeId: nodeId,
    mode: 'assessment',
    score,
    durationMs: boundedDuration(body.durationMs),
    sourceAttemptId: attemptId,
  };
  const evidence = {
    id: evidenceId,
    user_id: owner,
    source_type: 'assessment',
    source_id: attemptId,
    evidence_data: evidenceData,
  };

  const result = db.transaction(() => {
    practiceModel.createAttempt(attempt);
    const state = stateModel.recordEvidenceWithState({
      stateId: existing ? existing.id : stateId,
      userId: owner,
      courseId: ownedCourseId,
      knowledgeNodeId: nodeId,
      mastery: derived.mastery,
      confidence: derived.confidence,
      state: derived.state,
      evidence,
    });
    if (confirmedProposal) {
      actionModel.markStatus({
        userId: owner,
        proposalId: confirmedProposal.id,
        status: 'completed',
      });
    }
    return state;
  })();

  return {
    attempt: toAttempt({
      ...attempt,
      created_at: result.updated_at,
    }),
    mastery: toState(result),
    assessment: {
      version: RESULT_VERSION,
      score: Number(score.toFixed(4)),
      items: graded,
    },
    action: confirmedProposal ? {
      proposalId: confirmedProposal.id,
      status: 'completed',
    } : null,
  };
}

async function listAssessmentAttempts({ userId, query }) {
  const owner = Number(userId);
  if (!Number.isInteger(owner) || owner <= 0) {
    throw ApiError.unauthorized('UNAUTHORIZED', '请先登录');
  }
  const ownedCourseId = await assertOwnedCourse(owner, query && query.courseId);
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), MAX_ATTEMPTS);
  const offset = Math.min(Math.max(Number(query.offset) || 0, 0), 10000);
  return {
    courseId: ownedCourseId,
    attempts: practiceModel.listAttempts({
      userId: owner,
      courseId: ownedCourseId,
      limit,
      offset,
    }).filter((row) => row.mode === 'assessment').map(toAttempt),
    limit,
    offset,
  };
}

module.exports = {
  ASSESSMENT_VERSION,
  RESULT_VERSION,
  buildAssessment,
  gradeAnswer,
  recordAssessment,
  listAssessmentAttempts,
};
