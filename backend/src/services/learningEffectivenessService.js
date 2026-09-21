'use strict';

const ApiError = require('../utils/ApiError');
const actionModel = require('../db/learningActionModel');
const practiceModel = require('../db/studentPracticeModel');
const syncService = require('./syncService');

const VERSION = 'learning-effectiveness-v1';
const MAX_ATTEMPTS = 500;
const MAX_ACTIONS = 500;
const ERROR_SCORE = 0.5;

function requiredText(value, field, max = 200) {
  const text = String(value == null ? '' : value).trim();
  if (!text) throw ApiError.badRequest('INVALID_INPUT', `${field}必填`);
  if (text.length > max) throw ApiError.badRequest('INVALID_INPUT', `${field}长度不能超过${max}`);
  return text;
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

function rate({ value, completed, total, source }) {
  if (!total) {
    return { status: 'unavailable', value: null, reason: 'missing_denominator', source };
  }
  return {
    status: 'available',
    value: Number((completed / total).toFixed(4)),
    completed,
    total,
    source,
  };
}

function difference({ value, nodes, source }) {
  if (!nodes.length) {
    return { status: 'unavailable', value: null, reason: 'missing_comparison', source };
  }
  return {
    status: 'available',
    value: Number((value / nodes.length).toFixed(4)),
    nodeCount: nodes.length,
    source,
  };
}

function average(values) {
  if (!values.length) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function parseTimestamp(value) {
  return value.includes('T') ? new Date(value) : new Date(`${value}Z`);
}

function groupScores(attempts) {
  const groups = new Map();
  for (const attempt of attempts) {
    if (!groups.has(attempt.knowledge_node_id)) groups.set(attempt.knowledge_node_id, []);
    groups.get(attempt.knowledge_node_id).push(Number(attempt.score));
  }
  return groups;
}

function buildMetrics(attempts, actions, windowDays) {
  const assessmentActions = actions.filter((row) => row.kind === 'assessment' && row.status !== 'dismissed');
  const reviewActions = actions.filter((row) => row.kind === 'review' && row.status !== 'dismissed');
  const assessments = attempts.filter((row) => row.mode === 'assessment');
  const scores = groupScores(assessments);

  let repeatedErrors = 0;
  let repeatedErrorOpportunities = 0;
  const previousByNode = new Map();
  for (const attempt of assessments) {
    const previous = previousByNode.get(attempt.knowledge_node_id);
    const failed = Number(attempt.score) < ERROR_SCORE;
    if (previous !== undefined) {
      repeatedErrorOpportunities += 1;
      if (failed && previous < ERROR_SCORE) repeatedErrors += 1;
    }
    previousByNode.set(attempt.knowledge_node_id, Number(attempt.score));
  }

  const improvements = [];
  for (const nodeScores of scores.values()) {
    if (nodeScores.length >= 2) improvements.push(nodeScores[nodeScores.length - 1] - nodeScores[0]);
  }

  const reviewComparisons = [];
  for (const review of reviewActions.filter((row) => row.status === 'completed')) {
    const nodeScores = scores.get(review.knowledge_node_id) || [];
    const reviewedAt = parseTimestamp(review.updated_at);
    const before = [];
    const after = [];
    for (const attempt of assessments.filter((row) => row.knowledge_node_id === review.knowledge_node_id)) {
      const attemptedAt = parseTimestamp(attempt.createdAt);
      if (attemptedAt < reviewedAt) before.push(Number(attempt.score));
      else after.push(Number(attempt.score));
    }
    const beforeAverage = average(before);
    const afterAverage = average(after);
    if (beforeAverage !== null && afterAverage !== null) {
      reviewComparisons.push(afterAverage - beforeAverage);
    }
  }

  const activeDays = new Set(assessments.map((attempt) => attempt.createdAt.slice(0, 10))).size;
  const completedPractice = assessmentActions.filter((row) => row.status === 'completed').length;
  const completedReviews = reviewActions.filter((row) => row.status === 'completed').length;
  const accuracy = average(assessments.map((row) => Number(row.score)));

  return {
    practiceCompletionRate: rate({
      value: completedPractice / assessmentActions.length,
      completed: completedPractice,
      total: assessmentActions.length,
      source: 'learning_action_proposals',
    }),
    assessmentAccuracy: accuracy === null ? {
      status: 'unavailable',
      value: null,
      reason: 'missing_attempts',
      source: 'student_practice_attempts',
    } : {
      status: 'available',
      value: Number(accuracy.toFixed(4)),
      assessmentCount: assessments.length,
      source: 'student_practice_attempts',
    },
    repeatedErrorRate: rate({
      value: repeatedErrors / repeatedErrorOpportunities,
      completed: repeatedErrors,
      total: repeatedErrorOpportunities,
      source: 'student_practice_attempts',
    }),
    masteryImprovement: difference({
      value: improvements.reduce((total, value) => total + value, 0),
      nodes: improvements,
      source: 'student_practice_attempts',
    }),
    reviewCompletionRate: rate({
      value: completedReviews / reviewActions.length,
      completed: completedReviews,
      total: reviewActions.length,
      source: 'learning_action_proposals',
    }),
    postReviewImprovement: difference({
      value: reviewComparisons.reduce((total, value) => total + value, 0),
      nodes: reviewComparisons,
      source: 'learning_action_proposals+student_practice_attempts',
    }),
    learningContinuity: assessments.length ? {
      status: 'available',
      value: Number((activeDays / windowDays).toFixed(4)),
      activeDays,
      windowDays,
      source: 'student_practice_attempts',
    } : {
      status: 'unavailable',
      value: null,
      reason: 'missing_attempts',
      source: 'student_practice_attempts',
    },
  };
}

async function buildEffectiveness({ userId, courseId, query = {} }) {
  const owner = Number(userId);
  if (!Number.isInteger(owner) || owner <= 0) {
    throw ApiError.unauthorized('UNAUTHORIZED', '请先登录');
  }
  const ownedCourseId = await assertOwnedCourse(owner, courseId);
  const days = Number(query.days) || 30;
  if (!Number.isInteger(days) || days < 1 || days > 365) {
    throw ApiError.badRequest('INVALID_INPUT', 'days必须是1到365之间的整数');
  }
  const now = new Date();
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const attempts = practiceModel.listAttemptsForWindow({
    userId: owner,
    courseId: ownedCourseId,
    from,
    limit: MAX_ATTEMPTS,
  });
  const actions = actionModel.listProposalsForWindow({
    userId: owner,
    courseId: ownedCourseId,
    from,
    limit: MAX_ACTIONS,
  });

  return {
    version: VERSION,
    courseId: ownedCourseId,
    window: {
      days,
      from: from.toISOString(),
      to: now.toISOString(),
    },
    metrics: buildMetrics(attempts, actions, days),
    metadata: {
      readOnly: true,
      deterministic: true,
      limits: {
        attempts: MAX_ATTEMPTS,
        actions: MAX_ACTIONS,
      },
      derivedFrom: [
        'student_practice_attempts',
        'learning_action_proposals',
      ],
    },
  };
}

module.exports = {
  VERSION,
  buildEffectiveness,
};
