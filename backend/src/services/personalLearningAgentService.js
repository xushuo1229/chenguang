'use strict';

const ApiError = require('../utils/ApiError');
const actionService = require('./learningActionService');
const adaptiveReviewService = require('./adaptiveReviewService');
const plannerService = require('./learningPlannerService');

const AGENT_VERSION = 'personal-learning-agent-v2';

function countBy(items, selector) {
  return items.reduce((output, item) => {
    const key = selector(item);
    output[key] = (output[key] || 0) + 1;
    return output;
  }, {});
}

async function buildOverview({ userId, courseId, query = {} }) {
  const owner = Number(userId);
  if (!Number.isInteger(owner) || owner <= 0) {
    throw ApiError.unauthorized('UNAUTHORIZED', '请先登录');
  }
  const [review, plan, actions] = await Promise.all([
    adaptiveReviewService.buildAdaptiveReview({
      userId: owner,
      courseId,
      query: { limit: 10 },
    }),
    plannerService.buildLearningPlan({
      userId: owner,
      courseId,
      query,
    }),
    actionService.listProposals({
      userId: owner,
      query: { courseId, limit: 20 },
    }),
  ]);
  const nextBest = review.items[0] || null;
  const stateCounts = countBy(review.items, (item) => item.state);
  const riskCounts = countBy(review.items, (item) => item.riskLevel);
  const statusCounts = countBy(actions.proposals, (item) => item.status);

  return {
    version: AGENT_VERSION,
    courseId: plan.courseId,
    perception: {
      stateCounts,
      riskCounts,
      actionStatusCounts: statusCounts,
      nextBestRecommendation: nextBest,
    },
    plan,
    actions: {
      proposals: actions.proposals,
      limit: actions.limit,
    },
    permissions: {
      read: ['adaptive_review', 'learning_plan', 'learning_actions'],
      write: ['user_confirmed_action'],
    },
    metadata: {
      generatedAt: plan.metadata.generatedAt,
      readOnly: true,
      actionLevel: 'recommendation_only',
      llmRequired: false,
      autonomous: false,
    },
  };
}

async function confirmNextAction({ userId, courseId, body }) {
  const owner = Number(userId);
  if (!Number.isInteger(owner) || owner <= 0) {
    throw ApiError.unauthorized('UNAUTHORIZED', '请先登录');
  }
  if (!body || body.confirmed !== true) {
    throw ApiError.badRequest('USER_CONFIRMATION_REQUIRED', '下一个学习行动必须由用户确认');
  }
  const plan = await plannerService.buildLearningPlan({
    userId: owner,
    courseId,
    query: {},
  });
  const block = plan.blocks[0];
  if (!block) {
    return {
      version: AGENT_VERSION,
      status: 'no_action_available',
      proposal: null,
      action: null,
      permissions: { read: ['learning_plan'], write: [] },
      metadata: {
        readOnly: true,
        actionLevel: 'recommendation_only',
        reason: 'plan_empty',
      },
    };
  }
  const confirmed = await actionService.confirmProposal({
    userId: owner,
    body: {
      courseId: plan.courseId,
      planId: plan.planId,
      blockId: block.blockId,
      availableMinutes: plan.availableMinutes,
    },
  });
  return {
    version: AGENT_VERSION,
    status: 'action_ready',
    proposal: confirmed.proposal,
    action: confirmed.action,
    planContext: {
      planId: plan.planId,
      blockId: block.blockId,
      dayKey: plan.dayKey,
    },
    permissions: {
      read: ['learning_plan', 'assessment'],
      write: ['learning_action_status'],
    },
    metadata: {
      userConfirmed: true,
      readOnly: false,
      actionLevel: 'user_confirmed_action',
      autonomous: false,
    },
  };
}

module.exports = {
  AGENT_VERSION,
  buildOverview,
  confirmNextAction,
};
