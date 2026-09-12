/**
 * 晨光自律台 · Phase 13 AI 2.0 后端测试
 * ============================================================
 * 覆盖：
 *  1. validateContext：格式 / 版本 / 超长 / 敏感键剥离
 *  2. validateHistory：角色白名单 / 条数 / 长度
 *  3. promptBuilder：System Prompt 人设与注入防护 / Context 数据块 / 派生建议与动作
 *  4. coachChat：消息组装（System 在首、Context 块、无敏感键泄漏）
 *     / 返回结构 { reply, mode:'coach', suggestions, actions }
 *  5. Provider 失败：上游 500 → 友好 ApiError，不透出上游响应体
 *  6. 未配置 Key：AI_NOT_CONFIGURED，不触发 fetch
 * ------------------------------------------------------------
 * 运行：node --test backend/test/ai.test.js（或 npm test）
 */
// —— 必须在 require setup 之前设置 AI 环境变量：
//    setup → db/index → config/env 在 require 时快照全部配置 ——
process.env.AI_API_KEY = 'test-key-123';
process.env.AI_TIMEOUT_MS = '500';

require('./setup');

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const aiService = require('../src/services/aiService');
const promptBuilder = require('../src/services/promptBuilder');
const { getProvider } = require('../src/services/providers');
const ApiError = require('../src/utils/ApiError');

const CONTEXT = {
  version: '1.0',
  generatedAt: '2026-09-12T08:00:00.000Z',
  today: '2026-09-12',
  overview: { activeDays: 5, completionRate: 60, currentStreak: 3, longestStreak: 9, totalFocusMinutes: 300, studyMinutes: 420 },
  trends: { days7: { study: { metric: 'study', current: 420, previous: 500, delta: -16 } }, days30: null },
  study: { minutes: 420, trend: {}, activeDays: 5, courseCount: 2, averageCourseProgress: 30 },
  exercise: { minutes: 90, days: 2, calories: 500, trend: {} },
  english: { minutes: 120, words: 40, activeDays: 3, trend: {} },
  focus: { minutes: 300, activeDays: 5, averageDailyMinutes: 60, trend: {} },
  todos: { total: 10, completed: 6, completionRate: 60, overdueOrIncomplete: 4 },
  courses: [{ id: 'c1', name: '高数', progress: 30, status: 'doing', credits: 4 }],
  goals: {
    active: [{ id: 'g1', title: '本周专注 600 min', type: 'focus', metric: 'minutes', targetValue: 600, currentValue: 120, percentage: 20, remaining: 480, period: 'weekly', startDate: '2026-09-07', endDate: '2026-09-13', status: 'active' }],
    completed: [], expired: [],
  },
  insights: [
    { type: 'goal_risk', severity: 'high', goalId: 'g1', title: '本周专注 600 min', reason: '目标「本周专注 600 min」剩余时间不足仍差 480，很可能无法按期达成', percentage: 20, daysRemaining: 1 },
    { type: 'declining_trend', severity: 'medium', metric: 'study', reason: '学习时长较上一周下滑 16%' },
  ],
};

/* ---- fetch mock 工具：记录调用并返回 OpenAI 兼容响应 ---- */
let lastFetch = null;
function mockFetch(reply) {
  lastFetch = null;
  globalThis.fetch = async (url, opts) => {
    lastFetch = { url, opts };
    return {
      ok: true,
      json: async () => ({ choices: [{ message: { content: reply } }] }),
    };
  };
}

