'use strict';

require('./setup');

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const authService = require('../src/services/authService');
const syncService = require('../src/services/syncService');
const courseSpaceService = require('../src/services/courseSpaceService');
const practiceModel = require('../src/db/studentPracticeModel');
const stateModel = require('../src/db/studentKnowledgeStateModel');
const assessmentService = require('../src/services/learningAssessmentService');

async function prepareOwner(email, courseId = 'course-1') {
  await authService.register({ email, password: 'Password123' });
  const userId = await authService.login({ email, password: 'Password123' })
    .then((result) => result.user.id);
  await syncService.saveData(userId, {
    courses: [{ id: courseId, name: 'JavaScript' }],
  });
  const document = await courseSpaceService.createDocument({
    userId,
    body: {
      courseId,
      title: 'JavaScript Notes',
      content: 'Promise semantics',
    },
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
  const evidence = await courseSpaceService.createEvidence({
    userId,
    body: {
      courseId,
      documentId: document.id,
      nodeId: node.id,
      quote: 'A Promise can resolve later.',
      locator: 'chapter 3',
    },
  });
  return { userId, courseId, node, evidence, document };
}

describe('advanced assessment', () => {
  test('builds deterministic evidence-backed assessment without exposing answers', async () => {
    const owner = await prepareOwner('assessment-owner@example.com');
    const first = await assessmentService.buildAssessment({
      userId: owner.userId,
      courseId: owner.courseId,
      knowledgeNodeId: owner.node.id,
    });
    const second = await assessmentService.buildAssessment({
      userId: owner.userId,
      courseId: owner.courseId,
      knowledgeNodeId: owner.node.id,
    });

    assert.equal(first.version, 'assessment-result-v1');
    assert.equal(first.items.length, 2);
    assert.deepEqual(first.items, second.items);
    assert.equal(first.items.some((entry) => JSON.stringify(entry).includes('expected')), false);
    assert.equal(first.items[0].kind, 'concept_recall');
    assert.equal(first.items[1].evidenceId, owner.evidence.id);
  });

  test('grades deterministic answers and atomically writes attempt plus evidence', async () => {
    const owner = await prepareOwner('assessment-write@example.com');
    const assessment = await assessmentService.buildAssessment({
      userId: owner.userId,
      courseId: owner.courseId,
      knowledgeNodeId: owner.node.id,
    });
    const result = await assessmentService.recordAssessment({
      userId: owner.userId,
      body: {
        confirmed: true,
        courseId: owner.courseId,
        knowledgeNodeId: owner.node.id,
        durationMs: 1200,
        answers: assessment.items.map((entry) => ({
          itemId: entry.itemId,
          response: entry.kind === 'concept_recall'
            ? 'It represents an eventual value.'
            : 'A Promise can resolve later.',
        })),
      },
    });

    assert.equal(result.attempt.mode, 'assessment');
    assert.equal(result.attempt.score > 0, true);
    assert.equal(result.mastery.evidenceCount, 1);
    assert.equal(result.assessment.items.length, 2);
    assert.equal(practiceModel.listAttempts({
      userId: owner.userId,
      courseId: owner.courseId,
      limit: 10,
      offset: 0,
    }).some((row) => row.id === result.attempt.id), true);
    assert.equal(stateModel.listEvidence({
      userId: owner.userId,
      knowledgeStateId: result.mastery.id,
    }).some((row) => row.source_id === result.attempt.id), true);
  });

  test('rejects unconfirmed submissions and foreign course data', async () => {
    const owner = await prepareOwner('assessment-guard@example.com');
    const other = await prepareOwner('assessment-other@example.com', 'course-other');
    await assert.rejects(() => assessmentService.recordAssessment({
      userId: owner.userId,
      body: {
        confirmed: false,
        courseId: owner.courseId,
        knowledgeNodeId: owner.node.id,
        answers: [],
      },
    }), (error) => error.code === 'USER_CONFIRMATION_REQUIRED');
    await assert.rejects(() => assessmentService.buildAssessment({
      userId: other.userId,
      courseId: owner.courseId,
      knowledgeNodeId: owner.node.id,
    }), (error) => error.code === 'INVALID_COURSE');
  });

  test('keeps scoring bounded and deterministic', () => {
    assert.equal(assessmentService.gradeAnswer('', 'A Promise represents an eventual value.'), 0);
    assert.equal(assessmentService.gradeAnswer('It represents an eventual value.', 'A Promise represents an eventual value.'), 1);
    assert.equal(assessmentService.gradeAnswer('random text', 'A Promise represents an eventual value.') <= 1, true);
  });
});
