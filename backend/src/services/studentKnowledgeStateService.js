'use strict';

const crypto = require('crypto');
const ApiError = require('../utils/ApiError');
const courseSpaceModel = require('../db/courseSpaceModel');
const model = require('../db/studentKnowledgeStateModel');
const syncService = require('./syncService');

const SOURCE_TYPES = new Set(['learning_activity', 'assessment', 'review', 'reflection', 'manual_feedback']);
const PAGE_SIZE_DEFAULT = 20;
const PAGE_SIZE_MAX = 50;
const MAX_EVIDENCE_DATA = 4000;

const SOURCE_WEIGHTS = {
  assessment: 1,
  review: 0.7,
  learning_activity: 0.4,
  reflection: 0.2,
  manual_feedback: 0.2,
};

const SOURCE_VALUES = {
  learning_activity: 0.35,
  reflection: 0.25,
  manual_feedback: 0.25,
};
const BASE_MASTERY_WEIGHT = 0.4;

function requireObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw ApiError.badRequest('INVALID_INPUT', '数据格式不正确');
  }
  return value;
}

function requiredText(value, field, max) {
  const text = String(value == null ? '' : value).trim();
  if (!text) throw ApiError.badRequest('INVALID_INPUT', `${field}必填`);
  if (text.length > max) throw ApiError.badRequest('INVALID_INPUT', `${field}长度不能超过${max}`);
  return text;
}

function boundedNumber(value, field, max) {
  if (value == null || value === '') return field === 'limit' ? PAGE_SIZE_DEFAULT : 0;
  const numberValue = Number(value);
  const limitMax = field === 'limit' ? PAGE_SIZE_MAX : Number.MAX_SAFE_INTEGER;
  if (!Number.isInteger(numberValue) || numberValue < 0 || numberValue > limitMax) {
    throw ApiError.badRequest('INVALID_INPUT', `${field}不正确`);
  }
  if (max && numberValue > max) throw ApiError.badRequest('INVALID_INPUT', `${field}不正确`);
  return numberValue;
}

function boundedUnit(value, field) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw ApiError.badRequest('INVALID_INPUT', `${field}必须是0到1之间的数值`);
  }
  return value;
}

function stateForMastery({ mastery, evidenceCount, assessmentCount }) {
  if (mastery >= 0.75 && assessmentCount > 0 && evidenceCount >= 2) return 'mastered';
  if (mastery >= 0.4) return 'learning';
  return 'weak';
}

function aggregateEvidence(rows) {
  let weightedSum = 0;
  let totalWeight = BASE_MASTERY_WEIGHT;
  let assessmentCount = 0;
  for (const row of rows) {
    const weight = SOURCE_WEIGHTS[row.source_type];
    let value = SOURCE_VALUES[row.source_type];
    if (row.source_type === 'assessment') {
      const data = JSON.parse(row.evidence_data);
      value = boundedUnit(data && data.score, 'assessment score');
      assessmentCount += 1;
    } else if (row.source_type === 'review') {
      const data = JSON.parse(row.evidence_data);
      if (typeof (data && data.confirmed) !== 'boolean') {
        throw ApiError.badRequest('INVALID_INPUT', 'review confirmed必须是布尔值');
      }
      value = data.confirmed ? 1 : 0;
    }
    weightedSum += weight * value;
    totalWeight += weight;
  }
  const mastery = totalWeight ? weightedSum / totalWeight : 0;
  let confidence = Math.min(1, rows.length * 0.15 + assessmentCount * 0.4);
  if (!assessmentCount) confidence = Math.min(confidence, 0.5);
  return {
    mastery: Number(boundedUnit(mastery, 'mastery').toFixed(4)),
    confidence: Number(boundedUnit(confidence, 'confidence').toFixed(4)),
    state: stateForMastery({ mastery, evidenceCount: rows.length, assessmentCount }),
  };
}

function toState(row) {
  return {
    id: row.id,
    courseId: row.course_id,
    knowledgeNodeId: row.knowledge_node_id,
    nodeTitle: row.node_title || '',
    nodeKind: row.node_kind || '',
    masteryLevel: row.mastery_level,
    confidence: row.confidence,
    state: row.state,
    evidenceCount: row.evidence_count || 0,
    assessmentEvidenceCount: row.assessment_evidence_count || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function assertOwnedCourse(userId, courseId) {
  const text = requiredText(courseId, 'courseId', 200);
  const envelope = await syncService.getData(userId);
  const courses = envelope && envelope.data && Array.isArray(envelope.data.courses) ? envelope.data.courses : [];
  if (!courses.some((course) => course && String(course.id) === text)) {
    throw ApiError.badRequest('INVALID_COURSE', '课程不存在或不属于当前用户');
  }
  return text;
}

async function recordEvidence({ userId, courseId, knowledgeNodeId, sourceType, sourceId, evidenceData }) {
  const ownedCourseId = await assertOwnedCourse(userId, courseId);
  const nodeId = requiredText(knowledgeNodeId, 'knowledgeNodeId', 100);
  const node = await courseSpaceModel.findNode({ userId, nodeId });
  if (!node || node.course_id !== ownedCourseId) {
    throw ApiError.badRequest('INVALID_REFERENCE', '知识节点不存在或不属于当前课程');
  }
  if (!SOURCE_TYPES.has(sourceType)) {
    throw ApiError.badRequest('INVALID_SOURCE_TYPE', '证据来源不支持');
  }
  const data = requireObject(evidenceData);
  let serializedData;
  try {
    serializedData = JSON.stringify(data);
  } catch (_) {
    throw ApiError.badRequest('INVALID_INPUT', '证据数据不正确');
  }
  if (!serializedData || serializedData.length > MAX_EVIDENCE_DATA) {
    throw ApiError.badRequest('INVALID_INPUT', `证据数据长度不能超过${MAX_EVIDENCE_DATA}`);
  }

  const existing = model.findState({ userId, courseId: ownedCourseId, knowledgeNodeId: nodeId });
  const stateId = existing ? existing.id : crypto.randomUUID();
  const evidence = {
    id: crypto.randomUUID(),
    source_type: sourceType,
    source_id: requiredText(sourceId, 'sourceId', 200),
    evidence_data: serializedData,
  };
  const previousEvidence = existing
    ? model.listEvidence({ userId, knowledgeStateId: existing.id })
    : [];
  const candidateEvidence = previousEvidence.map((row) => ({
    source_type: row.source_type,
    evidence_data: row.evidence_data,
  }));
  candidateEvidence.push({ source_type: evidence.source_type, evidence_data: evidence.evidence_data });
  const derived = aggregateEvidence(candidateEvidence);
  return toState(model.recordEvidenceWithState({
    stateId,
    userId,
    courseId: ownedCourseId,
    knowledgeNodeId: nodeId,
    mastery: derived.mastery,
    confidence: derived.confidence,
    state: derived.state,
    evidence,
  }));
}

async function listCourseStates({ userId, courseId, query }) {
  const ownedCourseId = await assertOwnedCourse(userId, courseId);
  const input = query || {};
  const limit = boundedNumber(input.limit, 'limit');
  const offset = boundedNumber(input.offset, 'offset');
  const rows = model.listStates({ userId, courseId: ownedCourseId, limit, offset });
  return {
    courseId: ownedCourseId,
    states: rows.map(toState),
    limit,
    offset,
  };
}

module.exports = {
  aggregateEvidence,
  listCourseStates,
  recordEvidence,
};