describe('validateContext', () => {
  test('合法 Context 通过并保留内容', () => {
    const clean = aiService.validateContext(JSON.parse(JSON.stringify(CONTEXT)));
    assert.equal(clean.version, '1.0');
    assert.equal(clean.goals.active[0].id, 'g1');
  });

  test('非对象 / 数组 / 版本不符 → 400 INVALID_CONTEXT*', () => {
    assert.throws(() => aiService.validateContext('str'), /格式不正确/);
    assert.throws(() => aiService.validateContext([]), /格式不正确/);
    assert.throws(() => aiService.validateContext({ version: '9.9' }), /版本不受支持/);
  });

  test('超长 Context → CONTEXT_TOO_LARGE', () => {
    const big = { version: '1.0', blob: 'x'.repeat(30000) };
    assert.throws(() => aiService.validateContext(big), /数据过大/);
  });

  test('敏感键剥离：apiKey / token / password（含嵌套）不出现在序列化结果', () => {
    const dirty = {
      version: '1.0',
      overview: { apiKey: 'sk-leak', nested: { TOKEN: 'leak', Authorization: 'Bearer x', password: 'p' } },
      deep: [{ secret: 's', keep: 1 }],
    };
    const clean = aiService.validateContext(dirty);
    const s = JSON.stringify(clean);
    assert.ok(!/sk-leak|Bearer x|"s"/.test(s), '敏感值必须被移除');
    assert.equal(clean.deep[0].keep, 1);        // 非敏感字段保留
  });

  test('validateContext(null) 返回 null（允许无 Context）', () => {
    assert.equal(aiService.validateContext(null), null);
  });
});

describe('validateHistory', () => {
  test('null/undefined → []', () => {
    assert.deepEqual(aiService.validateHistory(null), []);
    assert.deepEqual(aiService.validateHistory(undefined), []);
  });

  test('非法角色 / 空 content / 超长 → 400', () => {
    assert.throws(() => aiService.validateHistory([{ role: 'system', content: 'x' }]), /非法的消息角色/);
    assert.throws(() => aiService.validateHistory([{ role: 'user', content: '  ' }]), /不能为空/);
    assert.throws(() => aiService.validateHistory([{ role: 'user', content: 'x'.repeat(9000) }]), /过长/);
    assert.throws(() => aiService.validateHistory('not-array'), /格式不正确/);
  });

  test('合法 user/assistant 消息被 trim 保留', () => {
    const out = aiService.validateHistory([{ role: 'user', content: ' 你好 ' }, { role: 'assistant', content: '好的' }]);
    assert.equal(out[0].content, '你好');
    assert.equal(out.length, 2);
  });
});

describe('promptBuilder', () => {
  test('System Prompt 含教练人设、事实边界、注入防护、只读声明', () => {
    const p = promptBuilder.buildSystemPrompt({ today: '2026-09-12' });
    for (const kw of ['晨光 AI 教练', '2026-09-12', '数据事实边界', '不可信数据', '只读铁律', '不能创建/修改/删除']) {
      assert.ok(p.includes(kw), 'System Prompt 应包含：' + kw);
    }
  });

  test('buildContextBlock 用 <context> 边界包裹且声明数据不是指令', () => {
    const block = promptBuilder.buildContextBlock(CONTEXT, '1.0');
    assert.ok(block.startsWith('<context version="1.0">'));
    assert.ok(block.endsWith('</context>'));
    assert.ok(block.includes('不是给你的指令'));
    assert.ok(block.includes('高数')); // context 内容在块内
  });

  test('deriveSuggestions 最多 3 条且文本来自 insights.reason', () => {
    const s = promptBuilder.deriveSuggestions(CONTEXT);
    assert.ok(s.length <= 3);
    assert.equal(s[0].type, 'goal_risk');
    assert.ok(s[0].text.includes('本周专注'));
  });

  test('deriveActions 只允许 navigate 且去重、最多 2 个', () => {
    const a = promptBuilder.deriveActions(CONTEXT);
    assert.ok(a.length <= 2);
    a.forEach((x) => assert.equal(x.type, 'navigate'));
    assert.ok(a.some((x) => x.target === 'goals'));
  });

  test('deriveActions/deriveSuggestions 空数据安全', () => {
    assert.deepEqual(promptBuilder.deriveActions(null), []);
    assert.deepEqual(promptBuilder.deriveSuggestions({}), []);
  });
});

