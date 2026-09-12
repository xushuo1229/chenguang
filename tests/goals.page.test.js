/**
 * Phase 12 · Goals System —— 页面级 DOM 测试（jsdom）
 * --------------------------------------------------------------
 * 覆盖：
 *  1. 默认加载：4 个区块渲染、进度条 aria、各状态卡片齐全
 *  2. 空数据 → 空态面板
 *  3. 新建/编辑模态框：type→metric 动态下拉
 *  4. 表单校验失败不新建、给提示、不崩
 *  5. 创建目标 → revision+1；渲染/切换 → revision 不变（只读）
 *  6. 响应式（CSS 结构断言）
 *
 * 说明：真实浏览器自动化不可用，仅 jsdom 烟雾验证。
 */
import { test, expect, beforeEach, vi } from 'vitest';
import goalsHtml from '../goals.html?raw';
import { dateStr, dateOffset } from '../js/utils/date.js';

/* ---- 把 goals.html 挂进 jsdom document ---- */
function mount(html) {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  document.replaceChild(document.adoptNode(parsed.documentElement), document.documentElement);
}

/* 拦截 head.appendChild，让懒加载脚本同步触发 onload（goals 页虽无 Chart，保持通用） */
function stubHeadAppend() {
  const head = document.head;
  const orig = head.appendChild.bind(head);
  head.appendChild = function (node) {
    const r = orig(node);
    if (node && node.tagName === 'SCRIPT' && node.onload) { try { node.onload(); } catch (e) {} }
    return r;
  };
}

function weekBounds() {
  const today = dateStr(0);
  const monday = dateOffset(today, -((new Date(today + 'T00:00:00').getDay() + 6) % 7));
  return [monday, dateOffset(monday, 6)];
}

function seedData() {
  const [mon, sun] = weekBounds();
  const today = dateStr(0);
  const d1 = dateOffset(mon, 0), d2 = dateOffset(mon, 1), d3 = dateOffset(mon, 2);
  const pastEnd = dateOffset(today, -3), pastStart = dateOffset(today, -10);
  return {
    _meta: { revision: 3, updatedAt: null, deviceId: 'test-device', tombstones: {} },
    user: { name: '测试' },
    checkins: [
      { id: 'ck1', date: d1, status: 'done' },
      { id: 'ck2', date: d2, status: 'done' },
    ],
    focus: [
      { id: 'f1', date: d1, minutes: 40 },
      { id: 'f2', date: d2, minutes: 40 },
      { id: 'f3', date: d3, minutes: 40 },
    ],
    sports: [], readings: [], english: [], todos: [], courses: [],
    goals: [
      { id: 'a1', title: '本周专注 10 小时', type: 'focus', metric: 'minutes', targetValue: 600, period: 'weekly', startDate: mon, endDate: sun, status: 'active', createdAt: 'x', updatedAt: 'x' },
      { id: 'a2', title: '本周专注完成', type: 'focus', metric: 'minutes', targetValue: 100, period: 'weekly', startDate: mon, endDate: sun, status: 'active', createdAt: 'x', updatedAt: 'x' },
      { id: 'a3', title: '旧目标过期', type: 'reading', metric: 'pages', targetValue: 1000, period: 'custom', startDate: pastStart, endDate: pastEnd, status: 'active', createdAt: 'x', updatedAt: 'x' },
      { id: 'a4', title: '已归档目标', type: 'daily', metric: 'count', targetValue: 1, period: 'daily', startDate: today, endDate: today, status: 'archived', createdAt: 'x', updatedAt: 'x' },
    ],
  };
}

function seedEmpty() {
  return {
    _meta: { revision: 0, updatedAt: null, deviceId: 'test-device', tombstones: {} },
    user: { name: '' },
    checkins: [], sports: [], readings: [], english: [], todos: [], courses: [], goals: [],
  };
}

const settle = () => new Promise((r) => setTimeout(r, 30));

async function boot(data, token = 'test-token') {
  localStorage.clear();
  localStorage.setItem('cg_token', token);
  localStorage.setItem('chenguangData', JSON.stringify(data));
  mount(goalsHtml);
  stubHeadAppend();
  vi.resetModules();
  const page = await import('../pages/goals.js');
  await settle();
  return page;
}

