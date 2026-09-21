'use strict';

const crypto = require('node:crypto');
const ApiError = require('../utils/ApiError');
const { db } = require('../db');
const model = require('../db/studentPracticeModel');
const courseSpaceModel = require('../db/courseSpaceModel');
const stateModel = require('../db/studentKnowledgeStateModel');
const stateService = require('./studentKnowledgeStateService');
const syncService = require('./syncService');

const MODES = new Set(['recall', 'explanation', 'application']);
const MAX_ATTEMPTS = 50;

function toState(row) {
  return {
    masteryLevel: row.mastery_level,
    confidence: row.confidence,
    state: row.state,
    evidenceCount: row.evidence_count || 0,
    assessmentEvidenceCount: row.assessment_evidence_count || 0,
  };
}

function requiredText(value, field, max) {
  const text = String(value == null ? '' : value).trim();
  if (!text) throw ApiError.badRequest('INVALID_INPUT', `${field}必填`);
  if (text.length > max) throw ApiError.badRequest('INVALID_INPUT', `${field}长度不能超过${max}`);
  return text;
}

function boundedUnit(value) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0 || numberValue > 1) {
    throw ApiError.badRequest('INVALID_INPUT', 'score必须是0到1之间的数值');
  }
  return numberValue;
}

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

async function assertOwnedCourse(userId, courseId) {
  const ownedCourseId = requiredText(courseId, 'courseId', 200);
  const envelope = await syncService.getData(userId);
  const courses = envelope && envelope.data && Array.isArray(envelope.data.courses) ? envelope.data.courses : [];
  if (!courses.some((course) => course && String(course.id) === ownedCourseId)) {
    throw ApiError.badRequest('INVALID_COURSE', '课程不存在或不属于当前用户');
  }
  return ownedCourseId;
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

async function recordPracticeAttempt({ userId, body }) {
  const owner = Number(userId);
  if (!Number.isInteger(owner) || owner <= 0) {
    throw ApiError.unauthorized('UNAUTHORIZED', '请先登录');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw ApiError.badRequest('INVALID_INPUT', '数据格式不正确');
  }
  if (body.confirmed !== true) {
    throw ApiError.badRequest('USER_CONFIRMATION_REQUIRED', '练习记录必须由用户确认');
  }
  const courseId = await assertOwnedCourse(owner, body.courseId);
  const knowledgeNodeId = requiredText(body.knowledgeNodeId, 'knowledgeNodeId', 100);
  const score = boundedUnit(body.score);
  const durationMs = boundedDuration(body.durationMs);
  const mode = body.mode === undefined ? 'recall' : requiredText(body.mode, 'mode', 40);
  if (!MODES.has(mode)) throw ApiError.badRequest('INVALID_INPUT', 'mode不支持');
  const id = crypto.randomUUID();
  const node = await courseSpaceModel.findNode({ userId: owner, nodeId: knowledgeNodeId });
  if (!node || node.course_id !== courseId) {
    throw ApiError.badRequest('INVALID_REFERENCE', '知识节点不存在或不属于当前课程');
  }

  const evidenceData = JSON.stringify({ score, practice: true, mode });
  const existing = stateModel.findState({ userId: owner, courseId, knowledgeNodeId });
  const candidateEvidence = existing
    ? stateModel.listEvidence({ userId: owner, knowledgeStateId: existing.id }).map((row) => ({
      source_type: row.source_type,
      evidence_data: row.evidence_data,
    }))
    : [];
  candidateEvidence.push({ source_type: 'assessment', evidence_data: evidenceData });
  const derived = stateService.aggregateEvidence(candidateEvidence);
  const evidenceId = crypto.randomUUID();
  const stateId = crypto.randomUUID();
  const attempt = {
    id,
    userId: owner,
    courseId,
    knowledgeNodeId,
    mode,
    score,
    durationMs,
    sourceAttemptId: id,
    sourceAttemptId: id,
  };
  const state = db.transaction(() => {
    model.createAttempt(attempt);
    return stateModel.recordEvidenceWithState({
      stateId: existing ? existing.id : stateId,
      userId: owner,
      courseId,
      knowledgeNodeId,
      mastery: derived.mastery,
      confidence: derived.confidence,
      state: derived.state,
      evidence: {
        id: evidenceId,
        user_id: owner,
        source_type: 'assessment',
        source_id: id,
        evidence_data: evidenceData,
      },
    });
  })();
  return {
    attempt: toAttempt({
      id,
      course_id: courseId,
      knowledge_node_id: knowledgeNodeId,
      mode,
      score,
      duration_ms: durationMs,
      created_at: state.updatedAt,
    }),
    mastery: toState(state),
  };
}

async function listPracticeAttempts({ userId, query }) {
  const owner = Number(userId);
  if (!Number.isInteger(owner) || owner <= 0) {
    throw ApiError.unauthorized('UNAUTHORIZED', '请先登录');
  }
  const courseId = requiredText(query && query.courseId, 'courseId', 200);
  const ownedCourseId = await assertOwnedCourse(owner, courseId);
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), MAX_ATTEMPTS);
  const offset = Math.min(Math.max(Number(query.offset) || 0, 0), 10000);
  return {
    courseId: ownedCourseId,
    attempts: model.listAttempts({ userId: owner, courseId: ownedCourseId, limit, offset }).map(toAttempt),
    limit,
    offset,
  };
}

module.exports = {
  recordPracticeAttempt,
  listPracticeAttempts,
};
