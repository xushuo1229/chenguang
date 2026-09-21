'use strict';

require('./setup');

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const authService = require('../src/services/authService');
const syncService = require('../src/services/syncService');
const courseSpaceService = require('../src/services/courseSpaceService');
const agentService = require('../src/services/personalLearningAgentService');
const assessmentService = require('../src/services/learningAssessmentService');

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

describe('personal learning agent 2.0', () => {
  test('builds bounded perception overview without autonomous action', async () => {
    const owner = await prepareCourse('agent-overview@example.com');
    const overview = await agentService.buildOverview({
      userId: owner.userId,
      courseId: owner.courseId,
      query: { availableMinutes: 15 },
    });

    assert.equal(overview.version, 'personal-learning-agent-v2');
    assert.equal(overview.perception.stateCounts.no_state, 1);
    assert.equal(overview.plan.blocks.length, 1);
    assert.equal(overview.metadata.autonomous, false);
    assert.equal(overview.metadata.actionLevel, 'recommendation_only');
  });

  test('confirms only explicit next action and feeds assessment back', async () => {
    const owner = await prepareCourse('agent-feedback@example.com');
    await assert.rejects(() => agentService.confirmNextAction({
      userId: owner.userId,
      courseId: owner.courseId,
      body: { confirmed: false },
    }), (error) => error.code === 'USER_CONFIRMATION_REQUIRED');

    const next = await agentService.confirmNextAction({
      userId: owner.userId,
      courseId: owner.courseId,
      body: { confirmed: true },
    });
    assert.equal(next.status, 'action_ready');
    assert.equal(next.metadata.userConfirmed, true);
    assert.equal(next.action.type, 'start_assessment');

    const feedback = await assessmentService.recordAssessment({
      userId: owner.userId,
      body: {
        confirmed: true,
        courseId: owner.courseId,
        knowledgeNodeId: owner.node.id,
        proposalId: next.proposal.id,
        answers: next.action.assessment.items.map((entry) => ({
          itemId: entry.itemId,
          response: 'It represents an eventual value.',
        })),
      },
    });
    assert.equal(feedback.action.proposalId, next.proposal.id);
    assert.equal(feedback.action.status, 'completed');
  });

  test('rejects foreign course overview', async () => {
    const owner = await prepareCourse('agent-a@example.com', 'course-a');
    const other = await prepareCourse('agent-b@example.com', 'course-b');
    await assert.rejects(() => agentService.buildOverview({
      userId: other.userId,
      courseId: owner.courseId,
    }), (error) => error.code === 'INVALID_COURSE');
  });
});
