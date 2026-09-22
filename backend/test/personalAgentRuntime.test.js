'use strict';

require('./setup');

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

process.env.AI_API_KEY = process.env.AI_API_KEY || '';

const authService = require('../src/services/authService');
const syncService = require('../src/services/syncService');
const courseSpaceService = require('../src/services/courseSpaceService');
const personalLearningAgentService = require('../src/services/personalLearningAgentService');
const runtime = require('../src/services/personalAgentRuntime');

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
  return { userId, courseId, nodeId: node.id };
}

describe('personal agent runtime', () => {
  test('builds a bounded read-only context from authoritative sources', async () => {
    const owner = await prepareOwner('personal-agent-context@example.com');
    const result = await runtime.buildDisplayContext({ userId: owner.userId });

    assert.equal(result.version, runtime.CONTEXT_VERSION);
    assert.equal(result.userId, owner.userId);
    assert.equal(result.readOnly, true);
    assert.deepEqual(result.permissions.write, []);
    assert.equal(result.context.courses.value[0].courseId, owner.courseId);
    assert.equal(result.context.behavior.value.focusSummary.minutes, 45);
    assert.equal(result.previousInsights.length <= 5, true);
    assert.equal(result.review.courseId, owner.courseId);
    assert.equal(result.plan.courseId, owner.courseId);
    assert.equal(Array.isArray(result.practice.attempts), true);
    assert.equal(result.actions[0].requiresConfirmation, true);
    assert.ok(JSON.stringify(result).length < 65536);
    assert.equal(JSON.stringify(result).includes('"todos":'), false);
  });

  test('rejects unowned context requests', async () => {
    await assert.rejects(
      () => runtime.buildDisplayContext({ userId: 0 }),
      (error) => error.code === 'UNAUTHORIZED',
    );
  });

  test('validates chat input and conversation id', async () => {
    await assert.rejects(() => runtime.chat({
      userId: 1,
      message: 'x',
      mode: 'autonomous',
      conversationId: 'conv-1',
    }), (error) => error.code === 'INVALID_MODE');
    await assert.rejects(() => runtime.chat({
      userId: 1,
      message: '',
      mode: 'personal',
      conversationId: 'conv-1',
    }), (error) => error.code === 'INVALID_MESSAGE');
    await assert.rejects(() => runtime.chat({
      userId: 1,
      message: 'x',
      mode: 'personal',
      conversationId: 'bad id',
    }), (error) => error.code === 'INVALID_CONVERSATION_ID');
  });

  test('runs personal mode through selection and returns evidence plus proposal', async () => {
    const owner = await prepareOwner('personal-agent-personal@example.com');
    const result = await runtime.chat({
      userId: owner.userId,
      message: '解释 Promise',
      mode: 'personal',
      conversationId: 'conv-1',
      provider: {
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
      },
    });

    assert.equal(result.version, runtime.CHAT_VERSION);
    assert.equal(result.mode, 'personal');
    assert.equal(result.readOnly, true);
    assert.equal(result.conversationId, 'conv-1');
    assert.equal(result.provider.interface, 'agentProvider-v1');
    assert.equal(Array.isArray(result.evidence), true);
    assert.equal(result.actions[0].requiresConfirmation, true);
    assert.equal(typeof result.answer, 'string');
    assert.equal(result.answer.length > 0, true);
    assert.equal(JSON.stringify(result).includes('"todos":'), false);
  });

  test('falls back safely when the personal provider emits invalid output', async () => {
    const owner = await prepareOwner('personal-agent-invalid@example.com');
    const result = await runtime.chat({
      userId: owner.userId,
      message: '解释 Promise',
      mode: 'personal',
      conversationId: 'conv-2',
      provider: {
        async generateExplanation() {
          return {
            status: 'ok',
            reply: 'not-json',
            provider: 'stub',
            model: 'stub-model',
            promptVersion: 'test',
            requestId: 'request-1',
            latencyMs: 1,
          };
        },
      },
    });

    assert.equal(result.metadata.fallback, true);
    assert.equal(result.metadata.fallbackReason, 'llm_malformed');
    assert.equal(result.confidence, 0);
    assert.equal(result.actions[0].requiresConfirmation, true);
  });

  test('keeps general mode free of personal context and falls back when provider is unavailable', async () => {
    const owner = await prepareOwner('personal-agent-general@example.com');
    const result = await runtime.chat({
      userId: owner.userId,
      message: '解释量子力学',
      mode: 'general',
      conversationId: 'conv-3',
      generalProvider: {
        async chatCompletion({ messages }) {
          assert.equal(messages.length, 1);
          assert.equal(messages[0].content, '解释量子力学');
          throw Object.assign(new Error('AI 服务未配置'), { code: 'AI_NOT_CONFIGURED' });
        },
      },
    });

    assert.equal(result.mode, 'general');
    assert.deepEqual(result.evidence, []);
    assert.deepEqual(result.insights, []);
    assert.deepEqual(result.actions, []);
    assert.equal(result.provider.interface, 'agentProvider-v1');
    assert.equal(result.metadata.reason, 'llm_not_configured');
    assert.equal(JSON.stringify(result).includes('"courses":'), false);
  });

  test('returns a safe general fallback when the provider request fails', async () => {
    const owner = await prepareOwner('personal-agent-general-failure@example.com');
    const result = await runtime.chat({
      userId: owner.userId,
      message: '解释量子力学',
      mode: 'general',
      conversationId: 'conv-fallback',
      generalProvider: {
        async chatCompletion() { throw new Error('upstream timeout'); },
      },
    });

    assert.equal(result.mode, 'general');
    assert.equal(result.answer, 'AI 服务暂时不可用，请稍后再试。');
    assert.equal(result.metadata.fallback, true);
    assert.equal(result.metadata.reason, 'provider_unavailable');
    assert.deepEqual(result.evidence, []);
    assert.deepEqual(result.actions, []);
  });

  test('keeps action execution behind explicit user confirmation', async () => {
    const owner = await prepareOwner('personal-agent-action@example.com');
    const context = await runtime.buildDisplayContext({ userId: owner.userId });
    const proposal = context.actions[0];
    assert.equal(proposal.status, 'proposal');
    assert.equal(proposal.requiresConfirmation, true);

    const confirmed = await personalLearningAgentService.confirmNextAction({
      userId: owner.userId,
      courseId: owner.courseId,
      body: { confirmed: true },
    });
    assert.equal(confirmed.metadata.userConfirmed, true);
    assert.equal(confirmed.status, 'action_ready');
  });

  test('keeps context ownership isolated', async () => {
    const first = await prepareOwner('personal-agent-owner-a@example.com', 'course-a');
    const second = await prepareOwner('personal-agent-owner-b@example.com', 'course-b');
    const [firstContext, secondContext] = await Promise.all([
      runtime.buildDisplayContext({ userId: first.userId }),
      runtime.buildDisplayContext({ userId: second.userId }),
    ]);

    assert.equal(firstContext.userId, first.userId);
    assert.equal(secondContext.userId, second.userId);
    assert.equal(firstContext.context.courses.value[0].courseId, 'course-a');
    assert.equal(secondContext.context.courses.value[0].courseId, 'course-b');
  });
});
