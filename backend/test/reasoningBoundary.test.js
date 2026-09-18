require('./setup');

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const app = require('../src/app');
const authService = require('../src/services/authService');
const syncService = require('../src/services/syncService');
const agentHomeService = require('../src/services/agentHomeService');
const agentInsightService = require('../src/services/agentInsightService');
const reasoningEngine = require('../src/services/agentReasoning/reasoningEngine');

function request(port, path, headers = {}, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, method, headers }, (response) => {
      let raw = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { raw += chunk; });
      response.on('end', () => {
        let body = null;
        try { body = raw ? JSON.parse(raw) : null; } catch (_) { body = null; }
        resolve({ status: response.statusCode, body });
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

async function prepareUser(email) {
  await authService.register({ email, password: 'Password123' });
  const login = await authService.login({ email, password: 'Password123' });
  await syncService.saveData(login.user.id, {
    todos: [{ id: 'todo-1', title: 'Read', date: '2026-09-18', done: true }],
    focus: [{ id: 'focus-1', date: '2026-09-18', minutes: 40 }],
  });
  return login;
}

describe('agent reasoning boundary', () => {
  test('keeps reasoning read-only and rejects ownership mismatch', () => {
    const context = {
      version: 'learning-context-v1',
      userId: 1,
      readOnly: true,
      permissions: { write: [] },
    };
    const insights = {
      version: 'agent-insight-v1',
      userId: 2,
      scope: 'agent_home',
      insights: [],
      metadata: { readOnly: true, actionLevel: 'insight_only', contextVersion: 'learning-context-v1' },
    };

    assert.throws(() => reasoningEngine.buildReasoning({ context, insights }), /REASONING_OWNERSHIP_MISMATCH/);
    assert.throws(() => reasoningEngine.buildReasoning({
      context: { ...context, permissions: { write: ['todos'] } },
      insights: { ...insights, userId: 1 },
    }), /INVALID_CONTEXT_PERMISSIONS/);
  });

  test('exposes authenticated user-isolated reasoning API without write permissions', async () => {
    const owner = await prepareUser('reasoning-owner@example.com');
    const other = await prepareUser('reasoning-other@example.com');
    const context = await agentHomeService.buildAgentHomeContext({ userId: owner.user.id });
    const insights = agentInsightService.buildInsights(context);
    const reasoning = reasoningEngine.buildReasoning({ context, insights });

    assert.equal(reasoning.userId, owner.user.id);
    assert.equal(reasoning.metadata.actionLevel, 'insight_only');
    assert.deepEqual(reasoning.permissions.write, []);

    const { server, port } = await listen(app);
    try {
      const unauthenticated = await request(port, '/api/agent-home/reasoning');
      assert.equal(unauthenticated.status, 401);

      const ownerResponse = await request(port, '/api/agent-home/reasoning', {
        authorization: `Bearer ${owner.token}`,
      });
      assert.equal(ownerResponse.status, 200);
      assert.equal(ownerResponse.body.data.userId, owner.user.id);
      assert.equal(ownerResponse.body.data.metadata.actionLevel, 'insight_only');
      assert.deepEqual(ownerResponse.body.data.permissions.write, []);

      const otherResponse = await request(port, '/api/agent-home/reasoning', {
        authorization: `Bearer ${other.token}`,
      });
      assert.equal(otherResponse.status, 200);
      assert.equal(otherResponse.body.data.userId, other.user.id);
      assert.notEqual(otherResponse.body.data.userId, ownerResponse.body.data.userId);

      const writeAttempt = await request(port, '/api/agent-home/reasoning', {
        authorization: `Bearer ${owner.token}`,
      }, 'POST');
      assert.ok([403, 404].includes(writeAttempt.status));
    } finally {
      server.close();
    }
  });
});
