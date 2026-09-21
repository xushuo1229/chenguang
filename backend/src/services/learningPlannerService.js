'use strict';

const crypto = require('node:crypto');
const ApiError = require('../utils/ApiError');
const adaptiveReviewService = require('./adaptiveReviewService');

const PLAN_VERSION = 'learning-plan-v1';
const MAX_BLOCKS = 4;
const BLOCK_MINUTES = [10, 15, 20, 25];
const KIND_BY_MODE = {
  assessment: 'assessment',
  review: 'review',
  consolidate: 'consolidate',
};

function localDayKey(now) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((output, key) => {
    output[key] = canonicalJson(value[key]);
    return output;
  }, {});
}

function blockForItem(entry, index) {
  const kind = KIND_BY_MODE[entry.recommendedMode] || 'consolidate';
  const minutes = entry.riskLevel === 'high' ? 20 : entry.state === 'mastered' ? 10 : 15;
  return {
    version: PLAN_VERSION,
    blockId: `block:${index + 1}:${entry.knowledgeNodeId}`,
    kind,
    knowledgeNodeId: entry.knowledgeNodeId,
    nodeTitle: entry.nodeTitle,
    minutes,
    priority: entry.priority,
    riskLevel: entry.riskLevel,
    reason: `${entry.state}:${entry.recommendedMode}:${entry.dueNow ? 'due' : 'scheduled'}`,
    sourceRefs: [
      { type: 'adaptive_review', id: entry.knowledgeNodeId, authority: 'deterministic_projection' },
      { type: 'student_knowledge_state', id: entry.knowledgeNodeId, authority: 'source' },
    ],
  };
}

async function buildLearningPlan({ userId, courseId, query = {} }) {
  const owner = Number(userId);
  if (!Number.isInteger(owner) || owner <= 0) {
    throw ApiError.unauthorized('UNAUTHORIZED', '请先登录');
  }
  const availableMinutes = Math.min(Math.max(Number(query.availableMinutes) || 60, 15), 240);
  const review = await adaptiveReviewService.buildAdaptiveReview({
    userId: owner,
    courseId,
    query: { limit: 20 },
  });
  const now = new Date();
  const dayKey = localDayKey(now);
  const seenNodes = new Set();
  const candidates = [];
  for (const item of review.items) {
    if (seenNodes.has(item.knowledgeNodeId)) continue;
    seenNodes.add(item.knowledgeNodeId);
    const block = blockForItem(item, candidates.length);
    candidates.push(block);
  }
  const blocks = [];
  let remainingMinutes = availableMinutes;
  for (const block of candidates) {
    const fit = BLOCK_MINUTES.find((minutes) => minutes === block.minutes && minutes <= remainingMinutes)
      || BLOCK_MINUTES.find((minutes) => minutes <= remainingMinutes);
    if (!fit) break;
    blocks.push({ ...block, minutes: fit });
    remainingMinutes -= fit;
    if (blocks.length >= MAX_BLOCKS || remainingMinutes < Math.min(...BLOCK_MINUTES)) break;
  }
  const sourceFingerprint = crypto.createHash('sha256')
    .update(JSON.stringify(canonicalJson(review.items.map((item) => ({
      knowledgeNodeId: item.knowledgeNodeId,
      nodeTitle: item.nodeTitle,
      state: item.state,
      masteryLevel: item.masteryLevel,
      evidenceCount: item.evidenceCount,
      assessmentCount: item.practiceCount,
      dueNow: item.dueNow,
      priority: item.priority,
      riskLevel: item.riskLevel,
      recommendedMode: item.recommendedMode,
    })))))
    .digest('hex');
  const planId = crypto.createHash('sha256')
    .update(`${review.courseId}:${dayKey}:${sourceFingerprint}`)
    .digest('hex')
    .slice(0, 32);

  return {
    version: PLAN_VERSION,
    planId,
    courseId: review.courseId,
    dayKey,
    availableMinutes,
    blocks,
    sourceRefs: [
      { type: 'adaptive_review', authority: 'deterministic_projection' },
      { type: 'student_knowledge_state', authority: 'source' },
    ],
    permissions: { read: ['adaptive_review'], write: [] },
    metadata: {
      generatedAt: now.toISOString(),
      readOnly: true,
      deterministic: true,
      aiGenerated: false,
      actionLevel: 'plan_only',
      sourceFingerprint,
    },
  };
}

module.exports = {
  PLAN_VERSION,
  buildLearningPlan,
};
