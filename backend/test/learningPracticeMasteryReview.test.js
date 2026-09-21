'use strict';

require('./setup');

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const authService = require('../src/services/authService');
const syncService = require('../src/services/syncService');
const courseSpaceService = require('../src/services/courseSpaceService');
const practiceService = require('../src/services/studentPracticeService');
const reviewService = require('../src/services/learningReviewService');

async function prepareOwner(email, courseId = 'course-1') {
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
  return { userId, courseId, nodeId: node.id };
}

describe('practice, mastery gate, and review queue', () => {
  test('requires explicit user confirmation and persists user-owned attempts', async () => {
    const owner = await prepareOwner('practice-owner@example.com');
    await assert.rejects(() => practiceService.recordPracticeAttempt({
      userId: owner.userId,
      body: {
        courseId: owner.courseId,
        knowledgeNodeId: owner.nodeId,
        score: 0.9,
        confirmed: false,
      },
    }), /练习记录必须由用户确认/);

    for (let index = 0; index < 3; index += 1) {
      const result = await practiceService.recordPracticeAttempt({
        userId: owner.userId,
        body: {
          courseId: owner.courseId,
          knowledgeNodeId: owner.nodeId,
          score: 0.9,
          mode: 'recall',
          durationMs: 1000,
          confirmed: true,
        },
      });
      assert.equal(result.attempt.confirmed, true);
      assert.equal(result.mastery.evidenceCount, index + 1);
    }

    const attempts = await practiceService.listPracticeAttempts({
      userId: owner.userId,
      query: { courseId: owner.courseId, limit: 20 },
    });
    assert.equal(attempts.attempts.length, 3);
    assert.ok(attempts.attempts.every((attempt) => attempt.score === 0.9));
  });

  test('derives mastery gate and review queue without creating a second mastery store', async () => {
    const owner = await prepareOwner('mastery-owner@example.com');
    const weakNode = await courseSpaceService.createNode({
      userId: owner.userId,
      body: {
        courseId: owner.courseId,
        title: 'Event Loop',
        kind: 'concept',
        definition: 'The event loop schedules asynchronous work.',
        confidence: 'medium',
      },
    });
    for (let index = 0; index < 3; index += 1) {
      await practiceService.recordPracticeAttempt({
        userId: owner.userId,
        body: {
          courseId: owner.courseId,
          knowledgeNodeId: owner.nodeId,
          score: 0.9,
          confirmed: true,
        },
      });
    }
    await practiceService.recordPracticeAttempt({
      userId: owner.userId,
      body: {
        courseId: owner.courseId,
        knowledgeNodeId: weakNode.id,
        score: 0.2,
        confirmed: true,
      },
    });

    const mastery = await reviewService.evaluateMasteryPromotion({
      userId: owner.userId,
      courseId: owner.courseId,
    });
    const passed = mastery.evaluations.find((item) => item.knowledgeNodeId === owner.nodeId);
    assert.equal(passed.gate, 'passed');
    assert.equal(passed.requirements.masteryAtLeast75, true);
    assert.equal(passed.requirements.twoEvidenceItems, true);

    const queue = await reviewService.buildReviewQueue({
      userId: owner.userId,
      courseId: owner.courseId,
    });
    assert.equal(queue.items.some((item) => item.knowledgeNodeId === owner.nodeId), false);
    assert.equal(queue.items.some((item) => item.knowledgeNodeId === weakNode.id), true);
    assert.equal(queue.items[0].knowledgeNodeId, weakNode.id);
  });

  test('keeps practice data user-scoped', async () => {
    const first = await prepareOwner('practice-isolation-a@example.com', 'course-a');
    const second = await prepareOwner('practice-isolation-b@example.com', 'course-b');
    await practiceService.recordPracticeAttempt({
      userId: first.userId,
      body: {
        courseId: first.courseId,
        knowledgeNodeId: first.nodeId,
        score: 0.8,
        confirmed: true,
      },
    });
    const attempts = await practiceService.listPracticeAttempts({
      userId: second.userId,
      query: { courseId: second.courseId },
    });
    assert.equal(attempts.attempts.length, 0);
  });
});
