/**
 * Phase 13 · AI 教练页 —— 页面级 DOM 测试（jsdom）
 * --------------------------------------------------------------
 * 覆盖：
 *  1. 有数据：仪表盘渲染（今日状态 6 格、快捷问题 5 个、发现/风险列表）
 *  2. 空数据：显示空态面板
 *  3. 对话：发送 → AI 回复 textContent 渲染（XSS 不注入）
 *     / suggestions 渲染 / actions 只允许 navigate 且白名单外丢弃
 *  4. AI 失败：友好系统提示（不透出原始错误）
 *  5. 只读：渲染 + 对话后 revision 不变
 *  6. 历史：memory-first 存 sessionStorage（不进 CGStore）
 *  7. 响应式 CSS / 无障碍静态断言
 *
 * 说明：jsdom 烟雾验证（真实浏览器自动化不可用）。
 */
import { test, expect, beforeEach, vi } from 'vitest';
import aiHtml from '../ai.html?raw';
import { dateStr, dateOffset } from '../js/utils/date.js';

const TODAY = dateStr(0);
const day = (n) => dateOffset(TODAY, n);

/* ---- 把 ai.html 挂进 jsdom document ---- */
function mount(html) {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  document.replaceChild(document.adoptNode(parsed.documentElement), document.documentElement);
}

/* 拦截 head.appendChild，让懒加载脚本同步触发 onload */
function stubHeadAppend() {
  const head = document.head;
  const orig = head.appendChild.bind(head);
  head.appendChild = function (node) {
    const r = orig(node);
    if (node && node.tagName === 'SCRIPT' && node.onload) { try { node.onload(); } catch (e) {} }
    return r;
  };
}

function seedData() {
  return {
    _meta: { revision: 5, updatedAt: null, deviceId: 'test-device', tombstones: {} },
    user: { name: '测试' },
    checkins: [
      { id: 'ck1', date: day(-1), status: 'done' },
      { id: 'ck2', date: TODAY, status: 'done' },
    ],
    focus: [
      { id: 'f1', date: day(-1), minutes: 45 },
      { id: 'f2', date: TODAY, minutes: 45 },
    ],
    sports: [{ id: 's1', date: TODAY, minutes: 30, calories: 200 }],
    readings: [], english: [{ id: 'e1', date: TODAY, minutes: 25, words: 20 }],
    todos: [
      { id: 't1', text: '完成高数作业', done: true },
      { id: 't2', text: '复习英语', done: false },
    ],
    courses: [{ id: 'c1', name: '高等数学', progress: 10, status: 'doing', credits: 4 }],
    goals: [
      {
        id: 'g1', title: '即将到期的目标', type: 'exercise', metric: 'minutes', targetValue: 600,
        period: 'custom', startDate: day(-10), endDate: TODAY, status: 'active',
        createdAt: 'x', updatedAt: 'x'
      },
    ],
  };
}

function seedEmpty() {
  return {
    _meta: { revision: 0, updatedAt: null, deviceId: 'test-device', tombstones: {} },
    user: { name: '' },
    checkins: [], focus: [], sports: [], readings: [], english: [],
    todos: [], courses: [], goals: [],
  };
}

const settle = () => new Promise((r) => setTimeout(r, 30));