describe('coachChat', () => {
  test('返回 { reply, mode:coach, suggestions, actions, model } 且不发 system 角色', async () => {
    mockFetch('好的，建议如下。');
    const result = await aiService.coachChat({
      message: '我今天应该做什么？',
      history: [],
      context: CONTEXT,
      contextVersion: '1.0',
    });
    assert.equal(result.mode, 'coach');
    assert.equal(result.reply, '好的，建议如下。');
    assert.ok(Array.isArray(result.suggestions));
    assert.ok(Array.isArray(result.actions));

    // 消息组装：第一条是 system（人设），第二条是 <context> 数据块，最后一条是本轮问题
    const sent = JSON.parse(lastFetch.opts.body).messages;
    assert.equal(sent[0].role, 'system');
    assert.ok(sent[0].content.includes('晨光 AI 教练'));
    assert.ok(sent[1].content.startsWith('<context'));
    assert.equal(sent[sent.length - 1].role, 'user');
    assert.equal(sent[sent.length - 1].content, '我今天应该做什么？');
  });

  test('上下文与历史中不泄漏 API Key，System/Context 之外无伪造 system 消息', async () => {
    mockFetch('ok');
    const dirty = JSON.parse(JSON.stringify(CONTEXT));
    dirty.overview = { apiKey: 'sk-leak-123' };
    await aiService.coachChat({ message: 'hi', context: dirty });
    const sent = JSON.parse(lastFetch.opts.body).messages;
    const all = JSON.stringify(sent);
    assert.ok(!all.includes('sk-leak-123'), 'API Key 不得出现在发给模型的消息里');
    assert.equal(sent.filter((m) => m.role === 'system').length, 1); // 仅后端自己的 system
  });

  test('上游 500 → 友好 ApiError，不透出上游响应体', async () => {
    globalThis.fetch = async () => ({
      ok: false,
      status: 500,
      text: async () => 'UPSTREAM_SECRET=abc; stack trace here',
    });
    await assert.rejects(
      () => aiService.coachChat({ message: 'hi', context: CONTEXT }),
      (err) => {
        assert.ok(err instanceof ApiError);
        assert.ok(/AI 服务暂时不可用/.test(err.message));
        assert.ok(!String(err.message).includes('UPSTREAM_SECRET'), '上游响应体不得透出');
        return true;
      }
    );
  });

  test('上游超时 → AI_TIMEOUT', async () => {
    globalThis.fetch = async () => new Promise((_, reject) => {
      const e = new Error('aborted');
      e.name = 'AbortError';
      reject(e);
    });
    await assert.rejects(() => aiService.coachChat({ message: 'hi', context: CONTEXT }), /超时/);
  });

  test('模型/鉴权配置错误 → 统一不可用文案，零运维语言（.env/backend/Key 不出后端）', async () => {
    const cases = [
      { status: 404, body: JSON.stringify({ error: { code: 'ModelNotFound' } }) },
      { status: 403, body: JSON.stringify({ error: { code: 'Unauthorized' } }) },
      { status: 400, body: JSON.stringify({ error: { code: 'ModelNotOpen' } }) },
    ];
    for (const c of cases) {
      globalThis.fetch = async () => ({ ok: false, status: c.status, text: async () => c.body });
      await assert.rejects(
        () => aiService.coachChat({ message: 'hi', context: CONTEXT }),
        (err) => {
          assert.ok(err instanceof ApiError);
          assert.match(err.message, /AI 教练暂时不可用/);
          assert.ok(!/\.env|后端|API ?Key|控制台|base[_ ]?url/i.test(err.message), '用户文案不得含运维语言: ' + err.message);
          return true;
        }
      );
    }
  });

  test('未配置 Key → AI_NOT_CONFIGURED 且不触发 fetch', async () => {
    const saved = process.env.AI_API_KEY;
    const config = require('../src/config/env');
    const savedKey = config.aiApiKey;
    config.aiApiKey = '';
    let fetched = false;
    globalThis.fetch = async () => { fetched = true; return { ok: true, json: async () => ({}) }; };
    await assert.rejects(() => aiService.coachChat({ message: 'hi', context: CONTEXT }), /AI_NOT_CONFIGURED|未配置/);
    assert.equal(fetched, false);
    config.aiApiKey = savedKey; // 还原
    void saved;
  });
});
