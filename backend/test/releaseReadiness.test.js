'use strict';

require('./setup');
const { test, describe, after } = require('node:test');
const assert = require('node:assert/strict');
const app = require('../src/app');
const config = require('../src/config/env');
const { handler } = require('../src/middleware/error');

const server = app.listen(0);
const port = server.address().port;

after(() => {
  server.close();
});

async function call(method, path, headers = {}, body) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, { method, headers, body });
  return { status: response.status, body: await response.json() };
}

describe('release readiness API errors', () => {
  test('protected data requires JWT and returns 401', async () => {
    const result = await call('GET', '/api/data');
    assert.equal(result.status, 401);
    assert.equal(result.body.error.code, 'UNAUTHORIZED');
  });

  test('write requests without CSRF header return 403', async () => {
    const result = await call('POST', '/api/auth/login', {
      'content-type': 'application/json',
    }, JSON.stringify({ email: 'user@example.com', password: 'Abc123456' }));
    assert.equal(result.status, 403);
    assert.equal(result.body.error.code, 'CSRF_VALIDATION_FAILED');
  });

  test('unknown API routes return 404', async () => {
    const result = await call('GET', '/api/not-found-for-release-audit');
    assert.equal(result.status, 404);
    assert.equal(result.body.error.code, 'NOT_FOUND');
  });

  test('unknown errors return production-safe 500', () => {
    const savedIsProd = config.isProd;
    config.isProd = true;
    let status;
    let body;
    const res = {
      status(code) { status = code; return this; },
      json(payload) { body = payload; },
    };
    handler(new Error('database internals'), {}, res, () => {});
    config.isProd = savedIsProd;

    assert.equal(status, 500);
    assert.equal(body.error.code, 'INTERNAL_ERROR');
    assert.equal(body.error.message, '服务器内部错误');
    assert.ok(!body.error.message.includes('database internals'));
  });
});