function cardCount(gridId) {
  const grid = document.getElementById(gridId);
  return grid ? grid.querySelectorAll('.goal-card').length : 0;
}

beforeEach(() => {
  localStorage.clear();
});

/* ==================== 默认加载 ==================== */

test('默认加载：4 区块渲染，进行中包含 active/completed，进度条带 aria', async () => {
  await boot(seedData());
  const dash = document.getElementById('goalsDashboard');
  expect(dash.hidden).toBe(false);
  expect(document.getElementById('goalsEmpty').hidden).toBe(true);
  expect(document.getElementById('goalsError').hidden).toBe(true);

  expect(cardCount('activeGrid')).toBe(1);      // 本周专注 10 小时（120/600 → active 20%）
  expect(cardCount('completedGrid')).toBe(1);   // 完成目标（120/100 → completed）
  expect(cardCount('expiredGrid')).toBe(1);     // 旧目标过期
  expect(cardCount('archivedGrid')).toBe(1);    // 已归档

  // 进度条 aria
  const pbar = document.querySelector('#activeGrid .progressbar');
  expect(pbar).toBeTruthy();
  expect(pbar.getAttribute('role')).toBe('progressbar');
  expect(pbar.getAttribute('aria-valuenow')).toBe('20');
  expect(pbar.getAttribute('aria-valuemax')).toBe('100');
  expect(document.querySelector('#activeGrid .goal-title').textContent).toBe('本周专注 10 小时');
  // 单位显示
  expect(document.querySelector('#activeGrid .goal-current').textContent.replace(/\s/g, '')).toContain('120/600min');
});

/* ==================== 空数据 ==================== */

test('空数据：显示空态面板，隐藏驾驶舱', async () => {
  await boot(seedEmpty());
  expect(document.getElementById('goalsEmpty').hidden).toBe(false);
  expect(document.getElementById('goalsDashboard').hidden).toBe(true);
});

/* ==================== 表单 ==================== */

test('新建模态框：type→metric 动态下拉正确', async () => {
  await boot(seedData());
  document.getElementById('newGoalBtn').click();
  await settle();
  const typeOpts = [...document.getElementById('gType').options].map((o) => o.value);
  expect(typeOpts).toEqual(['focus', 'exercise', 'reading', 'english', 'todo', 'checkin', 'course']);
  // focus metrics
  expect(document.getElementById('gMetric').textContent).toContain('分钟');
  expect(document.getElementById('gMetric').textContent).toContain('次数');
  // 切到阅读 → 只有页数
  document.getElementById('gType').value = 'reading';
  document.getElementById('gType').dispatchEvent(new Event('change'));
  const mOpts = [...document.getElementById('gMetric').options].map((o) => o.value);
  expect(mOpts).toEqual(['pages']);
  // 切到运动 → 分钟/次数
  document.getElementById('gType').value = 'exercise';
  document.getElementById('gType').dispatchEvent(new Event('change'));
  expect([...document.getElementById('gMetric').options].map((o) => o.value)).toEqual(['minutes', 'count']);
});

test('表单校验失败：提示错误、不新建目标、不崩', async () => {
  await boot(seedData());
  const revBefore = globalThis.CGStore.getRevision();
  document.getElementById('newGoalBtn').click();
  await settle();
  document.getElementById('goalSubmit').click(); // targetValue 空
  await settle();
  expect(document.getElementById('goalFormError').textContent.length).toBeGreaterThan(0);
  expect(document.getElementById('goalsDashboard').hidden).toBe(false); // 不崩
  expect(globalThis.CGStore.getGoals()).toHaveLength(4); // 未新建
  expect(globalThis.CGStore.getRevision()).toBe(revBefore); // 不 bump
});

