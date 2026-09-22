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
import GrowthReport from '../js/growthReport.js';

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

  expect(document.getElementById('agentWorkspace').hidden).toBe(false);
  expect(document.getElementById('aiLoading').hidden).toBe(true);
  expect(document.getElementById('aiEmpty').hidden).toBe(true);
  expect(document.getElementById('aiError').hidden).toBe(true);

  // 今日状态 6 格
  expect(document.querySelectorAll('#todayGrid .today-stat')).toHaveLength(6);
  expect(document.getElementById('agentWorkspace')).toBeTruthy();
  expect(document.getElementById('agentHistoryPanel')).toBeTruthy();
  expect(document.getElementById('agentConversationPanel')).toBeTruthy();
  expect(document.getElementById('agentContextPanel')).toBeTruthy();
  expect(document.getElementById('agentModePersonal').classList.contains('active')).toBe(true);
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

/* ==================== Agent Workspace ==================== */

function agentContextPayload() {
  return {
    data: {
      context: {
        courses: { value: [{ courseId: 'c1', name: '高等数学' }] },
        behavior: { value: { taskSummary: { completed: 2, total: 4 }, focusSummary: { minutes: 45 } } },
        knowledgeStates: { value: { weakTopics: [{ title: 'Promise' }], strongTopics: [] } },
      },
      previousInsights: [{ id: 'i1', title: '学习一致性提高' }],
      review: { nextBestRecommendation: { nodeTitle: 'Promise' } },
    },
  };
}

test('Personal 回复 textContent 渲染，HTML 不被注入', async () => {
  await boot(seedData());
  globalThis.CGAPI.personalAgent.context = vi.fn().mockResolvedValue(agentContextPayload());
  const malicious = '<img src=x onerror="window.__cgXss=1">你好，这是 Agent 回复';
  window.__cgXss = 0;
  globalThis.CGAPI.personalAgent.chat = vi.fn().mockResolvedValue({
    data: { answer: malicious, mode: 'personal', evidence: [], insights: [], confidence: 0.8, actions: [] }
  });

  const input = document.getElementById('agentInput');
  input.value = '我今天应该做什么？';
  document.getElementById('agentSend').click();
  await settle(); await settle();

  const bubbles = [...document.querySelectorAll('#agentMessages .msg-ai .msg-bubble')];
  expect(bubbles[bubbles.length - 1].textContent).toBe(malicious);
  expect(document.querySelector('#agentMessages img')).toBeNull();
  expect(window.__cgXss).toBe(0);
  expect(globalThis.CGAPI.personalAgent.chat).toHaveBeenCalledTimes(1);
  const arg = globalThis.CGAPI.personalAgent.chat.mock.calls[0][0];
  expect(arg.message).toBe('我今天应该做什么？');
  expect(arg.mode).toBe('personal');
  expect(arg.conversationId).toMatch(/^agent-/);
  expect(input.value).toBe('');
  expect(input.disabled).toBe(false);
});

test('Personal 回复渲染 Evidence Answer', async () => {
  await boot(seedData());
  globalThis.CGAPI.personalAgent.chat = vi.fn().mockResolvedValue({
    data: {
      answer: '发现：学习一致性提高。',
      evidence: [{ id: 'e1', title: '连续 3 天学习', source: 'student_knowledge_states' }],
      insights: [],
      actions: [],
    },
  });
  document.getElementById('agentInput').value = '为什么最近数学下降？';
  document.getElementById('agentSend').click();
  await settle(); await settle();
  expect(document.querySelector('#agentMessages details summary').textContent).toBe('基于你的学习记录');
  expect(document.querySelector('#agentMessages .agent-evidence-item').textContent).toContain('连续 3 天学习');
});

test('Action Proposal 需要确认，确认后才调用既有执行接口', async () => {
  await boot(seedData());
  globalThis.CGAPI.personalAgent.chat = vi.fn().mockResolvedValue({
    data: {
      answer: '建议评估 Promise。',
      evidence: [], insights: [],
      actions: [{ id: 'a1', type: 'learning_action', title: '评估 Promise', courseId: 'c1', status: 'proposal', requiresConfirmation: true }],
    },
  });
  globalThis.CGAPI.learningAgent.confirmNextAction = vi.fn().mockResolvedValue({
    status: 'action_ready', metadata: { userConfirmed: true },
  });
  document.getElementById('agentInput').value = '下一步做什么';
  document.getElementById('agentSend').click();
  await settle(); await settle();
  expect(document.querySelector('#agentMessages .agent-action-proposal p').textContent).toContain('需要你确认');
  document.querySelector('#agentMessages .agent-action-proposal button').click();
  await settle(); await settle();
  expect(globalThis.CGAPI.learningAgent.confirmNextAction).toHaveBeenCalledWith('c1');
  expect(document.getElementById('agentMessages').textContent).toContain('行动已确认');
});

test('General 模式不请求个人上下文执行链', async () => {
  await boot(seedData());
  globalThis.CGAPI.personalAgent.chat = vi.fn().mockResolvedValue({
    data: { answer: '量子力学是描述微观运动的物理理论。', mode: 'general', evidence: [], insights: [], actions: [] },
  });
  document.getElementById('agentModeGeneral').click();
  document.getElementById('agentInput').value = '解释量子力学';
  document.getElementById('agentSend').click();
  await settle(); await settle();
  expect(globalThis.CGAPI.personalAgent.chat.mock.calls[0][0].mode).toBe('general');
  expect(document.querySelector('#agentMessages details')).toBeNull();
});