async function boot(data, token = 'test-token') {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('cg_token', token);
  localStorage.setItem('chenguangData', JSON.stringify(data));
  mount(aiHtml);
  stubHeadAppend();
  vi.resetModules();
  const page = await import('../pages/ai.js');
  await settle();
  return page;
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

/* ==================== 默认加载 ==================== */

test('有数据：仪表盘渲染，今日状态 6 格、快捷问题 5 个、目标风险出现', async () => {
  await boot(seedData());

  expect(document.getElementById('coachDashboard').hidden).toBe(false);
  expect(document.getElementById('aiLoading').hidden).toBe(true);
  expect(document.getElementById('aiEmpty').hidden).toBe(true);
  expect(document.getElementById('aiError').hidden).toBe(true);

  // 今日状态 6 格
  expect(document.querySelectorAll('#todayGrid .today-stat')).toHaveLength(6);
  // 快捷问题（mandate 规定的 5 个）
  const qs = [...document.querySelectorAll('.quick-q')].map((b) => b.getAttribute('data-q'));
  expect(qs).toEqual([
    '我今天应该做什么？', '我的效率为什么下降？', '哪个目标最危险？',
    '我的学习状态怎么样？', '帮我安排今天'
  ]);
  // 目标风险：即将到期 + 进度低 → 有 high 项
  const riskTexts = [...document.querySelectorAll('#riskList .ii-text')].map((n) => n.textContent);
  expect(riskTexts.length).toBeGreaterThan(0);
  expect(riskTexts.join(' ')).toContain('即将到期的目标');
  // 风险标题以纯文字渲染（XSS 防御基线）
  expect(document.querySelector('#riskList img')).toBeNull();
});

test('空数据：显示空态面板，隐藏仪表盘', async () => {
  await boot(seedEmpty());
  expect(document.getElementById('aiEmpty').hidden).toBe(false);
  expect(document.getElementById('coachDashboard').hidden).toBe(true);
});

test('未登录：不渲染仪表盘', async () => {
  await boot(seedData(), '');
  expect(document.getElementById('coachDashboard').hidden).toBe(true);
});

/* ==================== AI 对话 ==================== */

test('发送问题 → AI 回复 textContent 渲染，HTML 不被注入', async () => {
  await boot(seedData());
  const malicious = '<img src=x onerror="window.__cgXss=1">你好，这是 AI 回复';
  window.__cgXss = 0;
  globalThis.CGAPI.ai.chat = vi.fn().mockResolvedValue({
    data: { reply: malicious, mode: 'coach', suggestions: [{ type: 'goal_risk', severity: 'high', text: '建议专注目标进度' }], actions: [] }
  });

  const input = document.getElementById('chatInput');
  input.value = '我今天应该做什么？';
  document.getElementById('chatSend').click();
  await settle(); await settle();

  // AI 回复以纯文本渲染：读到原始字符串，无 <img> 节点
  const bubbles = [...document.querySelectorAll('#chatMessages .msg-ai .msg-bubble')];
  expect(bubbles.length).toBeGreaterThan(0);
  expect(bubbles[bubbles.length - 1].textContent).toBe(malicious);
  expect(document.querySelector('#chatMessages img')).toBeNull();
  expect(window.__cgXss).toBe(0);
  // chat 被调用时带 context 与 contextVersion
  expect(globalThis.CGAPI.ai.chat).toHaveBeenCalledTimes(1);
  const arg = globalThis.CGAPI.ai.chat.mock.calls[0][0];
  expect(arg.message).toBe('我今天应该做什么？');
  expect(arg.contextVersion).toBe('1.0');
  expect(arg.context.version).toBe('1.0');
  // 输入框清空、恢复可用
  expect(input.value).toBe('');
  expect(input.disabled).toBe(false);
});

test('回复 suggestions 渲染为建议条；actions 只允许 navigate 且白名单外丢弃', async () => {
  await boot(seedData());
  globalThis.CGAPI.ai.chat = vi.fn().mockResolvedValue({
    data: {
      reply: '建议如下',
      suggestions: [{ type: 'goal_risk', severity: 'high', text: '优先补目标' }],
      actions: [
        { type: 'navigate', target: 'goals' },
        { type: 'navigate', target: 'javascript:alert(1)' },  // 非法目标 → 丢弃
        { type: 'delete', target: 'goals' }                    // 非 navigate → 丢弃
      ]
    }
  });

  document.getElementById('chatInput').value = '哪个目标最危险？';
  document.getElementById('chatSend').click();
  await settle(); await settle();

  // 建议条
  const chips = [...document.querySelectorAll('#chatMessages .sugg-chip')];
  expect(chips.length).toBe(1);
  expect(chips[0].textContent).toContain('优先补目标');
  // actions：只剩 1 个合法导航按钮
  const btns = [...document.querySelectorAll('#chatMessages .action-btn')];
  expect(btns).toHaveLength(1);
  expect(btns[0].textContent).toBe('查看目标');
});

test('AI 失败 → 友好系统提示，不透出原始错误堆栈', async () => {
  await boot(seedData());
  const err = new Error('AI 服务未配置，请在后端环境变量设置 AI_API_KEY');
  globalThis.CGAPI.ai.chat = vi.fn().mockRejectedValue(err);

  document.getElementById('chatInput').value = '测试失败提示';
  document.getElementById('chatSend').click();
  await settle(); await settle();

  const sys = [...document.querySelectorAll('#chatMessages .msg-system .msg-bubble')];
  expect(sys.length).toBeGreaterThan(0);
  expect(sys[sys.length - 1].textContent).toContain('AI 教练暂时不可用');
});

test('快捷问题点击 → 直接以固定问题发起对话', async () => {
  await boot(seedData());
  globalThis.CGAPI.ai.chat = vi.fn().mockResolvedValue({
    data: { reply: '好的', suggestions: [], actions: [] }
  });
  const qBtn = document.querySelector('.quick-q[data-q="帮我安排今天"]');
  qBtn.click();
  await settle(); await settle();
  expect(globalThis.CGAPI.ai.chat).toHaveBeenCalledTimes(1);
  expect(globalThis.CGAPI.ai.chat.mock.calls[0][0].message).toBe('帮我安排今天');
});

/* ==================== 只读 / 历史 ==================== */

test('只读：渲染 + 对话后 revision 与数据不变', async () => {
  await boot(seedData());
  const revBefore = globalThis.CGStore.getRevision();
  const snapBefore = JSON.stringify(globalThis.CGStore.get());

  globalThis.CGAPI.ai.chat = vi.fn().mockResolvedValue({
    data: { reply: 'ok', suggestions: [], actions: [] }
  });
  document.getElementById('chatInput').value = '问题';
  document.getElementById('chatSend').click();
  await settle(); await settle();

  expect(globalThis.CGStore.getRevision()).toBe(revBefore);
  expect(JSON.stringify(globalThis.CGStore.get())).toBe(snapBefore);
});

test('对话历史 memory-first：存 sessionStorage，不写 chenguangData', async () => {
  await boot(seedData());
  globalThis.CGAPI.ai.chat = vi.fn().mockResolvedValue({
    data: { reply: '回答', suggestions: [], actions: [] }
  });
  document.getElementById('chatInput').value = '你好';
  document.getElementById('chatSend').click();
  await settle(); await settle();

  const hist = JSON.parse(sessionStorage.getItem('cg_ai_coach_history') || '[]');
  expect(hist).toHaveLength(2);
  expect(hist[0]).toEqual({ role: 'user', content: '你好' });
  expect(hist[1]).toEqual({ role: 'assistant', content: '回答' });
  // 业务快照不含对话
  expect(JSON.stringify(globalThis.CGStore.get())).not.toContain('cg_ai_coach_history');
});

/* ==================== 静态结构：响应式 / 无障碍 ==================== */

test('响应式：断点与自适应结构存在（390/768/1440 视口对应规则）', () => {
  expect(aiHtml).toMatch(/@media\s*\(max-width:\s*1024px\)/);   // 平板：单列
  expect(aiHtml).toMatch(/@media\s*\(max-width:\s*860px\)/);    // 移动端：抽屉侧栏 + tabbar
  expect(aiHtml).toMatch(/@media\s*\(max-width:\s*480px\)/);    // 小屏：2 列今日状态
  expect(aiHtml).toMatch(/repeat\(auto-fill,\s*minmax\(120px,\s*1fr\)\)/); // 今日状态自适应
});

test('无障碍：快捷问题分组有 role/aria-label，输入区与发送按钮有 aria-label', () => {
  expect(aiHtml).toContain('role="group" aria-label="快捷问题"');
  expect(aiHtml).toContain('aria-label="输入你的问题"');
  expect(aiHtml).toContain('aria-label="发送"');
  expect(aiHtml).toContain('aria-live="polite"');
});
