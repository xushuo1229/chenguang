/**
 * Phase 11 · Stats Center —— 页面级 DOM 测试（jsdom）
 * --------------------------------------------------------------
 * 覆盖：
 *   1. 默认加载（本周）可初始化
 *   2. 切换「今日 / 本周 / 本月 / 自定义」各区块刷新
 *   3. 空数据 → 空态面板
 *   4. 部分数据 + 单条非法日期 → 不崩、无 NaN/undefined
 *   5. Chart 不重复实例（切换后旧图已 destroy）
 *   6. Store / revision 在渲染前后不变（Stats 只读）
 *   7. 响应式（CSS 结构断言：390 / 768 / 1440）
 *
 * 说明：统计值全部来自 CGAnalytics；本页不做业务统计。
 * 真实浏览器自动化不可用，仅 jsdom + Chart 桩验证。
 */
import { test, expect, beforeEach, vi } from 'vitest';
import statsHtml from '../stats.html?raw';
import { dateStr } from '../js/utils/date.js';

let charts = [];

/* ---- 桩：Canvas 2D context（jsdom 无真实 2D 实现） ---- */
function fakeCtx2d() {
  return {
    createLinearGradient: function () { return { addColorStop: function () {} }; },
    addColorStop: function () {}, save: function () {}, restore: function () {},
    fillText: function () {}, clip: function () {}, beginPath: function () {},
    moveTo: function () {}, lineTo: function () {}, stroke: function () {},
    set fillStyle(v) {}, set strokeStyle(v) {}, set font(v) {}, set textAlign(v) {}, set textBaseline(v) {},
    canvas: null, measureText: function () { return { width: 0 }; },
  };
}

/* ---- 桩：Chart.js（仅记录实例 + 支持 destroy） ---- */
class FakeChart {
  constructor(ctx, config) { this.ctx = ctx; this.config = config; this.destroyed = false; charts.push(this); }
  destroy() { this.destroyed = true; }
}
FakeChart.defaults = {
  color: '', font: { family: '', size: 12 }, borderColor: '',
  plugins: { legend: { labels: { color: '', padding: 12 } }, tooltip: { backgroundColor: '', titleColor: '', bodyColor: '', borderColor: '', borderWidth: 1, padding: 10, cornerRadius: 8, displayColors: false } },
};

/* ---- 把 stats.html 挂进 jsdom document ---- */
function mount(html) {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  document.replaceChild(document.adoptNode(parsed.documentElement), document.documentElement);
}

/* 拦截 document.head.appendChild，让懒加载的 Chart.js 脚本同步触发 onload */
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
  const a = dateStr(-2), b = dateStr(-1), c = dateStr(0);
  return {
    _meta: { revision: 7, updatedAt: null, deviceId: 'test-device', tombstones: {} },
    user: { name: '测试', semesterStart: dateStr(-20) },
    checkins: [
      { id: 'ck1', date: a, status: 'done' },
      { id: 'ck2', date: b, status: 'done' },
      { id: 'ck3', date: c, status: 'done' },
    ],
    english: [
      { id: 'e1', date: c, minutes: 30, words: 40 },
      { id: 'e2', date: b, minutes: 15, words: 10 },
    ],
    focus: [
      { id: 'f1', date: c, minutes: 25 },
      { id: 'f2', date: c, minutes: 20 },
      { id: 'f3', date: b, minutes: 50 },
    ],
    sports: [{ id: 's1', date: c, name: '跑步', duration: 30, calories: 200, type: 'run' }],
    readings: [{ id: 'r1', date: c, bookName: '书', pages: 20, totalPages: 100 }],
    todos: [
      { id: 't1', date: c, text: '复习', done: true },
      { id: 't2', date: c, text: '练字', done: false },
      { id: 't3', date: b, text: '早睡', done: true },
    ],
    courses: [{ id: 'c1', name: '高数', progress: 50, status: 'doing', credits: 4, courseType: '必修', slots: [{ weekday: 0, periods: [1, 2], weeks: '' }] }],
  };
}

function seedEmpty() {
  return {
    _meta: { revision: 0, updatedAt: null, deviceId: 'test-device', tombstones: {} },
    user: { name: '' },
    checkins: [], english: [], focus: [], sports: [], readings: [], todos: [], courses: [],
  };
}

/* 期望渲染完成后，刷新几次微任务 */
const settle = () => new Promise((r) => setTimeout(r, 25));

async function boot(data, token = 'test-token') {
  localStorage.clear();
  localStorage.setItem('cg_token', token);
  localStorage.setItem('chenguangData', JSON.stringify(data));
  mount(statsHtml);
  stubHeadAppend();

  globalThis.HTMLCanvasElement.prototype.getContext = function () { return fakeCtx2d(); };
  window.Chart = FakeChart;
  charts = [];

  vi.resetModules();
  const page = await import('../pages/stats.js');
  await settle();
  return page;
}

function clickRange(key) {
  const btn = document.querySelector(`[data-range="${key}"]`);
  if (!btn) throw new Error('tab not found: ' + key);
  btn.click();
}
function setCustom(s, e) {
  document.getElementById('customStart').value = s;
  document.getElementById('customEnd').value = e;
  document.getElementById('customApply').click();
}
function overviewText() {
  return document.getElementById('overviewGrid').textContent;
}

beforeEach(() => {
  localStorage.clear();
  charts = [];
});

/* ==================== 默认加载 ==================== */

