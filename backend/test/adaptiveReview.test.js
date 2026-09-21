'use strict';

require('./setup');

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const authService = require('../src/services/authService');
const syncService = require('../src/services/syncService');
const courseSpaceService = require('../src/services/courseSpaceService');
const stateService = require('../src/services/studentKnowledgeStateService');
const adaptiveReviewService = require('../src/services/adaptiveReviewService');

async function prepareCourse(email, courseId = 'course-1') {
  await authService.register({ email, password: 'Password123' });
  const userId = await authService.login({ email, password: 'Password123' })
    .then((result) => result.user.id);
  await syncService.saveData(userId, {
    courses: [{ id: courseId, name: 'JavaScript' }],
  });
  const node = await courseSpaceService.createNode({
    userId,
    body: {
      courseId,
      title: 'Promise',
      kind: 'concept',
      definition: 'A Promise represents an eventual value.',
      confidence: 'medium',
    },
  });
  return { userId, courseId, node };
}

describe('adaptive review intelligence', () => {
  test('derives no-state recommendation as assessment due now', async () => {
    const owner = await prepareCourse('adaptive-no-state@example.com');
    const result = await adaptiveReviewService.buildAdaptiveReview({
      userId: owner.userId,
      courseId: owner.courseId,
    });
    const item = result.items.find((entry) => entry.knowledgeNodeId === owner.node.id);
    assert.equal(result.version, 'adaptive-review-v1');
    assert.equal(item.state, 'no_state');
    assert.equal(item.dueNow, true);
    assert.equal(item.recommendedMode, 'assessment');
    assert.equal(item.riskLevel, 'watch');
    assert.equal(item.priority > 80, true);
  });

  test('uses state and assessment evidence to rank weak and mastered nodes', async () => {
    const owner = await prepareCourse('adaptive-state@example.com');
    const weak = await courseSpaceService.createNode({
      userId: owner.userId,
      body: {
        courseId: owner.courseId,
        title: 'Weak Topic',
        kind: 'concept',
        definition: 'Weak concept.',
        confidence: 'medium',
      },
    });
    const mastered = await courseSpaceService.createNode({
      userId: owner.userId,
      body: {
        courseId: owner.courseId,
        title: 'Mastered Topic',
        kind: 'concept',
        definition: 'Mastered concept.',
        confidence: 'medium',
      },
    });
    await stateService.recordEvidence({
      userId: owner.userId,
      courseId: owner.courseId,
      knowledgeNodeId: weak.id,
      sourceType: 'assessment',
      sourceId: 'weak-assessment',
      evidenceData: { score: 0.2 },
    });
    await stateService.recordEvidence({
      userId: owner.userId,
      courseId: owner.courseId,
      knowledgeNodeId: mastered.id,
      sourceType: 'assessment',
      sourceId: 'mastered-assessment-1',
      evidenceData: { score: 1 },
    });
    await stateService.recordEvidence({
      userId: owner.userId,
      courseId: owner.courseId,
      knowledgeNodeId: mastered.id,
      sourceType: 'assessment',
      sourceId: 'mastered-assessment-2',
      evidenceData: { score: 1 },
    });

    const result = await adaptiveReviewService.buildAdaptiveReview({
      userId: owner.userId,
      courseId: owner.courseId,
    });
    const noState = result.items.find((entry) => entry.knowledgeNodeId === owner.node.id);
    const weakItem = result.items.find((entry) => entry.knowledgeNodeId === weak.id);
    const masteredItem = result.items.find((entry) => entry.knowledgeNodeId === mastered.id);
    assert.equal(weakItem.state, 'weak');
    assert.equal(weakItem.recommendedMode, 'assessment');
    assert.equal(weakItem.riskLevel, 'high');
    assert.equal(masteredItem.state, 'mastered');
    assert.equal(masteredItem.dueNow, false);
    assert.equal(masteredItem.recommendedMode, 'consolidate');
    assert.equal(noState.priority > weakItem.priority, true);
    assert.equal(weakItem.priority > masteredItem.priority, true);
  });

  test('rejects foreign courses and keeps read-only metadata', async () => {
    const owner = await prepareCourse('adaptive-owner@example.com', 'owner-course');
    const other = await prepareCourse('adaptive-other@example.com', 'other-course');
    await assert.rejects(() => adaptiveReviewService.buildAdaptiveReview({
      userId: other.userId,
      courseId: owner.courseId,
    }), (error) => error.code === 'INVALID_COURSE');
    const result = await adaptiveReviewService.buildAdaptiveReview({
      userId: owner.userId,
      courseId: owner.courseId,
    });
    assert.equal(result.metadata.readOnly, true);
    assert.equal(result.metadata.actionLevel, 'recommendation_only');
  });
});
