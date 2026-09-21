'use strict';

const ApiError = require('../utils/ApiError');
const courseSpaceModel = require('../db/courseSpaceModel');
const practiceModel = require('../db/studentPracticeModel');
const stateModel = require('../db/studentKnowledgeStateModel');
const syncService = require('./syncService');

const REVIEW_VERSION = 'adaptive-review-v1';
const STATE_LIMIT = 50;
const INTERVALS = {
  no_state: 0,
  weak: 1,
  learning: 3,
  mastered: 14,
};
const BASE_PRIORITY = {
  no_state: 100,
  weak: 90,
  learning: 60,
  mastered: 20,
};

function requiredText(value, field, max) {
  const text = String(value == null ? '' : value).trim();
  if (!text) throw ApiError.badRequest('INVALID_INPUT', `${field}必填`);
  if (text.length > max) throw ApiError.badRequest('INVALID_INPUT', `${field}长度不能超过${max}`);
  return text;
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

function parseTimestamp(value) {
  if (!value) return null;
  const date = new Date(`${String(value).replace(' ', 'T')}Z`);
  return Number.isFinite(date.getTime()) ? date : null;
}

function evidenceSummary(rows) {
  let lastAssessmentAt = null;
  let assessmentSum = 0;
  let assessmentCount = 0;
  for (const row of rows) {
    if (row.source_type !== 'assessment') continue;
    try {
      const data = JSON.parse(row.evidence_data);
      if (typeof data.score === 'number' && Number.isFinite(data.score)) {
        assessmentSum += Math.min(1, Math.max(0, data.score));
        assessmentCount += 1;
      }
    } catch (_) {
      continue;
    }
    const createdAt = parseTimestamp(row.created_at);
    if (createdAt && (!lastAssessmentAt || createdAt > lastAssessmentAt)) {
      lastAssessmentAt = createdAt;
    }
  }
  return {
    lastAssessmentAt,
    assessmentAverage: assessmentCount ? assessmentSum / assessmentCount : null,
    assessmentCount,
  };
}

function buildItem(row, attempts, now) {
  const state = row.state || 'no_state';
  const lastEvidenceAt = parseTimestamp(row.updated_at) || parseTimestamp(row.created_at);
  const stateAttempts = attempts.filter((attempt) => attempt.knowledge_node_id === row.knowledge_node_id);
  const assessmentSummary = evidenceSummary(stateModel.listEvidence({
    userId: row.user_id,
    knowledgeStateId: row.id,
  }));
  const intervalDays = INTERVALS[state] ?? 3;
  const dueAt = lastEvidenceAt
    ? new Date(lastEvidenceAt.getTime() + intervalDays * 24 * 60 * 60 * 1000)
    : now;
  const dueNow = !dueAt || now.getTime() >= dueAt.getTime();
  const daysSinceEvidence = lastEvidenceAt
    ? Math.max(0, (now.getTime() - lastEvidenceAt.getTime()) / (24 * 60 * 60 * 1000))
    : 30;
  const mastery = row.mastery_level ?? 0;
  const assessmentAverage = assessmentSummary.assessmentAverage;
  const recencyPressure = Math.min(1, daysSinceEvidence / Math.max(1, intervalDays));
  const masteryPressure = 1 - mastery;
  const performancePressure = assessmentAverage === null ? 0.5 : 1 - assessmentAverage;
  let priority = (BASE_PRIORITY[state] ?? 50) * 0.55
    + masteryPressure * 20
    + recencyPressure * 15
    + performancePressure * 10;
  priority = Math.max(0, Math.min(100, Math.round(priority)));
  const riskLevel = state === 'weak' || assessmentAverage !== null && assessmentAverage < 0.4
    ? 'high'
    : state === 'learning' || dueNow ? 'watch' : 'none';
  const recommendedMode = assessmentSummary.assessmentCount === 0 || assessmentAverage !== null && assessmentAverage < 0.5
    ? 'assessment'
    : dueNow && state !== 'weak' ? 'review' : 'consolidate';

  return {
    knowledgeNodeId: row.knowledge_node_id,
    nodeTitle: row.node_title || row.title || '',
    state,
    masteryLevel: mastery,
    confidence: row.confidence ?? 0,
    evidenceCount: row.evidence_count ?? 0,
    practiceCount: stateAttempts.length,
    lastEvidenceAt: lastEvidenceAt ? lastEvidenceAt.toISOString() : null,
    lastAssessmentAt: assessmentSummary.lastAssessmentAt
      ? assessmentSummary.lastAssessmentAt.toISOString()
      : null,
    assessmentAverage: assessmentAverage === null ? null : Number(assessmentAverage.toFixed(4)),
    dueNow,
    dueAt: dueAt.toISOString(),
    priority,
    riskLevel,
    recommendedMode,
    reasons: [
      `state:${state}`,
      dueNow ? 'due_now' : 'not_due',
      assessmentSummary.assessmentCount === 0 ? 'missing_assessment_evidence' : 'assessment_evidence_present',
    ],
  };
}

async function buildAdaptiveReview({ userId, courseId, query = {} }) {
  const owner = Number(userId);
  if (!Number.isInteger(owner) || owner <= 0) {
    throw ApiError.unauthorized('UNAUTHORIZED', '请先登录');
  }
  const ownedCourseId = await assertOwnedCourse(owner, courseId);
  const limit = Math.min(Math.max(Number(query.limit) || STATE_LIMIT, 1), STATE_LIMIT);
  const now = new Date();
  const nodes = await courseSpaceModel.listNodes(owner, ownedCourseId);
  const states = stateModel.listStates({
    userId: owner,
    courseId: ownedCourseId,
    limit: STATE_LIMIT,
    offset: 0,
  });
  const statesByNode = new Map(states.map((row) => [row.knowledge_node_id, row]));
  const attempts = practiceModel.listAttempts({
    userId: owner,
    courseId: ownedCourseId,
    limit: 100,
    offset: 0,
  });
  const sourceRows = [
    ...states,
    ...nodes.filter((node) => !statesByNode.has(node.id)).map((node) => ({
      id: null,
      user_id: owner,
      knowledge_node_id: node.id,
      node_title: node.title,
      state: 'no_state',
      mastery_level: 0,
      confidence: 0,
      evidence_count: 0,
      updated_at: null,
      created_at: null,
    })),
  ];
  const items = sourceRows.map((row) => buildItem(row, attempts, now))
    .sort((left, right) => right.priority - left.priority
      || left.masteryLevel - right.masteryLevel
      || left.nodeTitle.localeCompare(right.nodeTitle))
    .slice(0, limit);

  return {
    version: REVIEW_VERSION,
    courseId: ownedCourseId,
    items,
    limit,
    metadata: {
      generatedAt: now.toISOString(),
      readOnly: true,
      deterministic: true,
      derivedFrom: [
        'student_knowledge_states',
        'student_knowledge_evidence',
        'student_practice_attempts',
      ],
      actionLevel: 'recommendation_only',
    },
  };
}

module.exports = {
  REVIEW_VERSION,
  buildAdaptiveReview,
};
