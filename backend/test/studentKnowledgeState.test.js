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

function request(port, path, headers) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port,
      path,
      method: 'GET',
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
  const userId = await authService.login({ email, password: 'Password123' }).then((result) => result.user.id);
  await syncService.saveData(userId, { courses: [{ id: courseId, name: 'JavaScript' }] });
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

describe('student knowledge state foundation', () => {
  test('creates user-owned schema, indexes and evidence-backed state', async () => {
    const { userId, courseId } = await prepareUser('knowledge-owner@example.com');
    const node = await prepareNode(userId, courseId);
    const first = await stateService.recordEvidence({
      userId,
      courseId,
      knowledgeNodeId: node.id,
      sourceType: 'assessment',
      sourceId: 'assessment-1',
      evidenceData: { score: 0.9 },
    });
    assert.equal(first.state, 'learning');
    assert.equal(first.masteryLevel > 0.6 && first.masteryLevel < 0.7, true);
    assert.equal(first.confidence > 0.5 && first.confidence <= 0.6, true);

    const second = await stateService.recordEvidence({
      userId,
      courseId,
      knowledgeNodeId: node.id,
      sourceType: 'review',
      sourceId: 'review-1',
      evidenceData: { confirmed: true },
    });
    assert.equal(second.state, 'mastered');
    assert.equal(second.masteryLevel >= 0.75, true);
    assert.equal(second.evidenceCount, 2);

    const list = await stateService.listCourseStates({ userId, courseId, query: { limit: 20, offset: 0 } });
    assert.equal(list.states.length, 1);
    assert.equal(list.states[0].knowledgeNodeId, node.id);
  });

  test('validates mastery and confidence inputs without AI inference', async () => {
    const { userId, courseId } = await prepareUser('knowledge-validation@example.com');
    const node = await prepareNode(userId, courseId);
    await assert.rejects(
      () => stateService.recordEvidence({
        userId,
        courseId,
        knowledgeNodeId: node.id,
        sourceType: 'assessment',
        sourceId: 'invalid-score',
        evidenceData: { score: 1.5 },
      }),
      /score.*0到1|score必须是0到1之间的数值/,
    );
    await assert.rejects(
      () => stateService.recordEvidence({
        userId,
        courseId,
        knowledgeNodeId: node.id,
        sourceType: 'ai_inference',
        sourceId: 'invalid-source',
        evidenceData: {},
      }),
      /证据来源不支持/,
    );
  });

  test('keeps owner, course and node boundaries', async () => {
    const owner = await prepareUser('knowledge-isolation-owner@example.com');
    const node = await prepareNode(owner.userId, owner.courseId);
    await stateService.recordEvidence({
      userId: owner.userId,
      courseId: owner.courseId,
      knowledgeNodeId: node.id,
      sourceType: 'assessment',
      sourceId: 'owner-assessment',
      evidenceData: { score: 0.8 },
    });
    const other = await prepareUser('knowledge-isolation-other@example.com');

    await assert.rejects(
      () => stateService.recordEvidence({
        userId: other.userId,
        courseId: owner.courseId,
        knowledgeNodeId: node.id,
        sourceType: 'assessment',
        sourceId: 'foreign-assessment',
        evidenceData: { score: 0.9 },
      }),
      /知识节点不存在或不属于当前课程/,
    );
    const foreignList = await stateService.listCourseStates({
      userId: other.userId,
      courseId: owner.courseId,
      query: {},
    });
    assert.equal(foreignList.states.length, 0);
  });

  test('returns bounded, authenticated course states', async () => {
    const owner = await prepareUser('knowledge-api@example.com');
    const node = await prepareNode(owner.userId, owner.courseId);
    await stateService.recordEvidence({
      userId: owner.userId,
      courseId: owner.courseId,
      knowledgeNodeId: node.id,
      sourceType: 'learning_activity',
      sourceId: 'learning-1',
      evidenceData: { completed: true },
    });
    const token = await authService.login({ email: 'knowledge-api@example.com', password: 'Password123' }).then((r) => r.token);
    const headers = { authorization: `Bearer ${token}` };
    const { server, port } = await listen(app);
    try {
      const unauthenticated = await request(port, `/api/knowledge-state/course/${owner.courseId}`, {});
      assert.equal(unauthenticated.status, 401);

      const response = await request(port, `/api/knowledge-state/course/${owner.courseId}?limit=1&offset=0`, headers);
      assert.equal(response.status, 200);
      assert.equal(response.body.data.states.length, 1);
      assert.equal(response.body.data.states[0].knowledgeNodeId, node.id);

      const invalid = await request(port, `/api/knowledge-state/course/${owner.courseId}?limit=51`, headers);
      assert.equal(invalid.status, 400);
    } finally {
      server.close();
    }
  });
});
