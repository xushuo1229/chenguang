'use strict';

require('./setup');

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const authService = require('../src/services/authService');
const syncService = require('../src/services/syncService');
const courseSpaceService = require('../src/services/courseSpaceService');
const stateService = require('../src/services/studentKnowledgeStateService');
const {
  RUNTIME_VERSION,
  runLearningConversation,
} = require('../src/services/agentLearningConversation/learningConversationRuntime');

function localToday() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

async function prepareOwner(email, courseId = 'course-1') {
  await authService.register({ email, password: 'Password123' });
  const userId = await authService.login({ email, password: 'Password123' })
    .then((result) => result.user.id);
  await syncService.saveData(userId, {
    courses: [{ id: courseId, name: 'JavaScript' }],
    todos: [{ id: 'todo-1', title: 'Read chapter', date: localToday(), done: true }],
    focus: [{ id: 'focus-1', date: localToday(), minutes: 45 }],
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
  await stateService.recordEvidence({
    userId,
    courseId,
    knowledgeNodeId: node.id,
    sourceType: 'assessment',
    sourceId: 'assessment-1',
    evidenceData: { score: 0.45 },
  });
  return { userId, courseId };
}

function notConfiguredProvider() {
  return {
    async generateExplanation() {
      return {
        status: 'failed',
        reason: 'llm_not_configured',
        provider: 'stub',
        model: '',
        promptVersion: '',
        requestId: 'test',
        latencyMs: 1,
      };
    },
  };
}

describe('learning conversation runtime', () => {
  test('runs the frozen query, selection, and gateway chain for a supported query', async () => {
    const owner = await prepareOwner('conversation-owner@example.com');
    let providerPayload;
    const provider = {
      async generateExplanation(request) {
        providerPayload = request.context;
        return notConfiguredProvider().generateExplanation();
      },
    };
    const result = await runLearningConversation({
      userId: owner.userId,
      query: '解释 Promise',
      currentCourseLabel: 'JavaScript',
      options: { provider },
    });

    assert.equal(result.version, RUNTIME_VERSION);
    assert.equal(result.userId, owner.userId);
    assert.equal(result.status, 'fallback');
    assert.equal(result.queryUnderstanding.intent.value, 'explain');
    assert.equal(result.queryUnderstanding.queryType.value, 'conceptual_question');
    assert.equal(result.queryUnderstanding.knowledgeRefs[0].displayLabel, 'Promise');
    assert.equal(result.contextSelection.status, 'selected');
    assert.equal(result.contextSelection.selectedItems.length > 0, true);
    assert.equal(result.explanation.status, 'fallback');
    assert.equal(result.explanation.fallback.reason, 'llm_not_configured');
    assert.equal(result.modeHint, 'concept_explanation');
    assert.equal(providerPayload.sources.some((source) => source.key === 'behavior'), false);
    assert.equal(providerPayload.insights.some((insight) => (
      insight.evidence.some((evidence) => evidence.source === 'behavior_adapter')
    )), false);
    assert.deepEqual(result.permissions.write, []);
    assert.equal(result.metadata.readOnly, true);
    assert.equal(result.metadata.actionLevel, 'insight_only');
    assert.equal(JSON.stringify(result).includes('"todos":'), false);
  });

  test('keeps ambiguous and unsupported queries outside provider execution', async () => {
    const owner = await prepareOwner('conversation-guard@example.com');
    let providerCalled = false;
    const provider = {
      async generateExplanation() {
        providerCalled = true;
        return {
          status: 'failed',
          reason: 'llm_not_configured',
          provider: 'stub',
          model: '',
          promptVersion: '',
          requestId: 'test',
          latencyMs: 1,
        };
      },
    };
    const ambiguous = await runLearningConversation({
      userId: owner.userId,
      query: '这个为什么不对？',
      currentCourseLabel: 'JavaScript',
      options: { provider },
    });
    const unsupported = await runLearningConversation({
      userId: owner.userId,
      query: '帮我自动安排明天的学习任务',
      currentCourseLabel: 'JavaScript',
      options: { provider },
    });

    assert.equal(ambiguous.status, 'clarification_required');
    assert.equal(ambiguous.explanation, null);
    assert.equal(unsupported.status, 'clarification_required');
    assert.equal(unsupported.contextSelection.status, 'rejected');
    assert.equal(providerCalled, false);
  });

  test('rejects malformed input without querying user data', async () => {
    const owner = await prepareOwner('conversation-malformed@example.com');
    await assert.rejects(() => runLearningConversation({
      userId: owner.userId,
      query: '',
      currentCourseLabel: 'JavaScript',
    }), /INVALID_QUERY/);
    await assert.rejects(() => runLearningConversation({
      userId: owner.userId,
      query: '解释 Promise',
      currentCourseLabel: '',
    }), /INVALID_COURSE_CONTEXT/);
  });

  test('keeps owner boundaries by loading only the requested user context', async () => {
    const first = await prepareOwner('conversation-isolation-a@example.com', 'course-a');
    const second = await prepareOwner('conversation-isolation-b@example.com', 'course-b');
    const result = await runLearningConversation({
      userId: second.userId,
      query: '解释 Promise',
      currentCourseLabel: 'JavaScript',
      options: { provider: notConfiguredProvider() },
    });

    assert.equal(result.userId, second.userId);
    assert.equal(result.contextSelection.selectedItems.every((item) => (
      !item.courseId || item.courseId === second.courseId
    )), true);
    assert.equal(result.contextSelection.selectedItems.some((item) => (
      item.courseId === first.courseId
    )), false);
  });
});
