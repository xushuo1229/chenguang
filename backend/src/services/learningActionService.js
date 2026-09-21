'use strict';

const crypto = require('node:crypto');
const ApiError = require('../utils/ApiError');
const actionModel = require('../db/learningActionModel');
const assessmentService = require('./learningAssessmentService');
const plannerService = require('./learningPlannerService');
const syncService = require('./syncService');

const ACTION_VERSION = 'learning-action-v1';
const STATUSES = new Set(['proposed', 'confirmed', 'completed', 'dismissed']);
const MAX_ACTIONS = 50;

function requiredText(value, field, max = 200) {
  const text = String(value == null ? '' : value).trim();
  if (!text) throw ApiError.badRequest('INVALID_INPUT', `${field}必填`);
  if (text.length > max) throw ApiError.badRequest('INVALID_INPUT', `${field}长度不能超过${max}`);
  return text;
}

function toProposal(row) {
  let payload = {};
  try {
    payload = JSON.parse(row.payload_json || '{}');
  } catch (_) {
    payload = {};
  }
  return {
    id: row.id,
    courseId: row.course_id,
    knowledgeNodeId: row.knowledge_node_id,
    kind: row.kind,
    status: row.status,
    planId: row.plan_id,
    blockId: row.block_id,
    fingerprint: row.fingerprint,
    payload,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function identityForBlock(plan, block) {
  const fingerprint = crypto.createHash('sha256')
    .update(`${plan.planId}:${block.blockId}:${block.kind}:${block.knowledgeNodeId}:${plan.dayKey}`)
    .digest('hex');
  return {
    id: fingerprint.slice(0, 32),
    fingerprint,
  };
}

function payloadForBlock(block) {
  return JSON.stringify({
    nodeTitle: block.nodeTitle,
    priority: block.priority,
    riskLevel: block.riskLevel,
    reason: block.reason,
    minutes: block.minutes,
  });
}

async function assertOwnedCourse(userId, courseId) {
  const ownedCourseId = requiredText(courseId, 'courseId');
  const envelope = await syncService.getData(userId);
  const courses = envelope && envelope.data && Array.isArray(envelope.data.courses)
    ? envelope.data.courses
    : [];
  if (!courses.some((course) => course && String(course.id) === ownedCourseId)) {
    throw ApiError.badRequest('INVALID_COURSE', '课程不存在或不属于当前用户');
  }
  return ownedCourseId;
}

async function confirmProposal({ userId, body }) {
  const owner = Number(userId);
  if (!Number.isInteger(owner) || owner <= 0) {
    throw ApiError.unauthorized('UNAUTHORIZED', '请先登录');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw ApiError.badRequest('INVALID_INPUT', '数据格式不正确');
  }
  const courseId = await assertOwnedCourse(owner, body.courseId);
  const planId = requiredText(body.planId, 'planId', 64);
  const blockId = requiredText(body.blockId, 'blockId', 200);
  const plan = await plannerService.buildLearningPlan({
    userId: owner,
    courseId,
    query: { availableMinutes: body.availableMinutes },
  });
  if (plan.planId !== planId) {
    throw ApiError.badRequest('INVALID_ACTION_PLAN', '学习计划已变化，请重新加载');
  }
  const block = plan.blocks.find((entry) => entry.blockId === blockId);
  if (!block) {
    throw ApiError.badRequest('INVALID_ACTION_BLOCK', '学习行动不存在');
  }
  const identity = identityForBlock(plan, block);
  actionModel.upsertProposal({
    id: identity.id,
    userId: owner,
    courseId,
    knowledgeNodeId: block.knowledgeNodeId,
    kind: block.kind,
    status: 'confirmed',
    planId: plan.planId,
    blockId: block.blockId,
    fingerprint: identity.fingerprint,
    payload: payloadForBlock(block),
  });
  const proposalRow = actionModel.findProposal({ userId: owner, proposalId: identity.id });
  const proposal = toProposal(proposalRow);
  const action = block.kind === 'assessment'
    ? {
      type: 'start_assessment',
      assessment: await assessmentService.buildAssessment({
        userId: owner,
        courseId,
        knowledgeNodeId: block.knowledgeNodeId,
      }),
    }
    : {
      type: block.kind === 'review' ? 'start_review' : 'start_consolidation',
      instruction: `复习「${block.nodeTitle}」，完成后手动确认。`,
    };
  return {
    version: ACTION_VERSION,
    proposal,
    action,
    permissions: { read: ['learning_plan', 'assessment'], write: ['learning_action_status'] },
    metadata: {
      userConfirmed: true,
      readOnly: false,
      actionLevel: 'user_confirmed_action',
    },
  };
}

async function completeProposal({ userId, proposalId, body }) {
  const owner = Number(userId);
  if (!Number.isInteger(owner) || owner <= 0) {
    throw ApiError.unauthorized('UNAUTHORIZED', '请先登录');
  }
  if (!body || body.confirmed !== true) {
    throw ApiError.badRequest('USER_CONFIRMATION_REQUIRED', '完成操作必须由用户确认');
  }
  const id = requiredText(proposalId, 'proposalId', 64);
  const row = actionModel.findProposal({ userId: owner, proposalId: id });
  if (!row) throw ApiError.notFound('ACTION_NOT_FOUND', '学习行动不存在');
  if (row.status === 'completed') return { version: ACTION_VERSION, proposal: toProposal(row) };
  if (row.status !== 'confirmed') {
    throw ApiError.badRequest('ACTION_NOT_CONFIRMED', '学习行动尚未确认');
  }
  if (row.kind === 'assessment') {
    const attemptCount = actionModel.countAttemptsBySource({ userId: owner, sourceId: row.id });
    if (!attemptCount) {
      throw ApiError.badRequest('ASSESSMENT_FEEDBACK_REQUIRED', '评估行动需要先提交评估');
    }
  }
  actionModel.markStatus({ userId: owner, proposalId: id, status: 'completed' });
  return {
    version: ACTION_VERSION,
    proposal: toProposal(actionModel.findProposal({ userId: owner, proposalId: id })),
  };
}

async function listProposals({ userId, query = {} }) {
  const owner = Number(userId);
  if (!Number.isInteger(owner) || owner <= 0) {
    throw ApiError.unauthorized('UNAUTHORIZED', '请先登录');
  }
  let courseId = null;
  if (query.courseId) courseId = await assertOwnedCourse(owner, query.courseId);
  const status = query.status ? requiredText(query.status, 'status', 20) : null;
  if (status && !STATUSES.has(status)) {
    throw ApiError.badRequest('INVALID_INPUT', 'status不支持');
  }
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), MAX_ACTIONS);
  const offset = Math.min(Math.max(Number(query.offset) || 0, 0), 10000);
  return {
    version: ACTION_VERSION,
    courseId,
    status,
    proposals: actionModel.listProposals({
      userId: owner,
      courseId,
      status,
      limit,
      offset,
    }).map(toProposal),
    limit,
    offset,
  };
}

module.exports = {
  ACTION_VERSION,
  confirmProposal,
  completeProposal,
  listProposals,
};
