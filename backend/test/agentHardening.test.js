'use strict';

require('./setup');

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const authService = require('../src/services/authService');
const syncService = require('../src/services/syncService');
const courseSpaceService = require('../src/services/courseSpaceService');
const practiceService = require('../src/services/studentPracticeService');
const reviewService = require('../src/services/learningReviewService');
const stateModel = require('../src/db/studentKnowledgeStateModel');
const { query } = require('../src/db');

async function prepareOwner(email, courseId = 'course-1') {
  await authService.register({ email, password: 'Password123' });
  const userId = await authService.login({ email, password: 'Password123' }).then((result) => result.user.id);
  await syncService.saveData(userId, { courses: [{ id: courseId, name: 'JavaScript' }] });
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

describe('agent data and action hardening', () => {
  test('rolls back legacy practice attempt when evidence write fails', async () => {
    const owner = await prepareOwner('hardening-transaction@example.com');
    const original = stateModel.recordEvidenceWithState;
    stateModel.recordEvidenceWithState = () => {
      throw new Error('simulated evidence failure');
    };
    try {
      await assert.rejects(() => practiceService.recordPracticeAttempt({
        userId: owner.userId,
        body: {
          courseId: owner.courseId,
          knowledgeNodeId: owner.nodeId,
          score: 0.9,
          confirmed: true,
        },
      }), /simulated evidence failure/);
    } finally {
      stateModel.recordEvidenceWithState = original;
    }
    const attempts = await practiceService.listPracticeAttempts({
      userId: owner.userId,
      query: { courseId: owner.courseId },
    });
    assert.equal(attempts.attempts.length, 0);
  });

  test('requires explicit assessment evidence instead of inferring mastery condition', async () => {
    const owner = await prepareOwner('hardening-mastery@example.com');
    await practiceService.recordPracticeAttempt({
      userId: owner.userId,
      body: {
        courseId: owner.courseId,
        knowledgeNodeId: owner.nodeId,
        score: 0.9,
        confirmed: true,
      },
    });
    const firstEvaluation = await reviewService.evaluateMasteryPromotion({
      userId: owner.userId,
      courseId: owner.courseId,
    });
    assert.equal(firstEvaluation.evaluations[0].requirements.assessmentEvidencePresent, true);

    const reviewOnly = await courseSpaceService.createNode({
      userId: owner.userId,
      body: {
        courseId: owner.courseId,
        title: 'Review-only',
        kind: 'concept',
        definition: 'Review-only definition.',
        confidence: 'medium',
      },
    });
    await query(
      `INSERT INTO student_knowledge_states
         (id, user_id, course_id, knowledge_node_id, mastery_level, confidence, state)
       VALUES ('review-state', $1, $2, $3, 0.9, 0.9, 'learning')`,
      [owner.userId, owner.courseId, reviewOnly.id],
    );
    await query(
      `INSERT INTO student_knowledge_evidence
         (id, user_id, knowledge_state_id, source_type, source_id, evidence_data)
       VALUES ('review-evidence-1', $1, 'review-state', 'review', 'review-1', '{"confirmed":true}'),
              ('review-evidence-2', $1, 'review-state', 'review', 'review-2', '{"confirmed":true}')`,
      [owner.userId],
    );
    const evaluation = await reviewService.evaluateMasteryPromotion({
      userId: owner.userId,
      courseId: owner.courseId,
    });
    const reviewOnlyEvaluation = evaluation.evaluations.find((item) => item.knowledgeNodeId === reviewOnly.id);
    assert.equal(reviewOnlyEvaluation.requirements.assessmentEvidencePresent, false);
    assert.equal(reviewOnlyEvaluation.gate, 'not_ready');
  });
});
