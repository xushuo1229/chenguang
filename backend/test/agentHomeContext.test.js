'use strict';

require('./setup');

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const app = require('../src/app');
const authService = require('../src/services/authService');
const syncService = require('../src/services/syncService');
const courseSpaceService = require('../src/services/courseSpaceService');
const stateService = require('../src/services/studentKnowledgeStateService');
const agentHomeService = require('../src/services/agentHomeService');

function localToday() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function request(port, path, headers = {}, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port,
      path,
      method,
      headers,
    }, (response) => {
      let raw = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { raw += chunk; });
      response.on('end', () => {
        let parsed = null;
        try { parsed = raw ? JSON.parse(raw) : null; } catch (_) { parsed = null; }
        resolve({ status: response.statusCode, body: parsed });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function listen(appInstance) {
  const server = http.createServer(appInstance);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, port: server.address().port };
}

async function prepareUser(email, courseId = 'course-1') {
  await authService.register({ email, password: 'Password123' });
  const userId = await authService.login({ email, password: 'Password123' })
    .then((result) => result.user.id);
  await syncService.saveData(userId, {
    courses: [{ id: courseId, name: 'JavaScript' }],
    todos: [{ id: 'todo-1', title: 'Read chapter', date: localToday(), done: true }],
    focus: [{ id: 'focus-1', date: localToday(), minutes: 45 }],
    user: {
      memory: {
        patterns: [{
          id: 'pattern-1',
          type: 'Habit',
          content: 'Morning study is stable',
          status: 'active',
          confidence: 0.8,
          updatedAt: localToday(),
        }],
      },
    },
  });
  return { userId, courseId };
}

async function prepareNode(userId, courseId, title = 'Promise') {
  return courseSpaceService.createNode({
    userId,
    body: {
      courseId,
      title,
      kind: 'concept',
      definition: 'A Promise represents an eventual value.',
      confidence: 'medium',
    },
  });
}

describe('agent home context builder', () => {
  test('builds bounded, user-owned learning context from authoritative sources', async () => {
    const owner = await prepareUser('agent-context-owner@example.com');
    const node = await prepareNode(owner.userId, owner.courseId);
    await stateService.recordEvidence({
      userId: owner.userId,
      courseId: owner.courseId,
      knowledgeNodeId: node.id,
      sourceType: 'assessment',
      sourceId: 'assessment-1',
      evidenceData: { score: 0.25 },
    });
    const masteredNode = await prepareNode(owner.userId, owner.courseId, 'Async Await');
    await stateService.recordEvidence({
      userId: owner.userId,
      courseId: owner.courseId,
      knowledgeNodeId: masteredNode.id,
      sourceType: 'assessment',
      sourceId: 'assessment-2',
      evidenceData: { score: 0.9 },
    });
    await stateService.recordEvidence({
      userId: owner.userId,
      courseId: owner.courseId,
      knowledgeNodeId: masteredNode.id,
      sourceType: 'review',
      sourceId: 'review-1',
      evidenceData: { confirmed: true },
    });

    const context = await agentHomeService.buildAgentHomeContext({ userId: owner.userId });
    assert.equal(context.version, 'learning-context-v1');
    assert.equal(context.userId, owner.userId);
    assert.equal(context.readOnly, true);
    assert.equal(context.actionLevel, 'insight_only');
    assert.equal(context.courses.value[0].courseId, owner.courseId);
    assert.equal(context.behavior.value.taskSummary.completed, 1);
    assert.equal(context.behavior.value.focusSummary.minutes, 45);
    assert.equal(context.knowledgeStates.value.weakTopics[0].knowledgeNodeId, node.id);
    assert.equal(context.knowledgeStates.value.strongTopics[0].knowledgeNodeId, masteredNode.id);
    assert.equal(context.memories.growth.value.items[0].id, 'pattern-1');
    assert.deepEqual(context.permissions.write, []);
    assert.ok(JSON.stringify(context).length < 32768);
    assert.equal(JSON.stringify(context).includes('"todos":'), false);
  });

  test('keeps user and knowledge boundaries', async () => {
    const owner = await prepareUser('agent-context-isolation-owner@example.com');
    const node = await prepareNode(owner.userId, owner.courseId);
    await stateService.recordEvidence({
      userId: owner.userId,
      courseId: owner.courseId,
      knowledgeNodeId: node.id,
      sourceType: 'assessment',
      sourceId: 'owner-assessment',
      evidenceData: { score: 0.4 },
    });
    const other = await prepareUser('agent-context-isolation-other@example.com', 'course-other');

    const foreignContext = await agentHomeService.buildAgentHomeContext({ userId: other.userId });
    assert.equal(foreignContext.userId, other.userId);
    assert.equal(foreignContext.courses.value[0].courseId, 'course-other');
    assert.equal(foreignContext.courseKnowledge.value.nodes.length, 0);
    assert.equal(foreignContext.knowledgeStates.value.weakTopics.length, 0);

    await assert.rejects(
      () => agentHomeService.buildAgentHomeContext({ userId: 0 }),
      /UNAUTHORIZED/,
    );
  });

  test('bounds course knowledge output and exposes only a read API', async () => {
    const owner = await prepareUser('agent-context-bounded@example.com');
    for (let index = 0; index < 12; index += 1) {
      await prepareNode(owner.userId, owner.courseId, `Node ${index}`);
    }
    const context = await agentHomeService.buildAgentHomeContext({ userId: owner.userId });
    assert.equal(context.courseKnowledge.value.nodes.length, 10);

    const token = await authService.login({
      email: 'agent-context-bounded@example.com',
      password: 'Password123',
    }).then((result) => result.token);
    const headers = { authorization: `Bearer ${token}` };
    const { server, port } = await listen(app);
    try {
      const unauthenticated = await request(port, '/api/agent-home/context');
      assert.equal(unauthenticated.status, 401);

      const response = await request(port, '/api/agent-home/context', headers);
      assert.equal(response.status, 200);
      assert.equal(response.body.data.version, 'learning-context-v1');
      assert.equal(response.body.data.readOnly, true);

      const writeAttempt = await request(port, '/api/agent-home/context', headers, 'POST');
      assert.ok([403, 404].includes(writeAttempt.status));
    } finally {
      server.close();
    }
  });

  test('separates behavior summary from unavailable reflection and memory authority', async () => {
    const owner = await prepareUser('agent-context-boundary@example.com');
    const context = await agentHomeService.buildAgentHomeContext({ userId: owner.userId });

    assert.equal(context.behavior.source, 'reflection_context_source');
    assert.equal(context.behavior.authority, 'deterministic_projection');
    assert.equal(context.behavior.type, 'behavior_summary');
    assert.equal(context.behavior.confidence, 1);
    assert.equal(context.behavior.value.taskSummary.completed, 1);

    assert.equal(context.reflections.source, 'reflection_storage');
    assert.equal(context.reflections.authority, 'unavailable');
    assert.equal(context.reflections.type, 'user_reflection');
    assert.equal(context.reflections.confidence, 0);
    assert.equal(context.reflections.value.available, false);
    assert.equal(
      context.reflections.value.reason,
      'reflection_storage_adapter_not_available',
    );
    assert.equal(JSON.stringify(context.reflections).includes('taskSummary'), false);

    assert.equal(context.memories.growth.source, 'cgstore.user.memory');
    assert.equal(context.memories.growth.authority, 'derived_memory');
    assert.equal(context.memories.growth.type, 'growth_memory_projection');
    assert.equal(context.memories.growth.value.items[0].id, 'pattern-1');

    assert.equal(context.memories.coach.source, 'coach_memory');
    assert.equal(context.memories.coach.authority, 'unavailable');
    assert.equal(context.memories.coach.value.available, false);
    assert.equal(
      context.memories.coach.value.reason,
      'client_side_memory_not_available_to_backend',
    );

    assert.deepEqual(context.permissions.read, [
      'course_knowledge',
      'student_knowledge_state',
      'behavior_summary',
      'growth_memory_projection',
    ]);
    assert.deepEqual(context.permissions.write, []);
  });
});
