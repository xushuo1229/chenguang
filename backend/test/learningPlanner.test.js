'use strict';

require('./setup');

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const authService = require('../src/services/authService');
const syncService = require('../src/services/syncService');
const courseSpaceService = require('../src/services/courseSpaceService');
const plannerService = require('../src/services/learningPlannerService');

async function prepareCourse(email, courseId = 'course-1') {
  await authService.register({ email, password: 'Password123' });
  const userId = await authService.login({ email, password: 'Password123' })
    .then((result) => result.user.id);
  await syncService.saveData(userId, {
    courses: [{ id: courseId, name: 'JavaScript' }],
  });
  const nodes = [];
  for (const title of ['Promise', 'Closure', 'Event Loop']) {
    nodes.push(await courseSpaceService.createNode({
      userId,
      body: {
        courseId,
        title,
        kind: 'concept',
        definition: `${title} definition.`,
        confidence: 'medium',
      },
    }));
  }
  return { userId, courseId, nodes };
}

describe('learning planner', () => {
  test('builds deterministic bounded plan with assessment blocks', async () => {
    const owner = await prepareCourse('planner-owner@example.com');
    const first = await plannerService.buildLearningPlan({
      userId: owner.userId,
      courseId: owner.courseId,
      query: { availableMinutes: 30 },
    });
    const second = await plannerService.buildLearningPlan({
      userId: owner.userId,
      courseId: owner.courseId,
      query: { availableMinutes: 30 },
    });

    assert.equal(first.version, 'learning-plan-v1');
    assert.equal(first.planId, second.planId);
    assert.equal(first.blocks.length, 2);
    assert.equal(first.blocks.every((block) => block.kind === 'assessment'), true);
    assert.equal(first.blocks.reduce((total, block) => total + block.minutes, 0) <= 30, true);
    assert.equal(first.permissions.write.length, 0);
    assert.equal(first.metadata.actionLevel, 'plan_only');
  });

  test('rejects foreign courses', async () => {
    const owner = await prepareCourse('planner-a@example.com', 'course-a');
    const other = await prepareCourse('planner-b@example.com', 'course-b');
    await assert.rejects(() => plannerService.buildLearningPlan({
      userId: other.userId,
      courseId: owner.courseId,
    }), (error) => error.code === 'INVALID_COURSE');
  });
});
