'use strict';

process.env.AI_API_KEY = 'test-key-123';
process.env.AI_TIMEOUT_MS = '500';
require('./setup');

const { test, describe, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const app = require('../src/app');
const authService = require('../src/services/authService');
const feedbackService = require('../src/services/aiReflectionFeedbackService');

const server = app.listen(0);
const port = server.address().port;

after(() => {
  server.close();
});

function mockReflectionProvider() {
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      choices: [{
        message: {
          content: JSON.stringify({
            summary: { title: '稳步推进', overview: '今天节奏稳定。' },
            insights: [],
            suggestions: [],
          }),
        },
      }],
    }),
  });
}

async function postJson(path, headers, body) {
  const payload = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const request = http.request({
      host: '127.0.0.1',
      port,
      path,
      method: 'POST',
      headers: Object.assign({ 'content-type': 'application/json' }, headers),
    }, (response) => {
      let raw = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { raw += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, body: JSON.parse(raw) }));
    });
    request.on('error', reject);
    request.end(payload);
  });
}

async function registerUser(email) {
  return authService.register({ email, password: 'Abc123456' });
}

function authHeaders(token) {
  return {
    authorization: `Bearer ${token}`,
    'x-requested-with': 'XMLHttpRequest',
  };
}

describe('AI reflection feedback API', () => {
  test('accepts helpful feedback for a reflection owned by the current user', async () => {
    const account = await registerUser('feedback-helpful@example.com');
    mockReflectionProvider();
    const generated = await postJson('/api/ai/reflection', authHeaders(account.token), { context: {} });
    assert.equal(generated.status, 200);
    assert.match(generated.body.data.reflectionId, /^rf_[0-9a-f-]{36}$/);

    const result = await postJson('/api/ai/reflection/feedback', authHeaders(account.token), {
      reflectionId: generated.body.data.reflectionId,
      rating: 'helpful',
    });
    assert.equal(result.status, 200);
    assert.deepEqual(result.body, { success: true });
  });

  test('accepts not_helpful feedback for a reflection owned by the current user', async () => {
    const account = await registerUser('feedback-not-helpful@example.com');
    const reflectionId = await feedbackService.recordReflectionGeneration(account.user.id);
    const result = await postJson('/api/ai/reflection/feedback', authHeaders(account.token), {
      reflectionId,
      rating: 'not_helpful',
    });
    assert.equal(result.status, 200);
    assert.deepEqual(result.body, { success: true });
  });

  test('rejects unsupported ratings and malformed reflection IDs', async () => {
    const account = await registerUser('feedback-invalid@example.com');
    const reflectionId = await feedbackService.recordReflectionGeneration(account.user.id);
    const invalidRating = await postJson('/api/ai/reflection/feedback', authHeaders(account.token), {
      reflectionId,
      rating: 'invalid',
    });
    assert.equal(invalidRating.status, 400);
    assert.equal(invalidRating.body.error.code, 'INVALID_RATING');

    const invalidId = await postJson('/api/ai/reflection/feedback', authHeaders(account.token), {
      reflectionId: 'reflection_123',
      rating: 'helpful',
    });
    assert.equal(invalidId.status, 400);
    assert.equal(invalidId.body.error.code, 'INVALID_REFLECTION_ID');
  });

  test('requires authentication', async () => {
    const result = await postJson('/api/ai/reflection/feedback', {
      'x-requested-with': 'XMLHttpRequest',
    }, { reflectionId: 'rf_00000000-0000-4000-8000-000000000000', rating: 'helpful' });
    assert.equal(result.status, 401);
  });

  test('prevents feedback on another user reflection', async () => {
    const owner = await registerUser('feedback-owner@example.com');
    const attacker = await registerUser('feedback-attacker@example.com');
    const ownedReflectionId = await feedbackService.recordReflectionGeneration(owner.user.id);
    const result = await postJson('/api/ai/reflection/feedback', authHeaders(attacker.token), {
      reflectionId: ownedReflectionId,
      rating: 'helpful',
    });
    assert.equal(result.status, 403);
    assert.equal(result.body.error.code, 'REFLECTION_FORBIDDEN');
  });
});
