'use strict';

process.env.AI_API_KEY = 'test-key-123';
process.env.AI_TIMEOUT_MS = '500';
require('./setup');

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const aiService = require('../src/services/aiService');
const promptBuilder = require('../src/services/promptBuilder');
const app = require('../src/app');
const authService = require('../src/services/authService');
const http = require('node:http');

const GROWTH_CONTEXT = {
  version: '1.0',
  today: '2026-09-17',
  taskSummary: { total: 4, completed: 3, pending: 1, completionRate: 75, yesterdayPending: 0 },
  focusSummary: { minutes: 120, studyMinutes: 45, exerciseMinutes: 30, activeToday: true },
  streaks: { current: 3, longest: 9, todayDone: true },
  goals: { activeCount: 1, atRisk: [] },
  signals: {
    positive: [{ type: 'focus_time', message: '今日专注 120 分钟' }],
    risks: [{ type: 'yesterday_pending', severity: 'low', message: '昨日有任务未完成' }],
  },
  suggestions: ['下午完成核心任务'],
};

function mockReflection(reply) {
  globalThis.fetch = async (url, opts) => {
    globalThis.lastReflectionRequest = { url, opts };
    return {
      ok: true,
      json: async () => ({ choices: [{ message: { content: reply } }] }),
    };
  };
}

function postJson(port, path, headers, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
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
      response.on('end', () => {
        try {
          resolve({ status: response.statusCode, body: JSON.parse(raw) });
        } catch (err) {
          reject(err);
        }
      });
    });
    request.on('error', reject);
    request.end(payload);
  });
}

describe('buildReflectionPrompt', () => {
  test('includes reflection identity, context, task, schema and safety rules', () => {
    const messages = promptBuilder.buildReflectionPrompt(GROWTH_CONTEXT);
    const all = JSON.stringify(messages);
    assert.equal(messages[0].role, 'system');
    assert.equal(messages[1].role, 'user');
    assert.equal(messages[2].role, 'user');
    assert.ok(messages[0].content.includes('个人成长教练'));
    assert.ok(messages[0].content.includes('不能编造用户数据'));
    assert.ok(messages[1].content.startsWith('<context'));
    assert.ok(messages[1].content.includes('2026-09-17'));
    assert.ok(messages[2].content.startsWith('<reflection-task'));
    assert.ok(all.includes('summary'));
    assert.ok(all.includes('insights'));
    assert.ok(all.includes('suggestions'));
  });
});

describe('dailyReflection', () => {
  test('parses valid reflection and derives performance from GrowthContext', async () => {
    const reflection = {
      summary: { title: '稳步推进', overview: '今天完成 3/4 项任务。' },
      insights: [{ type: 'trend', content: '专注时间保持稳定。' }],
      suggestions: [{ priority: 'high', content: '明天先完成核心任务。' }],
      performance: { tasks: { total: 999, completed: 999 } },
    };
    mockReflection(JSON.stringify(reflection));
    const result = await aiService.dailyReflection({ growthContext: GROWTH_CONTEXT });
    assert.equal(result.contextVersion, '1.0');
    assert.equal(result.reflection.summary.title, '稳步推进');
    assert.deepEqual(result.reflection.performance, {
      tasks: { total: 4, completed: 3, pending: 1, completionRate: 75, yesterdayPending: 0 },
      focus: { minutes: 120, activeToday: true },
      learning: { studyMinutes: 45, exerciseMinutes: 30 },
    });
    const sent = JSON.parse(globalThis.lastReflectionRequest.opts.body).messages;
    assert.equal(sent.filter((item) => item.role === 'system').length, 1);
  });

  test('empty context remains valid', async () => {
    mockReflection(JSON.stringify({
      summary: { title: '数据不足', overview: '目前还没有足够的今日数据。' },
      insights: [],
      suggestions: [],
    }));
    const result = await aiService.dailyReflection({ growthContext: { today: {}, goals: {} } });
    assert.equal(result.reflection.performance.tasks.total, 0);
  });

  test('invalid JSON returns a safe error', async () => {
    mockReflection('hello');
    await assert.rejects(
      () => aiService.dailyReflection({ growthContext: GROWTH_CONTEXT }),
      (err) => err.code === 'AI_INVALID_RESPONSE'
    );
  });
});

describe('POST /api/ai/reflection', () => {
  test('returns data.reflection for an authenticated request', async () => {
    const server = app.listen(0);
    const port = server.address().port;
    try {
      const { token } = await authService.register({
        email: 'reflection@example.com',
        password: 'Abc123456',
      });
      const valid = {
        summary: { title: '稳步推进', overview: '今天节奏稳定。' },
        insights: [{ type: 'trend', content: '任务完成率良好。' }],
        suggestions: [{ priority: 'high', content: '保留专注时间。' }],
      };
      mockReflection(JSON.stringify(valid));
      const response = await postJson(port, '/api/ai/reflection', {
        authorization: `Bearer ${token}`,
        'x-requested-with': 'XMLHttpRequest',
      }, { context: GROWTH_CONTEXT });
      assert.equal(response.status, 200);
      const body = response.body;
      assert.equal(body.data.reflection.summary.title, '稳步推进');
      assert.equal(body.meta.contextVersion, '1.0');
      assert.equal(typeof body.meta.model, 'string');
    } finally {
      server.close();
    }
  });

  test('reflection endpoint requires authentication', async () => {
    const server = app.listen(0);
    const port = server.address().port;
    try {
      const response = await postJson(port, '/api/ai/reflection', {
        'x-requested-with': 'XMLHttpRequest',
      }, { context: {} });
      assert.equal(response.status, 401);
    } finally {
      server.close();
    }
  });
});
