'use strict';

const crypto = require('node:crypto');
const ApiError = require('../utils/ApiError');
const model = require('../db/studentPracticeModel');
const courseSpaceModel = require('../db/courseSpaceModel');
const stateService = require('./studentKnowledgeStateService');
const syncService = require('./syncService');

const MODES = new Set(['recall', 'explanation', 'application']);
const MAX_ATTEMPTS = 50;

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

  await model.createAttempt({
    id,
    userId: owner,
    courseId,
    knowledgeNodeId,
    mode,
    score,
    durationMs,
    sourceAttemptId: id,
  });
  const state = await stateService.recordEvidence({
    userId: owner,
    courseId,
    knowledgeNodeId,
    sourceType: 'assessment',
    sourceId: id,
    evidenceData: { score, practice: true, mode },
  });
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
    mastery: {
      masteryLevel: state.masteryLevel,
      confidence: state.confidence,
      state: state.state,
      evidenceCount: state.evidenceCount,
    },
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