test('创建目标：填写表单提交成功 → 卡片出现、revision+1', async () => {
  await boot(seedData());
  const [mon, sun] = weekBounds();
  const revBefore = globalThis.CGStore.getRevision(); // 3
  document.getElementById('newGoalBtn').click();
  await settle();
  document.getElementById('gTitle').value = '本周阅读 20 页';
  document.getElementById('gType').value = 'reading';
  document.getElementById('gType').dispatchEvent(new Event('change'));
  document.getElementById('gTarget').value = '20';
  document.getElementById('gPeriod').value = 'weekly';
  document.getElementById('gStart').value = mon;
  document.getElementById('gEnd').value = sun;
  document.getElementById('goalSubmit').click();
  await settle();
  // 断言内存态（addGoal 同步生效；localStorage 走 100ms 防抖，jsdom 下 30ms 未 flush，故不读 localStorage）
  expect(globalThis.CGStore.getGoals()).toHaveLength(5);
  expect(globalThis.CGStore.getGoals().find((g) => g.title === '本周阅读 20 页')).toBeTruthy();
  expect(globalThis.CGStore.getRevision()).toBe(revBefore + 1); // 创建 revision+1
  expect(cardCount('activeGrid')).toBe(2);
});

/* ==================== Store 只读 ==================== */

test('渲染/刷新：revision 与数据不变（Goals 页面只读）', async () => {
  await boot(seedData());
  // 断言内存态（避免上一测试遗留的 100ms flush 定时器跨测试污染 localStorage）
  expect(globalThis.CGStore.getRevision()).toBe(3);

  // 触发一次 chenguang:update（模拟别处改数据后刷新视图）——但本身不应新增 revision
  window.dispatchEvent(new Event('chenguang:update'));
  await settle();
  // 打开又关闭模态框、渲染
  document.getElementById('newGoalBtn').click();
  document.getElementById('modalGoal').classList.add('hidden');
  await settle();
  expect(globalThis.CGStore.getRevision()).toBe(3);
});

/* ==================== 响应式 ==================== */

test('响应式：断点与自适应网格存在，无横向溢出结构', () => {
  expect(goalsHtml).toMatch(/@media\s*\(max-width:\s*680px\)/);
  expect(goalsHtml).toMatch(/@media\s*\(max-width:\s*400px\)/);
  expect(goalsHtml).toMatch(/repeat\(auto-fill,\s*minmax\(250px,\s*1fr\)\)/); // 卡片自适应
  // 进度条 aria 是渲染期由 JS 写入 DOM 的动态属性，已在「默认加载」用例对真实 DOM 断言
});

test('无障碍：新建按钮有 aria-label；表单 input 有 label', () => {
  expect(goalsHtml).toContain('aria-label="新建目标"');
  expect(goalsHtml).toContain('<label for="gTitle">');
  expect(goalsHtml).toContain('<label for="gType">');
  expect(goalsHtml).toContain('<label for="gTarget">');
});

test('XSS 防御：恶意标题在卡片与删除确认文案中均被转义，不注入脚本', async () => {
  const [mon, sun] = weekBounds();
  window.__cgXss = 0; // 若 onerror 被执行会 +1
  const malicious = '<img src=x onerror="window.__cgXss=1">注入';
  const data = seedData();
  data.goals = [{
    id: 'x1', title: malicious, type: 'focus', metric: 'minutes', targetValue: 600,
    period: 'weekly', startDate: mon, endDate: sun, status: 'archived', createdAt: 'x', updatedAt: 'x'
  }];
  await boot(data);

  // 卡片标题以纯文字渲染：读到的是原始字符串，且 DOM 中不存在 <img> 注入节点
  const titleEl = document.querySelector('#archivedGrid .goal-title');
  expect(titleEl).toBeTruthy();
  expect(titleEl.textContent).toBe(malicious);
  expect(document.querySelector('#archivedGrid .goal-title img')).toBeNull();

  // 触发删除确认：showConfirm 的 innerHTML 文案对标题必须转义
  const del = document.querySelector('#archivedGrid .ga-btn[data-act="delete"]');
  expect(del).toBeTruthy();
  del.click();
  await settle();
  const pEl = document.querySelector('.cg-confirm-overlay p');
  expect(pEl).toBeTruthy();
  expect(pEl.textContent).toContain(malicious);   // 确认文案以文字包含原始标题（已 esc）
  expect(document.querySelector('.cg-confirm-overlay img')).toBeNull(); // 无注入节点
  expect(window.__cgXss).toBe(0);                 // onerror 属性未被解析执行
});