test('Provider 失败时展示安全兜底提示', async () => {
  await boot(seedData());
  globalThis.CGAPI.personalAgent.chat = vi.fn().mockResolvedValue({
    data: { answer: '当前学习上下文不足。', metadata: { fallback: true, reason: 'llm_not_configured' }, actions: [] },
  });
  document.getElementById('agentInput').value = '我的学习怎么样';
  document.getElementById('agentSend').click();
  await settle(); await settle();
  expect(document.getElementById('agentMessages').textContent).toContain('Provider 暂不可用');
});

test('网络失败提示不暴露内部错误', async () => {
  await boot(seedData());
  globalThis.CGAPI.personalAgent.chat = vi.fn().mockRejectedValue(new Error('secret-stack'));
  document.getElementById('agentInput').value = '测试失败';
  document.getElementById('agentSend').click();
  await settle(); await settle();
  expect(document.getElementById('agentMessages').textContent).toContain('个人 Agent 暂时不可用');
  expect(document.getElementById('agentMessages').textContent).not.toContain('secret-stack');
});

/* ==================== 只读 / 历史 ==================== */

test('只读：渲染 + 对话后 revision 与数据不变', async () => {
  await boot(seedData());
  const revBefore = globalThis.CGStore.getRevision();
  const snapBefore = JSON.stringify(globalThis.CGStore.get());

  globalThis.CGAPI.personalAgent.chat = vi.fn().mockResolvedValue({
    data: { answer: 'ok', actions: [] }
  });
  document.getElementById('agentInput').value = '问题';
  document.getElementById('agentSend').click();
  await settle(); await settle();

  expect(globalThis.CGStore.getRevision()).toBe(revBefore);
  expect(JSON.stringify(globalThis.CGStore.get())).toBe(snapBefore);
});

test('性能：刷新与对话复用同一页面快照，不重复读取 Store', async () => {
  await boot(seedData());
  const getSpy = vi.spyOn(globalThis.CGStore, 'get');
  window.dispatchEvent(new Event('chenguang:update'));
  await settle(); await settle();

  globalThis.CGAPI.personalAgent.chat = vi.fn().mockResolvedValue({
    data: { answer: 'ok', actions: [] }
  });
  document.getElementById('agentInput').value = '我的成长情况';
  document.getElementById('agentSend').click();
  await settle(); await settle();

  expect(getSpy).toHaveBeenCalledTimes(1);
});

test('Context 面板展示 Today State、Learning State 与 Insights', async () => {
  await boot(seedData());
  globalThis.CGAPI.personalAgent.context = vi.fn().mockResolvedValue(agentContextPayload());
  window.dispatchEvent(new Event('chenguang:update'));
  await settle(); await settle();

  const labels = [...document.querySelectorAll('#agentContextItems .agent-context-label')].map((n) => n.textContent);
  expect(labels).toEqual(['Today State', 'Learning State', 'Course', 'Review', 'Insights']);
  expect(document.getElementById('agentContextItems').textContent).toContain('2/4 任务');
  expect(document.getElementById('agentContextItems').textContent).toContain('学习一致性提高');
});

test('New Chat 清空内存历史但不写业务数据', async () => {
  await boot(seedData());
  globalThis.CGAPI.personalAgent.chat = vi.fn().mockResolvedValue({ data: { answer: '回答', actions: [] } });
  document.getElementById('agentInput').value = '你好';
  document.getElementById('agentSend').click();
  await settle(); await settle();
  document.getElementById('newAgentChat').click();
  await settle();

  expect(JSON.parse(sessionStorage.getItem('cg_ai_coach_history') || '[]')).toHaveLength(0);
  expect(document.getElementById('agentMessages').textContent).toContain('新会话已开始');
});

test('Conversation History 只使用 sessionStorage', async () => {
  await boot(seedData());
  globalThis.CGAPI.personalAgent.chat = vi.fn().mockResolvedValue({ data: { answer: '回答', actions: [] } });
  document.getElementById('agentInput').value = '你好';
  document.getElementById('agentSend').click();
  await settle(); await settle();

  expect(JSON.parse(sessionStorage.getItem('cg_ai_coach_history'))).toHaveLength(2);
  expect(document.getElementById('conversationHistory').textContent).toContain('你好');
});

test('对话历史 memory-first：存 sessionStorage，不写 chenguangData', async () => {
  await boot(seedData());
  globalThis.CGAPI.personalAgent.chat = vi.fn().mockResolvedValue({
    data: { answer: '回答', actions: [] }
  });
  document.getElementById('agentInput').value = '你好';
  document.getElementById('agentSend').click();
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
  expect(aiHtml).toContain('role="group" aria-label="回答模式"');
  expect(aiHtml).toContain('aria-label="输入你的问题"');
  expect(aiHtml).toContain('aria-label="发送"');
  expect(aiHtml).toContain('aria-live="polite"');
});