test('默认加载（本周）：页面可初始化，各区块渲染，图/热力图存在', async () => {
  await boot(seedData());
  const dash = document.getElementById('statsDashboard');
  expect(dash.hidden).toBe(false);
  expect(document.getElementById('statsEmpty').hidden).toBe(true);
  expect(document.getElementById('statsError').hidden).toBe(true);
  expect(document.getElementById('rangeLabel').textContent).toContain('本周');
  expect(document.getElementById('overviewGrid').children.length).toBeGreaterThanOrEqual(5);
  expect(document.getElementById('trendGrid').children.length).toBeGreaterThanOrEqual(3);
  expect(document.querySelectorAll('#heatmapContainer .hm-cell').length).toBeGreaterThan(300);
  expect(document.getElementById('personalBestBody').children.length).toBeGreaterThanOrEqual(6);
  expect(charts.length).toBeGreaterThan(0);
});

/* ==================== 时间切换 ==================== */

test('切换「今日」：标签更新、图表重建、概览刷新', async () => {
  await boot(seedData());
  const createdBefore = charts.length;
  clickRange('today');
  await settle();
  expect(document.getElementById('rangeLabel').textContent).toContain('今日');
  expect(charts.length).toBeGreaterThan(createdBefore); // 今日构成图（新图）
  expect(overviewText()).toContain('活跃天数');
});

test('切换「本周」：刷新不崩，概览为周口径', async () => {
  await boot(seedData());
  clickRange('week');
  await settle();
  expect(document.getElementById('rangeLabel').textContent).toContain('本周');
  expect(overviewText().length).toBeGreaterThan(0);
});

test('切换「本月」：刷新不崩', async () => {
  await boot(seedData());
  clickRange('month');
  await settle();
  expect(document.getElementById('rangeLabel').textContent).toContain('本月');
});

test('自定义范围：显示输入、应用后刷新', async () => {
  await boot(seedData());
  clickRange('custom');
  await settle();
  expect(document.getElementById('customRange').hidden).toBe(false);
  const createdBefore = charts.length;
  setCustom(dateStr(-3), dateStr(0));
  await settle();
  expect(document.getElementById('rangeLabel').textContent).toContain('自定义');
  expect(charts.length).toBeGreaterThan(createdBefore);
});

test('自定义范围：空/非法输入给提示，不崩', async () => {
  await boot(seedData());
  clickRange('custom');
  await settle();
  document.getElementById('customStart').value = '';
  document.getElementById('customApply').click();
  await settle();
  // 无有效范围 → 不切换到自定义（保持本周）
  expect(document.getElementById('rangeLabel').textContent).toContain('本周');
});

/* ==================== 空数据 / 部分数据 / 非法日期 ==================== */

test('空数据：显示空态面板，隐藏驾驶舱', async () => {
  await boot(seedEmpty());
  expect(document.getElementById('statsEmpty').hidden).toBe(false);
  expect(document.getElementById('statsDashboard').hidden).toBe(true);
});

test('部分数据 + 单条非法日期：不崩、无 NaN / undefined / Invalid', async () => {
  const d = seedData();
  d.english.push({ id: 'bad', date: '2026-02-30', minutes: 99, words: 99 }); // 非真实日期
  d.checkins.push({ id: 'bad2', date: 'not-a-date', status: 'done' });
  await boot(d);
  clickRange('month');
  await settle();
  const text = document.getElementById('statsDashboard').textContent;
  expect(text).not.toMatch(/NaN|undefined|Invalid/);
  expect(document.getElementById('statsError').hidden).toBe(true);
});

/* ==================== Chart 生命周期 ==================== */

test('切换范围：旧图全部 destroy，无 canvas 叠加', async () => {
  await boot(seedData());
  const firstRender = charts.slice();
  expect(firstRender.length).toBeGreaterThan(0);
  clickRange('today');
  await settle();
  // 第一次渲染的图，在切换后应已 destroy
  firstRender.forEach((c) => expect(c.destroyed).toBe(true));
  // 且确实建了新图
  expect(charts.length).toBeGreaterThan(firstRender.length);
});

/* ==================== Store 只读（revision 不变） ==================== */

test('渲染前后：localStorage / revision 不变（Stats 只读）', async () => {
  await boot(seedData());
  const baseline = localStorage.getItem('chenguangData');
  clickRange('today');
  await settle();
  clickRange('month');
  await settle();
  clickRange('week');
  await settle();
  expect(localStorage.getItem('chenguangData')).toBe(baseline);
  const parsed = JSON.parse(localStorage.getItem('chenguangData'));
  expect(parsed._meta.revision).toBe(7);
});

/* ==================== 响应式（结构断言） ==================== */

test('响应式：390 / 768 / 1440 三档断点与自适应网格存在', () => {
  // 结构层：CSS 提供断点 + 自适应网格；jsdom 无法做真实布局测量，此处做结构验证
  const css = statsHtml;
  expect(css).toMatch(/@media\s*\(max-width:\s*680px\)/);      // ~768 档收敛单列
  expect(css).toMatch(/@media\s*\(max-width:\s*400px\)/);      // ~390 档双列压缩
  expect(css).toMatch(/repeat\(auto-fit,\s*minmax\(150px,\s*1fr\)\)/); // 概览/个人最佳自适应
  expect(css).toContain('.duo-grid');
  expect(css).toContain('overflow-x: auto');                    // 热力图内部横向滚动
});

test('无障碍：范围标签含 role=tablist / aria-selected，icon 按钮有 aria-label', () => {
  expect(statsHtml).toContain('role="tablist"');
  expect(statsHtml).toContain('aria-selected');
  expect(statsHtml).toContain('aria-label="刷新统计数据"');
});