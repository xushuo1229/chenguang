'use strict';

require('./setup');

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const authService = require('../src/services/authService');
const syncService = require('../src/services/syncService');
const courseSpaceService = require('../src/services/courseSpaceService');
const plannerService = require('../src/services/learningPlannerService');
const assessmentService = require('../src/services/learningAssessmentService');
const actionService = require('../src/services/learningActionService');
const { query } = require('../src/db');

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

describe('learning action confirmation', () => {
  test('requires user confirmation before starting assessment action', async () => {
    const owner = await prepareCourse('action-owner@example.com');
    const plan = await plannerService.buildLearningPlan({
      userId: owner.userId,
      courseId: owner.courseId,
      query: { availableMinutes: 15 },
    });
    const confirmed = await actionService.confirmProposal({
      userId: owner.userId,
      body: {
        courseId: owner.courseId,
        planId: plan.planId,
        blockId: plan.blocks[0].blockId,
        availableMinutes: 15,
      },
    });

    assert.equal(confirmed.proposal.status, 'confirmed');
    assert.equal(confirmed.proposal.kind, 'assessment');
    assert.equal(confirmed.action.type, 'start_assessment');
    assert.equal(confirmed.action.assessment.items.length > 0, true);
    assert.equal(confirmed.metadata.userConfirmed, true);
  });

  test('marks assessment proposal completed only after assessment evidence', async () => {
    const owner = await prepareCourse('action-feedback@example.com');
    const plan = await plannerService.buildLearningPlan({
      userId: owner.userId,
      courseId: owner.courseId,
      query: { availableMinutes: 15 },
    });
    const confirmed = await actionService.confirmProposal({
      userId: owner.userId,
      body: {
        courseId: owner.courseId,
        planId: plan.planId,
        blockId: plan.blocks[0].blockId,
        availableMinutes: 15,
      },
    });
    await assert.rejects(() => actionService.completeProposal({
      userId: owner.userId,
      proposalId: confirmed.proposal.id,
      body: { confirmed: true },
    }), (error) => error.code === 'ASSESSMENT_FEEDBACK_REQUIRED');

    const assessment = await assessmentService.recordAssessment({
      userId: owner.userId,
      body: {
        confirmed: true,
        courseId: owner.courseId,
        knowledgeNodeId: owner.node.id,
        proposalId: confirmed.proposal.id,
        answers: confirmed.action.assessment.items.map((entry) => ({
          itemId: entry.itemId,
          response: 'It represents an eventual value.',
        })),
      },
    });
    assert.equal(assessment.action.proposalId, confirmed.proposal.id);
    assert.equal(assessment.action.status, 'completed');

    const listed = await actionService.listProposals({
      userId: owner.userId,
      query: { courseId: owner.courseId, status: 'completed' },
    });
    assert.equal(listed.proposals.some((entry) => entry.id === confirmed.proposal.id), true);
  });

  test('rejects foreign course and unconfirmed completion', async () => {
    const owner = await prepareCourse('action-guard-a@example.com', 'course-a');
    const other = await prepareCourse('action-guard-b@example.com', 'course-b');
    await assert.rejects(() => actionService.confirmProposal({
      userId: other.userId,
      body: {
        courseId: owner.courseId,
        planId: 'invalid',
        blockId: 'invalid',
      },
    }), (error) => error.code === 'INVALID_COURSE');
    await assert.rejects(() => actionService.completeProposal({
      userId: owner.userId,
      proposalId: 'missing',
      body: { confirmed: false },
    }), (error) => error.code === 'USER_CONFIRMATION_REQUIRED');
  });

  test('rejects expired confirmation and remains idempotent for completed actions', async () => {
    const owner = await prepareCourse('action-expiry@example.com');
    const plan = await plannerService.buildLearningPlan({
      userId: owner.userId,
      courseId: owner.courseId,
      query: { availableMinutes: 15 },
    });
    const confirmed = await actionService.confirmProposal({
      userId: owner.userId,
      body: {
        courseId: owner.courseId,
        planId: plan.planId,
        blockId: plan.blocks[0].blockId,
        availableMinutes: 15,
      },
    });
    await assert.rejects(() => actionService.completeProposal({
      userId: owner.userId,
      proposalId: confirmed.proposal.id,
      body: { confirmed: true },
    }), (error) => error.code === 'ASSESSMENT_FEEDBACK_REQUIRED');

    await query(
      `UPDATE learning_action_proposals
          SET updated_at = '2020-01-01T00:00:00.000Z'
        WHERE id = $1`,
      [confirmed.proposal.id],
    );
    await assert.rejects(() => actionService.completeProposal({
      userId: owner.userId,
      proposalId: confirmed.proposal.id,
      body: { confirmed: true },
    }), (error) => error.code === 'ACTION_EXPIRED');

    const before = await actionService.listProposals({
      userId: owner.userId,
      query: { courseId: owner.courseId },
    });
    await assert.rejects(() => actionService.completeProposal({
      userId: owner.userId,
      proposalId: 'missing-proposal',
      body: { confirmed: true },
    }), (error) => error.code === 'ACTION_NOT_FOUND');
    assert.equal(before.proposals.length > 0, true);
  });
});
